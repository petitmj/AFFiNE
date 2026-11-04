import type { Checkpoint, ItemKind, Outcome, StagedItem, TaskKind, TaskWarning } from '../types';

// ============================================================================
// Domain Types for Notion Import
// ============================================================================

/** Unique identifier for a run */
export type RunId = string;

/** Unique identifier for a task */
export type TaskId = string;

/** Notion object ID */
export type NotionId = string;

/**
 * Task context passed to handlers.
 * Contains everything needed to execute a single task.
 */
export interface TaskContext {
  run: RunRecord;
  task: TaskRecord;
  checkpoint: Checkpoint;
}

/**
 * Run record from the domain perspective.
 * Contains the essential fields needed for processing.
 */
export interface RunRecord {
  id: RunId;
  workspaceId: string;
  status: RunStatus;
  tokenCipher: string | null;
  scope: any;
  progress: any;
  includeBlockComments: boolean;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  expiresAt: Date | null;
}

/**
 * Task record from the domain perspective.
 */
export interface TaskRecord {
  id: TaskId;
  runId: RunId;
  kind: TaskKind;
  targetId: NotionId;
  status: TaskStatus;
  cursor: Checkpoint;
  attempts: number;
  nextAttemptAt: Date | null;
  lastError: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
}

/**
 * Outcome of executing a task.
 * nextCursor: if non-null, the task should be continued with this cursor.
 * warnings: any warnings generated during execution.
 */
export interface TaskOutcome {
  nextCursor: string | null;
  warnings?: TaskWarning[];
  windowStart?: string | null;
}

/**
 * Status of a run from the domain perspective.
 */
export type RunStatus = 
  | 'Pending'
  | 'Running'
  | 'Paused'
  | 'Staged'
  | 'Failed'
  | 'Cancelled'
  | 'Expired';

/**
 * Status of a task from the domain perspective.
 */
export type TaskStatus = 
  | 'Pending'
  | 'Leased'
  | 'Done'
  | 'Failed';

/**
 * File status from the domain perspective.
 */
export type FileStatus = 
  | 'Pending'
  | 'Stored'
  | 'Unavailable';

/**
 * Outcome classification for ledger entries.
 */
export type OutcomeType = Outcome;

/**
 * A file reference to be mirrored from Notion to AFFiNE storage.
 */
export interface FileRef {
  ownerId: NotionId;
  slot: string;
  url: string;
}

/**
 * Summary statistics for a run.
 */
export interface RunStats {
  tasks: {
    pending: number;
    leased: number;
    done: number;
    failed: number;
  };
  items: {
    users: number;
    pages: number;
    databases: number;
    dataSources: number;
    blocks: number;
    properties: number;
    comments: number;
  };
  files: {
    pending: number;
    stored: number;
    unavailable: number;
  };
  ledger: {
    mapped: number;
    degraded: number;
    preservedOnly: number;
    unrecoverable: number;
  };
}

/**
 * A preserved record that outlives the import run.
 */
export interface PreservedRecord {
  kind: PreservedKind;
  notionId: NotionId;
  payload: unknown;
  payloadHash: string;
}

/**
 * Kinds of objects that are preserved verbatim.
 */
export type PreservedKind = 
  | 'database'
  | 'data_source'
  | 'page_properties'
  | 'property_page';

/**
 * A ledger entry recording the outcome of mapping a Notion object.
 */
export interface LedgerEntry {
  notionId: NotionId;
  subject: string;
  outcome: OutcomeType;
  warningCode?: string;
  contentHash?: string;
  message?: string;
}
