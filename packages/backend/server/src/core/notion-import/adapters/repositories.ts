import type { NotionImportTask, Prisma } from '@prisma/client';

import type { NotionImportModel } from '../../../models';
import { payloadHash } from '../domain/canonical';
import type { RunStatus } from '../domain/lifecycle';
import type {
  FileRegistry,
  RunRepository,
  StagingStore,
  TaskFailure,
} from '../domain/ports';
import type {
  FileRecord,
  ImportWarning,
  NewTask,
  StagedItem,
  TaskRef,
} from '../domain/types';

const MAX_STORED_WARNINGS = 200;

export interface RunProgress {
  warningCount: number;
  warnings: ImportWarning[];
  crashCount: number;
}

export function readProgress(value: unknown): RunProgress {
  const raw =
    typeof value === 'object' && value !== null
      ? (value as Partial<RunProgress>)
      : {};
  return {
    warningCount: typeof raw.warningCount === 'number' ? raw.warningCount : 0,
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    crashCount: typeof raw.crashCount === 'number' ? raw.crashCount : 0,
  };
}

function toTaskRef(row: NotionImportTask): TaskRef {
  return {
    id: row.id,
    runId: row.runId,
    kind: row.kind,
    targetId: row.targetId,
    cursor: row.cursor,
    attempts: row.attempts,
  };
}

export class ModelRunRepository implements RunRepository {
  constructor(private readonly model: NotionImportModel) {}

  async status(runId: string): Promise<RunStatus | null> {
    return (await this.model.getRun(runId))?.status ?? null;
  }

  async claimNextTask(runId: string, now: Date) {
    const row = await this.model.claimNextTask(runId, now);
    return row ? toTaskRef(row) : null;
  }

  checkpoint(taskId: string, cursor: string) {
    return this.model.checkpointTask(taskId, cursor);
  }

  complete(taskId: string) {
    return this.model.completeTask(taskId);
  }

  fail(taskId: string, failure: TaskFailure) {
    return this.model.failTask(taskId, failure.error, failure.retryAt);
  }

  enqueue(runId: string, tasks: NewTask[]) {
    return this.model.enqueue(runId, tasks);
  }

  unfinishedCount(runId: string) {
    return this.model.countUnfinishedTasks(runId);
  }

  async appendWarnings(runId: string, warnings: ImportWarning[]) {
    const run = await this.model.getRun(runId);
    if (!run) return;
    const progress = readProgress(run.progress);
    const next: RunProgress = {
      ...progress,
      warningCount: progress.warningCount + warnings.length,
      // Only the newest are kept in the row; the count stays exact.
      warnings: [...progress.warnings, ...warnings].slice(-MAX_STORED_WARNINGS),
    };
    await this.model.updateProgress(runId, next as unknown as Prisma.InputJsonValue);
  }

  markOwnerFilesUnavailable(runId: string, ownerId: string, message: string) {
    return this.model.markOwnerFilesUnavailable(runId, ownerId, message);
  }
}

export class ModelStagingStore implements StagingStore {
  constructor(private readonly model: NotionImportModel) {}

  putItems(runId: string, items: StagedItem[]) {
    return this.model.putItems(
      runId,
      items.map(item => ({
        ...item,
        payload: item.payload as Prisma.InputJsonValue,
        payloadHash: payloadHash(item.payload),
      }))
    );
  }
}

export class ModelFileRegistry implements FileRegistry {
  constructor(private readonly model: NotionImportModel) {}

  async get(runId: string, ownerId: string, slot: string) {
    const row = await this.model.getFile(runId, ownerId, slot);
    if (!row) return null;
    const record: FileRecord = {
      ownerId: row.ownerId,
      slot: row.slot,
      status: row.status,
      blobKey: row.blobKey,
      size: row.size,
      mime: row.mime,
      lastError: row.lastError,
    };
    return record;
  }

  upsert(runId: string, record: FileRecord) {
    return this.model.upsertFile(runId, record);
  }
}
