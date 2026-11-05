import { createHash } from 'node:crypto';

import test from 'ava';

import type { SnapBlock } from '../domain/blocks';
import { docIdFor, blockIdFor } from '../domain/ids';
import { CODES } from '../domain/ledger';
import { richTextToDelta } from '../domain/rich-text';
import { legalTitle, transformRun } from '../domain/transform';
import {
  buildRun,
  DB1,
  DB2,
  P1,
  P2,
  R1,
  R2,
  R3,
  S1,
  mentionPage,
  rt,
} from './fixtures';

const deps = {
  hash: async (s: string) => createHash('sha256').update(s).digest('hex'),
  now: 1_700_000_000_000,
};

const flat = (b: SnapBlock): SnapBlock[] => [b, ...b.children.flatMap(flat)];
const doc = (out: Awaited<ReturnType<typeof transformRun>>, notionId: string) =>
  out.docs.find(d => d.id === docIdFor(notionId))!;
const body = (d: { snapshot: { blocks: SnapBlock } }) =>
  d.snapshot.blocks.children[1].children;

test('one doc per page, row and full-page database; inline database has none', async t => {
  const out = await transformRun(buildRun().run, deps);
  t.deepEqual(
    out.docs.map(d => d.id).sort(),
    [P1, P2, R1, R2, R3, DB2].map(docIdFor).sort()
  );
  t.false(out.docs.some(d => d.id === docIdFor(DB1)));
  t.false(out.docs.some(d => d.id === docIdFor(S1)));
});

test('ids are pure functions of Notion ids, so a re-run is identical', async t => {
  const a = await transformRun(buildRun().run, deps);
  const b = await transformRun(buildRun().run, deps);
  t.deepEqual(
    a.docs.map(d => d.snapshot),
    b.docs.map(d => d.snapshot)
  );
  t.deepEqual(
    a.docs.map(d => d.id),
    b.docs.map(d => d.id)
  );
  t.deepEqual(a.folders, b.folders);
  t.deepEqual(
    a.ledger
      .entries()
      .map(e => [e.notionId, e.subject, e.outcome, e.contentHash]),
    b.ledger
      .entries()
      .map(e => [e.notionId, e.subject, e.outcome, e.contentHash])
  );
});

test('every block id is unique inside its doc, including copied synced blocks', async t => {
  const out = await transformRun(buildRun().run, deps);
  for (const d of out.docs) {
    const ids = flat(d.snapshot.blocks).map(b => b.id);
    t.deepEqual(
      ids.filter((x, i) => ids.indexOf(x) !== i),
      []
    );
  }
});

test('every page reference points at a doc this import creates', async t => {
  const out = await transformRun(buildRun().run, deps);
  const known = new Set(out.docs.map(d => d.id));
  const missing: string[] = [];
  for (const d of out.docs) {
    for (const b of flat(d.snapshot.blocks)) {
      const t0 = b.props.text as
        | { delta?: { attributes?: { reference?: { pageId: string } } }[] }
        | undefined;
      for (const op of t0?.delta ?? []) {
        const ref = op.attributes?.reference;
        if (ref && !known.has(ref.pageId)) missing.push(ref.pageId);
      }
    }
  }
  t.deepEqual(missing, []);
});

test('page body: headings, lists, callout, code, latex, table, flattening', async t => {
  const out = await transformRun(buildRun().run, deps);
  const blocks = body(doc(out, P1));
  const flavours = blocks.map(b => b.flavour);
  t.is(flavours[0], 'affine:image'); // the cover comes first
  t.true(flavours.includes('affine:callout'));
  t.true(flavours.includes('affine:code'));
  t.true(flavours.includes('affine:divider'));
  t.true(flavours.includes('affine:latex'));
  t.true(flavours.includes('affine:table'));
  const lists = blocks.filter(b => b.flavour === 'affine:list');
  t.deepEqual(
    lists.filter(l => l.props.type === 'numbered').map(l => l.props.order),
    [1, 2]
  );
  t.true(lists.find(l => l.props.type === 'todo')!.props.checked as boolean);
  const toggle = lists.find(l => l.props.collapsed === true)!;
  t.is(toggle.children.length, 1);
  const table = blocks.find(b => b.flavour === 'affine:table')!;
  t.is(Object.keys(table.props.rows as object).length, 2);
  t.is(Object.keys(table.props.columns as object).length, 2);
  const texts = flat(doc(out, P1).snapshot.blocks).map(b =>
    JSON.stringify(b.props.text ?? '')
  );
  t.true(texts.some(s => s.includes('in column'))); // column layout flattened, text kept
  t.is(texts.filter(s => s.includes('shared text')).length, 2); // synced block copied
});

test('media: stored file keeps its blob key, missing file is visible and unrecoverable', async t => {
  const out = await transformRun(buildRun().run, deps);
  const all = flat(doc(out, P1).snapshot.blocks);
  t.true(
    all.some(
      b => b.flavour === 'affine:image' && b.props.sourceId === 'blob-img'
    )
  );
  t.true(
    all.some(b =>
      JSON.stringify(b.props.text ?? '').includes('File unavailable')
    )
  );
  t.true(all.some(b => b.flavour === 'affine:bookmark')); // external image kept as a link
  const lost = out.ledger.entries().filter(e => e.outcome === 'unrecoverable');
  t.true(
    lost.some(
      e =>
        e.subject === 'block:image' && e.codes.includes(CODES.fileUnavailable)
    )
  );
});

test('unknown blocks keep a placeholder and their raw JSON', async t => {
  const out = await transformRun(buildRun().run, deps);
  const e = out.ledger.entries().find(x => x.subject === 'block:ai_block')!;
  t.is(e.outcome, 'preserved_only');
  t.truthy(out.ledger.preserved().find(p => p.notionId === e.notionId));
  const toc = out.ledger
    .entries()
    .find(x => x.subject === 'block:table_of_contents')!;
  t.is(toc.outcome, 'degraded');
});

test('database columns: native types in Notion order, title first', async t => {
  const out = await transformRun(buildRun().run, deps);
  const dbBlock = flat(doc(out, P1).snapshot.blocks).find(
    b => b.flavour === 'affine:database'
  )!;
  const cols = dbBlock.props.columns as {
    type: string;
    name: string;
    data: Record<string, unknown>;
  }[];
  t.deepEqual(
    cols.map(c => `${c.name}:${c.type}`),
    [
      'Name:title',
      'Status:status',
      'Tags:multi-select',
      'Estimate:number',
      'Due:date',
      'Owner:person',
      'Spec:files',
      'Blocks:relation',
      'Total:rollup',
      'Score:formula',
      'Ref:rich-text',
      'Done:checkbox',
      'Site:link',
      'Note:rich-text',
      'Created:created-time',
    ]
  );
  const status = cols.find(c => c.type === 'status')!;
  t.is((status.data.groups as unknown[]).length, 2);
  t.is(
    (cols.find(c => c.type === 'formula')!.data as { expression: string })
      .expression,
    'prop("Estimate") * 2'
  );
  t.is(dbBlock.children.length, 2); // two rows
});

test('cells: values land in the right shape', async t => {
  const out = await transformRun(buildRun().run, deps);
  const dbBlock = flat(doc(out, P1).snapshot.blocks).find(
    b => b.flavour === 'affine:database'
  )!;
  const cols = dbBlock.props.columns as {
    id: string;
    name: string;
    data: { options?: { id: string; value: string }[] };
  }[];
  const cells = dbBlock.props.cells as Record<
    string,
    Record<string, { value: any }>
  >;
  const row = cells[blockIdFor(R1)];
  const by = (name: string) => row[cols.find(c => c.name === name)!.id]?.value;
  t.is(by('Status'), 'o2');
  t.deepEqual(by('Tags'), ['t1', 'new']); // an option missing from the schema is added, not dropped
  t.true(
    cols
      .find(c => c.name === 'Tags')!
      .data.options!.some(o => o.value === 'fresh')
  );
  t.is(by('Estimate'), 3);
  t.is(by('Due'), Date.parse('2025-04-01'));
  t.is(by('Done'), true);
  t.is(by('Site'), 'https://example.com');
  t.is(by('Owner')[0].email, 'ada@example.com');
  t.deepEqual(by('Total'), {
    display: '9',
    raw: { type: 'number', number: 9, function: 'sum' },
    incomplete: false,
  });
  t.deepEqual(by('Score'), { type: 'number', value: 6, display: '6' });
  t.is(
    JSON.stringify(by('Ref')),
    JSON.stringify({
      '$blocksuite:internal:text$': true,
      delta: [{ insert: 'TSK-7' }],
    })
  );
  const files = by('Spec');
  t.is(files[0].blobId, 'blob-spec');
  t.true(files[1].unavailable);
  t.true(files[2].external);
});

test('more than 25 relations: the staged property pages are merged in, nothing truncated', async t => {
  const out = await transformRun(buildRun().run, deps);
  const dbBlock = flat(doc(out, P1).snapshot.blocks).find(
    b => b.flavour === 'affine:database'
  )!;
  const cols = dbBlock.props.columns as { id: string; name: string }[];
  const cells = dbBlock.props.cells as Record<
    string,
    Record<string, { value: any }>
  >;
  const rel = cells[blockIdFor(R1)][cols.find(c => c.name === 'Blocks')!.id]
    .value as { notionId: string; docId?: string }[];
  t.is(rel.length, 30);
  t.is(rel.find(r => r.notionId === R2)!.docId, docIdFor(R2)); // resolvable ones link
  t.is(rel[0].docId, undefined); // the rest keep their Notion id
});

test('row block shows the row doc as a link and carries created time', async t => {
  const out = await transformRun(buildRun().run, deps);
  const dbBlock = flat(doc(out, P1).snapshot.blocks).find(
    b => b.flavour === 'affine:database'
  )!;
  const row = dbBlock.children[0];
  t.is(row.props['meta:createdAt'], Date.parse('2025-03-04T10:00:00.000Z'));
  t.true(JSON.stringify(row.props.text).includes(docIdFor(R1)));
});

test('ledger: column-level codes are recorded once per column, not once per row', async t => {
  const out = await transformRun(buildRun().run, deps);
  const entries = out.ledger.entries();
  t.is(entries.filter(e => e.codes.includes(CODES.formulaStatic)).length, 1);
  t.is(entries.filter(e => e.codes.includes(CODES.rollupStatic)).length, 1);
  t.true(
    entries.some(
      e => e.notionId === R1 && e.codes.includes(CODES.dateEndPreserved)
    )
  );
  t.true(
    entries.some(
      e => e.notionId === R2 && e.codes.includes(CODES.rollupIncomplete)
    )
  );
  const verify = entries.find(e => e.notionId === `${S1}/Verify`)!;
  t.is(verify.outcome, 'preserved_only');
  const s = out.ledger.summary();
  t.true(
    s.mapped > 0 && s.degraded > 0 && s.preservedOnly > 0 && s.unrecoverable > 0
  );
});

test('comments are preserved, not dropped', async t => {
  const out = await transformRun(buildRun().run, deps);
  const c = out.ledger.entries().find(e => e.subject === 'comment')!;
  t.is(c.outcome, 'preserved_only');
  t.true(out.ledger.preserved().some(p => p.subject === 'comment'));
});

test('folders: parents first, rows excluded, inline database excluded', async t => {
  const out = await transformRun(buildRun().run, deps);
  const paths = out.folders.map(f => f.path);
  t.true(paths.includes(P1) && paths.includes(P2) && paths.includes(DB2));
  t.false(paths.includes(R1));
  t.false(paths.includes(DB1));
  t.true(paths.indexOf(P1) < paths.indexOf(P2));
  t.is(out.folders.find(f => f.path === P2)!.parentPath, P1);
  t.is(out.folders.find(f => f.path === DB2)!.parentPath, undefined);
  t.deepEqual(out.folders.find(f => f.path === P1)!.icon, {
    type: 'emoji',
    unicode: '📁',
  });
});

test('archived pages are imported into the trash, with their content', async t => {
  const out = await transformRun(buildRun().run, deps);
  t.true(doc(out, P2).meta.trash);
  t.falsy(doc(out, P1).meta.trash);
});

test('an unsupported database icon is reported, not silently lost', async t => {
  const out = await transformRun(buildRun().run, deps);
  t.true(
    out.ledger
      .entries()
      .some(
        e =>
          e.notionId === DB2 &&
          e.subject === 'icon' &&
          e.codes.includes(CODES.iconDropped)
      )
  );
});

test('a folder cycle in the source cannot stall the commit step', async t => {
  const { run } = buildRun();
  const a = run.items.find(i => i.notionId === P1)!;
  (a.payload.parent as { type: string; page_id?: string }) = {
    type: 'page_id',
    page_id: P2,
  };
  const out = await transformRun(run, deps);
  const f1 = out.folders.find(f => f.path === P1)!;
  const f2 = out.folders.find(f => f.path === P2)!;
  t.true(f1.parentPath === undefined || f2.parentPath === undefined);
});

test('rich text: merging, equations, unresolved mentions', t => {
  const notes: string[] = [];
  const ctx = {
    resolveDoc: (id: string) => (id === 'known' ? 'doc-known' : undefined),
    note: (c: string) => notes.push(c),
  };
  const r = richTextToDelta(
    [
      rt('a'),
      rt('b'),
      rt('c', {}, { bold: true }),
      mentionPage('known', 'K'),
      mentionPage('gone', 'G'),
      {
        type: 'equation',
        equation: { expression: 'x^2' },
        annotations: {},
        plain_text: 'x^2',
      },
    ],
    ctx
  );
  t.deepEqual(r.delta[0], { insert: 'ab' });
  t.deepEqual(r.delta[1], { insert: 'c', attributes: { bold: true } });
  t.is((r.delta[2].attributes as any).reference.pageId, 'doc-known');
  t.true(
    (r.delta[3].attributes as any).link.includes('gone'.replace(/-/g, ''))
  );
  t.is((r.delta[4].attributes as any).latex, 'x^2');
  t.deepEqual(notes, [CODES.mentionUnresolved]);
});

test('legalTitle strips control characters and names empty titles', t => {
  t.deepEqual(legalTitle('  a\u0000b\nc '), { title: 'a b c', empty: false });
  t.deepEqual(legalTitle('   '), { title: 'Untitled', empty: true });
  t.is(legalTitle('x'.repeat(900)).title.length, 500);
});
