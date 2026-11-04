import type {
  Checkpoint,
  FileRef,
  LedgerEntry,
  PreservedRecord,
  RunId,
  RunRecord,
  StagedItem,
  TaskKind,
  TaskOutcome,
  TaskRecord,
  TaskWarning,
} from './types';

// ============================================================================
// Ports (Interfaces) for Notion Import Domain
// ============================================================================
// These define the contracts that the domain layer depends on.
// Concrete implementations are provided by adapters.

/**
 * Port for making HTTP requests to Notion's API.
 */
export interface HttpPort {
  /**
   * Make an HTTP request to Notion.
   * @param request - The request configuration
   * @param token - The Notion integration token
   * @param apiVersion - The Notion API version to use
   * @returns The response with status, body, and headers
   */
  request(
    request: HttpRequest,
    token: string,
    apiVersion: string
  ): Promise<HttpResponse>;
}

/** HTTP request configuration */
export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
}

/** HTTP response */
export interface HttpResponse {
  status: number;
  json(): Promise<unknown>;
  header(name: string): string | null;
}

/**
 * Port for staging extracted Notion objects.
 */
export interface StagingStore {
  /**
   * Stage items extracted from Notion.
   * Insert-if-absent based on (runId, kind, notionId).
   */
  stageItems(runId: RunId, items: StagedItem[]): Promise<number>;

  /**
   * Get all items for a run.
   */
  getItems(runId: RunId): Promise<StagedItem[]>;

  /**
   * Get items by kind for a run.
   */
  getItemsByKind(runId: RunId, kind: TaskKind): Promise<StagedItem[]>;

  /**
   * Get a specific item.
   */
  getItem(runId: RunId, kind: TaskKind, notionId: string): Promise<StagedItem | null>;

  /**
   * Enqueue tasks for processing.
   */
  enqueueTasks(
    runId: RunId,
    tasks: Array<{ kind: TaskKind; targetId: string; cursor?: string }>
  ): Promise<number>;

  /**
   * Get the run record.
   */
  getRun(runId: RunId): Promise<RunRecord | null>;

  /**
   * Update the run's progress.
   */
  updateRunProgress(runId: RunId, owner: string, progress: any): Promise<RunRecord | null>;

  /**
   * Mark the run as staged (extraction complete).
   */
  markRunStaged(runId: RunId, owner: string): Promise<RunRecord | null>;

  /**
   * Record a ledger entry.
   */
  recordLedger(runId: RunId, entry: LedgerEntry): Promise<void>;

  /**
   * Get ledger entries for a run.
   */
  getLedger(runId: RunId): Promise<LedgerEntry[]>;

  /**
   * Get task count by status.
   */
  countTasks(runId: RunId): Promise<Record<string, number>>;
}

/**
 * Port for managing file mirroring from Notion to AFFiNE storage.
 */
export interface FileRegistry {
  /**
   * Register files that need to be mirrored.
   */
  registerFiles(runId: RunId, files: FileRef[]): Promise<number>;

  /**
   * Get all files for a run.
   */
  getFiles(runId: RunId): Promise<FileRef[]>;

  /**
   * Get files by status.
   */
  getFilesByStatus(runId: RunId, status: string): Promise<FileRef[]>;

  /**
   * Mark a file as stored with its blob key.
   */
  markFileStored(runId: RunId, ownerId: string, slot: string, blobKey: string): Promise<void>;

  /**
   * Mark a file as unavailable.
   */
  markFileUnavailable(runId: RunId, ownerId: string, slot: string, error: string): Promise<void>;
}

/**
 * Port for mirroring files from Notion to AFFiNE blob storage.
 */
export interface FileMirror {
  /**
   * Download and mirror a file from Notion to AFFiNE storage.
   * @param runId - The run ID
   * @param ref - The file reference
   * @param maxBytes - Maximum size to download
   * @returns The blob key where the file was stored
   */
  mirror(runId: RunId, ref: FileRef, maxBytes: number): Promise<string>;
}

/**
 * Port for accessing preserved records.
 */
export interface PreservedRecordStore {
  /**
   * Upsert a preserved record.
   */
  upsert(record: PreservedRecord): Promise<void>;

  /**
   * Get a preserved record.
   */
  get(workspaceId: string, kind: string, notionId: string): Promise<PreservedRecord | null>;
}

/**
 * Port for run lifecycle management.
 */
export interface RunRepository {
  /**
   * Create a new run.
   */
  create(input: {
    workspaceId: string;
    createdBy: string | null;
    tokenCipher: string;
    scope: any;
    includeBlockComments: boolean;
  }): Promise<RunRecord>;

  /**
   * Get a run by ID.
   */
  get(runId: RunId): Promise<RunRecord | null>;

  /**
   * Claim a run's lease for processing.
   */
  claimLease(runId: RunId, owner: string): Promise<RunRecord | null>;

  /**
   * Renew a run's lease.
   */
  renewLease(runId: RunId, owner: string): Promise<RunRecord | null>;

  /**
   * Release a run's lease.
   */
  releaseLease(runId: RunId, owner: string, status: string): Promise<RunRecord | null>;

  /**
   * Set run error.
   */
  setError(runId: RunId, owner: string, error: string): Promise<RunRecord | null>;

  /**
   * Expire runs that have passed their expiry time.
   */
  expireRuns(): Promise<number>;

  /**
   * List runs for a workspace.
   */
  listRuns(workspaceId: string, statuses?: string[]): Promise<RunRecord[]>;
}

/**
 * Port for task lifecycle management.
 */
export interface TaskRepository {
  /**
   * Claim a batch of tasks for processing.
   */
  claimTasks(runId: RunId, owner: string, limit: number): Promise<TaskRecord[]>;

  /**
   * Complete a task successfully.
   */
  completeTask(taskId: TaskId, owner: string, cursor: Checkpoint): Promise<TaskRecord | null>;

  /**
   * Fail a task with the option to retry.
   */
  failTask(
    taskId: TaskId,
    owner: string,
    error: string,
    nextAttemptAt: Date
  ): Promise<TaskRecord | null>;

  /**
   * Mark a task as permanently failed.
   */
  markFailed(taskId: TaskId, owner: string, error: string): Promise<TaskRecord | null>;

  /**
   * Get a task by ID.
   */
  getTask(taskId: TaskId): Promise<TaskRecord | null>;

  /**
   * Count tasks by status.
   */
  countByStatus(runId: RunId): Promise<Record<string, number>>;
}

/**
 * Combined port for all repository operations.
 * This is the main dependency injected into the domain layer.
 */
export interface ImportRepositories {
  runs: RunRepository;
  tasks: TaskRepository;
  staging: StagingStore;
  files: FileRegistry;
  preserved: PreservedRecordStore;
}
