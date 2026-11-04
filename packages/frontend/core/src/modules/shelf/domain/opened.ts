/**
 * The "documents opened" counter is per device. It is stored as a list of
 * doc ids, not a number, so a doc opened twice counts once and a deleted doc
 * stops counting.
 */

/** hard cap so the stored list cannot grow without bound */
export const MAX_OPENED_IDS = 20_000;

export function markOpened(
  current: readonly string[],
  docId: string
): readonly string[] {
  if (!docId || current.includes(docId)) return current;
  const next = [...current, docId];
  return next.length > MAX_OPENED_IDS
    ? next.slice(next.length - MAX_OPENED_IDS)
    : next;
}

/** opened docs that still exist and are not in the trash */
export function countOpened(
  opened: readonly string[],
  liveDocIds: ReadonlySet<string>
): number {
  let n = 0;
  const seen = new Set<string>();
  for (const id of opened) {
    if (!seen.has(id) && liveDocIds.has(id)) {
      seen.add(id);
      n++;
    }
  }
  return n;
}

/**
 * `/<docId>` and `/<docId>/attachments/<id>` open a doc. Everything else
 * (`/all`, `/chat`, `/shelf`, ...) does not; the caller decides by checking
 * the id against the live doc set.
 */
export function docIdFromPathname(pathname: string): string | null {
  const first = pathname.split('/').filter(Boolean)[0];
  return first ?? null;
}
