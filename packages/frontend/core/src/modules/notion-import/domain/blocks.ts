import { calloutColor } from './colors';
import { blockIdFor } from './ids';
import { type JsonObject, arr, at, isObj, num, obj, str } from './json';
import { CODES, type Outcome } from './ledger';
import { type MirroredFileInfo } from './properties';
import {
  type DeltaInsert,
  richTextPlain,
  richTextToDelta,
  type TextContext,
  textValue,
} from './rich-text';

export interface SnapBlock {
  type: 'block';
  id: string;
  flavour: string;
  props: Record<string, unknown>;
  children: SnapBlock[];
}

export interface BlockContext extends TextContext {
  /** staged children of a Notion block or page, in order */
  children(parentNotionId: string): JsonObject[];
  file(ownerId: string, slot: string): MirroredFileInfo | undefined;
  /** record the outcome of one Notion object; raw is kept when not mapped */
  record(
    notionId: string,
    subject: string,
    outcome: Outcome,
    codes?: string[],
    raw?: JsonObject
  ): void;
  /** an in-place database block for a Notion database id, if it was staged */
  databaseBlock(databaseNotionId: string): SnapBlock[] | undefined;
  titleOfPage(notionId: string): string | undefined;
}

/** flavours AFFiNE accepts as a child of a paragraph or list */
const NESTABLE = new Set([
  'affine:paragraph',
  'affine:list',
  'affine:code',
  'affine:callout',
  'affine:latex',
]);

const COMMON_GFX = {
  index: 'a0',
  xywh: '[0,0,0,0]',
  rotate: 0,
  lockedBySelf: false,
};

const CODE_LANG: Record<string, string | null> = {
  'plain text': null,
  'c++': 'cpp',
  'c#': 'csharp',
  'objective-c': 'objc',
  'f#': 'fsharp',
  shell: 'shellscript',
  'visual basic': 'vb',
};

const NOTION_LIST = new Set([
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
]);

interface Walk {
  ctx: BlockContext;
  /** prefix for copied (synced) subtrees, so ids stay unique */
  prefix: string;
}

const idFor = (w: Walk, notionId: string) =>
  w.prefix ? `${w.prefix}-${blockIdFor(notionId)}` : blockIdFor(notionId);

function meta(block: JsonObject) {
  const created = Date.parse(str(block.created_time));
  const edited = Date.parse(str(block.last_edited_time));
  return {
    ...(Number.isNaN(created) ? {} : { 'meta:createdAt': created }),
    ...(Number.isNaN(edited) ? {} : { 'meta:updatedAt': edited }),
  };
}

function text(
  items: readonly unknown[],
  ctx: BlockContext,
  notionId: string,
  subject: string
) {
  const codes = new Set<string>();
  const out = richTextToDelta(items as never, {
    resolveDoc: ctx.resolveDoc,
    note: (code, outcome) => {
      codes.add(code);
      ctx.record(notionId, subject, outcome, [code]);
    },
  });
  return { ...out, codes };
}

/** the root of a page body, or of a synced original */
export function convertBlocks(
  parentNotionId: string,
  ctx: BlockContext,
  prefix = ''
): SnapBlock[] {
  return walk(parentNotionId, { ctx, prefix });
}

function walk(parentId: string, w: Walk): SnapBlock[] {
  const out: SnapBlock[] = [];
  let numbered = 0;
  for (const block of w.ctx.children(parentId)) {
    const type = str(block.type);
    numbered = type === 'numbered_list_item' ? numbered + 1 : 0;
    out.push(...convertOne(block, w, numbered || null));
  }
  return out;
}

/** children converted and, where AFFiNE would reject them, hoisted out */
function nested(
  block: JsonObject,
  w: Walk,
  subject: string
): { inside: SnapBlock[]; after: SnapBlock[] } {
  if (block.has_children !== true) return { inside: [], after: [] };
  const all = walk(str(block.id), w);
  const inside: SnapBlock[] = [];
  const after: SnapBlock[] = [];
  for (const child of all) {
    if (NESTABLE.has(child.flavour)) inside.push(child);
    else {
      after.push(child);
      w.ctx.record(
        str(block.id),
        subject,
        'degraded',
        [CODES.nestedHoisted],
        block
      );
    }
  }
  return { inside, after };
}

const paragraph = (
  id: string,
  delta: DeltaInsert[],
  extra: Record<string, unknown> = {},
  children: SnapBlock[] = []
): SnapBlock => ({
  type: 'block',
  id,
  flavour: 'affine:paragraph',
  props: { type: 'text', text: textValue(delta), collapsed: false, ...extra },
  children,
});

function convertOne(
  block: JsonObject,
  w: Walk,
  order: number | null
): SnapBlock[] {
  const { ctx } = w;
  const notionId = str(block.id);
  const type = str(block.type);
  const subject = `block:${type}`;
  const id = idFor(w, notionId);
  const body = obj(block[type]);
  const rich = arr(body.rich_text);
  const done = (outcome: Outcome = 'mapped', codes: string[] = []) =>
    ctx.record(
      notionId,
      subject,
      outcome,
      codes,
      outcome === 'mapped' ? undefined : block
    );

  switch (type) {
    case 'paragraph':
    case 'quote':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3': {
      const t = text(rich, ctx, notionId, subject);
      const kind =
        type === 'paragraph'
          ? 'text'
          : type === 'quote'
            ? 'quote'
            : `h${type.slice(-1)}`;
      const { inside, after } = nested(block, w, subject);
      done();
      return [
        {
          type: 'block',
          id,
          flavour: 'affine:paragraph',
          props: {
            type: kind,
            text: textValue(t.delta),
            collapsed: body.is_toggleable === true,
            ...meta(block),
          },
          children: inside,
        },
        ...after,
      ];
    }
    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'to_do':
    case 'toggle': {
      const t = text(rich, ctx, notionId, subject);
      const { inside, after } = nested(block, w, subject);
      const listType =
        type === 'to_do'
          ? 'todo'
          : type === 'numbered_list_item'
            ? 'numbered'
            : 'bulleted';
      done(
        type === 'toggle' ? 'degraded' : 'mapped',
        type === 'toggle' ? [CODES.toggleAsList] : []
      );
      return [
        {
          type: 'block',
          id,
          flavour: 'affine:list',
          props: {
            type: listType,
            text: textValue(t.delta),
            checked: type === 'to_do' && body.checked === true,
            collapsed: type === 'toggle',
            order: listType === 'numbered' ? order : null,
            ...meta(block),
          },
          children: inside,
        },
        ...after,
      ];
    }
    case 'callout': {
      const t = text(rich, ctx, notionId, subject);
      const { inside, after } = nested(block, w, subject);
      const icon = obj(body.icon);
      done();
      return [
        {
          type: 'block',
          id,
          flavour: 'affine:callout',
          props: {
            text: textValue(t.delta),
            backgroundColorName: calloutColor(body.color),
            ...(str(icon.type) === 'emoji'
              ? { icon: { type: 'emoji', unicode: str(icon.emoji) } }
              : {}),
            ...meta(block),
          },
          children: inside,
        },
        ...after,
      ];
    }
    case 'code': {
      const t = text(rich, ctx, notionId, subject);
      const lang = str(body.language, 'plain text').toLowerCase();
      done();
      return [
        {
          type: 'block',
          id,
          flavour: 'affine:code',
          props: {
            text: textValue(t.delta),
            language: lang in CODE_LANG ? CODE_LANG[lang] : lang,
            wrap: false,
            caption: richTextPlain(arr(body.caption)),
            ...meta(block),
          },
          children: [],
        },
      ];
    }
    case 'divider':
      done();
      return [
        {
          type: 'block',
          id,
          flavour: 'affine:divider',
          props: {},
          children: [],
        },
      ];
    case 'equation':
      done();
      return [
        {
          type: 'block',
          id,
          flavour: 'affine:latex',
          props: {
            latex: str(body.expression),
            scale: 1,
            xywh: '[0,0,16,16]',
            index: 'a0',
            rotate: 0,
            lockedBySelf: false,
          },
          children: [],
        },
      ];
    case 'image':
    case 'file':
    case 'pdf':
    case 'video':
    case 'audio':
      return mediaBlock(block, w, type, id, notionId, body);
    case 'bookmark':
    case 'link_preview':
    case 'embed': {
      const url = str(body.url);
      done();
      return [bookmark(id, url, richTextPlain(arr(body.caption)))];
    }
    case 'table':
      return tableBlock(block, w, id, notionId, body);
    case 'table_row':
      // rows are consumed by their table; a stray row has nothing to attach to
      return [];
    case 'child_page': {
      const docId = ctx.resolveDoc(notionId);
      const title = str(body.title) || ctx.titleOfPage(notionId) || 'Untitled';
      done(
        docId ? 'mapped' : 'degraded',
        docId ? [] : [CODES.mentionUnresolved]
      );
      return [
        paragraph(
          id,
          docId
            ? [
                {
                  insert: ' ',
                  attributes: {
                    reference: { type: 'LinkedPage', pageId: docId },
                  },
                },
              ]
            : [{ insert: title }]
        ),
      ];
    }
    case 'link_to_page': {
      const target = str(body.page_id) || str(body.database_id);
      const docId = target ? ctx.resolveDoc(target) : undefined;
      done(
        docId ? 'mapped' : 'degraded',
        docId ? [] : [CODES.mentionUnresolved]
      );
      return [
        paragraph(
          id,
          docId
            ? [
                {
                  insert: ' ',
                  attributes: {
                    reference: { type: 'LinkedPage', pageId: docId },
                  },
                },
              ]
            : [{ insert: target }]
        ),
      ];
    }
    case 'child_database': {
      const blocks = ctx.databaseBlock(notionId);
      if (blocks) {
        done();
        return blocks;
      }
      // a full-page database has its own doc: link to it from here
      const docId = ctx.resolveDoc(notionId);
      if (docId) {
        done();
        return [
          paragraph(id, [
            {
              insert: ' ',
              attributes: { reference: { type: 'LinkedPage', pageId: docId } },
            },
          ]),
        ];
      }
      done('preserved_only', [CODES.databaseMissing]);
      return [
        paragraph(id, [
          { insert: `[Database not imported: ${str(body.title)}]` },
        ]),
      ];
    }
    case 'column_list': {
      done('degraded', [CODES.columnsFlattened]);
      return walk(notionId, w);
    }
    case 'column':
      return walk(notionId, w);
    case 'synced_block': {
      const from = at(body, 'synced_from', 'block_id');
      if (typeof from === 'string') {
        done('degraded', [CODES.syncedBlockCopied]);
        // a copy, with ids prefixed by this block so they stay unique
        return walk(from, { ctx, prefix: id });
      }
      done();
      return walk(notionId, w);
    }
    case 'table_of_contents':
    case 'breadcrumb':
      done('degraded', [CODES.tocIsWidget]);
      return [];
    default: {
      // template, ai_block, unsupported, and anything Notion adds later
      done('preserved_only', [CODES.unsupportedBlock]);
      return [
        paragraph(id, [
          { insert: `[Unsupported Notion block: ${type || 'unknown'}]` },
        ]),
      ];
    }
  }
}

function bookmark(id: string, url: string, caption: string): SnapBlock {
  return {
    type: 'block',
    id,
    flavour: 'affine:bookmark',
    props: {
      style: 'horizontal',
      url,
      caption: caption || null,
      description: null,
      icon: null,
      image: null,
      title: null,
      footnoteIdentifier: null,
      ...COMMON_GFX,
    },
    children: [],
  };
}

function mediaBlock(
  block: JsonObject,
  w: Walk,
  type: string,
  id: string,
  notionId: string,
  body: JsonObject
): SnapBlock[] {
  const { ctx } = w;
  const subject = `block:${type}`;
  const caption = richTextPlain(arr(body.caption));
  const name = str(body.name) || caption || type;
  const kind = str(body.type);

  if (kind === 'external') {
    const url = str(at(body, 'external', 'url'));
    ctx.record(
      notionId,
      subject,
      type === 'image' ? 'degraded' : 'mapped',
      type === 'image' ? [CODES.externalImageAsLink] : [],
      type === 'image' ? block : undefined
    );
    return [bookmark(id, url, caption)];
  }

  const mirrored = ctx.file(notionId, 'file');
  if (mirrored?.status === 'stored' && mirrored.blobKey) {
    ctx.record(notionId, subject, 'mapped');
    const base = {
      caption,
      sourceId: mirrored.blobKey,
      size: mirrored.size ?? -1,
    };
    if (type === 'image') {
      return [
        {
          type: 'block',
          id,
          flavour: 'affine:image',
          props: {
            ...base,
            width: 0,
            height: 0,
            ...COMMON_GFX,
            ...meta(block),
          },
          children: [],
        },
      ];
    }
    return [
      {
        type: 'block',
        id,
        flavour: 'affine:attachment',
        props: {
          ...base,
          name,
          type: mirrored.mime ?? 'application/octet-stream',
          embed: false,
          style: type === 'pdf' ? 'pdf' : 'horizontalThin',
          footnoteIdentifier: null,
          ...COMMON_GFX,
        },
        children: [],
      },
    ];
  }

  // never fetched, or Notion no longer serves it: keep a visible marker
  ctx.record(
    notionId,
    subject,
    'unrecoverable',
    [CODES.fileUnavailable],
    block
  );
  return [paragraph(id, [{ insert: `[File unavailable: ${name}]` }])];
}

function tableBlock(
  block: JsonObject,
  w: Walk,
  id: string,
  notionId: string,
  body: JsonObject
): SnapBlock[] {
  const { ctx } = w;
  const subject = 'block:table';
  const rowsRaw = ctx
    .children(notionId)
    .filter(r => str(r.type) === 'table_row');
  const width =
    num(body.table_width) ??
    Math.max(1, ...rowsRaw.map(r => arr(at(r, 'table_row', 'cells')).length));
  const pad = (n: number) => `a${String(n).padStart(4, '0')}`;
  const rows: Record<string, unknown> = {};
  const columns: Record<string, unknown> = {};
  const cells: Record<string, unknown> = {};
  const colIds = Array.from({ length: width }, (_, i) => `${id}-c${i}`);
  colIds.forEach((c, i) => (columns[c] = { columnId: c, order: pad(i) }));
  rowsRaw.forEach((row, ri) => {
    const rowId = `${id}-r${ri}`;
    rows[rowId] = { rowId, order: pad(ri) };
    arr(at(row, 'table_row', 'cells')).forEach((cell, ci) => {
      if (ci >= width) return;
      const t = text(arr(cell), ctx, str(row.id), 'block:table_row');
      cells[`${rowId}:${colIds[ci]}`] = { text: { delta: t.delta } };
    });
    ctx.record(str(row.id), 'block:table_row', 'mapped');
  });
  const flagged =
    body.has_column_header === true || body.has_row_header === true;
  ctx.record(
    notionId,
    subject,
    flagged ? 'degraded' : 'mapped',
    flagged ? [CODES.tableHeaderFlag] : [],
    flagged ? block : undefined
  );
  return [
    {
      type: 'block',
      id,
      flavour: 'affine:table',
      props: { rows, columns, cells },
      children: [],
    },
  ];
}

export { NOTION_LIST };
