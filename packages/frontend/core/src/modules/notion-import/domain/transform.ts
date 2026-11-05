import { type BlockContext, convertBlocks, type SnapBlock } from './blocks';
import { canonicalJson } from './canonical';
import { blockIdFor, docIdFor, notionUrl } from './ids';
import { type JsonObject, arr, at, isObj, num, obj, str } from './json';
import { CODES, Ledger, type Outcome } from './ledger';
import {
  type Column,
  type ColumnMeta,
  mergePropertyPages,
  type MirroredFileInfo,
  type PropertyContext,
  schemaToColumns,
  valueToCell,
} from './properties';
import { richTextPlain, type TextContext, textValue } from './rich-text';

// ---- input / output shapes (structurally compatible with ImportBatch) -----

export interface StagedItemLike {
  kind: string;
  notionId: string;
  parentId: string | null;
  position: number;
  payload: JsonObject;
}

export interface FileRow {
  ownerId: string;
  slot: string;
  status: string;
  blobKey?: string | null;
  size?: number | null;
  mime?: string | null;
}

export interface StagedRun {
  items: readonly StagedItemLike[];
  files: readonly FileRow[];
}

export interface OutDoc {
  id: string;
  sourcePath: string;
  snapshot: {
    type: 'page';
    meta: { id: string; title: string; createDate: number; tags: string[] };
    blocks: SnapBlock;
  };
  meta: {
    title: string;
    createDate?: number;
    updatedDate?: number;
    trash?: boolean;
  };
}

export interface OutFolder {
  path: string;
  name: string;
  parentPath?: string;
  pageId: string;
  icon?: { type: 'emoji'; unicode: string };
}

export interface TransformOutput {
  docs: OutDoc[];
  folders: OutFolder[];
  icons: { docId: string; icon: { type: 'emoji'; unicode: string } }[];
  warnings: { code: string; message: string; sourcePath?: string }[];
  ledger: Ledger;
}

export interface TransformDeps {
  /** content hash of a string; the app passes SHA-256 */
  hash(input: string): Promise<string>;
  /** stamp for docs Notion gave no created time; one value for the whole run */
  now?: number;
}

/** codes that describe how a whole column behaves, not one wrong cell */
const COLUMN_LEVEL = new Set<string>([
  CODES.formulaStatic,
  CODES.rollupStatic,
  CODES.uniqueIdStatic,
]);

const MAX_TITLE = 500;

/** legalize: AFFiNE titles are single-line text without control characters */
export function legalTitle(raw: string): { title: string; empty: boolean } {
  // eslint-disable-next-line no-control-regex
  const clean = raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE);
  return clean
    ? { title: clean, empty: false }
    : { title: 'Untitled', empty: true };
}

interface Index {
  pages: Map<string, JsonObject>;
  databases: Map<string, JsonObject>;
  sources: Map<string, JsonObject>;
  /** data source id -> database id */
  sourceDb: Map<string, string>;
  /** database id -> data source ids, in order */
  dbSources: Map<string, string[]>;
  children: Map<string, JsonObject[]>;
  blockParent: Map<string, JsonObject>;
  propertyPages: Map<string, JsonObject[]>;
  comments: JsonObject[];
  rowsOfSource: Map<string, JsonObject[]>;
}

function buildIndex(run: StagedRun): Index {
  const ix: Index = {
    pages: new Map(),
    databases: new Map(),
    sources: new Map(),
    sourceDb: new Map(),
    dbSources: new Map(),
    children: new Map(),
    blockParent: new Map(),
    propertyPages: new Map(),
    comments: [],
    rowsOfSource: new Map(),
  };
  const ordered = [...run.items].sort((a, b) => a.position - b.position);
  for (const it of ordered) {
    const id = it.notionId;
    switch (it.kind) {
      case 'page':
        ix.pages.set(id, it.payload);
        break;
      case 'database':
        ix.databases.set(id, it.payload);
        for (const s of arr(it.payload.data_sources)) {
          const sid = str(at(s, 'id'));
          if (sid) link(ix, id, sid);
        }
        break;
      case 'data_source': {
        ix.sources.set(id, it.payload);
        const db =
          str(at(it.payload, 'parent', 'database_id')) || it.parentId || '';
        if (db) link(ix, db, id);
        break;
      }
      case 'block': {
        const parent = it.parentId ?? '';
        const list = ix.children.get(parent) ?? [];
        list.push(it.payload);
        ix.children.set(parent, list);
        ix.blockParent.set(id, obj(it.payload.parent));
        break;
      }
      case 'property': {
        const key = `${str(it.payload.page_id)}/${str(it.payload.property_id)}`;
        const list = ix.propertyPages.get(key) ?? [];
        list.push(it.payload);
        ix.propertyPages.set(key, list);
        break;
      }
      case 'comment':
        ix.comments.push(it.payload);
        break;
    }
  }
  for (const [id, page] of ix.pages) {
    const parent = obj(page.parent);
    const sid = str(parent.data_source_id) || str(parent.database_id);
    if (
      sid &&
      (parent.type === 'data_source_id' || parent.type === 'database_id')
    ) {
      // a row whose parent is named by database id resolves to its first source
      const source = ix.sources.has(sid)
        ? sid
        : (ix.dbSources.get(sid)?.[0] ?? sid);
      const rows = ix.rowsOfSource.get(source) ?? [];
      rows.push(page);
      ix.rowsOfSource.set(source, rows);
    }
    void id;
  }
  return ix;
}

function link(ix: Index, db: string, source: string) {
  ix.sourceDb.set(source, db);
  const list = ix.dbSources.get(db) ?? [];
  if (!list.includes(source)) list.push(source);
  ix.dbSources.set(db, list);
}

const isRow = (page: JsonObject) => {
  const t = str(at(page, 'parent', 'type'));
  return t === 'data_source_id' || t === 'database_id';
};

const pageTitle = (page: JsonObject): string => {
  for (const v of Object.values(obj(page.properties))) {
    if (isObj(v) && v.type === 'title') return richTextPlain(arr(v.title));
  }
  return '';
};

const isInline = (db: JsonObject) => db.is_inline === true;

// ---- the transform ---------------------------------------------------------

export async function transformRun(
  run: StagedRun,
  deps: TransformDeps
): Promise<TransformOutput> {
  const ix = buildIndex(run);
  const now = deps.now ?? Date.now();
  const ledger = new Ledger();
  const warnings: TransformOutput['warnings'] = [];
  const docs: OutDoc[] = [];
  const icons: TransformOutput['icons'] = [];

  const fileMap = new Map<string, FileRow>();
  for (const f of run.files) fileMap.set(`${f.ownerId}\u0000${f.slot}`, f);
  const fileLookup = (
    ownerId: string,
    slot: string
  ): MirroredFileInfo | undefined => {
    const f = fileMap.get(`${ownerId}\u0000${slot}`);
    if (!f) return undefined;
    return {
      status:
        f.status === 'stored'
          ? 'stored'
          : f.status === 'unavailable'
            ? 'unavailable'
            : 'pending',
      blobKey: f.blobKey,
      size: f.size,
      mime: f.mime,
    };
  };

  // which Notion ids get a doc of their own
  const standaloneDbs = new Set(
    [...ix.databases].filter(([, db]) => !isInline(db)).map(([id]) => id)
  );
  const resolveDoc = (id: string): string | undefined => {
    if (ix.pages.has(id)) return docIdFor(id);
    if (standaloneDbs.has(id)) return docIdFor(id);
    const db = ix.sourceDb.get(id);
    if (db && standaloneDbs.has(db)) return docIdFor(db);
    if (db) {
      // inline database: the closest linkable thing is the page holding it
      const parent = ancestorPage(obj(at(ix.databases.get(db), 'parent')), ix);
      return parent ? docIdFor(parent) : undefined;
    }
    return undefined;
  };
  const titleOf = (id: string): string | undefined => {
    const page = ix.pages.get(id);
    if (page) return legalTitle(pageTitle(page)).title;
    const db = ix.databases.get(id) ?? ix.sources.get(id);
    return db ? legalTitle(richTextPlain(arr(db.title))).title : undefined;
  };

  /** per-owner context so every note lands on the right ledger entry */
  const textCtx = (
    notionId: string,
    subject: string,
    docId?: string
  ): TextContext => ({
    resolveDoc,
    note: (code, outcome) =>
      ledger.record({
        notionId,
        subject,
        outcome,
        codes: [code],
        affineDocId: docId,
      }),
  });

  const blockCtx = (docId: string): BlockContext => ({
    resolveDoc,
    note: () => undefined,
    children: parent => ix.children.get(parent) ?? [],
    file: fileLookup,
    record: (notionId, subject, outcome, codes, raw) =>
      ledger.record(
        { notionId, subject, outcome, codes, affineDocId: docId },
        raw
      ),
    databaseBlock: dbId => {
      const db = ix.databases.get(dbId);
      return db && isInline(db) ? buildDatabaseBlocks(dbId, docId) : undefined;
    },
    titleOfPage: titleOf,
  });

  // ---- database blocks ----
  function buildDatabaseBlocks(dbId: string, docId: string): SnapBlock[] {
    const db = ix.databases.get(dbId);
    const sourceIds = ix.dbSources.get(dbId) ?? [];
    // 2022-style API or a database with no staged source: treat it as its own source
    const ids = sourceIds.length ? sourceIds : [dbId];
    return ids.map(sid => databaseBlock(sid, db, docId));
  }

  function databaseBlock(
    sid: string,
    db: JsonObject | undefined,
    docId: string
  ): SnapBlock {
    const src = ix.sources.get(sid) ?? db ?? {};
    const rows = (ix.rowsOfSource.get(sid) ?? [])
      .slice()
      .sort((a, b) => str(a.created_time).localeCompare(str(b.created_time)));
    const schemaProps =
      isObj(src.properties) && Object.keys(src.properties).length
        ? obj(src.properties)
        : inferSchema(rows);

    const notes: { name: string; code: string; outcome: Outcome }[] = [];
    const { columns, skipped } = schemaToColumns(sid, schemaProps, {
      note: (name, code, outcome) => notes.push({ name, code, outcome }),
    });
    for (const n of notes) {
      ledger.record({
        notionId: `${sid}/${n.name}`,
        subject: 'column',
        outcome: n.outcome,
        codes: [n.code],
        affineDocId: docId,
      });
    }
    for (const s of skipped) {
      ledger.record(
        {
          notionId: `${sid}/${s.name}`,
          subject: `column:${s.notionType}`,
          outcome: 'preserved_only',
          codes: [CODES.unsupportedBlock],
          affineDocId: docId,
        },
        { name: s.name, type: s.notionType }
      );
    }
    const byNotionId = new Map<string, ColumnMeta>();
    for (const c of columns) byNotionId.set(c.notionId, c);
    const titleCol = columns.find(c => c.isTitle) as ColumnMeta;

    const cells: Record<
      string,
      Record<string, { columnId: string; value: unknown }>
    > = {};
    const rowBlocks: SnapBlock[] = [];
    for (const row of rows) {
      const rowId = str(row.id);
      const rowBlockId = blockIdFor(rowId);
      const cellMap: Record<string, { columnId: string; value: unknown }> = {};
      const pctx: PropertyContext = {
        ...textCtx(rowId, 'property', docId),
        titleOf,
        file: fileLookup,
      };
      for (const prop of Object.values(obj(row.properties))) {
        if (!isObj(prop)) continue;
        const col = byNotionId.get(str(prop.id));
        if (!col) continue;
        const merged = mergePropertyPages(
          prop,
          ix.propertyPages.get(`${rowId}/${str(prop.id)}`) ?? []
        );
        const cell = valueToCell(col, merged, rowId, pctx);
        if (!cell) continue;
        if (cell.value !== undefined)
          cellMap[col.id] = { columnId: col.id, value: cell.value };
        if (cell.outcome) {
          const columnLevel = COLUMN_LEVEL.has(cell.outcome.code);
          ledger.record(
            {
              notionId: columnLevel ? `${sid}/${col.name}` : rowId,
              subject: columnLevel ? 'column' : `property:${col.notionType}`,
              outcome: cell.outcome.outcome,
              codes: [cell.outcome.code],
              affineDocId: docId,
            },
            columnLevel ? undefined : merged
          );
        }
      }
      cells[rowBlockId] = cellMap;
      const created = Date.parse(str(row.created_time));
      const edited = Date.parse(str(row.last_edited_time));
      rowBlocks.push({
        type: 'block',
        id: rowBlockId,
        flavour: 'affine:paragraph',
        props: {
          type: 'text',
          collapsed: false,
          text: textValue([
            {
              insert: ' ',
              attributes: {
                reference: { type: 'LinkedPage', pageId: docIdFor(rowId) },
              },
            },
          ]),
          ...(Number.isNaN(created) ? {} : { 'meta:createdAt': created }),
          ...(Number.isNaN(edited) ? {} : { 'meta:updatedAt': edited }),
        },
        children: [],
      });
    }

    const name = legalTitle(
      richTextPlain(arr(src.title)) || richTextPlain(arr(db?.title))
    ).title;
    const cleanCols: Column[] = columns.map(c => ({
      id: c.id,
      type: c.type,
      name: c.name,
      data: c.data,
    }));
    ledger.record({
      notionId: sid,
      subject: 'database',
      outcome: 'mapped',
      affineDocId: docId,
    });
    return {
      type: 'block',
      id: blockIdFor(sid),
      flavour: 'affine:database',
      props: {
        title: textValue([{ insert: name }]),
        columns: cleanCols,
        cells,
        views: [
          {
            id: `${blockIdFor(sid)}-view`,
            name: 'Table View',
            mode: 'table',
            columns: [],
            filter: { type: 'group', op: 'and', conditions: [] },
            header: { titleColumn: titleCol.id, iconColumn: 'type' },
          },
        ],
      },
      children: rowBlocks,
    };
  }

  // ---- doc assembly ----
  const makeDoc = async (opts: {
    notionId: string;
    title: string;
    created?: number;
    edited?: number;
    trash?: boolean;
    body: SnapBlock[];
    payload: JsonObject;
  }) => {
    const docId = docIdFor(opts.notionId);
    const root = `root-${blockIdFor(opts.notionId)}`;
    docs.push({
      id: docId,
      sourcePath: notionUrl(opts.notionId),
      snapshot: {
        type: 'page',
        meta: {
          id: docId,
          title: opts.title,
          createDate: opts.created ?? now,
          tags: [],
        },
        blocks: {
          type: 'block',
          id: root,
          flavour: 'affine:page',
          props: { title: textValue([{ insert: opts.title }]) },
          children: [
            {
              type: 'block',
              id: `${root}-surface`,
              flavour: 'affine:surface',
              props: { elements: {} },
              children: [],
            },
            {
              type: 'block',
              id: `${root}-note`,
              flavour: 'affine:note',
              props: {
                xywh: '[0,0,800,95]',
                index: 'a0',
                hidden: false,
                displayMode: 'both',
              },
              children: opts.body,
            },
          ],
        },
      },
      meta: {
        title: opts.title,
        createDate: opts.created,
        updatedDate: opts.edited,
        ...(opts.trash ? { trash: true } : {}),
      },
    });
    return docId;
  };

  const stamp = (p: JsonObject) => {
    const c = Date.parse(str(p.created_time));
    const e = Date.parse(str(p.last_edited_time));
    return {
      created: Number.isNaN(c) ? undefined : c,
      edited: Number.isNaN(e) ? undefined : e,
    };
  };

  const decorate = (
    docId: string,
    notionId: string,
    payload: JsonObject,
    body: SnapBlock[]
  ) => {
    // icon
    const icon = obj(payload.icon);
    if (str(icon.type) === 'emoji' && str(icon.emoji)) {
      icons.push({ docId, icon: { type: 'emoji', unicode: str(icon.emoji) } });
    } else if (Object.keys(icon).length) {
      ledger.record(
        {
          notionId,
          subject: 'icon',
          outcome: 'degraded',
          codes: [CODES.iconDropped],
          affineDocId: docId,
        },
        payload
      );
    }
    // cover becomes the first image of the doc
    const cover = obj(payload.cover);
    if (Object.keys(cover).length) {
      const mirrored = fileLookup(notionId, 'cover');
      const sourceId = mirrored?.status === 'stored' ? mirrored.blobKey : null;
      if (sourceId) {
        body.unshift({
          type: 'block',
          id: `${blockIdFor(notionId)}-cover`,
          flavour: 'affine:image',
          props: {
            caption: '',
            sourceId,
            size: mirrored?.size ?? -1,
            width: 0,
            height: 0,
            index: 'a0',
            xywh: '[0,0,0,0]',
            rotate: 0,
            lockedBySelf: false,
          },
          children: [],
        });
        ledger.record({
          notionId,
          subject: 'cover',
          outcome: 'degraded',
          codes: [CODES.coverAsImage],
          affineDocId: docId,
        });
      } else if (str(cover.type) === 'external') {
        ledger.record(
          {
            notionId,
            subject: 'cover',
            outcome: 'degraded',
            codes: [CODES.coverAsImage],
            affineDocId: docId,
          },
          payload
        );
      } else {
        ledger.record(
          {
            notionId,
            subject: 'cover',
            outcome: 'unrecoverable',
            codes: [CODES.fileUnavailable],
            affineDocId: docId,
          },
          payload
        );
      }
    }
  };

  // pages and rows
  for (const [pageId, page] of ix.pages) {
    const { title, empty } = legalTitle(pageTitle(page));
    const docId = docIdFor(pageId);
    const body = convertBlocks(pageId, blockCtx(docId));
    decorate(docId, pageId, page, body);
    const contentHash = await deps.hash(canonicalJson(page as never));
    ledger.record({
      notionId: pageId,
      subject: isRow(page) ? 'row' : 'page',
      outcome: 'mapped',
      codes: empty ? [CODES.titleEmpty] : [],
      affineDocId: docId,
      contentHash,
    });
    await makeDoc({
      notionId: pageId,
      title,
      ...stamp(page),
      trash: page.in_trash === true || page.archived === true,
      body,
      payload: page,
    });
  }

  // standalone databases
  for (const dbId of standaloneDbs) {
    const db = ix.databases.get(dbId) as JsonObject;
    const docId = docIdFor(dbId);
    const body = buildDatabaseBlocks(dbId, docId);
    decorate(docId, dbId, db, body);
    const { title } = legalTitle(richTextPlain(arr(db.title)));
    await makeDoc({
      notionId: dbId,
      title,
      ...stamp(db),
      trash: db.in_trash === true || db.archived === true,
      body,
      payload: db,
    });
  }

  // comments cannot be created from an import: keep them in the preserved file
  for (const c of ix.comments) {
    const id = str(c.id);
    ledger.record(
      {
        notionId: id,
        subject: 'comment',
        outcome: 'preserved_only',
        codes: [CODES.commentPreserved],
      },
      c
    );
  }

  // folder tree: every page and standalone database hangs under its nearest
  // ancestor page. Rows live inside their database, not in the tree.
  const folders: OutFolder[] = [];
  const emojiOf = (p: JsonObject) => {
    const i = obj(p.icon);
    return str(i.type) === 'emoji' && str(i.emoji)
      ? ({ type: 'emoji', unicode: str(i.emoji) } as const)
      : undefined;
  };
  for (const [pageId, page] of ix.pages) {
    if (isRow(page)) continue;
    const parent = ancestorPage(obj(page.parent), ix);
    folders.push({
      path: pageId,
      name: legalTitle(pageTitle(page)).title,
      parentPath: parent && parent !== pageId ? parent : undefined,
      pageId: docIdFor(pageId),
      icon: emojiOf(page),
    });
  }
  for (const dbId of standaloneDbs) {
    const db = ix.databases.get(dbId) as JsonObject;
    const parent = ancestorPage(obj(db.parent), ix);
    folders.push({
      path: dbId,
      name: legalTitle(richTextPlain(arr(db.title))).title,
      parentPath: parent ?? undefined,
      pageId: docIdFor(dbId),
      icon: emojiOf(db),
    });
  }
  return { docs, folders: orderFolders(folders), icons, warnings, ledger };
}

/** walk up from a Notion parent to the nearest page that is not a row */
function ancestorPage(parent: JsonObject, ix: Index): string | null {
  const seen = new Set<string>();
  let cur: JsonObject | undefined = parent;
  while (cur) {
    const type = str(cur.type);
    if (type === 'page_id') {
      const id = str(cur.page_id);
      const page = ix.pages.get(id);
      if (!page) return null;
      if (!isRow(page)) return id;
      if (seen.has(id)) return null;
      seen.add(id);
      cur = obj(page.parent);
    } else if (type === 'block_id') {
      const id = str(cur.block_id);
      if (seen.has(id)) return null;
      seen.add(id);
      cur = ix.blockParent.get(id);
    } else if (type === 'data_source_id' || type === 'database_id') {
      const sid = str(cur.data_source_id) || str(cur.database_id);
      const db = ix.sourceDb.get(sid) ?? sid;
      if (seen.has(db)) return null;
      seen.add(db);
      cur = obj(at(ix.databases.get(db), 'parent'));
    } else {
      return null;
    }
  }
  return null;
}

/** parents before children, and no folder is its own ancestor */
function orderFolders(folders: OutFolder[]): OutFolder[] {
  const byPath = new Map(folders.map(f => [f.path, f]));
  const depth = (f: OutFolder): number => {
    let d = 0;
    const seen = new Set<string>([f.path]);
    let cur = f.parentPath ? byPath.get(f.parentPath) : undefined;
    while (cur) {
      if (seen.has(cur.path)) {
        // cycle: cut it so the commit step never waits on a parent that cannot exist
        f.parentPath = undefined;
        return 0;
      }
      seen.add(cur.path);
      d++;
      cur = cur.parentPath ? byPath.get(cur.parentPath) : undefined;
    }
    return d;
  };
  for (const f of folders) {
    if (f.parentPath && !byPath.has(f.parentPath)) f.parentPath = undefined;
  }
  return folders
    .map(f => ({ f, d: depth(f) }))
    .sort((a, b) => a.d - b.d)
    .map(x => x.f);
}

/** no schema was staged: rebuild one from the rows' own property values */
function inferSchema(rows: JsonObject[]): JsonObject {
  const out: JsonObject = {};
  for (const row of rows) {
    for (const [name, v] of Object.entries(obj(row.properties))) {
      if (!isObj(v) || name in out) continue;
      out[name] = { id: str(v.id), name, type: str(v.type) };
    }
  }
  return out;
}

export { num };
