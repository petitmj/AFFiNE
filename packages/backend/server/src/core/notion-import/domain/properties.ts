import type { JsonObject } from './types';

/** Notion returns at most 25 references inline for these property types. */
const INLINE_LIMIT = 25;

/**
 * True when a page property value may be truncated and must be fetched in
 * full from the property endpoint to avoid losing references.
 */
export function needsPropertyPage(property: JsonObject): boolean {
  switch (property.type) {
    case 'relation':
      return property.has_more === true;
    case 'rollup': {
      const rollup = property.rollup;
      if (typeof rollup !== 'object' || rollup === null || Array.isArray(rollup))
        return false;
      if (rollup.type === 'incomplete') return true;
      return (
        rollup.type === 'array' &&
        Array.isArray(rollup.array) &&
        rollup.array.length >= INLINE_LIMIT
      );
    }
    case 'people':
    case 'title':
    case 'rich_text': {
      const items = property[property.type as string];
      return Array.isArray(items) && items.length >= INLINE_LIMIT;
    }
    default:
      return false;
  }
}

/** Property ids of a page that need the property endpoint. */
export function truncatedPropertyIds(page: JsonObject): string[] {
  const properties = page.properties;
  if (typeof properties !== 'object' || properties === null) return [];
  const ids: string[] = [];
  for (const value of Object.values(properties)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      continue;
    const property = value as JsonObject;
    if (typeof property.id === 'string' && needsPropertyPage(property)) {
      ids.push(property.id);
    }
  }
  return ids;
}
