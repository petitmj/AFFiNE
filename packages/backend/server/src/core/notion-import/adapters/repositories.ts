// ============================================================================
// Repositories Adapter for Notion Import
// ============================================================================

import { Injectable } from '@nestjs/common';

import { NotionImportModel } from '../../../models/notion-import';
import type {
  FileRegistry,
  ImportRepositories,
  RunRepository,
  StagingStore,
  TaskRepository,
  PreservedRecordStore,
} from '../domain/ports';
import type {
  Checkpoint,
  FileRef,
  LedgerEntry,
  PreservedRecord,
  RunId,
  RunRecord,
  RunStatus,
  StagedItem,
  TaskKind,
  TaskRecord,
  TaskStatus,
} from '../domain/types';
import { decodeCheckpoint, encodeCheckpoint, EMPTY_CHECKPOINT } from '../domain/cursor';

/**
 * Adapts the NotionImportModel to the domain layer's repository ports.
 * This implements dependency inversion: the domain never sees Prisma types.
 */
@Injectable()
export class NotionImportRepositories implements ImportRepositories {
  constructor(private readonly model: NotionImportModel) {}

  get runs(): RunRepository {
    return new RunRepositoryAdapter(this.model);
  }

  get tasks(): TaskRepository {
    return new TaskRepositoryAdapter(this.model);
  }

  get staging(): StagingStore {
    return new StagingStoreAdapter(this.model);
  }

  get files(): FileRegistry {
    return new FileRegistryAdapter(this.model);
  }

  get preserved(): PreservedRecordStore {
    return new PreservedRecordStoreAdapter(this.model);
  }
}

// ============================================================================
// Run Repository Adapter
// ============================================================================

class RunRepositoryAdapter implements RunRepository {
  constructor(private readonly model: NotionImportModel) {}

  async create(input: {
    workspaceId: string;
    createdBy: string | null;
    tokenCipher: string;
    scope: any;
    includeBlockComments: boolean;
  }): Promise<RunRecord> {
    const row = await this.model.createRun({
      workspaceId: input.workspaceId,
      createdBy: input.createdBy,
      tokenCipher: input.tokenCipher,
      scope: input.scope,
      includeBlockComments: input.includeBlockComments,
    });

    return this.mapRun(row);
  }

  async get(runId: RunId): Promise<RunRecord | null> {
    // For now, we'll use a placeholder workspaceId
    // In production, this would need the actual workspaceId
    const row = await this.model.getRun('workspaceId', runId);
    return row ? this.mapRun(row) : null;
  }

  async claimLease(runId: RunId, owner: string): Promise<RunRecord | null> {
    const row = await this.model.claimRunLease(runId, owner);
    return row ? this.mapRun(row) : null;
  }

  async renewLease(runId: RunId, owner: string): Promise<RunRecord | null> {
    const row = await this.model.renewRunLease(runId, owner);
    return row ? this.mapRun(row) : null;
  }

  async releaseLease(runId: RunId, owner: string, status: string): Promise<RunRecord | null> {
    const row = await this.model.releaseRunLease(runId, owner, status as any);
    return row ? this.mapRun(row) : null;
  }

  async setError(runId: RunId, owner: string, error: string): Promise<RunRecord | null> {
    const row = await this.model.setRunError(runId, owner, error);
    return row ? this.mapRun(row) : null;
  }

  async expireRuns(): Promise<number> {
    return this.model.expireRuns();
  }

  async listRuns(workspaceId: string, statuses?: string[]): Promise<RunRecord[]> {
    const rows = await this.model.listRuns(
      workspaceId,
      statuses as any[]
    );
    return rows.map(this.mapRun);
  }

  private mapRun(row: any): RunRecord {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      status: row.status as RunStatus,
      tokenCipher: row.tokenCipher,
      scope: row.scope,
      progress: row.progress,
      includeBlockComments: row.includeBlockComments,
      lastError: row.lastError,
      leaseOwner: row.leaseOwner,
      leaseExpiresAt: row.leaseExpiresAt,
      expiresAt: row.expiresAt,
    };
  }
}

// ============================================================================
// Task Repository Adapter
// ============================================================================

class TaskRepositoryAdapter implements TaskRepository {
  constructor(private readonly model: NotionImportModel) {}

  async claimTasks(runId: RunId, owner: string, limit: number): Promise<TaskRecord[]> {
    const rows = await this.model.claimTasks(runId, owner, limit);
    return rows.map(this.mapTask);
  }

  async completeTask(taskId: string, owner: string, cursor: Checkpoint): Promise<TaskRecord | null> {
    const row = await this.model.completeTask(
      taskId,
      owner,
      encodeCheckpoint(cursor)
    );
    return row ? this.mapTask(row) : null;
  }

  async failTask(
    taskId: string,
    owner: string,
    error: string,
    nextAttemptAt: Date
  ): Promise<TaskRecord | null> {
    const row = await this.model.failTask(taskId, owner, error, nextAttemptAt);
    return row ? this.mapTask(row) : null;
  }

  async markFailed(taskId: string, owner: string, error: string): Promise<TaskRecord | null> {
    const row = await this.model.markTaskFailed(taskId, owner, error);
    return row ? this.mapTask(row) : null;
  }

  async getTask(taskId: string): Promise<TaskRecord | null> {
    // This would need to be added to NotionImportModel
    // For now, return null
    return null;
  }

  async countByStatus(runId: RunId): Promise<Record<string, number>> {
    const counts = await this.model.countTasks(runId);
    return counts;
  }

  private mapTask(row: any): TaskRecord {
    return {
      id: row.id,
      runId: row.runId,
      kind: row.kind as TaskKind,
      targetId: row.targetId,
      status: row.status as TaskStatus,
      cursor: decodeCheckpoint(row.cursor),
      attempts: row.attempts,
      nextAttemptAt: row.nextAttemptAt,
      lastError: row.lastError,
      leaseOwner: row.leaseOwner,
      leaseExpiresAt: row.leaseExpiresAt,
    };
  }
}

// ============================================================================
// Staging Store Adapter
// ============================================================================

class StagingStoreAdapter implements StagingStore {
  constructor(private readonly model: NotionImportModel) {}

  async stageItems(runId: RunId, items: StagedItem[]): Promise<number> {
    const mappedItems = items.map(item => ({
      kind: item.kind as any,
      notionId: item.notionId,
      payload: item.payload,
      payloadHash: item.payloadHash,
      parentId: item.parentId,
      position: item.position,
    }));
    return this.model.stageItems(runId, mappedItems);
  }

  async getItems(runId: RunId): Promise<StagedItem[]> {
    const rows = await this.model.getItems(runId);
    return rows.map(this.mapItem);
  }

  async getItemsByKind(runId: RunId, kind: TaskKind): Promise<StagedItem[]> {
    const rows = await this.model.getItemsByKind(runId, kind as any);
    return rows.map(this.mapItem);
  }

  async getItem(runId: RunId, kind: TaskKind, notionId: string): Promise<StagedItem | null> {
    const row = await this.model.getItem(runId, kind as any, notionId);
    return row ? this.mapItem(row) : null;
  }

  async enqueueTasks(
    runId: RunId,
    tasks: Array<{ kind: TaskKind; targetId: string; cursor?: string }>
  ): Promise<number> {
    return this.model.enqueueTasks(runId, tasks as any);
  }

  async getRun(runId: RunId): Promise<RunRecord | null> {
    const row = await this.model.getRun('workspaceId', runId);
    return row ? new RunRepositoryAdapter(this.model).mapRun(row) : null;
  }

  async updateRunProgress(runId: RunId, owner: string, progress: any): Promise<RunRecord | null> {
    return this.model.updateRunProgress(runId, owner, progress);
  }

  async markRunStaged(runId: RunId, owner: string): Promise<RunRecord | null> {
    return this.model.markRunStaged(runId, owner);
  }

  async recordLedger(runId: RunId, entry: LedgerEntry): Promise<void> {
    await this.model.recordLedger(runId, {
      notionId: entry.notionId,
      subject: entry.subject,
      outcome: entry.outcome as any,
      warningCode: entry.warningCode,
      contentHash: entry.contentHash,
      message: entry.message,
    });
  }

  async getLedger(runId: RunId): Promise<LedgerEntry[]> {
    const rows = await this.model.getLedger(runId);
    return rows.map(row => ({
      notionId: row.notionId,
      subject: row.subject,
      outcome: row.outcome as any,
      warningCode: row.warningCode || undefined,
      contentHash: row.contentHash || undefined,
      message: row.message || undefined,
    }));
  }

  async countTasks(runId: RunId): Promise<Record<string, number>> {
    return this.model.countTasks(runId);
  }

  private mapItem(row: any): StagedItem {
    return {
      id: row.id,
      kind: row.kind as any,
      notionId: row.notionId,
      payload: row.payload,
      payloadHash: row.payloadHash,
      parentId: row.parentId || undefined,
      position: row.position || undefined,
    };
  }
}

// ============================================================================
// File Registry Adapter
// ============================================================================

class FileRegistryAdapter implements FileRegistry {
  constructor(private readonly model: NotionImportModel) {}

  async registerFiles(runId: RunId, files: FileRef[]): Promise<number> {
    const mappedFiles = files.map(file => ({
      ownerId: file.ownerId,
      slot: file.slot,
    }));
    return this.model.registerFiles(runId, mappedFiles);
  }

  async getFiles(runId: RunId): Promise<FileRef[]> {
    const rows = await this.model.getFiles(runId);
    return rows.map(row => ({
      ownerId: row.ownerId,
      slot: row.slot,
      url: '', // URL is not stored in the model
    }));
  }

  async getFilesByStatus(runId: RunId, status: string): Promise<FileRef[]> {
    const rows = await this.model.getFilesByStatus(runId, status as any);
    return rows.map(row => ({
      ownerId: row.ownerId,
      slot: row.slot,
      url: '',
    }));
  }

  async markFileStored(runId: RunId, ownerId: string, slot: string, blobKey: string): Promise<void> {
    await this.model.markFileStored(runId, ownerId, slot, blobKey);
  }

  async markFileUnavailable(runId: RunId, ownerId: string, slot: string, error: string): Promise<void> {
    await this.model.markFileUnavailable(runId, ownerId, slot, error);
  }
}

// ============================================================================
// Preserved Record Store Adapter
// ============================================================================

class PreservedRecordStoreAdapter implements PreservedRecordStore {
  constructor(private readonly model: NotionImportModel) {}

  async upsert(record: PreservedRecord): Promise<void> {
    await this.model.upsertPreservedRecord(record.workspaceId, {
      kind: record.kind,
      notionId: record.notionId,
      payload: record.payload,
      payloadHash: record.payloadHash,
    });
  }

  async get(workspaceId: string, kind: string, notionId: string): Promise<PreservedRecord | null> {
    const row = await this.model.getPreservedRecord(workspaceId, kind, notionId);
    if (!row) {
      return null;
    }
    return {
      kind: row.kind,
      notionId: row.notionId,
      payload: row.payload,
      payloadHash: row.payloadHash,
      workspaceId: row.workspaceId,
    };
  }
}
