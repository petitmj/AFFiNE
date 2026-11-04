// ============================================================================
// Checkpoint Cursor for Notion Import
// ============================================================================

import type { Checkpoint } from './types';

/**
 * Separator used in checkpoint encoding.
 */
const SEPARATOR = '|';

/**
 * Encode a checkpoint into a string.
 * Format: nextCursor|staged|windowStart
 * This allows checkpoints to be stored in the database and passed between workers.
 */
export function encodeCheckpoint(checkpoint: Checkpoint): string {
  const parts: string[] = [];

  if (checkpoint.nextCursor) {
    parts.push(checkpoint.nextCursor);
  }
  parts.push(checkpoint.staged ? '1' : '0');
  if (checkpoint.windowStart) {
    parts.push(checkpoint.windowStart);
  }

  return parts.join(SEPARATOR);
}

/**
 * Decode a checkpoint from a string.
 * Returns the default checkpoint if the string is empty or malformed.
 */
export function decodeCheckpoint(encoded: string | null | undefined): Checkpoint {
  if (!encoded || encoded === '') {
    return {
      nextCursor: null,
      staged: false,
      windowStart: null,
    };
  }

  const parts = encoded.split(SEPARATOR);
  const nextCursor = parts[0] || null;
  const staged = parts[1] === '1';
  const windowStart = parts.length > 2 ? parts[2] || null : null;

  return {
    nextCursor,
    staged,
    windowStart,
  };
}

/**
 * Create a new checkpoint with updated values.
 */
export function updateCheckpoint(
  current: Checkpoint,
  updates: Partial<Checkpoint>
): Checkpoint {
  return {
    ...current,
    ...updates,
  };
}

/**
 * Empty checkpoint (no progress).
 */
export const EMPTY_CHECKPOINT: Checkpoint = {
  nextCursor: null,
  staged: false,
  windowStart: null,
};

/**
 * Check if a checkpoint represents completed pagination.
 */
export function isCheckpointComplete(checkpoint: Checkpoint): boolean {
  return checkpoint.nextCursor === null && !checkpoint.staged;
}
