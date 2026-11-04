import type {
  NotionImportFileStatus,
  NotionImportItemKind,
  NotionImportOutcome,
  NotionImportRunStatus,
  NotionImportTaskKind,
  NotionImportTaskStatus,
} from '@prisma/client';

// ============================================================================
// GraphQL Input/Output Types
// ============================================================================

export type NotionImportMode = 'merge' | 'skip-if-diverged' | 'overwrite';

export interface NotionImportInput {
  workspaceId: string;
  token: string;
  mode: NotionImportMode;
  includeBlockComments: boolean;
}

export interface NotionImportRunOutput {
  id: string;
  workspaceId: string;
  createdBy: string | null;
  status: NotionImportRunStatus;
  mode: NotionImportMode;
  scope: any;
  progress: any;
  includeBlockComments: boolean;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  canRetry: boolean;
  canCancel: boolean;
}

export interface NotionImportTaskOutput {
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
}

export interface NotionImportItemOutput {
  id: string;
  runId: string;
  kind: NotionImportItemKind;
  notionId: string;
  payload: any;
  payloadHash: string;
  parentId: string | null;
  position: number | null;
  createdAt: Date;
}

export interface NotionImportFileOutput {
  id: string;
  runId: string;
  ownerId: string;
  slot: string;
  blobKey: string | null;
  status: NotionImportFileStatus;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotionImportLedgerEntryOutput {
  id: string;
  runId: string;
  notionId: string;
  subject: string;
  outcome: NotionImportOutcome;
  warningCode: string | null;
  contentHash: string | null;
  message: string | null;
  createdAt: Date;
}

// ============================================================================
// Domain Types
// ============================================================================

export type TaskKind = NotionImportTaskKind;
export type ItemKind = NotionImportItemKind;
export type RunStatus = NotionImportRunStatus;
export type TaskStatus = NotionImportTaskStatus;
export type FileStatus = NotionImportFileStatus;
export type Outcome = NotionImportOutcome;

/** A staged item from Notion */
export interface StagedItem {
  id: string;
  kind: ItemKind;
  notionId: string;
  payload: unknown;
  payloadHash: string;
  parentId?: string;
  position?: number;
}

/** A checkpoint for resuming pagination */
export interface Checkpoint {
  nextCursor: string | null;
  staged: boolean;
  windowStart: string | null;
}

/** A reference to a hosted file in a staged object */
export interface HostedFileRef {
  ownerId: string;
  slot: string;
  url: string;
}

/** A warning recorded during import */
export interface TaskWarning {
  code: string;
  message: string;
  notionId?: string;
  sourcePath?: string;
}

/** A run record with its configuration */
export interface RunRecord {
  id: string;
  workspaceId: string;
  createdBy: string | null;
  status: RunStatus;
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
}

/** A task record */
export interface TaskRecord {
  id: string;
  runId: string;
  kind: TaskKind;
  targetId: string;
  status: TaskStatus;
  cursor: string | null;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Configuration for the import processor */
export interface ProcessorConfig {
  maxTaskAttempts: number;
  taskSliceMs: number;
  leaseTtlMs: number;
  runTtlHours: number;
}
