export type RunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'staged'
  | 'failed'
  | 'cancelled'
  | 'expired';

const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  pending: ['running', 'cancelled', 'expired'],
  running: ['paused', 'staged', 'failed', 'cancelled'],
  paused: ['running', 'cancelled', 'expired'],
  staged: ['expired', 'cancelled'],
  failed: ['running', 'expired'],
  cancelled: ['expired'],
  expired: [],
};

/** States in which the stored Notion token must no longer exist. */
export const TOKEN_FREE_STATES: readonly RunStatus[] = [
  'staged',
  'failed',
  'cancelled',
  'expired',
];

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal import run transition ${from} -> ${to}`);
  }
}

/** Exponential backoff for a failed task, capped at ten minutes. */
export function retryDelayMs(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 10 * 60_000);
}
