// ============================================================================
// File Discovery for Notion Import
// ============================================================================

import type { HostedFileRef } from './types';

/**
 * Visit all nodes in a value recursively.
 * Calls the visitor function for each node with its key and parent.
 */
function visit(
  value: unknown,
  fn: (node: unknown, key: string | null, parent: unknown) => void,
  parent: unknown = null,
  key: string | null = null
): void {
  fn(value, key, parent);

  if (Array.isArray(value)) {
    for (const item of value) {
      visit(item, fn, value, key);
    }
  } else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) {
      visit(child, fn, value, childKey);
    }
  }
}

/**
 * Determine the slot for a file based on its parent context.
 * Property values are keyed by property id.
 * Icons and covers sit at the top level of a page or database.
 */
function slotOf(parent: unknown): string {
  if (parent && typeof parent === 'object') {
    const record = parent as Record<string, unknown>;
    // Check if this is a page or database
    if (record.type === 'page' || record.object === 'page') {
      return String(record.id ?? 'unknown');
    }
    if (record.type === 'database' || record.object === 'database') {
      return String(record.id ?? 'unknown');
    }
    // For property values, use a generic slot
    return 'file';
  }
  return 'file';
}

/**
 * Find all hosted file references in a staged Notion object.
 * Notion returns either:
 * - { file: { url, expiry_time } } (hosted) 
 * - { external: { url } } (keep as a link)
 *
 * Icons and covers can also be hosted.
 */
export function findHostedFiles(ownerId: string, payload: unknown): HostedFileRef[] {
  const refs: HostedFileRef[] = [];

  visit(payload, (node, key, parent) => {
    if (key === 'file' && node && typeof node === 'object') {
      const fileNode = node as { url?: unknown; expiry_time?: unknown };
      const url = fileNode.url;
      if (typeof url === 'string' && url.startsWith('https://')) {
        // Check if this is a Notion-hosted file (expires)
        // Notion-hosted URLs typically start with https://www.notion.so/ or https://s3.us-west-2.amazonaws.com/
        const isHosted = url.includes('notion.so') || url.includes('amazonaws.com');
        if (isHosted) {
          refs.push({
            ownerId,
            slot: slotOf(parent),
            url,
          });
        }
      }
    }

    // Also check for icon and cover at the top level
    if (key === 'icon' || key === 'cover') {
      const iconNode = node as { file?: { url?: string } };
      if (iconNode?.file?.url) {
        const url = iconNode.file.url;
        if (typeof url === 'string' && url.startsWith('https://')) {
          refs.push({
            ownerId,
            slot: `${key}`,
            url,
          });
        }
      }
      const externalNode = node as { external?: { url?: string } };
      if (externalNode?.external?.url) {
        const url = externalNode.external.url;
        if (typeof url === 'string' && url.startsWith('https://')) {
          refs.push({
            ownerId,
            slot: `${key}`,
            url,
          });
        }
      }
    }
  });

  return refs;
}

/**
 * Extract the Notion ID from a Notion object.
 * Tries multiple possible fields: id, objectId, etc.
 */
export function notionIdOf(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  const record = obj as Record<string, unknown>;

  // Try common ID fields
  const id = record.id;
  if (typeof id === 'string') {
    return id;
  }

  const objectId = record.objectId;
  if (typeof objectId === 'string') {
    return objectId;
  }

  // For database rows, the ID might be in a different field
  const rowId = record.rowId;
  if (typeof rowId === 'string') {
    return rowId;
  }

  return null;
}

/**
 * Determine the object type from a Notion object.
 */
export function objectTypeOf(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') {
    return null;
  }

  const record = obj as Record<string, unknown>;

  // Try 'object' field first (Notion API v2022+)
  const objectType = record.object;
  if (typeof objectType === 'string') {
    return objectType;
  }

  // Try 'type' field
  const type = record.type;
  if (typeof type === 'string') {
    return type;
  }

  return null;
}
