import {
  startNotionImportMutation,
  cancelNotionImportMutation,
  retryNotionImportMutation,
  pauseNotionImportMutation,
  resumeNotionImportMutation,
  notionImportRunQuery,
  notionImportRunsQuery,
  notionImportItemsQuery,
  notionImportFilesQuery,
  notionImportLedgerQuery,
} from '@affine/graphql';
import { DebugLogger } from '@affine/debug';
import { LiveData, Service } from '@toeverything/infra';
import { map, catchError, of, switchMap, timer } from 'rxjs';

import type { GraphQLService } from '../../cloud';
import type { WorkspaceService } from '../../workspace';

const logger = new DebugLogger('notion-import');

export type NotionImportMode = 'merge' | 'skip-if-diverged' | 'overwrite';

export type NotionImportRunSnapshot = {
  id: string;
  workspaceId: string;
  createdBy: string | null;
  status: 'Pending' | 'Running' | 'Paused' | 'Staged' | 'Failed' | 'Cancelled' | 'Expired';
  mode: NotionImportMode;
  scope: Record<string, unknown>;
  progress: Record<string, unknown>;
  includeBlockComments: boolean;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  canRetry: boolean;
  canCancel: boolean;
};

export type StagedItem = {
  id: string;
  runId: string;
  kind: string;
  notionId: string;
  payload: unknown;
  payloadHash: string;
  parentId: string | null;
  position: number | null;
  createdAt: string;
};

export type StagedFile = {
  id: string;
  runId: string;
  ownerId: string;
  slot: string;
  blobKey: string | null;
  status: 'Pending' | 'Stored' | 'Unavailable';
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LedgerEntry = {
  id: string;
  runId: string;
  notionId: string;
  subject: string;
  outcome: 'Mapped' | 'Degraded' | 'PreservedOnly' | 'Unrecoverable';
  warningCode: string | null;
  contentHash: string | null;
  message: string | null;
  createdAt: string;
  preservedRecordId: string | null;
};

const PAGE_SIZE = 50;
const POLL_INTERVAL_MS = 2000;

/**
 * Orchestrates a Phase 3 import run from the client:
 *
 *   start -> poll run status -> page staged items/files ->
 *   assemble an ImportBatch via encodings -> hand to ImportService
 *
 * The service never writes Blocksuite models itself; it only
 * produces the same `ImportBatch` contract the file-tier
 * transformers produce, so the single verified commit path
 * (`ImportCommitService.commitBatch`) applies.
 */
export class NotionImportService extends Service {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly gql: GraphQLService
  ) {
    super();
  }

  async start(input: {
    token: string;
    mode: NotionImportMode;
    includeBlockComments?: boolean;
  }): Promise<string> {
    const result = await this.gql.gql({
      query: startNotionImportMutation,
      variables: {
        input: {
          workspaceId: this.workspaceService.workspace.id,
          token: input.token,
          mode: input.mode,
          includeBlockComments: input.includeBlockComments ?? false,
        },
      },
    });

    const run = (result as any).notionImport as { id: string };
    return run.id;
  }

  async pause(runId: string): Promise<NotionImportRunSnapshot | null> {
    const result = await this.gql.gql({
      query: pauseNotionImportMutation,
      variables: { input: { runId } },
    });

    const run = (result as any).pauseNotionImport;
    return run ? this.mapRun(run) : null;
  }

  async resume(runId: string): Promise<NotionImportRunSnapshot | null> {
    const result = await this.gql.gql({
      query: resumeNotionImportMutation,
      variables: { input: { runId } },
    });

    const run = (result as any).resumeNotionImport;
    return run ? this.mapRun(run) : null;
  }

  async cancel(runId: string): Promise<NotionImportRunSnapshot | null> {
    const result = await this.gql.gql({
      query: cancelNotionImportMutation,
      variables: { input: { runId } },
    });

    const run = (result as any).cancelNotionImport;
    return run ? this.mapRun(run) : null;
  }

  async retry(runId: string): Promise<NotionImportRunSnapshot | null> {
    const result = await this.gql.gql({
      query: retryNotionImportMutation,
      variables: { input: { runId } },
    });

    const run = (result as any).retryNotionImport;
    return run ? this.mapRun(run) : null;
  }

  /**
   * Get a single run by ID.
   */
  async getRun(runId: string): Promise<NotionImportRunSnapshot | null> {
    const result = await this.gql.gql({
      query: notionImportRunQuery,
      variables: { runId },
    });

    const run = (result as any).notionImportRun;
    return run ? this.mapRun(run) : null;
  }

  /**
   * List all runs for the current workspace.
   */
  async listRuns(): Promise<NotionImportRunSnapshot[]> {
    const result = await this.gql.gql({
      query: notionImportRunsQuery,
      variables: { pagination: { first: PAGE_SIZE } },
    });

    const runs = (result as any).notionImportRuns?.edges?.map((e: any) => e.node) ?? [];
    return runs.map(this.mapRun);
  }

  /**
   * Get items from a run.
   */
  async getItems(runId: string, after?: string): Promise<{ items: StagedItem[]; hasNextPage: boolean; endCursor: string | null }> {
    const result = await this.gql.gql({
      query: notionImportItemsQuery,
      variables: { runId, pagination: { first: PAGE_SIZE, after } },
    });

    const connection = (result as any).notionImportItems;
    const items = connection?.edges?.map((e: any) => this.mapItem(e.node)) ?? [];

    return {
      items,
      hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
      endCursor: connection?.pageInfo?.endCursor ?? null,
    };
  }

  /**
   * Get all items from a run (paginated).
   */
  async *iterateItems(runId: string): AsyncGenerator<StagedItem> {
    let after: string | undefined;
    let hasNextPage = true;

    while (hasNextPage) {
      const result = await this.getItems(runId, after);
      for (const item of result.items) {
        yield item;
      }
      after = result.endCursor ?? undefined;
      hasNextPage = result.hasNextPage;
    }
  }

  /**
   * Get files from a run.
   */
  async getFiles(runId: string, after?: string): Promise<{ files: StagedFile[]; hasNextPage: boolean; endCursor: string | null }> {
    const result = await this.gql.gql({
      query: notionImportFilesQuery,
      variables: { runId, pagination: { first: PAGE_SIZE, after } },
    });

    const connection = (result as any).notionImportFiles;
    const files = connection?.edges?.map((e: any) => this.mapFile(e.node)) ?? [];

    return {
      files,
      hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
      endCursor: connection?.pageInfo?.endCursor ?? null,
    };
  }

  /**
   * Get all files from a run (paginated).
   */
  async *iterateFiles(runId: string): AsyncGenerator<StagedFile> {
    let after: string | undefined;
    let hasNextPage = true;

    while (hasNextPage) {
      const result = await this.getFiles(runId, after);
      for (const file of result.files) {
        yield file;
      }
      after = result.endCursor ?? undefined;
      hasNextPage = result.hasNextPage;
    }
  }

  /**
   * Get ledger entries from a run.
   */
  async getLedger(runId: string, after?: string): Promise<{ entries: LedgerEntry[]; hasNextPage: boolean; endCursor: string | null }> {
    const result = await this.gql.gql({
      query: notionImportLedgerQuery,
      variables: { runId, pagination: { first: PAGE_SIZE, after } },
    });

    const connection = (result as any).notionImportLedger;
    const entries = connection?.edges?.map((e: any) => this.mapLedger(e.node)) ?? [];

    return {
      entries,
      hasNextPage: connection?.pageInfo?.hasNextPage ?? false,
      endCursor: connection?.pageInfo?.endCursor ?? null,
    };
  }

  /**
   * Get all ledger entries from a run (paginated).
   */
  async *iterateLedger(runId: string): AsyncGenerator<LedgerEntry> {
    let after: string | undefined;
    let hasNextPage = true;

    while (hasNextPage) {
      const result = await this.getLedger(runId, after);
      for (const entry of result.entries) {
        yield entry;
      }
      after = result.endCursor ?? undefined;
      hasNextPage = result.hasNextPage;
    }
  }

  /**
   * Collect all ledger entries for a run.
   */
  async collectLedger(runId: string): Promise<LedgerEntry[]> {
    const entries: LedgerEntry[] = [];
    for await (const entry of this.iterateLedger(runId)) {
      entries.push(entry);
    }
    return entries;
  }

  /**
   * Collect all files for a run.
   */
  async collectFiles(runId: string): Promise<StagedFile[]> {
    const files: StagedFile[] = [];
    for await (const file of this.iterateFiles(runId)) {
      files.push(file);
    }
    return files;
  }

  /**
   * Collect all items for a run.
   */
  async collectItems(runId: string): Promise<StagedItem[]> {
    const items: StagedItem[] = [];
    for await (const item of this.iterateItems(runId)) {
      items.push(item);
    }
    return items;
  }

  /**
   * LiveData of the run status; the wizard renders this directly.
   * Completes when the run leaves the Crawling state.
   */
  watchRun(runId: string, signal?: AbortSignal) {
    return timer(0, POLL_INTERVAL_MS).pipe(
      switchMap(() =>
        this.gql.rxGql({
          query: notionImportRunQuery,
          variables: { runId },
          context: { signal },
        })
      ),
      map((result: any) => {
        const run = result.notionImportRun;
        if (!run) throw new Error('Import run not found');
        return this.mapRun(run);
      }),
      catchError((err) => {
        logger.error('Error watching run:', err);
        return of(null as NotionImportRunSnapshot | null);
      })
    );
  }

  /**
   * Map a GraphQL run to a run snapshot.
   */
  private mapRun(run: any): NotionImportRunSnapshot {
    return {
      id: run.id,
      workspaceId: run.workspaceId,
      createdBy: run.createdBy,
      status: run.status,
      mode: run.mode,
      scope: run.scope || {},
      progress: run.progress || {},
      includeBlockComments: run.includeBlockComments || false,
      lastError: run.lastError,
      leaseOwner: run.leaseOwner,
      leaseExpiresAt: run.leaseExpiresAt,
      expiresAt: run.expiresAt,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      canRetry: run.canRetry || false,
      canCancel: run.canCancel || false,
    };
  }

  /**
   * Map a GraphQL item to a staged item.
   */
  private mapItem(item: any): StagedItem {
    return {
      id: item.id,
      runId: item.runId,
      kind: item.kind,
      notionId: item.notionId,
      payload: item.payload,
      payloadHash: item.payloadHash,
      parentId: item.parentId,
      position: item.position,
      createdAt: item.createdAt,
    };
  }

  /**
   * Map a GraphQL file to a staged file.
   */
  private mapFile(file: any): StagedFile {
    return {
      id: file.id,
      runId: file.runId,
      ownerId: file.ownerId,
      slot: file.slot,
      blobKey: file.blobKey,
      status: file.status,
      error: file.error,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
    };
  }

  /**
   * Map a GraphQL ledger entry to a ledger entry.
   */
  private mapLedger(entry: any): LedgerEntry {
    return {
      id: entry.id,
      runId: entry.runId,
      notionId: entry.notionId,
      subject: entry.subject,
      outcome: entry.outcome,
      warningCode: entry.warningCode,
      contentHash: entry.contentHash,
      message: entry.message,
      createdAt: entry.createdAt,
      preservedRecordId: entry.preservedRecordId,
    };
  }
}
