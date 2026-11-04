// ============================================================================
// Notion to Blocksuite Encodings
// ============================================================================

import type { StagedItem } from './services/notion-import';
import { hashPayload } from './services/notion-import';

/**
 * Column type mapping from Notion to Blocksuite.
 * This defines how Notion property types map to Blocksuite data-view column types.
 */
export const NOTION_TO_BLOCKSUITE_COLUMN_MAP: Record<string, string> = {
  // Text types
  title: 'title',
  rich_text: 'rich-text',
  text: 'text',

  // Number types
  number: 'number',

  // Boolean types
  checkbox: 'checkbox',

  // Date types
  date: 'date',
  created_time: 'date',
  last_edited_time: 'date',

  // Select types
  select: 'select',
  multi_select: 'multi-select',

  // Status type (Notion's status property)
  status: 'status',

  // Person type
  people: 'person',

  // File type
  files: 'image', // Notion files -> Blocksuite images

  // URL type
  url: 'text', // Notion URL -> Blocksuite text (with link)

  // Email type
  email: 'text',

  // Phone type
  phone_number: 'text',

  // Relation type - degraded to rich-text with mention
  relation: 'rich-text',

  // Rollup type - degraded to rich-text
  rollup: 'rich-text',

  // Formula type - degraded to rich-text
  formula: 'rich-text',

  // Created by / Last edited by - degraded to rich-text
  created_by: 'rich-text',
  last_edited_by: 'rich-text',
};

/**
 * Encoding result for a single cell.
 */
export interface CellEncoding {
  /** The Blocksuite cell value */
  value: unknown;
  /** The column type used */
  columnType: string;
  /** Any warnings generated during encoding */
  warnings: EncodingWarning[];
}

/**
 * Warning generated during encoding.
 */
export interface EncodingWarning {
  code: string;
  message: string;
  sourcePath?: string;
}

/**
 * Encoded property (column definition + cell value).
 */
export interface PropertyEncoding {
  /** The property ID */
  id: string;
  /** The property name */
  name: string;
  /** The Blocksuite column type */
  type: string;
  /** The encoded cell value */
  cell: CellEncoding;
}

/**
 * Encode a Notion property value to a Blocksuite cell value.
 * Returns the cell value, column type, and any warnings.
 */
export function encodeCell(
  notionType: string,
  notionValue: unknown,
  context: EncodingContext = {}
): CellEncoding {
  const encoder = CELL_ENCODERS[notionType];

  if (encoder) {
    return encoder(notionValue, context);
  }

  // Fallback: encode as rich-text
  return {
    value: encodeRichText(notionValue),
    columnType: 'rich-text',
    warnings: [
      {
        code: 'unsupported_property_type',
        message: `Notion property type '${notionType}' is not supported, degraded to rich-text`,
      },
    ],
  };
}

/**
 * Encoding context passed to cell encoders.
 */
export interface EncodingContext {
  /** The workspace ID for resolving references */
  workspaceId?: string;
  /** The page ID for resolving relative references */
  pageId?: string;
  /** Map of preserved records for looking up definitions */
  preservedRecords?: Map<string, unknown>;
}

// ============================================================================
// Cell Encoders
// ============================================================================

/**
 * Encoders for each Notion property type.
 * Each encoder takes the Notion value and returns a CellEncoding.
 */
const CELL_ENCODERS: Record<string, (value: unknown, context?: EncodingContext) => CellEncoding> = {
  // Title
  title: (value) => ({
    value: encodeTitle(value),
    columnType: 'title',
    warnings: [],
  }),

  // Rich text
  rich_text: (value) => ({
    value: encodeRichText(value),
    columnType: 'rich-text',
    warnings: [],
  }),

  // Text (fallback)
  text: (value) => ({
    value: encodeText(value),
    columnType: 'text',
    warnings: [],
  }),

  // Number
  number: (value) => ({
    value: encodeNumber(value),
    columnType: 'number',
    warnings: [],
  }),

  // Checkbox
  checkbox: (value) => ({
    value: encodeCheckbox(value),
    columnType: 'checkbox',
    warnings: [],
  }),

  // Date
  date: (value) => ({
    value: encodeDate(value),
    columnType: 'date',
    warnings: [],
  }),

  // Select
  select: (value) => ({
    value: encodeSelect(value),
    columnType: 'select',
    warnings: [],
  }),

  // Multi-select
  multi_select: (value) => ({
    value: encodeMultiSelect(value),
    columnType: 'multi-select',
    warnings: [],
  }),

  // Status
  status: (value) => ({
    value: encodeStatus(value),
    columnType: 'status',
    warnings: [],
  }),

  // Person
  people: (value, context) => ({
    value: encodePerson(value, context),
    columnType: 'person',
    warnings: [],
  }),

  // Files
  files: (value) => ({
    value: encodeFiles(value),
    columnType: 'image',
    warnings: [],
  }),

  // URL
  url: (value) => ({
    value: encodeUrl(value),
    columnType: 'text',
    warnings: [],
  }),

  // Email
  email: (value) => ({
    value: encodeEmail(value),
    columnType: 'text',
    warnings: [],
  }),

  // Phone
  phone_number: (value) => ({
    value: encodePhone(value),
    columnType: 'text',
    warnings: [],
  }),

  // Relation - degraded to rich-text with mention
  relation: (value, context) => ({
    value: encodeRelation(value, context),
    columnType: 'rich-text',
    warnings: [
      {
        code: 'degraded_relation',
        message: 'Notion relation degraded to rich-text with mention',
      },
    ],
  }),

  // Rollup - degraded to rich-text
  rollup: (value) => ({
    value: encodeRollup(value),
    columnType: 'rich-text',
    warnings: [
      {
        code: 'degraded_rollup',
        message: 'Notion rollup degraded to rich-text',
      },
    ],
  }),

  // Formula - degraded to rich-text
  formula: (value) => ({
    value: encodeFormula(value),
    columnType: 'rich-text',
    warnings: [
      {
        code: 'degraded_formula',
        message: 'Notion formula degraded to rich-text',
      },
    ],
  }),
};

// ============================================================================
// Individual Encoders
// ============================================================================

/**
 * Encode a Notion title to Blocksuite title.
 */
function encodeTitle(value: unknown): { id: string; type: 'title'; text: Array<{ type: 'text'; text: string }> } {
  const title = value as { id?: string; type?: string; title?: Array<{ type: string; text?: { content: string } }> };

  const text = title.title?.map(t => ({
    type: 'text' as const,
    text: t.text?.content || '',
  })) || [];

  return {
    id: title.id || 'title',
    type: 'title',
    text,
  };
}

/**
 * Encode Notion rich text to Blocksuite rich-text.
 */
function encodeRichText(value: unknown): Array<{ type: string; text?: string; link?: string }> {
  const richText = value as Array<{ type: string; text?: { content: string }; href?: string }>;

  if (!Array.isArray(richText)) {
    return [];
  }

  return richText.map(rt => {
    const text = rt.text?.content || '';
    const link = rt.href;

    if (link) {
      return {
        type: 'text',
        text,
        link,
      };
    }

    return {
      type: 'text',
      text,
    };
  });
}

/**
 * Encode plain text.
 */
function encodeText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  const text = value as { plain_text?: string };
  return text.plain_text || '';
}

/**
 * Encode a Notion number to Blocksuite number.
 */
function encodeNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return value;
  }

  const number = value as { number?: number | null };
  return number.number ?? null;
}

/**
 * Encode a Notion checkbox to Blocksuite boolean.
 */
function encodeCheckbox(value: unknown): boolean {
  const checkbox = value as { checkbox?: boolean };
  return checkbox.checkbox ?? false;
}

/**
 * Encode a Notion date to Blocksuite date.
 */
function encodeDate(value: unknown): { start: string; end?: string } | null {
  const date = value as { date?: { start: string; end?: string } | null };

  if (!date.date) {
    return null;
  }

  return {
    start: date.date.start,
    end: date.date.end,
  };
}

/**
 * Encode a Notion select to Blocksuite select.
 */
function encodeSelect(value: unknown): { id: string; name: string; color?: string } | null {
  const select = value as { select?: { id: string; name: string; color?: string } | null };

  if (!select.select) {
    return null;
  }

  return {
    id: select.select.id,
    name: select.select.name,
    color: select.select.color,
  };
}

/**
 * Encode a Notion multi-select to Blocksuite multi-select.
 */
function encodeMultiSelect(value: unknown): Array<{ id: string; name: string; color?: string }> {
  const multiSelect = value as { multi_select?: Array<{ id: string; name: string; color?: string }> };

  return multiSelect.multi_select?.map(s => ({
    id: s.id,
    name: s.name,
    color: s.color,
  })) || [];
}

/**
 * Encode a Notion status to Blocksuite status.
 */
function encodeStatus(value: unknown): { id: string; name: string; color?: string; group?: string } | null {
  const status = value as { status?: { id: string; name: string; color?: string; group?: { id: string; name: string } } | null };

  if (!status.status) {
    return null;
  }

  return {
    id: status.status.id,
    name: status.status.name,
    color: status.status.color,
    group: status.status.group?.name,
  };
}

/**
 * Encode Notion people to Blocksuite person.
 * Degraded to text with user mention.
 */
function encodePerson(value: unknown, context?: EncodingContext): Array<{ type: 'text'; text: string }> {
  const people = value as { people?: Array<{ id: string; name?: string }> };

  return people.people?.map(p => ({
    type: 'text' as const,
    text: `@${p.name || p.id}`,
  })) || [];
}

/**
 * Encode Notion files to Blocksuite image.
 */
function encodeFiles(value: unknown): Array<{ type: 'image'; url: string; name?: string }> {
  const files = value as { files?: Array<{ url: string; name?: string }> };

  return files.files?.map(f => ({
    type: 'image' as const,
    url: f.url,
    name: f.name,
  })) || [];
}

/**
 * Encode Notion URL to Blocksuite text with link.
 */
function encodeUrl(value: unknown): Array<{ type: 'text'; text: string; link: string }> {
  const url = value as { url?: string };

  if (!url.url) {
    return [];
  }

  return [{
    type: 'text' as const,
    text: url.url,
    link: url.url,
  }];
}

/**
 * Encode Notion email to Blocksuite text.
 */
function encodeEmail(value: unknown): string {
  const email = value as { email?: string };
  return email.email || '';
}

/**
 * Encode Notion phone to Blocksuite text.
 */
function encodePhone(value: unknown): string {
  const phone = value as { phone_number?: string };
  return phone.phone_number || '';
}

/**
 * Encode Notion relation to rich-text with mention.
 * This is a degraded encoding since Blocksuite doesn't support relations.
 */
function encodeRelation(value: unknown, context?: EncodingContext): Array<{ type: 'text'; text: string }> {
  const relation = value as { relation?: Array<{ id: string }> };

  return relation.relation?.map(r => ({
    type: 'text' as const,
    text: `@${r.id}`,
  })) || [];
}

/**
 * Encode Notion rollup to rich-text.
 */
function encodeRollup(value: unknown): Array<{ type: 'text'; text: string }> {
  const rollup = value as { rollup?: { function: string; result?: { number?: number; date?: { start: string }; array?: Array<{ title?: string }> } } };

  if (!rollup.rollup) {
    return [];
  }

  const result = rollup.rollup.result;

  if (result?.number !== undefined) {
    return [{
      type: 'text' as const,
      text: String(result.number),
    }];
  }

  if (result?.date) {
    return [{
      type: 'text' as const,
      text: result.date.start,
    }];
  }

  if (result?.array) {
    return result.array.map(a => ({
      type: 'text' as const,
      text: a.title || '',
    }));
  }

  return [];
}

/**
 * Encode Notion formula to rich-text.
 */
function encodeFormula(value: unknown): Array<{ type: 'text'; text: string }> {
  const formula = value as { formula?: { type: string; string?: string; number?: number; boolean?: boolean; date?: { start: string } } };

  if (!formula.formula) {
    return [];
  }

  const f = formula.formula;

  if (f.string !== undefined) {
    return [{
      type: 'text' as const,
      text: f.string,
    }];
  }

  if (f.number !== undefined) {
    return [{
      type: 'text' as const,
      text: String(f.number),
    }];
  }

  if (f.boolean !== undefined) {
    return [{
      type: 'text' as const,
      text: f.boolean ? 'true' : 'false',
    }];
  }

  if (f.date) {
    return [{
      type: 'text' as const,
      text: f.date.start,
    }];
  }

  return [{
    type: 'text' as const,
    text: f.type,
  }];
}

/**
 * Build an import batch from staged items.
 * This converts Notion objects to Blocksuite snapshots.
 */
export async function buildImportBatch(
  items: StagedItem[],
  files: StagedFile[],
  context?: EncodingContext
): Promise<{
  docs: Array<{ id: string; snapshot: unknown }>;
  blobs: Map<string, Blob>;
  warnings: EncodingWarning[];
}> {
  const docs: Array<{ id: string; snapshot: unknown }> = [];
  const blobs = new Map<string, Blob>();
  const warnings: EncodingWarning[] = [];

  // Group items by type
  const pages = items.filter(i => i.kind === 'Page');
  const databases = items.filter(i => i.kind === 'Database');
  const blocks = items.filter(i => i.kind === 'Block');

  // Process pages
  for (const page of pages) {
    const payload = page.payload as any;

    // Create a Blocksuite page snapshot
    const snapshot = createPageSnapshot(payload, context);

    docs.push({
      id: page.notionId,
      snapshot,
    });

    // Collect any warnings
    if (snapshot.warnings) {
      warnings.push(...snapshot.warnings);
    }
  }

  // Process databases
  for (const database of databases) {
    const payload = database.payload as any;

    // Create a Blocksuite database snapshot
    const snapshot = createDatabaseSnapshot(payload, items, context);

    docs.push({
      id: database.notionId,
      snapshot,
    });

    // Collect any warnings
    if (snapshot.warnings) {
      warnings.push(...snapshot.warnings);
    }
  }

  // Process files
  for (const file of files) {
    if (file.blobKey) {
      // In a real implementation, we'd fetch the blob from storage
      // For now, we'll just create a placeholder
      blobs.set(file.blobKey, new Blob());
    }
  }

  return { docs, blobs, warnings };
}

/**
 * Create a Blocksuite page snapshot from a Notion page.
 */
function createPageSnapshot(
  page: any,
  context?: EncodingContext
): { id: string; type: string; children: unknown[]; warnings: EncodingWarning[] } {
  const warnings: EncodingWarning[] = [];
  const children: unknown[] = [];

  // Process page properties
  const properties = page.properties || {};

  // Process blocks
  const blocks = page.blocks || [];

  for (const block of blocks) {
    const encoded = encodeBlock(block, context);
    children.push(encoded.value);
    if (encoded.warnings) {
      warnings.push(...encoded.warnings);
    }
  }

  return {
    id: page.id,
    type: 'page',
    children,
    warnings,
  };
}

/**
 * Create a Blocksuite database snapshot from a Notion database.
 */
function createDatabaseSnapshot(
  database: any,
  items: StagedItem[],
  context?: EncodingContext
): { id: string; type: string; props: unknown; children: unknown[]; warnings: EncodingWarning[] } {
  const warnings: EncodingWarning[] = [];
  const columns: Array<{ id: string; type: string; name: string }> = [];
  const rows: Array<{ id: string; cells: Record<string, unknown> }> = [];

  // Get database properties
  const properties = database.properties || {};

  // Map Notion properties to Blocksuite columns
  for (const [id, prop] of Object.entries(properties)) {
    const notionType = prop.type || prop.object;
    const blocksuiteType = NOTION_TO_BLOCKSUITE_COLUMN_MAP[notionType] || 'rich-text';

    if (blocksuiteType !== 'rich-text' || notionType === 'text' || notionType === 'title') {
      columns.push({
        id,
        type: blocksuiteType,
        name: prop.name || id,
      });
    } else {
      // Degraded to rich-text
      warnings.push({
        code: 'degraded_column_type',
        message: `Database column '${prop.name || id}' with type '${notionType}' degraded to rich-text`,
      });
      columns.push({
        id,
        type: 'rich-text',
        name: prop.name || id,
      });
    }
  }

  // Get database rows (pages in the database)
  const rowItems = items.filter(i => i.kind === 'Page' && i.parentId === database.id);

  for (const rowItem of rowItems) {
    const rowPayload = rowItem.payload as any;
    const cells: Record<string, unknown> = {};

    // Encode each cell
    for (const [colId, prop] of Object.entries(properties)) {
      const notionType = prop.type || prop.object;
      const cellValue = rowPayload.properties?.[colId];

      if (cellValue !== undefined) {
        const encoded = encodeCell(notionType, cellValue, context);
        cells[colId] = encoded.value;
        if (encoded.warnings) {
          warnings.push(...encoded.warnings);
        }
      }
    }

    rows.push({
      id: rowItem.notionId,
      cells,
    });
  }

  return {
    id: database.id,
    type: 'database',
    props: {
      columns,
      title: database.title || [],
      views: [],
    },
    children: rows.map(row => ({
      type: 'row',
      ...row,
    })),
    warnings,
  };
}

/**
 * Encode a Notion block to a Blocksuite block.
 */
function encodeBlock(block: any, context?: EncodingContext): { value: unknown; warnings: EncodingWarning[] } {
  const warnings: EncodingWarning[] = [];

  switch (block.type) {
    case 'paragraph':
      return {
        value: {
          type: 'paragraph',
          children: encodeRichText(block.paragraph?.rich_text || []),
        },
        warnings,
      };

    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
      return {
        value: {
          type: 'heading',
          level: parseInt(block.type.split('_')[1]),
          children: encodeRichText(block.heading_1?.rich_text || block.heading_2?.rich_text || block.heading_3?.rich_text || []),
        },
        warnings,
      };

    case 'bulleted_list_item':
      return {
        value: {
          type: 'bulleted-list',
          children: encodeRichText(block.bulleted_list_item?.rich_text || []),
        },
        warnings,
      };

    case 'numbered_list_item':
      return {
        value: {
          type: 'numbered-list',
          children: encodeRichText(block.numbered_list_item?.rich_text || []),
        },
        warnings,
      };

    case 'to_do':
      return {
        value: {
          type: 'to-do',
          checked: block.to_do?.checked || false,
          children: encodeRichText(block.to_do?.rich_text || []),
        },
        warnings,
      };

    case 'toggle':
      return {
        value: {
          type: 'toggle',
          children: encodeBlocks(block.toggle?.children || [], context),
        },
        warnings,
      };

    case 'image':
      const url = block.image?.file?.url || block.image?.external?.url || '';
      return {
        value: {
          type: 'image',
          url,
        },
        warnings,
      };

    case 'code':
      return {
        value: {
          type: 'code',
          language: block.code?.language || 'plain',
          text: block.code?.rich_text?.map((t: any) => t.plain_text).join('') || '',
        },
        warnings,
      };

    case 'divider':
      return {
        value: {
          type: 'divider',
        },
        warnings,
      };

    case 'table':
      return {
        value: {
          type: 'table',
          children: encodeTable(block.table, context),
        },
        warnings,
      };

    case 'column_list':
      return {
        value: {
          type: 'column-list',
          children: encodeBlocks(block.column_list?.children || [], context),
        },
        warnings,
      };

    case 'column':
      return {
        value: {
          type: 'column',
          children: encodeBlocks(block.column?.children || [], context),
        },
        warnings,
      };

    case 'quote':
      return {
        value: {
          type: 'quote',
          children: encodeRichText(block.quote?.rich_text || []),
        },
        warnings,
      };

    case 'callout':
      return {
        value: {
          type: 'callout',
          icon: block.callout?.icon?.emoji || '',
          color: block.callout?.color || 'gray',
          children: encodeRichText(block.callout?.rich_text || []),
        },
        warnings,
      };

    default:
      // Degrade unknown block types to paragraph
      warnings.push({
        code: 'degraded_block_type',
        message: `Notion block type '${block.type}' degraded to paragraph`,
      });
      return {
        value: {
          type: 'paragraph',
          children: encodeRichText([{ type: 'text', text: { content: block.type } }]),
        },
        warnings,
      };
  }
}

/**
 * Encode an array of blocks.
 */
function encodeBlocks(blocks: any[], context?: EncodingContext): unknown[] {
  const result: unknown[] = [];

  for (const block of blocks) {
    const encoded = encodeBlock(block, context);
    result.push(encoded.value);
  }

  return result;
}

/**
 * Encode a Notion table to Blocksuite table.
 */
function encodeTable(table: any, context?: EncodingContext): unknown[] {
  const rows: unknown[] = [];

  // Add header row
  const header = table.table_width?.map((width: number, index: number) => ({
    type: 'table-header',
    width,
    children: encodeRichText([{ type: 'text', text: { content: `Column ${index + 1}` } }]),
  })) || [];

  rows.push({
    type: 'table-row',
    children: header,
  });

  // Add data rows
  for (const row of table.children || []) {
    if (row.type === 'table_row') {
      const cells = row.table_row?.cells?.map((cell: any) => ({
        type: 'table-cell',
        children: encodeRichText(cell?.rich_text || []),
      })) || [];

      rows.push({
        type: 'table-row',
        children: cells,
      });
    }
  }

  return rows;
}
