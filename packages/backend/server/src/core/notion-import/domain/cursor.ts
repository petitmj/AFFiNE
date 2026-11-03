/** Task checkpoint: Notion cursor, sibling counter, and a time window start. */
export interface Checkpoint {
  /** Notion `start_cursor` for the next request, or null for the first. */
  c: string | null;
  /** Items already staged under this parent, so positions continue. */
  n: number;
  /** ISO time: only rows created on or after it (row window restart). */
  s: string | null;
}

export const START: Checkpoint = { c: null, n: 0, s: null };

export function encodeCheckpoint(checkpoint: Checkpoint): string {
  return JSON.stringify(checkpoint);
}

export function decodeCheckpoint(raw: string | null): Checkpoint {
  if (!raw) return START;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const { c, n, s } = parsed as Record<string, unknown>;
      return {
        c: typeof c === 'string' ? c : null,
        n: typeof n === 'number' && n >= 0 ? n : 0,
        s: typeof s === 'string' ? s : null,
      };
    }
  } catch {
    // A plain Notion cursor written by an older task: treat it as the cursor.
    return { c: raw, n: 0, s: null };
  }
  return START;
}
