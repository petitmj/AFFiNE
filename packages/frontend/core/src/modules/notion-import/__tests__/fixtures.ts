import type { JsonObject } from '../domain/json';
import type { FileRow, StagedItemLike, StagedRun } from '../domain/transform';

export const id = (n: number) =>
  `${String(n).padStart(8, '0')}-0000-0000-0000-${String(n).padStart(12, '0')}`;

export const P1 = id(1);
export const P2 = id(2);
export const DB1 = id(10);
export const S1 = id(11);
export const DB2 = id(20);
export const S2 = id(21);
export const R1 = id(31);
export const R2 = id(32);
export const R3 = id(33);

const T = '2025-03-04T10:00:00.000Z';
const E = '2025-03-05T10:00:00.000Z';

export const rt = (
  content: string,
  extra: JsonObject = {},
  annotations: JsonObject = {}
): JsonObject => ({
  type: 'text',
  text: { content, link: null },
  annotations: {
    bold: false,
    italic: false,
    strikethrough: false,
    underline: false,
    code: false,
    color: 'default',
    ...annotations,
  },
  plain_text: content,
  href: null,
  ...extra,
});

export const mentionPage = (pageId: string, label: string): JsonObject => ({
  type: 'mention',
  mention: { type: 'page', page: { id: pageId } },
  annotations: {},
  plain_text: label,
  href: null,
});

let seq = 100;
export const block = (
  type: string,
  body: JsonObject,
  extra: JsonObject = {}
): JsonObject => ({
  object: 'block',
  id: id(seq++),
  type,
  has_children: false,
  created_time: T,
  last_edited_time: E,
  [type]: body,
  ...extra,
});

const item = (
  kind: string,
  notionId: string,
  parentId: string | null,
  position: number,
  payload: JsonObject
): StagedItemLike => ({ kind, notionId, parentId, position, payload });

const title = (text: string): JsonObject => ({
  id: 'title',
  type: 'title',
  title: [rt(text)],
});

export function buildRun(): {
  run: StagedRun;
  blobKeys: Record<string, string>;
} {
  seq = 100; // same ids on every call, as in a re-run of the same workspace
  const items: StagedItemLike[] = [];
  const files: FileRow[] = [];
  let pos = 0;
  const add = (it: StagedItemLike) => items.push({ ...it, position: pos++ });

  // ---- page P1 with a varied body ----
  add(
    item('page', P1, null, 0, {
      object: 'page',
      id: P1,
      created_time: T,
      last_edited_time: E,
      parent: { type: 'workspace', workspace: true },
      icon: { type: 'emoji', emoji: '📁' },
      cover: { type: 'file', file: { url: 'https://s3/cover.png' } },
      properties: { title: title('Projects') },
    })
  );
  files.push({
    ownerId: P1,
    slot: 'cover',
    status: 'stored',
    blobKey: 'blob-cover',
    size: 10,
    mime: 'image/png',
  });

  const h2 = block('heading_2', {
    rich_text: [rt('Plan', {}, { bold: true })],
    is_toggleable: false,
  });
  const para = block('paragraph', {
    rich_text: [
      rt('See '),
      mentionPage(P2, 'Sub page'),
      rt(' and '),
      mentionPage(id(999), 'Elsewhere'),
      rt(' red', {}, { color: 'red' }),
    ],
  });
  const n1 = block('numbered_list_item', { rich_text: [rt('one')] });
  const n2 = block('numbered_list_item', { rich_text: [rt('two')] });
  const todo = block('to_do', { rich_text: [rt('ship')], checked: true });
  const toggle = block(
    'toggle',
    { rich_text: [rt('more')] },
    { has_children: true }
  );
  const toggleChild = block('paragraph', { rich_text: [rt('inside')] });
  const callout = block('callout', {
    rich_text: [rt('heads up')],
    icon: { type: 'emoji', emoji: '💡' },
    color: 'yellow_background',
  });
  const code = block('code', {
    rich_text: [rt('const a = 1')],
    language: 'plain text',
    caption: [rt('cap')],
  });
  const divider = block('divider', {});
  const equation = block('equation', { expression: 'e=mc^2' });
  const imgOk = block('image', {
    type: 'file',
    file: { url: 'https://s3/a.png' },
    caption: [rt('pic')],
  });
  const imgGone = block('image', {
    type: 'file',
    file: { url: 'https://s3/b.png' },
    caption: [],
  });
  const imgExt = block('image', {
    type: 'external',
    external: { url: 'https://example.com/c.png' },
    caption: [],
  });
  const table = block(
    'table',
    { table_width: 2, has_column_header: true, has_row_header: false },
    { has_children: true }
  );
  const row1 = block('table_row', { cells: [[rt('a')], [rt('b')]] });
  const row2 = block('table_row', { cells: [[rt('c')], [rt('d')]] });
  const inlineDb = block('child_database', { title: 'Tasks' });
  inlineDb.id = DB1;
  const fullDb = block('child_database', { title: 'Reading' });
  fullDb.id = DB2;
  const childPage = block('child_page', { title: 'Sub page' });
  childPage.id = P2;
  const cols = block('column_list', {}, { has_children: true });
  const col = block('column', {}, { has_children: true });
  const colPara = block('paragraph', { rich_text: [rt('in column')] });
  const original = block(
    'synced_block',
    { synced_from: null },
    { has_children: true }
  );
  const origChild = block('paragraph', { rich_text: [rt('shared text')] });
  const copy = block('synced_block', {
    synced_from: { block_id: original.id as string },
  });
  const toc = block('table_of_contents', { color: 'default' });
  const weird = block('ai_block', {});

  const top = [
    h2,
    para,
    n1,
    n2,
    todo,
    toggle,
    callout,
    code,
    divider,
    equation,
    imgOk,
    imgGone,
    imgExt,
    table,
    inlineDb,
    fullDb,
    childPage,
    cols,
    original,
    copy,
    toc,
    weird,
  ];
  top.forEach((b, i) => add(item('block', b.id as string, P1, i, b)));
  add(
    item('block', toggleChild.id as string, toggle.id as string, 0, toggleChild)
  );
  add(item('block', row1.id as string, table.id as string, 0, row1));
  add(item('block', row2.id as string, table.id as string, 1, row2));
  add(item('block', col.id as string, cols.id as string, 0, col));
  add(item('block', colPara.id as string, col.id as string, 0, colPara));
  add(
    item('block', origChild.id as string, original.id as string, 0, origChild)
  );
  files.push({
    ownerId: imgOk.id as string,
    slot: 'file',
    status: 'stored',
    blobKey: 'blob-img',
    size: 123,
    mime: 'image/png',
  });
  files.push({
    ownerId: imgGone.id as string,
    slot: 'file',
    status: 'unavailable',
    blobKey: null,
  });

  // ---- sub page ----
  add(
    item('page', P2, P1, 1, {
      object: 'page',
      id: P2,
      created_time: T,
      last_edited_time: E,
      archived: true,
      parent: { type: 'page_id', page_id: P1 },
      properties: { title: title('Sub page') },
    })
  );

  // ---- inline database DB1 / source S1 ----
  add(
    item('database', DB1, P1, 0, {
      object: 'database',
      id: DB1,
      is_inline: true,
      title: [rt('Tasks')],
      parent: { type: 'page_id', page_id: P1 },
      data_sources: [{ id: S1, name: 'Tasks' }],
    })
  );
  add(
    item('data_source', S1, DB1, 0, {
      object: 'data_source',
      id: S1,
      title: [rt('Tasks')],
      parent: { type: 'database_id', database_id: DB1 },
      properties: {
        Name: { id: 'title', name: 'Name', type: 'title', title: {} },
        Status: {
          id: 'st',
          name: 'Status',
          type: 'status',
          status: {
            options: [
              { id: 'o1', name: 'Todo', color: 'gray' },
              { id: 'o2', name: 'Done', color: 'green' },
            ],
            groups: [
              { id: 'g1', name: 'To-do', color: 'gray', option_ids: ['o1'] },
              {
                id: 'g2',
                name: 'Complete',
                color: 'green',
                option_ids: ['o2'],
              },
            ],
          },
        },
        Tags: {
          id: 'tg',
          name: 'Tags',
          type: 'multi_select',
          multi_select: {
            options: [
              { id: 't1', name: 'a', color: 'blue' },
              { id: 't2', name: 'b', color: 'brown' },
            ],
          },
        },
        Estimate: {
          id: 'es',
          name: 'Estimate',
          type: 'number',
          number: { format: 'dollar' },
        },
        Due: { id: 'du', name: 'Due', type: 'date', date: {} },
        Owner: { id: 'ow', name: 'Owner', type: 'people', people: {} },
        Spec: { id: 'sp', name: 'Spec', type: 'files', files: {} },
        Blocks: {
          id: 'bl',
          name: 'Blocks',
          type: 'relation',
          relation: {
            data_source_id: S1,
            type: 'single_property',
            single_property: {},
          },
        },
        Total: {
          id: 'to',
          name: 'Total',
          type: 'rollup',
          rollup: {
            relation_property_name: 'Blocks',
            rollup_property_name: 'Estimate',
            function: 'sum',
          },
        },
        Score: {
          id: 'sc',
          name: 'Score',
          type: 'formula',
          formula: { expression: 'prop("Estimate") * 2' },
        },
        Ref: {
          id: 'rf',
          name: 'Ref',
          type: 'unique_id',
          unique_id: { prefix: 'TSK' },
        },
        Done: { id: 'dn', name: 'Done', type: 'checkbox', checkbox: {} },
        Site: { id: 'si', name: 'Site', type: 'url', url: {} },
        Note: { id: 'nt', name: 'Note', type: 'rich_text', rich_text: {} },
        Created: {
          id: 'cr',
          name: 'Created',
          type: 'created_time',
          created_time: {},
        },
        Verify: {
          id: 'vf',
          name: 'Verify',
          type: 'verification',
          verification: {},
        },
      },
    })
  );

  const manyRelations = Array.from({ length: 25 }, (_, i) => ({
    id: id(500 + i),
  }));
  add(
    item('page', R1, S1, 0, {
      object: 'page',
      id: R1,
      created_time: T,
      last_edited_time: E,
      parent: { type: 'data_source_id', data_source_id: S1, database_id: DB1 },
      properties: {
        Name: title('Write spec'),
        Status: {
          id: 'st',
          type: 'status',
          status: { id: 'o2', name: 'Done', color: 'green' },
        },
        Tags: {
          id: 'tg',
          type: 'multi_select',
          multi_select: [
            { id: 't1', name: 'a', color: 'blue' },
            { id: 'new', name: 'fresh', color: 'pink' },
          ],
        },
        Estimate: { id: 'es', type: 'number', number: 3 },
        Due: {
          id: 'du',
          type: 'date',
          date: { start: '2025-04-01', end: '2025-04-03', time_zone: null },
        },
        Owner: {
          id: 'ow',
          type: 'people',
          people: [
            {
              object: 'user',
              id: 'u1',
              name: 'Ada',
              type: 'person',
              person: { email: 'ada@example.com' },
            },
          ],
        },
        Spec: {
          id: 'sp',
          type: 'files',
          files: [
            {
              name: 'spec.pdf',
              type: 'file',
              file: { url: 'https://s3/spec.pdf' },
            },
            {
              name: 'old.pdf',
              type: 'file',
              file: { url: 'https://s3/old.pdf' },
            },
            {
              name: 'link',
              type: 'external',
              external: { url: 'https://example.com/x' },
            },
          ],
        },
        Blocks: {
          id: 'bl',
          type: 'relation',
          has_more: true,
          relation: manyRelations,
        },
        Total: {
          id: 'to',
          type: 'rollup',
          rollup: { type: 'number', number: 9, function: 'sum' },
        },
        Score: {
          id: 'sc',
          type: 'formula',
          formula: { type: 'number', number: 6 },
        },
        Ref: {
          id: 'rf',
          type: 'unique_id',
          unique_id: { prefix: 'TSK', number: 7 },
        },
        Done: { id: 'dn', type: 'checkbox', checkbox: true },
        Site: { id: 'si', type: 'url', url: 'https://example.com' },
        Note: { id: 'nt', type: 'rich_text', rich_text: [rt('hello')] },
        Created: { id: 'cr', type: 'created_time', created_time: T },
      },
    })
  );
  files.push({
    ownerId: R1,
    slot: 'prop:sp:0',
    status: 'stored',
    blobKey: 'blob-spec',
    size: 5,
    mime: 'application/pdf',
  });
  files.push({
    ownerId: R1,
    slot: 'prop:sp:1',
    status: 'unavailable',
    blobKey: null,
  });
  // the 25-reference limit: the remaining relations arrive as property pages
  add(
    item('property', `${R1}/bl#0`, R1, 0, {
      object: 'property_page',
      page_id: R1,
      property_id: 'bl',
      index: 0,
      has_more: true,
      results: manyRelations.map(r => ({
        object: 'property_item',
        type: 'relation',
        relation: r,
      })),
    })
  );
  add(
    item('property', `${R1}/bl#1`, R1, 1, {
      object: 'property_page',
      page_id: R1,
      property_id: 'bl',
      index: 1,
      has_more: false,
      results: [R2, id(600), id(601), id(602), id(603)].map(x => ({
        object: 'property_item',
        type: 'relation',
        relation: { id: x },
      })),
    })
  );

  add(
    item('page', R2, S1, 1, {
      object: 'page',
      id: R2,
      created_time: T,
      last_edited_time: E,
      parent: { type: 'data_source_id', data_source_id: S1, database_id: DB1 },
      properties: {
        Name: title('Review'),
        Status: { id: 'st', type: 'status', status: null },
        Estimate: { id: 'es', type: 'number', number: null },
        Due: {
          id: 'du',
          type: 'date',
          date: { start: '2025-05-01', end: null, time_zone: null },
        },
        Total: {
          id: 'to',
          type: 'rollup',
          rollup: { type: 'incomplete', function: 'sum' },
        },
      },
    })
  );

  // ---- full-page database DB2 / source S2 ----
  add(
    item('database', DB2, null, 1, {
      object: 'database',
      id: DB2,
      is_inline: false,
      title: [rt('Reading')],
      parent: { type: 'workspace', workspace: true },
      icon: {
        type: 'external',
        external: { url: 'https://example.com/i.png' },
      },
      data_sources: [{ id: S2, name: 'Reading' }],
    })
  );
  add(
    item('data_source', S2, DB2, 0, {
      object: 'data_source',
      id: S2,
      title: [rt('Reading')],
      parent: { type: 'database_id', database_id: DB2 },
      properties: {
        Title: { id: 'title', name: 'Title', type: 'title', title: {} },
      },
    })
  );
  add(
    item('page', R3, S2, 0, {
      object: 'page',
      id: R3,
      created_time: T,
      last_edited_time: E,
      parent: { type: 'data_source_id', data_source_id: S2, database_id: DB2 },
      properties: { Title: title('A book') },
    })
  );

  add(
    item('comment', id(700), P1, 0, {
      object: 'comment',
      id: id(700),
      parent: { type: 'page_id', page_id: P1 },
      rich_text: [rt('looks good')],
    })
  );

  return {
    run: { items, files },
    blobKeys: { img: 'blob-img', cover: 'blob-cover', spec: 'blob-spec' },
  };
}
