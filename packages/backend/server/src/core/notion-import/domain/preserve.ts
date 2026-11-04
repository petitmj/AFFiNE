// ============================================================================
// Preserved Records for Notion Import
// ============================================================================

import type { StagedItem } from './types';
import { hashPayload } from './canonical';

/**
 * Preserved kinds (D6): the definitions the Phase 4 column types need and
 * the raw values that outlive the run's retention window.
 *
 * - database: schema incl. relations, rollups, formulas, status groups
 * - data_source: schema of a data source (API >= 2025-09-03)
 * - page_properties: per page: property values incl. time zones, unique ids
 * - property_page: full reference lists past Notion's 25-item limit
 */
export const PRESERVED_KINDS = [
  'database',
  'data_source',
  'page_properties',
  'property_page',
] as const;

export type PreservedKind = (typeof PRESERVED_KINDS)[number];

/**
 * Create a preserved record from a staged item.
 * Returns null if the item kind doesn't produce a preserved record.
 */
export function preservedRecordFor(item: {
  kind: string;
  notionId: string;
  payload: unknown;
}): { kind: PreservedKind; notionId: string; payload: unknown; payloadHash: string } | null {
  switch (item.kind) {
    case 'Database':
      return {
        kind: 'database',
        notionId: item.notionId,
        payload: item.payload,
        payloadHash: hashPayload(item.payload),
      };

    case 'DataSource':
      return {
        kind: 'data_source',
        notionId: item.notionId,
        payload: item.payload,
        payloadHash: hashPayload(item.payload),
      };

    case 'Page': {
      const record = item.payload as { properties?: unknown } | null;
      return {
        kind: 'page_properties',
        notionId: item.notionId,
        payload: record?.properties ?? {},
        payloadHash: hashPayload(record?.properties ?? {}),
      };
    }

    case 'Property':
      return {
        kind: 'property_page',
        notionId: item.notionId,
        payload: item.payload,
        payloadHash: hashPayload(item.payload),
      };

    default:
      return null;
  }
}

/**
 * Filter staged items down to those that produce preserved records.
 */
export function selectPreserved(items: StagedItem[]): Array<NonNullable<ReturnType<typeof preservedRecordFor>>> {
  const out: Array<NonNullable<ReturnType<typeof preservedRecordFor>>> = [];

  for (const item of items) {
    const record = preservedRecordFor({
      kind: item.kind,
      notionId: item.notionId,
      payload: item.payload,
    });

    if (record) {
      out.push(record);
    }
  }

  return out;
}

/**
 * Check if an item kind should be preserved.
 */
export function shouldPreserve(kind: string): boolean {
  return PRESERVED_KINDS.includes(kind as PreservedKind);
}

/**
 * Get the preserved kind for a staged item kind.
 */
export function getPreservedKind(kind: string): PreservedKind | null {
  switch (kind) {
    case 'Database':
      return 'database';
    case 'DataSource':
      return 'data_source';
    case 'Page':
      return 'page_properties';
    case 'Property':
      return 'property_page';
    default:
      return null;
  }
}
