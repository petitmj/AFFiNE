// ============================================================================
// Run Lifecycle for Notion Import
// ============================================================================

import type { RunStatus } from './types';
import { InvalidTransitionError } from './errors';

/**
 * Valid state transitions for an import run.
 * This defines the state machine for run lifecycle.
 */
const VALID_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  Pending: ['Running', 'Cancelled', 'Expired'],
  Running: ['Paused', 'Staged', 'Failed', 'Cancelled', 'Expired'],
  Paused: ['Running', 'Cancelled', 'Expired'],
  Staged: ['Failed', 'Cancelled', 'Expired'],
  Failed: ['Running', 'Cancelled'],
  Cancelled: [],
  Expired: [],
};

/**
 * Terminal states - once reached, no further transitions are possible.
 */
export const TERMINAL_STATES: Set<RunStatus> = new Set([
  'Staged',
  'Cancelled',
  'Expired',
]);

/**
 * States where the run can be cancelled.
 */
export const CANCELLABLE_STATES: Set<RunStatus> = new Set([
  'Pending',
  'Running',
  'Paused',
]);

/**
 * States where the run can be paused.
 */
export const PAUSABLE_STATES: Set<RunStatus> = new Set([
  'Running',
]);

/**
 * States where the run can be resumed.
 */
export const RESUMABLE_STATES: Set<RunStatus> = new Set([
  'Paused',
]);

/**
 * States where the run can be retried.
 */
export const RETRYABLE_STATES: Set<RunStatus> = new Set([
  'Failed',
]);

/**
 * States where the run is actively processing.
 */
export const ACTIVE_STATES: Set<RunStatus> = new Set([
  'Running',
  'Paused',
]);

/**
 * Assert that a state transition is valid.
 * Throws InvalidTransitionError if the transition is not allowed.
 */
export function assertTransition(from: RunStatus, to: RunStatus): void {
  const validTransitions = VALID_TRANSITIONS[from];

  if (!validTransitions || !validTransitions.includes(to)) {
    throw new InvalidTransitionError(
      `Invalid transition from ${from} to ${to}`,
      from,
      to
    );
  }
}

/**
 * Check if a state transition is valid.
 */
export function isValidTransition(from: RunStatus, to: RunStatus): boolean {
  const validTransitions = VALID_TRANSITIONS[from];
  return !!(validTransitions && validTransitions.includes(to));
}

/**
 * Check if a run is in a terminal state.
 */
export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATES.has(status);
}

/**
 * Check if a run can be cancelled.
 */
export function canCancel(status: RunStatus): boolean {
  return CANCELLABLE_STATES.has(status);
}

/**
 * Check if a run can be paused.
 */
export function canPause(status: RunStatus): boolean {
  return PAUSABLE_STATES.has(status);
}

/**
 * Check if a run can be resumed.
 */
export function canResume(status: RunStatus): boolean {
  return RESUMABLE_STATES.has(status);
}

/**
 * Check if a run can be retried.
 */
export function canRetry(status: RunStatus): boolean {
  return RETRYABLE_STATES.has(status);
}

/**
 * Check if a run is actively processing.
 */
export function isActive(status: RunStatus): boolean {
  return ACTIVE_STATES.has(status);
}

/**
 * Get the next valid states from a given state.
 */
export function getValidTransitions(from: RunStatus): RunStatus[] {
  return VALID_TRANSITIONS[from] || [];
}
