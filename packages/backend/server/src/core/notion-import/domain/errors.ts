// ============================================================================
// Domain Errors for Notion Import
// ============================================================================

/**
 * Base error for Notion import domain.
 * All domain errors extend this class.
 */
export class NotionImportError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly data?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error raised when a Notion API request fails.
 * Retriable if the status code indicates a transient error.
 */
export class NotionHttpError extends NotionImportError {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly retriable: boolean = false
  ) {
    super(message, 'NOTION_HTTP_ERROR', { statusCode, retriable });
  }
}

/**
 * Error raised when the integration token is revoked or invalid.
 * This is fatal for the run - it cannot be retried.
 */
export class TokenRevokedError extends NotionImportError {
  constructor() {
    super('Notion integration token has been revoked or is invalid', 'TOKEN_REVOKED');
  }
}

/**
 * Error raised when a task fails fatally.
 * The task will not be retried.
 */
export class TaskFatalError extends NotionImportError {
  constructor(
    message: string,
    public readonly warning: TaskWarning
  ) {
    super(message, 'TASK_FATAL', { warning });
  }
}

/**
 * Error raised when an illegal state transition is attempted.
 * For example, trying to pause a run that is already staged.
 */
export class InvalidTransitionError extends NotionImportError {
  constructor(
    message: string,
    public readonly from: string,
    public readonly to: string
  ) {
    super(message, 'INVALID_TRANSITION', { from, to });
  }
}

/**
 * Error raised when a run's lease is lost to another worker.
 * The current worker should stop processing and let the new lease holder continue.
 */
export class LeaseLostError extends NotionImportError {
  constructor() {
    super('Run lease has been claimed by another worker', 'LEASE_LOST');
  }
}

/**
 * Error raised when a task's lease is lost.
 */
export class TaskLeaseLostError extends NotionImportError {
  constructor() {
    super('Task lease has been claimed by another worker', 'TASK_LEASE_LOST');
  }
}

/**
 * Error raised when the run has expired.
 */
export class RunExpiredError extends NotionImportError {
  constructor() {
    super('Import run has expired', 'RUN_EXPIRED');
  }
}

/**
 * Check if an error is retriable.
 */
export function isRetriableError(error: Error): boolean {
  if (error instanceof NotionHttpError) {
    return error.retriable;
  }
  if (error instanceof LeaseLostError) {
    return true;
  }
  if (error instanceof TaskLeaseLostError) {
    return true;
  }
  return false;
}

/**
 * Check if an error is fatal for the run (not just the task).
 */
export function isFatalError(error: Error): boolean {
  return error instanceof TokenRevokedError || error instanceof RunExpiredError;
}
