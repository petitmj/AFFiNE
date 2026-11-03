import test from 'ava';

import { decodeCheckpoint, encodeCheckpoint } from '../domain/cursor';
import { FileMirrorError, NotionApiError, RetryTaskError } from '../domain/errors';
import { initialTasks, TaskExecutor } from '../domain/executor';
import type { JsonObject, RunOptions, TaskRef } from '../domain/types';
import {
  api,
  MemoryFiles,
  MemoryStore,
  page,
  ScriptedMirror,
} from './helpers';

const RUN = 'run1';
const options: RunOptions = { roots: [], includeBlockComments: false };

function task(kind: TaskRef['kind'], targetId: string, cursor: string | null = null): TaskRef {
  return { id: `${kind}:${targetId}`, runId: RUN, kind, targetId, cursor, attempts: 0 };
}

function setup(
  overrides: Parameters<typeof api>[0],
  mirror = new ScriptedMirror(() => ({ blobKey: 'k', size: 1, mime: 'image/png' })),
  opts = options
) {
  const store = new MemoryStore();
  const files = new MemoryFiles();
  const executor = new TaskExecutor(
    { api: api(overrides), store, files, mirror },
    opts
  );
  return { store, files, mirror, executor };
}

const hostedImage = (id: string): JsonObject => ({
  object: 'block',
  id,
  type: 'image',
  has_children: false,
  image: { type: 'file', file: { url: `https://s3/${id}.png`, expiry_time: 'x' } },
});

test('checkpoint round trips and tolerates a bare Notion cursor', t => {
  const cp = { c: 'abc', n: 7, s: '2024-01-01T00:00:00.000Z' };
  t.deepEqual(decodeCheckpoint(encodeCheckpoint(cp)), cp);
  t.deepEqual(decodeCheckpoint('plain-cursor'), { c: 'plain-cursor', n: 0, s: null });
  t.deepEqual(decodeCheckpoint(null), { c: null, n: 0, s: null });
});

test('initial work reads users and either searches or starts at the roots', t => {
  t.deepEqual(initialTasks(options).map(x => x.kind), ['users', 'search']);
  t.deepEqual(
    initialTasks({ ...options, roots: ['a', 'b'] }),
    [
      { kind: 'users', targetId: 'all' },
      { kind: 'page', targetId: 'a' },
      { kind: 'page', targetId: 'b' },
    ]
  );
});

test('block_children stages raw blocks and queues what hangs off them', async t => {
  const blocks: JsonObject[] = [
    { object: 'block', id: 'b1', type: 'paragraph', has_children: true },
    { object: 'block', id: 'b2', type: 'child_page', has_children: true },
    { object: 'block', id: 'b3', type: 'child_database', has_children: false },
    { object: 'block', id: 'b4', type: 'synced_block', has_children: false, synced_block: { synced_from: { block_id: 'orig' } } },
    { object: 'block', id: 'b5', type: 'unsupported', has_children: false },
  ];
  const { executor, store } = setup({ listBlockChildren: async () => page(blocks) });
  const result = await executor.execute(RUN, task('block_children', 'parent'));

  t.is(result.nextCursor, null);
  t.deepEqual(
    result.newTasks.map(x => `${x.kind}:${x.targetId}`).sort(),
    ['block_children:b1', 'block_children:orig', 'database:b3', 'page:b2'].sort()
  );
  t.is(result.warnings.length, 1);
  t.is(result.warnings[0].code, 'unsupported_block');
  // the child_page block must not also queue its own children
  t.false(result.newTasks.some(x => x.kind === 'block_children' && x.targetId === 'b2'));
  // payload is stored untouched
  t.is(store.items.get(`${RUN}/block/b1`)?.payload, blocks[0]);
  t.is(store.items.get(`${RUN}/block/b5`)?.position, 4);
});

test('block comments are only queued when the run asks for them', async t => {
  const blocks = [{ object: 'block', id: 'b1', type: 'paragraph', has_children: false }];
  const off = setup({ listBlockChildren: async () => page(blocks) });
  t.false((await off.executor.execute(RUN, task('block_children', 'p'))).newTasks.some(x => x.kind === 'comments'));
  const on = setup({ listBlockChildren: async () => page(blocks) }, undefined, { ...options, includeBlockComments: true });
  t.true((await on.executor.execute(RUN, task('block_children', 'p'))).newTasks.some(x => x.kind === 'comments'));
});

test('pagination returns a checkpoint that keeps positions continuous', async t => {
  const calls: Array<string | null> = [];
  const { executor, store } = setup({
    listBlockChildren: async (_id, cursor) => {
      calls.push(cursor);
      return cursor === null
        ? page([{ object: 'block', id: 'a', type: 'paragraph' }], 'c2')
        : page([{ object: 'block', id: 'b', type: 'paragraph' }]);
    },
  });
  const first = await executor.execute(RUN, task('block_children', 'p'));
  t.truthy(first.nextCursor);
  const second = await executor.execute(RUN, task('block_children', 'p', first.nextCursor));
  t.is(second.nextCursor, null);
  t.deepEqual(calls, [null, 'c2']);
  t.is(store.items.get(`${RUN}/block/a`)?.position, 0);
  t.is(store.items.get(`${RUN}/block/b`)?.position, 1);
});

test('a 10,000 row cap restarts the query from the last created_time', async t => {
  const seen: Array<string | null> = [];
  const { executor } = setup({
    queryDataSource: async (_id, o) => {
      seen.push(o.createdOnOrAfter);
      return {
        results: [{ object: 'page', id: 'r1', created_time: '2024-03-01T10:00:00.000Z', properties: {} }],
        nextCursor: null,
        hasMore: false,
        incomplete: true,
      };
    },
  });
  const first = await executor.execute(RUN, task('database_rows', 'ds'));
  const cp = decodeCheckpoint(first.nextCursor);
  t.is(cp.s, '2024-03-01T10:00:00.000Z');
  t.is(cp.c, null);
  t.is(first.warnings.length, 0);

  // the next window cannot advance: the same boundary comes back
  const second = await executor.execute(RUN, task('database_rows', 'ds', first.nextCursor));
  t.is(second.nextCursor, null);
  t.is(second.warnings[0].code, 'row_window_exhausted');
  t.deepEqual(seen, [null, '2024-03-01T10:00:00.000Z']);
});

test('rows queue blocks, comments and truncated property pages', async t => {
  const row: JsonObject = {
    object: 'page',
    id: 'row1',
    created_time: '2024-01-01T00:00:00.000Z',
    properties: {
      Rel: { id: 'relId', type: 'relation', has_more: true, relation: [] },
      Num: { id: 'numId', type: 'number', number: 1 },
    },
  };
  const { executor, store } = setup({ queryDataSource: async () => page([row]) });
  const result = await executor.execute(RUN, task('database_rows', 'ds'));
  t.deepEqual(
    result.newTasks.map(x => `${x.kind}:${x.targetId}`).sort(),
    ['block_children:row1', 'comments:row1', 'property_page:row1/relId'].sort()
  );
  t.is(store.items.get(`${RUN}/page/row1`)?.parentId, 'ds');
});

test('property pages are staged with a page index until has_more ends', async t => {
  const { executor, store } = setup({
    retrievePageProperty: async (_p, _id, cursor) =>
      cursor === null
        ? { results: [{ id: 'r1' }], nextCursor: 'n', hasMore: true, incomplete: false }
        : { results: [{ id: 'r2' }], nextCursor: null, hasMore: false, incomplete: false },
  });
  const a = await executor.execute(RUN, task('property_page', 'pg/prop'));
  const b = await executor.execute(RUN, task('property_page', 'pg/prop', a.nextCursor));
  t.is(b.nextCursor, null);
  t.truthy(store.items.get(`${RUN}/property/pg/prop#0`));
  t.truthy(store.items.get(`${RUN}/property/pg/prop#1`));
});

test('a root that is a database falls through from the page task', async t => {
  const { executor } = setup({
    retrievePage: async () => {
      throw new NotionApiError(404, 'object_not_found', 'x', false);
    },
  });
  const result = await executor.execute(RUN, task('page', 'dbroot'));
  t.deepEqual(result.newTasks, [{ kind: 'database', targetId: 'dbroot' }]);
});

test('other page errors still surface', async t => {
  const { executor } = setup({
    retrievePage: async () => {
      throw new NotionApiError(403, 'restricted_resource', 'x', false);
    },
  });
  await t.throwsAsync(() => executor.execute(RUN, task('page', 'p')), { instanceOf: NotionApiError });
});

test('a database stages its data sources and queues their rows', async t => {
  const { executor, store } = setup({
    retrieveDatabase: async () => ({ object: 'database', id: 'db', data_sources: [{ id: 'ds1', name: 'A' }, { id: 'ds2', name: 'B' }] }),
    retrieveDataSource: async id => ({ object: 'data_source', id, properties: {} }),
  });
  const result = await executor.execute(RUN, task('database', 'db'));
  t.deepEqual(result.newTasks.map(x => x.targetId), ['ds1', 'ds2']);
  t.truthy(store.items.get(`${RUN}/data_source/ds2`));
  t.is(store.items.get(`${RUN}/data_source/ds2`)?.parentId, 'db');
});

test('a database without data_sources warns about the API version', async t => {
  const { executor } = setup({ retrieveDatabase: async () => ({ object: 'database', id: 'db' }) });
  const result = await executor.execute(RUN, task('database', 'db'));
  t.is(result.warnings[0].code, 'unsupported_api_version');
});

test('hosted files are mirrored once and recorded', async t => {
  const { executor, files, mirror } = setup({ listBlockChildren: async () => page([hostedImage('img1')]) });
  await executor.execute(RUN, task('block_children', 'p'));
  await executor.execute(RUN, task('block_children', 'p'));
  t.is(files.records.get(`${RUN}/img1/file`)?.status, 'stored');
  t.is(mirror.calls.length, 1); // the replay did not download again
});

test('external files are left as links', async t => {
  const block = { object: 'block', id: 'e', type: 'image', image: { type: 'external', external: { url: 'https://x/y.png' } } };
  const { executor, mirror } = setup({ listBlockChildren: async () => page([block]) });
  await executor.execute(RUN, task('block_children', 'p'));
  t.is(mirror.calls.length, 0);
});

test('a transient download failure queues a retry that fetches a fresh URL', async t => {
  let healthy = false;
  const mirror = new ScriptedMirror(url =>
    healthy ? { blobKey: 'k', size: 3, mime: 'image/png' } : new FileMirrorError(`timeout ${url}`, true)
  );
  const { executor, files } = setup(
    {
      listBlockChildren: async () => page([hostedImage('img1')]),
      retrieveBlock: async () => hostedImage('img1'),
    },
    mirror
  );
  const first = await executor.execute(RUN, task('block_children', 'p'));
  t.deepEqual(first.newTasks.filter(x => x.kind === 'download_file'), [{ kind: 'download_file', targetId: 'block:img1' }]);
  t.is(files.records.get(`${RUN}/img1/file`)?.status, 'pending');

  // still failing: the retry task asks the queue to back off
  await t.throwsAsync(() => executor.execute(RUN, task('download_file', 'block:img1')), { instanceOf: RetryTaskError });

  healthy = true;
  await executor.execute(RUN, task('download_file', 'block:img1'));
  t.is(files.records.get(`${RUN}/img1/file`)?.status, 'stored');
});

test('a permanent download failure is recorded as unavailable, not dropped', async t => {
  const mirror = new ScriptedMirror(() => new FileMirrorError('too large', false));
  const { executor, files } = setup({ listBlockChildren: async () => page([hostedImage('img1')]) }, mirror);
  const result = await executor.execute(RUN, task('block_children', 'p'));
  t.is(files.records.get(`${RUN}/img1/file`)?.status, 'unavailable');
  t.is(result.warnings[0].code, 'file_unavailable');
  t.false(result.newTasks.some(x => x.kind === 'download_file'));
});

test('comment attachments cannot be refetched, so a failure is final', async t => {
  const comment = { object: 'comment', id: 'c1', attachments: [{ category: 'image', type: 'file', file: { url: 'https://s3/a.png' } }] };
  const mirror = new ScriptedMirror(() => new FileMirrorError('timeout', true));
  const { executor, files } = setup({ listComments: async () => page([comment]) }, mirror);
  const result = await executor.execute(RUN, task('comments', 'pg'));
  t.is(files.records.get(`${RUN}/c1/attachment:0`)?.status, 'unavailable');
  t.is(result.warnings[0].code, 'file_unavailable');
});

test('replaying a task leaves the staged data identical', async t => {
  const blocks = [{ object: 'block', id: 'b1', type: 'paragraph', has_children: false }];
  const { executor, store } = setup({ listBlockChildren: async () => page(blocks) });
  await executor.execute(RUN, task('block_children', 'p'));
  const before = JSON.stringify([...store.items.entries()]);
  await executor.execute(RUN, task('block_children', 'p'));
  t.is(JSON.stringify([...store.items.entries()]), before);
});
