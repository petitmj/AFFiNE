import { Injectable } from '@nestjs/common';
import { Transactional } from '@nestjs-cls/transactional';
import type {
  NotionImportFileStatus,
  NotionImportItemKind,
  NotionImportOutcome,
  NotionImportRunStatus,
  NotionImportTaskKind,
  NotionImportTaskStatus,
} from '@prisma/client';

import { BaseModel } from './base';

// Type aliases for the generated Prisma types to avoid circular dependencies
type RunRow = {
  id: string;
  workspaceId: string;
  createdBy: string | null;
  status: NotionImportRunStatus;
  tokenCipher: string | null;
  scope: any;
  progress: any;
  includeBlockComments: boolean;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type TaskRow = {
  id: string;
  runId: string;
  kind: NotionImportTaskKind;
  targetId: string;
  status: NotionImportTaskStatus;
  cursor: string | null;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type ItemRow = {
  id: string;
  runId: string;
  kind: NotionImportItemKind;
  notionId: string;
  payload: any;
  payloadHash: string;
  parentId: string | null;
  position: number | null;
  createdAt: Date;
};

type FileRow = {
  id: string;
  runId: string;
  ownerId: string;
  slot: string;
  blobKey: string | null;
  status: NotionImportFileStatus;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type LedgerRow = {
  id: string;
  runId: string;
  notionId: string;
  subject: string;
  outcome: NotionImportOutcome;
  warningCode: string | null;
  contentHash: string | null;
  message: string | null;
  createdAt: Date;
};

type PreservedRow = {
  id: string;
  workspaceId: string;
  kind: string;
  notionId: string;
  payload: any;
  payloadHash: string;
  createdAt: Date;
  updatedAt: Date;
};

const LEASE_TTL_MS = 15 * 1000; // 15 seconds
const RUN_TTL_HOURS = 1; // 1 hour initial expiry

/**
 * Notion Import Model
 *
 * Manages durable state for Notion zero-loss import runs:
 * - Run lifecycle (create, claim lease, renew lease, expire)
 * - Task queue (claim, renew, complete, fail)
 * - Staging storage (insert-if-absent items)
 * - File registry (track mirrored blobs)
 * - Ledger (record outcomes and warnings)
 * - Preserved records (durable storage for unmappable Notion objects)
 */
@Injectable()
export class NotionImportModel extends BaseModel {
  // ==========================================================================
  // Run operations
  // ==========================================================================

  /**
   * Create a new import run with the encrypted token.
   */
  @Transactional()
  async createRun(input: {
    workspaceId: string;
    createdBy: string | null;
    tokenCipher: string;
    scope: any;
    includeBlockComments: boolean;
  }): Promise<RunRow> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RUN_TTL_HOURS * 60 * 60 * 1000);

    const row = await this.db.notionImportRun.create({
      data: {
        workspaceId: input.workspaceId,
        createdBy: input.createdBy,
        status: NotionImportRunStatus.Pending,
        tokenCipher: input.tokenCipher,
        scope: input.scope,
        progress: {},
        includeBlockComments: input.includeBlockComments,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        expiresAt,
      },
    });

    return this.mapRun(row);
  }

  /**
   * Get a run by id, only if it belongs to the given workspace.
   */
  async getRun(workspaceId: string, runId: string): Promise<RunRow | null> {
    const row = await this.db.notionImportRun.findUnique({
      where: {
        id: runId,
        workspaceId,
      },
    });

    return row ? this.mapRun(row) : null;
  }

  /**
   * List runs for a workspace, optionally filtered by status.
   */
  async listRuns(
    workspaceId: string,
    statuses?: NotionImportRunStatus[]
  ): Promise<RunRow[]> {
    const rows = await this.db.notionImportRun.findMany({
      where: {
        workspaceId,
        ...(statuses?.length ? { status: { in: statuses } } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(this.mapRun);
  }

  /**
   * Claim a run's lease for processing. Only one worker can hold the lease.
   * Returns null if the run is already claimed or in a terminal state.
   */
  @Transactional()
  async claimRunLease(
    runId: string,
    owner: string
  ): Promise<RunRow | null> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_TTL_MS);

    // Use updateMany with condition to avoid race conditions
    const result = await this.db.notionImportRun.updateMany({
      where: {
        id: runId,
        status: { in: [NotionImportRunStatus.Pending, NotionImportRunStatus.Running, NotionImportRunStatus.Paused] },
        OR: [
          { leaseOwner: null },
          { leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: NotionImportRunStatus.Running,
        leaseOwner: owner,
        leaseExpiresAt,
        lastError: null,
        updatedAt: now,
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportRun.findUnique({ where: { id: runId } });
    return row ? this.mapRun(row) : null;
  }

  /**
   * Renew a run's lease. Must be called by the current lease owner.
   */
  @Transactional()
  async renewRunLease(runId: string, owner: string): Promise<RunRow | null> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_TTL_MS);

    const result = await this.db.notionImportRun.updateMany({
      where: {
        id: runId,
        leaseOwner: owner,
        leaseExpiresAt: { lte: now },
        status: { in: [NotionImportRunStatus.Running, NotionImportRunStatus.Paused] },
      },
      data: {
        leaseExpiresAt,
        updatedAt: now,
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportRun.findUnique({ where: { id: runId } });
    return row ? this.mapRun(row) : null;
  }

  /**
   * Release a run's lease (pause or cancel).
   */
  @Transactional()
  async releaseRunLease(
    runId: string,
    owner: string,
    status: NotionImportRunStatus
  ): Promise<RunRow | null> {
    const result = await this.db.notionImportRun.updateMany({
      where: {
        id: runId,
        leaseOwner: owner,
      },
      data: {
        status,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportRun.findUnique({ where: { id: runId } });
    return row ? this.mapRun(row) : null;
  }

  /**
   * Update run progress.
   */
  @Transactional()
  async updateRunProgress(
    runId: string,
    owner: string,
    progress: any
  ): Promise<RunRow | null> {
    const result = await this.db.notionImportRun.updateMany({
      where: {
        id: runId,
        leaseOwner: owner,
      },
      data: {
        progress,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportRun.findUnique({ where: { id: runId } });
    return row ? this.mapRun(row) : null;
  }

  /**
   * Set run error.
   */
  @Transactional()
  async setRunError(
    runId: string,
    owner: string,
    error: string
  ): Promise<RunRow | null> {
    const result = await this.db.notionImportRun.updateMany({
      where: {
        id: runId,
        leaseOwner: owner,
      },
      data: {
        lastError: error,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportRun.findUnique({ where: { id: runId } });
    return row ? this.mapRun(row) : null;
  }

  /**
   * Mark run as staged (all extraction complete).
   */
  @Transactional()
  async markRunStaged(runId: string, owner: string): Promise<RunRow | null> {
    const result = await this.db.notionImportRun.updateMany({
      where: {
        id: runId,
        leaseOwner: owner,
        status: NotionImportRunStatus.Running,
      },
      data: {
        status: NotionImportRunStatus.Staged,
        leaseOwner: null,
        leaseExpiresAt: null,
        tokenCipher: null, // No longer needed
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportRun.findUnique({ where: { id: runId } });
    return row ? this.mapRun(row) : null;
  }

  /**
   * Expire runs that have passed their expiry time.
   */
  @Transactional()
  async expireRuns(): Promise<number> {
    const now = new Date();
    const result = await this.db.notionImportRun.updateMany({
      where: {
        status: { in: [NotionImportRunStatus.Pending, NotionImportRunStatus.Running, NotionImportRunStatus.Paused] },
        expiresAt: { lt: now },
      },
      data: {
        status: NotionImportRunStatus.Expired,
        leaseOwner: null,
        leaseExpiresAt: null,
        tokenCipher: null,
        updatedAt: now,
      },
    });

    return result.count;
  }

  // ==========================================================================
  // Task operations
  // ==========================================================================

  /**
   * Enqueue tasks for a run. Idempotent: (run, kind, target) is unique.
   */
  @Transactional()
  async enqueueTasks(
    runId: string,
    tasks: Array<{
      kind: NotionImportTaskKind;
      targetId: string;
      cursor?: string;
    }>
  ): Promise<number> {
    const now = new Date();
    let count = 0;

    for (const task of tasks) {
      const result = await this.db.notionImportTask.upsert({
        where: {
          runId_kind_targetId: {
            runId,
            kind: task.kind,
            targetId: task.targetId,
          },
        },
        create: {
          runId,
          kind: task.kind,
          targetId: task.targetId,
          status: NotionImportTaskStatus.Pending,
          cursor: task.cursor ?? null,
          attempts: 0,
          nextAttemptAt: null,
          lastError: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          createdAt: now,
          updatedAt: now,
        },
        update: {
          // If already exists but was failed, reset it
          status: NotionImportTaskStatus.Pending,
          cursor: task.cursor ?? undefined,
          attempts: 0,
          nextAttemptAt: null,
          lastError: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          updatedAt: now,
        },
      });

      // Only count new tasks
      if (result.createdAt === now) {
        count++;
      }
    }

    return count;
  }

  /**
   * Claim a batch of pending tasks for processing.
   */
  @Transactional()
  async claimTasks(
    runId: string,
    owner: string,
    limit: number
  ): Promise<TaskRow[]> {
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_TTL_MS);

    // Use a transaction to claim tasks atomically
    const rows = await this.db.$transaction([
      this.db.notionImportTask.updateMany({
        where: {
          runId,
          status: NotionImportTaskStatus.Pending,
          nextAttemptAt: { lte: now },
        },
        data: {
          status: NotionImportTaskStatus.Leased,
          leaseOwner: owner,
          leaseExpiresAt,
          updatedAt: now,
        },
      }),
      this.db.notionImportTask.findMany({
        where: {
          runId,
          leaseOwner: owner,
          status: NotionImportTaskStatus.Leased,
        },
        take: limit,
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // The first result is the update count, second is the rows
    return (rows[1] as any[]).map(this.mapTask);
  }

  /**
   * Complete a task successfully.
   */
  @Transactional()
  async completeTask(
    taskId: string,
    owner: string,
    cursor: string | null
  ): Promise<TaskRow | null> {
    const result = await this.db.notionImportTask.updateMany({
      where: {
        id: taskId,
        leaseOwner: owner,
        status: NotionImportTaskStatus.Leased,
      },
      data: {
        status: NotionImportTaskStatus.Done,
        cursor,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportTask.findUnique({ where: { id: taskId } });
    return row ? this.mapTask(row) : null;
  }

  /**
   * Fail a task with an error. It will be retried later.
   */
  @Transactional()
  async failTask(
    taskId: string,
    owner: string,
    error: string,
    nextAttemptAt: Date
  ): Promise<TaskRow | null> {
    const result = await this.db.notionImportTask.updateMany({
      where: {
        id: taskId,
        leaseOwner: owner,
        status: NotionImportTaskStatus.Leased,
      },
      data: {
        status: NotionImportTaskStatus.Pending,
        lastError: error,
        attempts: { increment: 1 },
        nextAttemptAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportTask.findUnique({ where: { id: taskId } });
    return row ? this.mapTask(row) : null;
  }

  /**
   * Mark a task as permanently failed (no more retries).
   */
  @Transactional()
  async markTaskFailed(
    taskId: string,
    owner: string,
    error: string
  ): Promise<TaskRow | null> {
    const result = await this.db.notionImportTask.updateMany({
      where: {
        id: taskId,
        leaseOwner: owner,
      },
      data: {
        status: NotionImportTaskStatus.Failed,
        lastError: error,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportTask.findUnique({ where: { id: taskId } });
    return row ? this.mapTask(row) : null;
  }

  /**
   * Get task count by status for a run.
   */
  async countTasks(runId: string): Promise<Record<NotionImportTaskStatus, number>> {
    const counts = await this.db.notionImportTask.groupBy({
      by: ['status'],
      where: { runId },
      _count: { _all: true },
    });

    const result: Record<NotionImportTaskStatus, number> = {
      Pending: 0,
      Leased: 0,
      Done: 0,
      Failed: 0,
    };

    for (const count of counts) {
      result[count.status as NotionImportTaskStatus] = count._count._all;
    }

    return result;
  }

  // ==========================================================================
  // Item operations
  // ==========================================================================

  /**
   * Stage items for a run. Insert-if-absent based on (run, kind, notionId).
   */
  @Transactional()
  async stageItems(
    runId: string,
    items: Array<{
      kind: NotionImportItemKind;
      notionId: string;
      payload: any;
      payloadHash: string;
      parentId?: string;
      position?: number;
    }>
  ): Promise<number> {
    const now = new Date();
    let count = 0;

    for (const item of items) {
      const result = await this.db.notionImportItem.upsert({
        where: {
          runId_kind_notionId: {
            runId,
            kind: item.kind,
            notionId: item.notionId,
          },
        },
        create: {
          runId,
          kind: item.kind,
          notionId: item.notionId,
          payload: item.payload,
          payloadHash: item.payloadHash,
          parentId: item.parentId ?? null,
          position: item.position ?? null,
          createdAt: now,
        },
        update: {
          payload: item.payload,
          payloadHash: item.payloadHash,
          parentId: item.parentId ?? undefined,
          position: item.position ?? undefined,
        },
      });

      if (result.createdAt === now) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get all items for a run.
   */
  async getItems(runId: string): Promise<ItemRow[]> {
    const rows = await this.db.notionImportItem.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(this.mapItem);
  }

  /**
   * Get items by kind for a run.
   */
  async getItemsByKind(
    runId: string,
    kind: NotionImportItemKind
  ): Promise<ItemRow[]> {
    const rows = await this.db.notionImportItem.findMany({
      where: { runId, kind },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(this.mapItem);
  }

  /**
   * Get a specific item by notionId and kind.
   */
  async getItem(
    runId: string,
    kind: NotionImportItemKind,
    notionId: string
  ): Promise<ItemRow | null> {
    const row = await this.db.notionImportItem.findUnique({
      where: {
        runId_kind_notionId: { runId, kind, notionId },
      },
    });

    return row ? this.mapItem(row) : null;
  }

  // ==========================================================================
  // File operations
  // ==========================================================================

  /**
   * Register files to be mirrored.
   */
  @Transactional()
  async registerFiles(
    runId: string,
    files: Array<{
      ownerId: string;
      slot: string;
    }>
  ): Promise<number> {
    const now = new Date();
    let count = 0;

    for (const file of files) {
      const result = await this.db.notionImportFile.upsert({
        where: {
          runId_ownerId_slot: {
            runId,
            ownerId: file.ownerId,
            slot: file.slot,
          },
        },
        create: {
          runId,
          ownerId: file.ownerId,
          slot: file.slot,
          blobKey: null,
          status: NotionImportFileStatus.Pending,
          error: null,
          createdAt: now,
          updatedAt: now,
        },
        update: {},
      });

      if (result.createdAt === now) {
        count++;
      }
    }

    return count;
  }

  /**
   * Mark a file as stored with its blob key.
   */
  @Transactional()
  async markFileStored(
    runId: string,
    ownerId: string,
    slot: string,
    blobKey: string
  ): Promise<FileRow | null> {
    const result = await this.db.notionImportFile.updateMany({
      where: {
        runId,
        ownerId,
        slot,
        status: NotionImportFileStatus.Pending,
      },
      data: {
        blobKey,
        status: NotionImportFileStatus.Stored,
        error: null,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportFile.findUnique({
      where: {
        runId_ownerId_slot: { runId, ownerId, slot },
      },
    });

    return row ? this.mapFile(row) : null;
  }

  /**
   * Mark a file as unavailable.
   */
  @Transactional()
  async markFileUnavailable(
    runId: string,
    ownerId: string,
    slot: string,
    error: string
  ): Promise<FileRow | null> {
    const result = await this.db.notionImportFile.updateMany({
      where: {
        runId,
        ownerId,
        slot,
      },
      data: {
        status: NotionImportFileStatus.Unavailable,
        error,
        updatedAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    const row = await this.db.notionImportFile.findUnique({
      where: {
        runId_ownerId_slot: { runId, ownerId, slot },
      },
    });

    return row ? this.mapFile(row) : null;
  }

  /**
   * Get all files for a run.
   */
  async getFiles(runId: string): Promise<FileRow[]> {
    const rows = await this.db.notionImportFile.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(this.mapFile);
  }

  /**
   * Get files by status.
   */
  async getFilesByStatus(
    runId: string,
    status: NotionImportFileStatus
  ): Promise<FileRow[]> {
    const rows = await this.db.notionImportFile.findMany({
      where: { runId, status },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(this.mapFile);
  }

  // ==========================================================================
  // Ledger operations
  // ==========================================================================

  /**
   * Record a ledger entry for an object's import outcome.
   */
  @Transactional()
  async recordLedger(
    runId: string,
    entry: {
      notionId: string;
      subject: string;
      outcome: NotionImportOutcome;
      warningCode?: string;
      contentHash?: string;
      message?: string;
    }
  ): Promise<LedgerRow> {
    const now = new Date();

    const row = await this.db.notionImportLedger.upsert({
      where: {
        runId_notionId_subject: {
          runId,
          notionId: entry.notionId,
          subject: entry.subject,
        },
      },
      create: {
        runId,
        notionId: entry.notionId,
        subject: entry.subject,
        outcome: entry.outcome,
        warningCode: entry.warningCode ?? null,
        contentHash: entry.contentHash ?? null,
        message: entry.message ?? null,
        createdAt: now,
      },
      update: {
        outcome: entry.outcome,
        warningCode: entry.warningCode ?? undefined,
        contentHash: entry.contentHash ?? undefined,
        message: entry.message ?? undefined,
      },
    });

    return this.mapLedger(row);
  }

  /**
   * Get ledger entries for a run.
   */
  async getLedger(runId: string): Promise<LedgerRow[]> {
    const rows = await this.db.notionImportLedger.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map(this.mapLedger);
  }

  /**
   * Count ledger entries by outcome.
   */
  async countLedgerByOutcome(
    runId: string
  ): Promise<Record<NotionImportOutcome, number>> {
    const counts = await this.db.notionImportLedger.groupBy({
      by: ['outcome'],
      where: { runId },
      _count: { _all: true },
    });

    const result: Record<NotionImportOutcome, number> = {
      Mapped: 0,
      Degraded: 0,
      PreservedOnly: 0,
      Unrecoverable: 0,
    };

    for (const count of counts) {
      result[count.outcome as NotionImportOutcome] = count._count._all;
    }

    return result;
  }

  // ==========================================================================
  // Preserved Record operations
  // ==========================================================================

  /**
   * Upsert a preserved record. These outlive the run's retention window.
   */
  @Transactional()
  async upsertPreservedRecord(
    workspaceId: string,
    record: {
      kind: string;
      notionId: string;
      payload: any;
      payloadHash: string;
    }
  ): Promise<PreservedRow> {
    const now = new Date();

    const row = await this.db.notionPreservedRecord.upsert({
      where: {
        workspaceId_kind_notionId: {
          workspaceId,
          kind: record.kind,
          notionId: record.notionId,
        },
      },
      create: {
        workspaceId,
        kind: record.kind,
        notionId: record.notionId,
        payload: record.payload,
        payloadHash: record.payloadHash,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        payload: record.payload,
        payloadHash: record.payloadHash,
        updatedAt: now,
      },
    });

    return this.mapPreserved(row);
  }

  /**
   * Get a preserved record.
   */
  async getPreservedRecord(
    workspaceId: string,
    kind: string,
    notionId: string
  ): Promise<PreservedRow | null> {
    const row = await this.db.notionPreservedRecord.findUnique({
      where: {
        workspaceId_kind_notionId: { workspaceId, kind, notionId },
      },
    });

    return row ? this.mapPreserved(row) : null;
  }

  /**
   * Delete preserved records for a run's items.
   * Called when the run is deleted or when we want to clean up.
   */
  @Transactional()
  async deletePreservedRecords(
    workspaceId: string,
    kind: string,
    notionIds: string[]
  ): Promise<number> {
    const result = await this.db.notionPreservedRecord.deleteMany({
      where: {
        workspaceId,
        kind,
        notionId: { in: notionIds },
      },
    });

    return result.count;
  }

  // ==========================================================================
  // Helper mappers
  // ==========================================================================

  private mapRun(row: any): RunRow {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      createdBy: row.created_by,
      status: row.status,
      tokenCipher: row.token_cipher,
      scope: row.scope,
      progress: row.progress,
      includeBlockComments: row.include_block_comments,
      lastError: row.last_error,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: row.lease_expires_at,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapTask(row: any): TaskRow {
    return {
      id: row.id,
      runId: row.run_id,
      kind: row.kind,
      targetId: row.target_id,
      status: row.status,
      cursor: row.cursor,
      attempts: row.attempts,
      nextAttemptAt: row.next_attempt_at,
      lastError: row.last_error,
      leaseOwner: row.lease_owner,
      leaseExpiresAt: row.lease_expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapItem(row: any): ItemRow {
    return {
      id: row.id,
      runId: row.run_id,
      kind: row.kind,
      notionId: row.notion_id,
      payload: row.payload,
      payloadHash: row.payload_hash,
      parentId: row.parent_id,
      position: row.position,
      createdAt: row.created_at,
    };
  }

  private mapFile(row: any): FileRow {
    return {
      id: row.id,
      runId: row.run_id,
      ownerId: row.owner_id,
      slot: row.slot,
      blobKey: row.blob_key,
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapLedger(row: any): LedgerRow {
    return {
      id: row.id,
      runId: row.run_id,
      notionId: row.notion_id,
      subject: row.subject,
      outcome: row.outcome,
      warningCode: row.warning_code,
      contentHash: row.content_hash,
      message: row.message,
      createdAt: row.created_at,
    };
  }

  private mapPreserved(row: any): PreservedRow {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      kind: row.kind,
      notionId: row.notion_id,
      payload: row.payload,
      payloadHash: row.payload_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
