import {
  type Checkpoint,
  decodeCheckpoint,
  encodeCheckpoint,
} from './cursor';
import { FileMirrorError, NotionApiError, RetryTaskError } from './errors';
import { extractFileRefs } from './files';
import type {
  FileMirror,
  FileRegistry,
  NotionApi,
  StagingStore,
} from './ports';
import { truncatedPropertyIds } from './properties';
import type {
  ImportWarning,
  ItemKind,
  JsonObject,
  NewTask,
  OwnerKind,
  RunOptions,
  StagedItem,
  TaskKind,
  TaskRef,
  TaskResult,
} from './types';

export interface ExecutorDeps {
  api: NotionApi;
  store: StagingStore;
  files: FileRegistry;
  mirror: FileMirror;
}

/** Work that exists before any Notion call has been made. */
export function initialTasks(options: RunOptions): NewTask[] {
  const tasks: NewTask[] = [{ kind: 'users', targetId: 'all' }];
  if (options.roots.length === 0) {
    tasks.push({ kind: 'search', targetId: 'all' });
  } else {
    for (const root of options.roots) {
      tasks.push({ kind: 'page', targetId: root });
    }
  }
  return tasks;
}

interface Accumulator {
  tasks: NewTask[];
  warnings: ImportWarning[];
}

interface Context {
  runId: string;
  task: TaskRef;
  cp: Checkpoint;
  acc: Accumulator;
}

type Handler = (ctx: Context) => Promise<string | null>;

function idOf(object: JsonObject): string {
  if (typeof object.id !== 'string' || !object.id) {
    throw new NotionApiError(0, 'invalid_response', 'Object without id', false);
  }
  return object.id;
}

function asObject(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

/**
 * Runs one unit of Extract work and returns what to do next. Each call
 * handles at most one page of Notion results, so the checkpoint it returns is
 * written after every page and a crash repeats at most one page. Every write
 * is an upsert, which makes that repeat harmless.
 *
 * New task kinds are added by registering a handler: nothing else changes.
 */
export class TaskExecutor {
  private readonly handlers: Record<TaskKind, Handler> = {
    search: ctx => this.search(ctx),
    users: ctx => this.users(ctx),
    page: ctx => this.page(ctx),
    database: ctx => this.database(ctx),
    database_rows: ctx => this.databaseRows(ctx),
    block_children: ctx => this.blockChildren(ctx),
    property_page: ctx => this.propertyPage(ctx),
    comments: ctx => this.comments(ctx),
    download_file: ctx => this.downloadFile(ctx),
  };

  constructor(
    private readonly deps: ExecutorDeps,
    private readonly options: RunOptions
  ) {}

  async execute(runId: string, task: TaskRef): Promise<TaskResult> {
    const acc: Accumulator = { tasks: [], warnings: [] };
    const cp = decodeCheckpoint(task.cursor);
    const nextCursor = await this.handlers[task.kind]({ runId, task, cp, acc });
    return { nextCursor, newTasks: acc.tasks, warnings: acc.warnings };
  }

  // ---- handlers ----------------------------------------------------------

  private async search({ runId, cp, acc }: Context) {
    const page = await this.deps.api.search(cp.c);
    const items: StagedItem[] = [];
    for (const [i, result] of page.results.entries()) {
      if (result.object === 'page') {
        items.push(await this.stagePage(runId, result, null, cp.n + i, acc));
        continue;
      }
      // A data source leads to its database, which owns the row work.
      const parent = asObject(result.parent);
      const databaseId =
        parent?.type === 'database_id' && typeof parent.database_id === 'string'
          ? parent.database_id
          : result.object === 'database'
            ? idOf(result)
            : null;
      if (databaseId) acc.tasks.push({ kind: 'database', targetId: databaseId });
    }
    await this.deps.store.putItems(runId, items);
    return this.advance(page, cp, page.results.length);
  }

  private async users({ runId, cp }: Context) {
    const page = await this.deps.api.listUsers(cp.c);
    await this.deps.store.putItems(
      runId,
      page.results.map((user, i) =>
        this.item('user', idOf(user), null, cp.n + i, user)
      )
    );
    return this.advance(page, cp, page.results.length);
  }

  private async page({ runId, task, acc }: Context) {
    let page: JsonObject;
    try {
      page = await this.deps.api.retrievePage(task.targetId);
    } catch (error) {
      // A root id may name a database rather than a page.
      if (error instanceof NotionApiError && error.code === 'object_not_found') {
        acc.tasks.push({ kind: 'database', targetId: task.targetId });
        return null;
      }
      throw error;
    }
    const staged = await this.stagePage(runId, page, null, 0, acc);
    await this.deps.store.putItems(runId, [staged]);
    return null;
  }

  private async database({ runId, task, acc }: Context) {
    const database = await this.deps.api.retrieveDatabase(task.targetId);
    const databaseId = idOf(database);
    const items: StagedItem[] = [
      this.item('database', databaseId, null, 0, database),
    ];
    const sources = Array.isArray(database.data_sources)
      ? database.data_sources
      : [];
    if (sources.length === 0) {
      acc.warnings.push({
        code: 'unsupported_api_version',
        notionId: databaseId,
        message:
          'The database response has no data_sources. Notion-Version must be 2025-09-03 or later.',
      });
    }
    for (const [i, source] of sources.entries()) {
      const sourceId = idOf(asObject(source) ?? {});
      const dataSource = await this.deps.api.retrieveDataSource(sourceId);
      items.push(this.item('data_source', sourceId, databaseId, i, dataSource));
      acc.tasks.push({ kind: 'database_rows', targetId: sourceId });
    }
    await this.deps.store.putItems(runId, items);
    await this.mirrorFiles(runId, 'database', databaseId, database, acc, false);
    return null;
  }

  private async databaseRows({ runId, task, cp, acc }: Context) {
    const page = await this.deps.api.queryDataSource(task.targetId, {
      cursor: cp.c,
      createdOnOrAfter: cp.s,
    });
    const items: StagedItem[] = [];
    for (const [i, row] of page.results.entries()) {
      items.push(
        await this.stagePage(runId, row, task.targetId, cp.n + i, acc)
      );
    }
    await this.deps.store.putItems(runId, items);
    const count = cp.n + page.results.length;

    if (page.hasMore && page.nextCursor) {
      return encodeCheckpoint({ c: page.nextCursor, n: count, s: cp.s });
    }
    if (!page.incomplete) return null;

    // Notion stopped at its 10,000 row cap without an error. Restart the
    // query from the last created_time; rows on the boundary are re-read and
    // overwritten by the upsert.
    const last = page.results.at(-1);
    const lastCreated =
      last && typeof last.created_time === 'string' ? last.created_time : null;
    if (!lastCreated || lastCreated === cp.s) {
      acc.warnings.push({
        code: 'row_window_exhausted',
        notionId: task.targetId,
        message:
          'More than 10,000 rows share one creation minute, so Notion cannot page past them. Rows after that point were not read. Re-import this database from a CSV export, or split it with a filter.',
      });
      return null;
    }
    return encodeCheckpoint({ c: null, n: count, s: lastCreated });
  }

  private async blockChildren({ runId, task, cp, acc }: Context) {
    const page = await this.deps.api.listBlockChildren(task.targetId, cp.c);
    const items: StagedItem[] = [];
    for (const [i, block] of page.results.entries()) {
      const id = idOf(block);
      const type = typeof block.type === 'string' ? block.type : '';
      items.push(this.item('block', id, task.targetId, cp.n + i, block));

      if (type === 'child_page') {
        acc.tasks.push({ kind: 'page', targetId: id });
      } else if (type === 'child_database') {
        acc.tasks.push({ kind: 'database', targetId: id });
      } else {
        if (block.has_children === true) {
          acc.tasks.push({ kind: 'block_children', targetId: id });
        }
        if (this.options.includeBlockComments) {
          acc.tasks.push({ kind: 'comments', targetId: id });
        }
      }

      if (type === 'synced_block') {
        const from = asObject(asObject(block.synced_block)?.synced_from);
        if (from && typeof from.block_id === 'string') {
          acc.tasks.push({ kind: 'block_children', targetId: from.block_id });
        }
      }
      if (type === 'unsupported') {
        acc.warnings.push({
          code: 'unsupported_block',
          notionId: id,
          message: 'Notion marks this block type as unsupported by the API.',
        });
      }
      await this.mirrorFiles(runId, 'block', id, block, acc, false);
    }
    await this.deps.store.putItems(runId, items);
    return this.advance(page, cp, page.results.length);
  }

  private async propertyPage({ runId, task, cp, acc }: Context) {
    const slash = task.targetId.indexOf('/');
    if (slash < 0) {
      throw new NotionApiError(0, 'invalid_task', 'Malformed property task', false);
    }
    const pageId = task.targetId.slice(0, slash);
    const propertyId = task.targetId.slice(slash + 1);
    const page = await this.deps.api.retrievePageProperty(
      pageId,
      propertyId,
      cp.c
    );
    // `n` counts pages of this property here, not items.
    await this.deps.store.putItems(runId, [
      this.item('property', `${task.targetId}#${cp.n}`, pageId, cp.n, {
        object: 'property_page',
        page_id: pageId,
        property_id: propertyId,
        index: cp.n,
        has_more: page.hasMore,
        results: page.results,
      }),
    ]);
    void acc;
    if (page.hasMore && page.nextCursor) {
      return encodeCheckpoint({ c: page.nextCursor, n: cp.n + 1, s: null });
    }
    return null;
  }

  private async comments({ runId, task, cp, acc }: Context) {
    const page = await this.deps.api.listComments(task.targetId, cp.c);
    const items: StagedItem[] = [];
    for (const [i, comment] of page.results.entries()) {
      const id = idOf(comment);
      items.push(this.item('comment', id, task.targetId, cp.n + i, comment));
      await this.mirrorFiles(runId, 'comment', id, comment, acc, false);
    }
    await this.deps.store.putItems(runId, items);
    return this.advance(page, cp, page.results.length);
  }

  private async downloadFile({ runId, task, acc }: Context) {
    const colon = task.targetId.indexOf(':');
    const kind = task.targetId.slice(0, colon);
    const id = task.targetId.slice(colon + 1);
    let owner: JsonObject;
    if (kind === 'block') owner = await this.deps.api.retrieveBlock(id);
    else if (kind === 'page') owner = await this.deps.api.retrievePage(id);
    else if (kind === 'database')
      owner = await this.deps.api.retrieveDatabase(id);
    else {
      throw new NotionApiError(0, 'invalid_task', 'Malformed download task', false);
    }
    await this.mirrorFiles(runId, kind as OwnerKind, id, owner, acc, true);
    return null;
  }

  // ---- shared steps ------------------------------------------------------

  private item(
    kind: ItemKind,
    notionId: string,
    parentId: string | null,
    position: number,
    payload: JsonObject
  ): StagedItem {
    return { kind, notionId, parentId, position, payload };
  }

  private advance(
    page: { hasMore: boolean; nextCursor: string | null },
    cp: Checkpoint,
    staged: number
  ): string | null {
    return page.hasMore && page.nextCursor
      ? encodeCheckpoint({ c: page.nextCursor, n: cp.n + staged, s: cp.s })
      : null;
  }

  /** Builds the staged page and queues everything hanging off it. */
  private async stagePage(
    runId: string,
    page: JsonObject,
    parentId: string | null,
    position: number,
    acc: Accumulator
  ): Promise<StagedItem> {
    const id = idOf(page);
    acc.tasks.push(
      { kind: 'block_children', targetId: id },
      { kind: 'comments', targetId: id }
    );
    for (const propertyId of truncatedPropertyIds(page)) {
      acc.tasks.push({ kind: 'property_page', targetId: `${id}/${propertyId}` });
    }
    await this.mirrorFiles(runId, 'page', id, page, acc, false);
    return this.item('page', id, parentId, position, page);
  }

  /**
   * Stores every Notion-hosted file of an owner in the blob store while its
   * signed URL is still fresh. A transient failure queues a retry that fetches
   * the owner again for a new URL; a permanent one is recorded as unavailable.
   */
  private async mirrorFiles(
    runId: string,
    ownerKind: OwnerKind,
    ownerId: string,
    payload: JsonObject,
    acc: Accumulator,
    inRetryTask: boolean
  ): Promise<void> {
    let needsRetry = false;
    for (const ref of extractFileRefs(ownerKind, payload)) {
      const existing = await this.deps.files.get(runId, ownerId, ref.slot);
      if (existing?.status === 'stored' || existing?.status === 'unavailable') {
        continue;
      }
      try {
        const file = await this.deps.mirror.mirror({
          url: ref.url,
          name: ref.name,
        });
        await this.deps.files.upsert(runId, {
          ownerId,
          slot: ref.slot,
          status: 'stored',
          blobKey: file.blobKey,
          size: file.size,
          mime: file.mime,
          lastError: null,
        });
      } catch (error) {
        const failure =
          error instanceof FileMirrorError
            ? error
            : new FileMirrorError(
                error instanceof Error ? error.message : String(error),
                true
              );
        const canRetry = failure.retriable && ownerKind !== 'comment';
        await this.deps.files.upsert(runId, {
          ownerId,
          slot: ref.slot,
          status: canRetry ? 'pending' : 'unavailable',
          blobKey: null,
          size: null,
          mime: null,
          lastError: failure.message,
        });
        if (canRetry) {
          needsRetry = true;
        } else {
          acc.warnings.push({
            code: 'file_unavailable',
            notionId: ownerId,
            message: `File in slot ${ref.slot} could not be stored: ${failure.message}`,
          });
        }
      }
    }
    if (!needsRetry) return;
    if (inRetryTask) throw new RetryTaskError('File download failed, retrying');
    acc.tasks.push({ kind: 'download_file', targetId: `${ownerKind}:${ownerId}` });
  }
}

export type { TaskRef };
