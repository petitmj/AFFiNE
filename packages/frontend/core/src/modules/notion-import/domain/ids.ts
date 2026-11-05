/**
 * AFFiNE ids derived from Notion ids. They are pure functions of the Notion
 * id, so importing the same workspace twice produces the same ids. That is
 * what makes a re-run an update (`replaceExisting`) instead of a duplicate.
 */
export const normalizeNotionId = (id: string): string =>
  id.replace(/-/g, '').toLowerCase();

export const docIdFor = (notionId: string): string =>
  `notion-${normalizeNotionId(notionId)}`;

export const blockIdFor = (notionId: string): string =>
  `nb-${normalizeNotionId(notionId)}`;

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Notion property ids contain characters such as `%3A` and `~`; the column
 * id keeps a readable prefix and a hash so two properties never collide.
 */
export const columnIdFor = (
  sourceNotionId: string,
  propertyId: string
): string =>
  `nc-${normalizeNotionId(sourceNotionId).slice(0, 8)}-${fnv1a(propertyId)}`;

/** a block id for the n-th synthetic child of a Notion block */
export const childId = (parentId: string, suffix: string | number): string =>
  `${parentId}-${suffix}`;

export const notionUrl = (notionId: string): string =>
  `https://www.notion.so/${normalizeNotionId(notionId)}`;
