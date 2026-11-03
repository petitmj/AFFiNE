import type { RunStatus } from './lifecycle';
import type {
  FileRecord,
  ImportWarning,
  JsonObject,
  ListPage,
  MirroredFile,
  NewTask,
  StagedItem,
  TaskRef,
} from './types';

export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  /** Parsed body, or null when it was empty or not JSON. */
  json: unknown;
}

/** Sends one HTTP request. The production adapter wraps the SSRF-safe fetch. */
export interface HttpPort {
  send(request: HttpRequest): Promise<HttpResponse>;
}

/** The slice of the Notion API the Extract stage uses. */
export interface NotionApi {
  search(cursor: string | null): Promise<ListPage>;
  listUsers(cursor: string | null): Promise<ListPage>;
  retrievePage(id: string): Promise<JsonObject>;
  retrieveBlock(id: string): Promise<JsonObject>;
  retrieveDatabase(id: string): Promise<JsonObject>;
  retrieveDataSource(id: string): Promise<JsonObject>;
  queryDataSource(
    id: string,
    options: { cursor: string | null; createdOnOrAfter: string | null }
  ): Promise<ListPage>;
  listBlockChildren(id: string, cursor: string | null): Promise<ListPage>;
  retrievePageProperty(
    pageId: string,
    propertyId: string,
    cursor: string | null
  ): Promise<ListPage>;
  listComments(blockId: string, cursor: string | null): Promise<ListPage>;
}

/** Writes staged Notion objects. Writes are insert-if-absent, so replaying a task is harmless. */
export interface StagingStore {
  putItems(runId: string, items: StagedItem[]): Promise<void>;
}

export interface FileRegistry {
  get(runId: string, ownerId: string, slot: string): Promise<FileRecord | null>;
  upsert(runId: string, record: FileRecord): Promise<void>;
}

/** Downloads a file and stores it in the workspace blob store. */
export interface FileMirror {
  mirror(input: { url: string; name: string | null }): Promise<MirroredFile>;
}

export interface TaskFailure {
  error: string;
  /** Null: the task is finished for good and will not be retried. */
  retryAt: Date | null;
}

/** Durable task queue and run bookkeeping behind the processor. */
export interface RunRepository {
  status(runId: string): Promise<RunStatus | null>;
  /** Leases the next due task, or null when none is due. */
  claimNextTask(runId: string, now: Date): Promise<TaskRef | null>;
  /** Keeps the task pending and records where to resume. */
  checkpoint(taskId: string, cursor: string): Promise<void>;
  complete(taskId: string): Promise<void>;
  fail(taskId: string, failure: TaskFailure): Promise<void>;
  /** Idempotent: a task for the same kind and target is never added twice. */
  enqueue(runId: string, tasks: NewTask[]): Promise<void>;
  /** Tasks that are pending or leased. */
  unfinishedCount(runId: string): Promise<number>;
  appendWarnings(runId: string, warnings: ImportWarning[]): Promise<void>;
  /** After a task gives up: files it still owed become unavailable, not lost silently. */
  markOwnerFilesUnavailable(
    runId: string,
    ownerId: string,
    message: string
  ): Promise<void>;
}
