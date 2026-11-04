// ============================================================================
// Task Executor for Notion Import
// ============================================================================

import { hashPayload } from './canonical';
import { decodeCheckpoint, encodeCheckpoint } from './cursor';
import { cutPropertyIds } from './properties';
import { findHostedFiles, notionIdOf, objectTypeOf } from './files';
import { TaskFatalError } from './errors';
import type { NotionClient } from './notion-client';
import type { FileRegistry, StagingStore } from './ports';
import type {
  Checkpoint,
  HostedFileRef,
  ItemKind,
  RunRecord,
  StagedItem,
  TaskContext,
  TaskKind,
  TaskOutcome,
  TaskWarning,
} from './types';

/**
 * One handler per task kind.
 * Adding a kind means registering a handler here and nothing else
 * (open for extension, closed for modification - OCP).
 */
export class TaskExecutor {
  private readonly handlers = new Map<TaskKind, TaskHandler>();

  constructor(
    private readonly store: StagingStore,
    private readonly files: FileRegistry
  ) {
    // Register all task handlers
    this.handlers.set('Users', (ctx) => this.runUsers(ctx));
    this.handlers.set('Search', (ctx) => this.runSearch(ctx));
    this.handlers.set('Page', (ctx) => this.runPage(ctx));
    this.handlers.set('Database', (ctx) => this.runDatabase(ctx));
    this.handlers.set('DatabaseRows', (ctx) => this.runDatabaseRows(ctx));
    this.handlers.set('BlockChildren', (ctx) => this.runBlockChildren(ctx));
    this.handlers.set('PropertyPage', (ctx) => this.runPropertyPage(ctx));
    this.handlers.set('Comments', (ctx) => this.runComments(ctx));
    this.handlers.set('DownloadFile', (ctx) => this.runDownloadFile(ctx));
  }

  has(kind: TaskKind): boolean {
    return this.handlers.has(kind);
  }

  async execute(context: TaskContext): Promise<TaskOutcome> {
    const handler = this.handlers.get(context.task.kind);

    if (!handler) {
      throw new TaskFatalError(
        `No handler for ${context.task.kind}`,
        {
          code: 'task_failed',
          message: `No handler for task kind ${context.task.kind}`,
          notionId: context.task.targetId,
        }
      );
    }

    return handler(context);
  }

  // ---------------------------------------------------------------------------
  // Task Handlers
  // ---------------------------------------------------------------------------

  /**
   * GET /v1/users: stage every workspace member for the user map.
   */
  private async runUsers(ctx: TaskContext): Promise<TaskOutcome> {
    const envelope = await ctx.client.users(ctx.task.checkpoint.nextCursor ?? null);

    const items: StagedItem[] = (envelope.results ?? []).map((user, index) => ({
      kind: 'User' as ItemKind,
      notionId: notionIdOf(user) ?? `${ctx.task.targetId}:${index}`,
      payload: user,
      payloadHash: hashPayload(user),
    }));

    await this.store.stageItems(ctx.run.id, items);

    return {
      nextCursor: envelope.has_more ? envelope.next_cursor ?? null : null,
    };
  }

  /**
   * POST /v1/search: every page and database the integration can reach.
   */
  private async runSearch(ctx: TaskContext): Promise<TaskOutcome> {
    const envelope = await ctx.client.search(ctx.task.checkpoint.nextCursor ?? null);
    const results = envelope.results ?? [];

    const items: StagedItem[] = [];
    const tasks: { kind: TaskKind; targetId: string }[] = [];

    for (const result of results) {
      const id = notionIdOf(result);
      if (!id) continue;

      const object = objectTypeOf(result);

      if (object === 'page') {
        items.push({
          kind: 'Page' as ItemKind,
          notionId: id,
          payload: result,
          payloadHash: hashPayload(result),
        });
        tasks.push({ kind: 'Page', targetId: id });
      } else if (object === 'database') {
        items.push({
          kind: 'Database' as ItemKind,
          notionId: id,
          payload: result,
          payloadHash: hashPayload(result),
        });
        tasks.push({ kind: 'Database', targetId: id });
      }
    }

    await this.store.stageItems(ctx.run.id, items);
    await this.store.enqueueTasks(ctx.run.id, tasks);

    return {
      nextCursor: envelope.has_more ? envelope.next_cursor ?? null : null,
    };
  }

  /**
   * GET /v1/pages/{id}: stage the page, queue its children and cut lists.
   */
  private async runPage(ctx: TaskContext): Promise<TaskOutcome> {
    let payload: unknown;

    try {
      payload = await ctx.client.page(ctx.task.targetId);
    } catch (error) {
      // A database id can surface where a page id was expected; queue it.
      if (error instanceof Error && /404|410/.test(error.message)) {
        await this.store.enqueueTasks(ctx.run.id, [
          { kind: 'Database', targetId: ctx.task.targetId, cursor: '' },
        ]);
        return { nextCursor: null };
      }
      throw error;
    }

    const id = notionIdOf(payload) ?? ctx.task.targetId;

    await this.store.stageItems(ctx.run.id, [
      {
        kind: 'Page' as ItemKind,
        notionId: id,
        payload,
        payloadHash: hashPayload(payload),
      },
    ]);

    const tasks: { kind: TaskKind; targetId: string; cursor?: string }[] = [
      { kind: 'BlockChildren', targetId: id, cursor: '' },
    ];

    // Queue tasks for cut properties
    for (const propertyId of cutPropertyIds(payload)) {
      tasks.push({
        kind: 'PropertyPage',
        targetId: `${id}:${propertyId}`,
        cursor: '',
      });
    }

    // Queue comments if enabled
    if (ctx.run.includeBlockComments) {
      tasks.push({ kind: 'Comments', targetId: id, cursor: '' });
    }

    await this.store.enqueueTasks(ctx.run.id, tasks);

    // Register hosted files
    const fileRefs = findHostedFiles(id, payload);
    await this.files.registerFiles(ctx.run.id, fileRefs);

    return { nextCursor: null };
  }

  /**
   * GET /v1/databases/{id} + /v1/data_sources/{id}: schema and rows.
   */
  private async runDatabase(ctx: TaskContext): Promise<TaskOutcome> {
    const database = (await ctx.client.database(ctx.task.targetId)) as
      | { data_sources?: Array<{ id?: string }> }
      | null;

    const sources = database?.data_sources ?? [];

    if (sources.length === 0) {
      return {
        nextCursor: null,
        warnings: [
          {
            code: 'unsupported_api_version',
            message: `Database ${ctx.task.targetId} exposes no data sources`,
            notionId: ctx.task.targetId,
          },
        ],
      };
    }

    await this.store.stageItems(ctx.run.id, [
      {
        kind: 'Database' as ItemKind,
        notionId: ctx.task.targetId,
        payload: database,
        payloadHash: hashPayload(database),
      },
    ]);

    const tasks: { kind: TaskKind; targetId: string; cursor?: string }[] = [];

    for (const source of sources) {
      const sourceId = source?.id;
      if (!sourceId) continue;

      const payload = await ctx.client.dataSource(sourceId);

      await this.store.stageItems(ctx.run.id, [
        {
          kind: 'DataSource' as ItemKind,
          notionId: sourceId,
          payload,
          payloadHash: hashPayload(payload),
        },
      ]);

      tasks.push({ kind: 'DatabaseRows', targetId: sourceId, cursor: '' });
    }

    await this.store.enqueueTasks(ctx.run.id, tasks);

    return { nextCursor: null };
  }

  /**
   * POST /v1/data_sources/{id}/query.
   * Notion caps a query at 10,000 rows and reports the cut only in request_status.
   * Sort by created_time, detect the cut, restart from the last row's time.
   */
  private async runDatabaseRows(ctx: TaskContext): Promise<TaskOutcome> {
    const cursor = ctx.task.checkpoint.nextCursor ?? null;
    const windowStart = ctx.task.checkpoint.windowStart ?? null;

    const envelope = await ctx.client.queryDataSource(
      ctx.task.targetId,
      cursor,
      windowStart
    );

    const rows = envelope.results ?? [];
    const items: StagedItem[] = [];
    const tasks: { kind: TaskKind; targetId: string; cursor?: string }[] = [];

    for (const row of rows) {
      const id = notionIdOf(row);
      if (!id) continue;

      items.push({
        kind: 'Page' as ItemKind,
        notionId: id,
        payload: row,
        payloadHash: hashPayload(row),
      });

      tasks.push({ kind: 'Page', targetId: id, cursor: '' });
    }

    await this.store.stageItems(ctx.run.id, items);
    await this.store.enqueueTasks(ctx.run.id, tasks);

    // Check if we need to continue pagination
    if (envelope.has_more && envelope.next_cursor) {
      return { nextCursor: envelope.next_cursor };
    }

    // Check for request_status indicating the query was capped
    const status = envelope.request_status;
    const cut =
      status?.state === 'incomplete' &&
      status.reason === 'query_result_limit_reached';

    if (cut) {
      const lastRow = rows[rows.length - 1] as { created_time?: string } | undefined;
      const lastTime = lastRow?.created_time ?? null;

      if (lastTime && lastTime !== windowStart) {
        // Restart in a new window; staging is idempotent so overlap is free.
        return {
          nextCursor: null,
          windowStart: lastTime,
        };
      }

      return {
        nextCursor: null,
        warnings: [
          {
            code: 'row_window_exhausted',
            message: `Row window exhausted for data source ${ctx.task.targetId}: more than 10,000 rows share one creation minute`,
            notionId: ctx.task.targetId,
          },
        ],
      };
    }

    return { nextCursor: null };
  }

  /**
   * GET /v1/blocks/{id}/children with continuous sibling positions.
   */
  private async runBlockChildren(ctx: TaskContext): Promise<TaskOutcome> {
    const envelope = await ctx.client.blockChildren(
      ctx.task.targetId,
      ctx.task.checkpoint.nextCursor ?? null
    );

    const blocks = envelope.results ?? [];
    const items: StagedItem[] = [];
    const tasks: { kind: TaskKind; targetId: string; cursor?: string }[] = [];

    for (const block of blocks) {
      const id = notionIdOf(block);
      if (!id) continue;

      const object = objectTypeOf(block);

      // Skip block objects that are not pages or databases
      if (object === 'page' || object === 'database') {
        // These will be handled by their own tasks
        continue;
      }

      items.push({
        kind: 'Block' as ItemKind,
        notionId: id,
        payload: block,
        payloadHash: hashPayload(block),
        parentId: ctx.task.targetId,
      });

      // Recursively get children of this block
      tasks.push({ kind: 'BlockChildren', targetId: id, cursor: '' });

      // Register hosted files
      const fileRefs = findHostedFiles(id, block);
      await this.files.registerFiles(ctx.run.id, fileRefs);
    }

    await this.store.stageItems(ctx.run.id, items);
    await this.store.enqueueTasks(ctx.run.id, tasks);

    return {
      nextCursor: envelope.has_more ? envelope.next_cursor ?? null : null,
    };
  }

  /**
   * GET /v1/pages/{pageId}/properties/{propertyId}: get full property value.
   */
  private async runPropertyPage(ctx: TaskContext): Promise<TaskOutcome> {
    // Parse the targetId to get pageId and propertyId
    const [pageId, propertyId] = ctx.task.targetId.split(':');

    if (!pageId || !propertyId) {
      return { nextCursor: null };
    }

    const envelope = await ctx.client.propertyItems(
      pageId,
      propertyId,
      ctx.task.checkpoint.nextCursor ?? null
    );

    const results = envelope.results ?? [];

    // Collect all property values
    const values: unknown[] = [];
    for (const result of results) {
      values.push(result);
    }

    // Stage the property value
    await this.store.stageItems(ctx.run.id, [
      {
        kind: 'Property' as ItemKind,
        notionId: ctx.task.targetId,
        payload: { pageId, propertyId, values },
        payloadHash: hashPayload({ pageId, propertyId, values }),
        parentId: pageId,
      },
    ]);

    return {
      nextCursor: envelope.has_more ? envelope.next_cursor ?? null : null,
    };
  }

  /**
   * GET /v1/comments: get comments for a block.
   */
  private async runComments(ctx: TaskContext): Promise<TaskOutcome> {
    const envelope = await ctx.client.comments(
      ctx.task.targetId,
      ctx.task.checkpoint.nextCursor ?? null
    );

    const results = envelope.results ?? [];
    const items: StagedItem[] = [];

    for (const result of results) {
      const id = notionIdOf(result);
      if (!id) continue;

      items.push({
        kind: 'Comment' as ItemKind,
        notionId: id,
        payload: result,
        payloadHash: hashPayload(result),
        parentId: ctx.task.targetId,
      });
    }

    await this.store.stageItems(ctx.run.id, items);

    return {
      nextCursor: envelope.has_more ? envelope.next_cursor ?? null : null,
    };
  }

  /**
   * Download and mirror a file from Notion.
   */
  private async runDownloadFile(ctx: TaskContext): Promise<TaskOutcome> {
    // The targetId should be the file URL or a reference
    // For now, we'll just mark this as done
    // In a full implementation, this would download the file and mirror it

    return { nextCursor: null };
  }
}

// Type alias for handler function
type TaskHandler = (context: TaskContext) => Promise<TaskOutcome>;
