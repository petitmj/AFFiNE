import { tagColor } from './colors';
import { columnIdFor } from './ids';
import {
  type JsonObject,
  type JsonValue,
  arr,
  at,
  isObj,
  num,
  obj,
  str,
} from './json';
import { CODES, type Outcome } from './ledger';
import {
  type DeltaInsert,
  richTextPlain,
  richTextToDelta,
  type TextContext,
  textValue,
} from './rich-text';

export interface MirroredFileInfo {
  status: 'stored' | 'unavailable' | 'pending';
  blobKey?: string | null;
  size?: number | null;
  mime?: string | null;
}

export interface PropertyContext extends TextContext {
  /** title of an imported row, for relation chips */
  titleOf(notionId: string): string | undefined;
  /** the mirrored copy of a Notion-hosted file, by owner and slot */
  file(ownerId: string, slot: string): MirroredFileInfo | undefined;
}

export interface Column {
  id: string;
  type: string;
  name: string;
  data: Record<string, unknown>;
}

export interface ColumnMeta extends Column {
  notionId: string;
  notionType: string;
  /** false for the title, which lives in the row block text */
  isTitle: boolean;
}

interface Option {
  id: string;
  value: string;
  color: string;
}

/** notion property type to AFFiNE column type, `null` = no column */
const TYPE_MAP: Record<string, string | null> = {
  title: 'title',
  rich_text: 'rich-text',
  number: 'number',
  select: 'select',
  multi_select: 'multi-select',
  status: 'status',
  date: 'date',
  checkbox: 'checkbox',
  url: 'link',
  email: 'rich-text',
  phone_number: 'rich-text',
  people: 'person',
  created_by: 'person',
  last_edited_by: 'person',
  files: 'files',
  relation: 'relation',
  rollup: 'rollup',
  formula: 'formula',
  created_time: 'created-time',
  last_edited_time: 'date',
  unique_id: 'rich-text',
  place: 'rich-text',
  verification: null,
  button: null,
};

function optionsOf(
  schema: JsonObject,
  key: 'select' | 'multi_select' | 'status'
) {
  return arr(at(schema, key, 'options')).flatMap((o): Option[] => {
    if (!isObj(o)) return [];
    return [
      {
        id: str(o.id) || str(o.name),
        value: str(o.name),
        color: tagColor(o.color),
      },
    ];
  });
}

export interface SchemaResult {
  columns: ColumnMeta[];
  /** columns left out, with why (the preserved record still has them) */
  skipped: { name: string; notionType: string }[];
}

/**
 * Notion data source `properties` object to AFFiNE columns.
 * Column order follows Notion's object order. The title column always comes
 * first, as AFFiNE expects.
 */
export function schemaToColumns(
  sourceNotionId: string,
  properties: JsonObject,
  ctx: { note(name: string, code: string, outcome: Outcome): void }
): SchemaResult {
  const columns: ColumnMeta[] = [];
  const skipped: SchemaResult['skipped'] = [];
  const usedNames = new Set<string>();

  for (const [key, raw] of Object.entries(properties)) {
    if (!isObj(raw)) continue;
    const notionType = str(raw.type);
    const affineType = TYPE_MAP[notionType];
    if (affineType === undefined || affineType === null) {
      skipped.push({ name: key, notionType });
      ctx.note(key, CODES.unsupportedBlock, 'preserved_only');
      continue;
    }

    // legalize: column names must be unique and non-empty in one database
    let name = str(raw.name, key).trim() || 'Untitled';
    let n = 2;
    while (usedNames.has(name)) name = `${str(raw.name, key)} ${n++}`;
    usedNames.add(name);

    const notionId = str(raw.id) || key;
    let data: Record<string, unknown> = {};

    switch (notionType) {
      case 'select':
      case 'multi_select':
        data = { options: dedupeOptions(optionsOf(raw, notionType)) };
        break;
      case 'status': {
        data = {
          options: dedupeOptions(optionsOf(raw, 'status')),
          groups: arr(at(raw, 'status', 'groups')).flatMap(g =>
            isObj(g)
              ? [
                  {
                    id: str(g.id),
                    name: str(g.name),
                    color: str(g.color) || undefined,
                    optionIds: arr(g.option_ids).map(v => str(v)),
                  },
                ]
              : []
          ),
        };
        break;
      }
      case 'number': {
        const format = str(at(raw, 'number', 'format'), 'number');
        if (format !== 'number') {
          ctx.note(name, CODES.numberFormatDropped, 'degraded');
        }
        break;
      }
      case 'relation': {
        const target = str(at(raw, 'relation', 'data_source_id'));
        data = {
          targetNotionId: target || undefined,
          notionPropertyId: notionId,
          syncedPropertyName:
            str(at(raw, 'relation', 'dual_property', 'synced_property_name')) ||
            undefined,
          limit:
            at(raw, 'relation', 'type') === 'single_property'
              ? 'single'
              : 'many',
        };
        break;
      }
      case 'rollup':
        data = {
          relationPropertyName: str(
            at(raw, 'rollup', 'relation_property_name')
          ),
          rollupPropertyName: str(at(raw, 'rollup', 'rollup_property_name')),
          function: str(at(raw, 'rollup', 'function'), 'show_original'),
        };
        ctx.note(name, CODES.rollupStatic, 'degraded');
        break;
      case 'formula':
        data = { expression: str(at(raw, 'formula', 'expression')) };
        ctx.note(name, CODES.formulaStatic, 'degraded');
        break;
      case 'unique_id':
        ctx.note(name, CODES.uniqueIdStatic, 'degraded');
        break;
      case 'last_edited_time':
        // no "last edited" column exists; the value is kept as a date
        break;
    }

    columns.push({
      id: columnIdFor(sourceNotionId, notionId),
      type: affineType,
      name,
      data,
      notionId,
      notionType,
      isTitle: notionType === 'title',
    });
  }

  // title first; if Notion somehow sent none, add one so rows have a name
  const titleAt = columns.findIndex(c => c.isTitle);
  if (titleAt > 0) columns.unshift(...columns.splice(titleAt, 1));
  if (titleAt === -1) {
    columns.unshift({
      id: columnIdFor(sourceNotionId, '__title__'),
      type: 'title',
      name: 'Name',
      data: {},
      notionId: '__title__',
      notionType: 'title',
      isTitle: true,
    });
  }
  return { columns, skipped };
}

function dedupeOptions(options: Option[]): Option[] {
  const seen = new Set<string>();
  const out: Option[] = [];
  for (const o of options) {
    if (seen.has(o.id)) continue;
    seen.add(o.id);
    out.push(o);
  }
  return out;
}

function ensureOption(col: ColumnMeta, notion: JsonObject): string | null {
  const name = str(notion.name);
  const id = str(notion.id) || name;
  if (!name && !id) return null;
  const options = (col.data.options as Option[] | undefined) ?? [];
  const found =
    options.find(o => o.id === id) ?? options.find(o => o.value === name);
  if (found) return found.id;
  // value uses an option the schema did not list: add it rather than lose it
  options.push({ id, value: name || id, color: tagColor(notion.color) });
  col.data.options = options;
  return id;
}

/** readable text of any Notion property value (used for display fields) */
export function displayOf(value: unknown): string {
  if (!isObj(value)) return '';
  const type = str(value.type);
  const v = value[type];
  switch (type) {
    case 'title':
    case 'rich_text':
      return richTextPlain(arr(v));
    case 'number':
      return num(v) === null ? '' : String(v);
    case 'select':
    case 'status':
      return str(at(v, 'name'));
    case 'multi_select':
      return arr(v)
        .map(o => str(at(o, 'name')))
        .filter(Boolean)
        .join(', ');
    case 'date': {
      const start = str(at(v, 'start'));
      const end = str(at(v, 'end'));
      return end ? `${start} → ${end}` : start;
    }
    case 'checkbox':
      return v === true ? 'Yes' : 'No';
    case 'url':
    case 'email':
    case 'phone_number':
    case 'created_time':
    case 'last_edited_time':
      return str(v);
    case 'people':
      return arr(v)
        .map(u => str(at(u, 'name')))
        .filter(Boolean)
        .join(', ');
    case 'created_by':
    case 'last_edited_by':
      return str(at(v, 'name'));
    case 'files':
      return arr(v)
        .map(f => str(at(f, 'name')))
        .filter(Boolean)
        .join(', ');
    case 'formula':
      return displayOf(v);
    case 'rollup':
      return displayRollup(obj(v));
    case 'unique_id': {
      const prefix = str(at(v, 'prefix'));
      const n = num(at(v, 'number'));
      return n === null ? '' : prefix ? `${prefix}-${n}` : String(n);
    }
    case 'relation':
      return '';
    default:
      return '';
  }
}

function displayRollup(r: JsonObject): string {
  switch (str(r.type)) {
    case 'number':
      return num(r.number) === null ? '' : String(r.number);
    case 'date':
      return displayOf({ type: 'date', date: r.date });
    case 'array':
      return arr(r.array)
        .map(item => displayOf(item))
        .filter(Boolean)
        .join(', ');
    default:
      return '';
  }
}

/** a staged `property` page (more than 25 references) folded into the value */
export function mergePropertyPages(
  value: JsonObject,
  pages: readonly JsonObject[]
): JsonObject {
  if (pages.length === 0) return value;
  const results = pages
    .slice()
    .sort((a, b) => (num(a.index) ?? 0) - (num(b.index) ?? 0))
    .flatMap(p => arr(p.results))
    .filter(isObj);
  const type = str(value.type);
  switch (type) {
    case 'relation':
      return {
        ...value,
        has_more: false,
        relation: results.map(r => obj(r.relation)),
      };
    case 'people':
      return { ...value, people: results.map(r => obj(r.people)) };
    case 'title':
    case 'rich_text':
      return { ...value, [type]: results.map(r => obj(r[type])) };
    case 'rollup':
      return {
        ...value,
        rollup: { ...obj(value.rollup), type: 'array', array: results },
      };
    default:
      return value;
  }
}

export interface CellResult {
  value: unknown;
  /** set when the column holds a value of a kind AFFiNE only approximates */
  outcome?: { code: string; outcome: Outcome };
}

const toMs = (iso: string): number | null => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * One Notion property value to one AFFiNE cell value.
 * Returns `undefined` for properties with no cell (title lives in the row
 * block; created-time reads the block's `meta:createdAt`).
 */
export function valueToCell(
  col: ColumnMeta,
  prop: JsonObject,
  ownerId: string,
  ctx: PropertyContext
): CellResult | undefined {
  const t = col.notionType;
  const v = prop[t];
  switch (t) {
    case 'title':
    case 'created_time':
      return undefined;
    case 'rich_text':
      return { value: textValue(richTextToDelta(arr(v), ctx).delta) };
    case 'email':
    case 'phone_number':
    case 'place': {
      const text =
        t === 'place'
          ? [at(v, 'name'), at(v, 'address')]
              .map(x => str(x))
              .filter(Boolean)
              .join(', ')
          : str(v);
      return text
        ? { value: textValue([{ insert: text }]) }
        : { value: undefined };
    }
    case 'unique_id': {
      const text = displayOf(prop);
      return text
        ? { value: textValue([{ insert: text }]) }
        : { value: undefined };
    }
    case 'number':
      return { value: num(v) };
    case 'checkbox':
      return { value: v === true };
    case 'url':
      return { value: str(v) || undefined };
    case 'select':
    case 'status':
      return { value: isObj(v) ? ensureOption(col, v) : null };
    case 'multi_select':
      return {
        value: arr(v).flatMap(o => {
          const id = isObj(o) ? ensureOption(col, o) : null;
          return id ? [id] : [];
        }),
      };
    case 'date': {
      if (!isObj(v)) return { value: null };
      const start = toMs(str(v.start));
      const ranged = !!str(v.end) || !!str(v.time_zone);
      return {
        value: start,
        outcome: ranged
          ? { code: CODES.dateEndPreserved, outcome: 'degraded' }
          : undefined,
      };
    }
    case 'last_edited_time':
      return { value: toMs(str(v)) };
    case 'people':
      return { value: arr(v).flatMap(u => (isObj(u) ? [person(u)] : [])) };
    case 'created_by':
    case 'last_edited_by':
      return { value: isObj(v) ? [person(v)] : [] };
    case 'files': {
      const files = arr(v).flatMap((f, i) =>
        isObj(f)
          ? [fileEntry(f, ownerId, `prop:${str(prop.id)}:${i}`, ctx)]
          : []
      );
      const lost = files.some(f => f.unavailable);
      return {
        value: files,
        outcome: lost
          ? { code: CODES.fileUnavailable, outcome: 'unrecoverable' }
          : undefined,
      };
    }
    case 'relation': {
      const entries = arr(v).flatMap(r => {
        const id = str(at(r, 'id'));
        if (!id) return [];
        const docId = ctx.resolveDoc(id);
        return [{ notionId: id, docId, title: ctx.titleOf(id) ?? '' }];
      });
      return {
        value: entries,
        outcome: entries.some(e => !e.docId)
          ? { code: CODES.relationUnresolved, outcome: 'degraded' }
          : undefined,
      };
    }
    case 'rollup': {
      const r = obj(v);
      const incomplete = str(r.type) === 'incomplete';
      return {
        value: { display: displayRollup(r), raw: r, incomplete },
        outcome: {
          code: incomplete ? CODES.rollupIncomplete : CODES.rollupStatic,
          outcome: 'degraded',
        },
      };
    }
    case 'formula': {
      const f = obj(v);
      const type = str(f.type, 'string') as
        | 'string'
        | 'number'
        | 'boolean'
        | 'date';
      const raw = f[type];
      const value: string | number | boolean | null =
        type === 'date'
          ? str(at(raw, 'start')) || null
          : typeof raw === 'string' ||
              typeof raw === 'number' ||
              typeof raw === 'boolean'
            ? raw
            : null;
      return {
        value: { type, value, display: displayOf(prop) },
        outcome: { code: CODES.formulaStatic, outcome: 'degraded' },
      };
    }
    default:
      return undefined;
  }
}

function person(u: JsonObject) {
  const email = str(at(u, 'person', 'email'));
  const avatar = str(u.avatar_url);
  return {
    id: str(u.id),
    name: str(u.name) || str(u.id),
    ...(email ? { email } : {}),
    ...(avatar ? { avatarUrl: avatar } : {}),
    kind: str(u.type) === 'bot' ? ('bot' as const) : ('person' as const),
  };
}

function fileEntry(
  f: JsonObject,
  ownerId: string,
  slot: string,
  ctx: PropertyContext
) {
  const name = str(f.name) || 'file';
  if (str(f.type) === 'external') {
    return {
      name,
      url: str(at(f, 'external', 'url')) || undefined,
      external: true,
      unavailable: false,
    };
  }
  const mirrored = ctx.file(ownerId, slot);
  if (mirrored?.status === 'stored' && mirrored.blobKey) {
    return {
      name,
      blobId: mirrored.blobKey,
      mime: mirrored.mime ?? undefined,
      size: mirrored.size ?? undefined,
      external: false,
      unavailable: false,
    };
  }
  return { name, external: false, unavailable: true };
}

export type { DeltaInsert, JsonValue };
