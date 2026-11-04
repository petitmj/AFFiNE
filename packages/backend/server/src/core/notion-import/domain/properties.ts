// ============================================================================
// Property Handling for Notion Import
// ============================================================================

/**
 * Notion truncates some property values at 25 inline items and sets has_more.
 * Each cut property needs its own property-item pagination task.
 *
 * This function identifies which properties have been truncated.
 */
export function cutPropertyIds(page: unknown): string[] {
  if (!page || typeof page !== 'object') {
    return [];
  }

  const record = page as { properties?: Record<string, unknown> };
  const properties = record.properties;

  if (!properties || typeof properties !== 'object') {
    return [];
  }

  const cut: string[] = [];

  for (const [id, value] of Object.entries(properties)) {
    if (value && typeof value === 'object') {
      const flagged = value as { has_more?: unknown };
      if (flagged.has_more === true) {
        cut.push(id);
      }
    }
  }

  return cut;
}

/**
 * Extract property values from a Notion page or database row.
 * Handles both inline values and paginated property items.
 */
export function extractProperties(
  page: unknown,
  propertyItems: Map<string, unknown> = new Map()
): Record<string, unknown> {
  if (!page || typeof page !== 'object') {
    return {};
  }

  const record = page as { properties?: Record<string, unknown> };
  const properties = record.properties;

  if (!properties || typeof properties !== 'object') {
    return {};
  }

  const result: Record<string, unknown> = {};

  for (const [id, value] of Object.entries(properties)) {
    if (value && typeof value === 'object') {
      const valueObj = value as Record<string, unknown>;

      // If we have paginated items for this property, use them
      if (propertyItems.has(id)) {
        result[id] = propertyItems.get(id);
      } else if (valueObj.has_more === true) {
        // This property was truncated - we'll need to fetch more
        // For now, use what we have
        result[id] = value;
      } else {
        // Use the inline value
        result[id] = value;
      }
    } else {
      result[id] = value;
    }
  }

  return result;
}

/**
 * Check if a property value is a reference list that might be truncated.
 */
export function isReferenceList(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check for relation property
  if (obj.type === 'relation' || obj.object === 'relation') {
    return true;
  }

  // Check for people property
  if (obj.type === 'people' || obj.object === 'people') {
    return true;
  }

  // Check for rollup property
  if (obj.type === 'rollup' || obj.object === 'rollup') {
    return true;
  }

  return false;
}

/**
 * Check if a property value is a select/multi-select that might be truncated.
 */
export function isSelectProperty(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (obj.type === 'select' || obj.object === 'select') {
    return true;
  }

  if (obj.type === 'multi_select' || obj.object === 'multi_select') {
    return true;
  }

  return false;
}
