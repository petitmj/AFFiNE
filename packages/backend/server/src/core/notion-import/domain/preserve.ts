import type { JsonObject } from './types';

/**
 * Property types whose Notion value carries more than the interim AFFiNE
 * column can hold (relation graph, formula result type, time zone, unique id
 * prefix, status ids and so on). Their raw values are kept next to the schema.
 */
export const PRESERVED_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  'relation',
  'rollup',
  'formula',
  'status',
  'people',
  'files',
  'created_by',
  'last_edited_by',
  'unique_id',
  'place',
  'verification',
  'date',
]);

export interface PreservedRecord {
  /** database, data_source, page_properties or property_page */
  kind: 'database' | 'data_source' | 'page_properties' | 'property_page';
  notionId: string;
  payload: JsonObject;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The raw properties of a page that need preserving, or null when none do.
 * Values are copied untouched.
 */
export function preservedPageProperties(page: JsonObject): PreservedRecord | null {
  if (typeof page.id !== 'string' || !isObject(page.properties)) return null;
  const kept: JsonObject = {};
  for (const [name, value] of Object.entries(page.properties)) {
    if (
      isObject(value) &&
      typeof value.type === 'string' &&
      PRESERVED_PROPERTY_TYPES.has(value.type)
    ) {
      kept[name] = value;
    }
  }
  if (Object.keys(kept).length === 0) return null;
  return {
    kind: 'page_properties',
    notionId: page.id,
    payload: { page_id: page.id, properties: kept },
  };
}
