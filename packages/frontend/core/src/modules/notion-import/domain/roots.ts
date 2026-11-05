const ID = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi;

const dashed = (hex32: string) =>
  [
    hex32.slice(0, 8),
    hex32.slice(8, 12),
    hex32.slice(12, 16),
    hex32.slice(16, 20),
    hex32.slice(20),
  ].join('-');

/**
 * One line of the "only these pages" box: a Notion link or a bare id. A link
 * ends in `Page-Title-<32 hex>` and a database link may carry `?v=<view id>`,
 * which is not the database, so the query and fragment are cut off first and
 * the last id in the path wins.
 */
export function parseRoot(line: string): string | undefined {
  const path = line.trim().split(/[?#]/)[0];
  const found = path.match(ID);
  if (!found) return undefined;
  return dashed(found[found.length - 1].replace(/-/g, '').toLowerCase());
}

export interface ParsedRoots {
  ids: string[];
  /** lines that held no id, so the wizard can point at them */
  invalid: string[];
}

export function parseRoots(text: string): ParsedRoots {
  const ids = new Set<string>();
  const invalid: string[] = [];
  for (const raw of text.split(/[\n,]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const id = parseRoot(line);
    if (id) ids.add(id);
    else invalid.push(line);
  }
  return { ids: [...ids], invalid };
}
