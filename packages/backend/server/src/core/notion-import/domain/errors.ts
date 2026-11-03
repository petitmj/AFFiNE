/** A Notion API failure. Never carries the token or the request headers. */
export class NotionApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retriable: boolean
  ) {
    super(message);
    this.name = 'NotionApiError';
  }

  /** The integration lost access for good: the run cannot continue. */
  get isFatalForRun() {
    return this.status === 401;
  }
}

export class FileMirrorError extends Error {
  constructor(
    message: string,
    /** True when fetching the owner again for a fresh URL may help. */
    readonly retriable: boolean
  ) {
    super(message);
    this.name = 'FileMirrorError';
  }
}

/** Thrown by a handler when the task should be retried later with backoff. */
export class RetryTaskError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryTaskError';
  }
}
