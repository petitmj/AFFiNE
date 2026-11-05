import { createHash } from 'node:crypto';

import test from 'ava';

import { planBatches } from '../domain/batching';
import { CODES, Ledger } from '../domain/ledger';
import {
  buildPreservedFile,
  buildReport,
  CODE_HELP,
  PRESERVED_FORMAT,
} from '../domain/report';
import { transformRun } from '../domain/transform';
import { buildRun } from './fixtures';

const hash = async (s: string) => createHash('sha256').update(s).digest('hex');
const hashBytes = async (b: Uint8Array) =>
  createHash('sha256').update(b).digest('base64url');
const meta = {
  runId: 'run1',
  notionWorkspaceName: 'Acme',
  now: 1_700_000_000_000,
};

test('ledger keeps the worst outcome per item and counts each item once', t => {
  const l = new Ledger();
  l.record(
    { notionId: 'a', subject: 'block:x', outcome: 'degraded', codes: ['c1'] },
    { raw: 1 }
  );
  l.record({
    notionId: 'a',
    subject: 'block:x',
    outcome: 'preserved_only',
    codes: ['c2'],
  });
  l.record({ notionId: 'a', subject: 'block:x', outcome: 'mapped' });
  const [e] = l.entries();
  t.is(e.outcome, 'preserved_only');
  t.deepEqual(e.codes, ['c1', 'c2']);
  t.deepEqual(l.summary(), {
    mapped: 0,
    degraded: 0,
    preservedOnly: 1,
    unrecoverable: 0,
  });
  t.deepEqual(
    l.preserved().map(p => p.payload),
    [{ raw: 1 }]
  );
});

test('mapped items never carry a raw payload into the preserved file', t => {
  const l = new Ledger();
  l.record({ notionId: 'a', subject: 's', outcome: 'mapped' }, { raw: 1 });
  t.deepEqual(l.preserved(), []);
});

test('preserved file is self-describing and holds every non-mapped payload', async t => {
  const out = await transformRun(buildRun().run, { hash, now: meta.now });
  const file = JSON.parse(buildPreservedFile(out.ledger, meta));
  t.is(file.format, PRESERVED_FORMAT);
  t.is(file.runId, 'run1');
  t.is(file.generatedAt, '2023-11-14T22:13:20.000Z');
  const nonMapped = out.ledger
    .entries()
    .filter(e => e.outcome !== 'mapped').length;
  t.true(file.records.length > 0 && file.records.length <= nonMapped);
  t.deepEqual(file.summary, out.ledger.summary());
});

test('every code the transform can emit has a plain-language explanation', t => {
  const emitted = Object.values(CODES);
  t.deepEqual(
    emitted.filter(c => !(c in CODE_HELP) && c !== CODES.rowLimitReached),
    []
  );
});

test('report doc: summary, differences, table, and an attachment pointing at the blob', async t => {
  const out = await transformRun(buildRun().run, { hash, now: meta.now });
  const { doc, blob } = await buildReport(out.ledger, meta, hashBytes);
  const note = doc.snapshot.blocks.children[1];
  const flavours = note.children.map(b => b.flavour);
  t.true(flavours.includes('affine:table'));
  const att = note.children.find(b => b.flavour === 'affine:attachment')!;
  t.is(att.props.sourceId, blob.blobId);
  t.is(att.props.size, blob.bytes.byteLength);
  t.is(
    blob.blobId,
    createHash('sha256').update(blob.bytes).digest('base64url')
  );
  t.is(doc.meta.title, 'Notion import report 2023-11-14');
});

test('report of a clean import says so', async t => {
  const { doc } = await buildReport(new Ledger(), meta, hashBytes);
  t.true(
    JSON.stringify(doc.snapshot.blocks).includes(
      'Everything arrived in a native AFFiNE form.'
    )
  );
});

test('batches: docs first, report last, folders and icons only on the final batch', async t => {
  const out = await transformRun(buildRun().run, { hash, now: meta.now });
  const report = await buildReport(out.ledger, meta, hashBytes);
  const batches = planBatches(out, report, 4);
  const last = batches[batches.length - 1];
  t.true(last.done);
  t.true(batches.slice(0, -1).every(b => !b.done && !b.folders && !b.icons));
  t.deepEqual(
    last.docs.map(d => d.id),
    [report.doc.id]
  );
  t.is(last.folders, out.folders);
  const ids = batches.flatMap(b => b.docs.map(d => d.id));
  t.is(ids.length, out.docs.length + 1);
  t.deepEqual(
    ids.filter((x, i) => ids.indexOf(x) !== i),
    []
  ); // no doc committed twice
  t.is(last.progress.completed, last.progress.total);
  for (const b of batches) t.true(b.progress.completed <= b.progress.total);
});
