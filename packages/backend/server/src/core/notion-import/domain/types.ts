/**
 * Shared vocabulary of the Notion import Extract stage.
 *
 * Nothing in `domain/` imports NestJS, Prisma or the native layer. Persistence
 * and HTTP are reached through the ports in `ports.ts`, so the whole stage can
 * be exercised with in-memory fakes.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type TaskKind =
  | 'search'
  | 'users'
  | 'page'
  | 'database'
  | 'database_rows'
  | 'block_children'
  | 'property_page'
  | 'comments'
  | 'download_file';

export type ItemKind =
  | 'page'
  | 'database'
  | 'data_source'
  | 'block'
  | 'property'
  | 'comment'
  | 'user';

export type OwnerKind = 'block' | 'page' | 'database' | 'comment';

export interface NewTask {
  kind: TaskKind;
  targetId: string;
}

export interface TaskRef {
  id: string;
  runId: string;
  kind: TaskKind;
  targetId: string;
  /** Opaque checkpoint written by the handler that owns the task. */
  cursor: string | null;
  attempts: number;
}

export interface StagedItem {
  kind: ItemKind;
  notionId: string;
  parentId: string | null;
  position: number;
  /** The Notion object exactly as returned. Never reshaped. */
  payload: JsonObject;
}

export interface ImportWarning {
  /** Phase 2 warning code, e.g. `unsupported_block`, `file_unavailable`. */
  code: string;
  message: string;
  notionId?: string;
}

export interface TaskResult {
  /** Non-null: the task stays pending and resumes from this checkpoint. */
  nextCursor: string | null;
  newTasks: NewTask[];
  warnings: ImportWarning[];
}

export interface RunOptions {
  /** Empty means everything the integration can see. */
  roots: string[];
  /** Fetch comments of every block, not only of pages. One request per block. */
  includeBlockComments: boolean;
}

export interface ListPage {
  results: JsonObject[];
  nextCursor: string | null;
  hasMore: boolean;
  /** Notion stopped the query early (10,000 row cap). */
  incomplete: boolean;
}

export interface FileRef {
  /** Which slot of the owner holds the file: file, cover, icon, prop:<id>:<i>, attachment:<i>. */
  slot: string;
  url: string;
  name: string | null;
}

export interface MirroredFile {
  blobKey: string;
  size: number;
  mime: string;
}

export type FileStatus = 'pending' | 'stored' | 'unavailable';

export interface FileRecord {
  ownerId: string;
  slot: string;
  status: FileStatus;
  blobKey: string | null;
  size: number | null;
  mime: string | null;
  lastError: string | null;
}
