import { createHash } from 'node:crypto';

import test from 'ava';

import { CODES } from '../domain/ledger';
import { parseRoot, parseRoots } from '../domain/roots';
import { isRunning, overallProgress } from '../services/progress';
import {
  FILE_PAGE_SIZE,
  type GqlTransport,
  type ItemKind,
  LEDGER_SLICE,
  NotionApi,
  type NotionRun,
  type RunStatus,
} from '../services/notion-api';
import {
  type CommitResult,
  type ControllerDeps,
  type NotionApiPort,
  NotionImportController,
  type RunState,
} from '../services/run-controller';
import { buildRun } from './fixtures';

const run = (status: RunStatus, extra: Partial<NotionRun> = {}): NotionRun => ({
  id: 'run1',
  workspaceId: 'ws1',
  status,
  apiVersion: '2025-09-03',
  notionWorkspaceName: 'Acme',
  progress: {
    doneTasks: 1,
    failedTasks: 0,
    pendingTasks: 0,
    warningCount: 0,
    warnings: [],
  },
  ...extra,
});

function setup(
  statuses: NotionRun[],
  opts: {
    commit?: (docs: string[]) => CommitResult;
    reportFails?: boolean;
  } = {}
) {
  const fixture = buildRun().run;
  let polls = 0;
  const reported: number[] = [];
  const committed: string[][] = [];
  const api: NotionApiPort = {
    create: async () => statuses[0],
    run: async () => statuses[Math.min(++polls, statuses.length - 1)],
    runs: async () => statuses,
    pause: async () => {},
    resume: async () => {},
    cancel: async () => {},
    items: async (_id, kind: ItemKind) =>
      fixture.items.filter(i => i.kind === kind) as never,
    files: async () => fixture.files as never,
    preserved: async () => [],
    reportLedger: async (_id, entries) => {
      if (opts.reportFails) throw new Error('boom');
      reported.push(entries.length);
      return { mapped: 1, degraded: 2, preservedOnly: 3, unrecoverable: 4 };
    },
  };
  const deps: ControllerDeps = {
    api,
    hash: async s => createHash('sha256').update(s).digest('hex'),
    hashBytes: async b => createHash('sha256').update(b).digest('base64url'),
    commit: async batch => {
      const ids = batch.docs.map(d => d.id);
      committed.push(ids);
      return opts.commit ? opts.commit(ids) : { docIds: ids, warnings: [] };
    },
    now: () => 1_700_000_000_000,
    sleep: async () => {},
    docsPerBatch: 4,
  };
  const states: RunState[] = [];
  const c = new NotionImportController(deps, s => states.push(s));
  return { c, states, reported, committed };
}

const input = { token: 't', workspaceId: 'ws1' };

test('a run that stages is loaded, committed in batches, reported and finished', async t => {
  const { c, states, reported, committed } = setup([
    run('running'),
    run('staged'),
  ]);
  const end = await c.start(input);
  t.is(end.phase, 'done');
  t.true(end.importedDocIds.length > 0);
  t.truthy(end.reportDocId);
  t.deepEqual(end.summary, {
    mapped: 1,
    degraded: 2,
    preservedOnly: 3,
    unrecoverable: 4,
  });
  t.is(reported.length, 1);
  t.true(committed.length >= 3);
  t.deepEqual(committed[committed.length - 1], [end.reportDocId]);
  const phases = states.map(s => s.phase);
  for (const p of [
    'extracting',
    'loading',
    'transforming',
    'committing',
    'reporting',
    'done',
  ] as const) {
    t.true(phases.includes(p));
  }
  t.true(
    JSON.parse(end.preservedJson ?? '{}').format.startsWith(
      'affine-notion-preserved'
    )
  );
});

test('a page AFFiNE refuses becomes unrecoverable and keeps its raw data', async t => {
  let dropped = '';
  const { c } = setup([run('staged')], {
    commit: ids => {
      dropped ||= ids[0];
      return { docIds: ids.filter(i => i !== dropped), warnings: [] };
    },
  });
  const end = await c.start(input);
  t.is(end.phase, 'done');
  t.false(end.importedDocIds.includes(dropped));
  const file = JSON.parse(end.preservedJson ?? '{}');
  const hit = file.entries.find(
    (e: { affineDocId?: string }) => e.affineDocId === dropped
  );
  t.is(hit.outcome, 'unrecoverable');
  t.deepEqual(hit.codes, [CODES.commitFailed]);
  t.true(
    file.records.some((r: { notionId: string }) => r.notionId === hit.notionId)
  );
});

test('a server that cannot take the ledger does not lose the import', async t => {
  const { c } = setup([run('staged')], { reportFails: true });
  const end = await c.start(input);
  t.is(end.phase, 'done');
  t.true(end.warnings.some(w => w.code === 'ledger_report_failed'));
  t.true((end.summary?.mapped ?? 0) > 0);
});

test('failed, cancelled and expired runs end in the matching phase', async t => {
  const failed = await setup([
    run('failed', { lastError: 'rate limited' }),
  ]).c.start(input);
  t.is(failed.phase, 'failed');
  t.is(failed.error, 'rate limited');
  t.is((await setup([run('cancelled')]).c.start(input)).phase, 'cancelled');
  const expired = await setup([run('expired')]).c.start(input);
  t.is(expired.phase, 'failed');
  t.true(/expired/.test(expired.error ?? ''));
});

test('leaving the wizard detaches without touching the server run', async t => {
  const ctl = new AbortController();
  const { c } = setup([run('running')]);
  ctl.abort();
  const end = await c.start(input, ctl.signal);
  t.is(end.phase, 'detached');
});

test('a paused run is shown as paused while it is polled', async t => {
  const { c, states } = setup([run('paused'), run('paused'), run('staged')]);
  await c.start(input);
  t.true(states.some(s => s.phase === 'paused'));
});

function fakeGql(
  handler: (op: string, v: Record<string, unknown>) => unknown
): { gql: GqlTransport; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    gql: async ({ query, variables }) => {
      calls.push(query.op);
      return { [query.op]: handler(query.op, variables ?? {}) };
    },
  };
}

test('items are paged by cursor until the server stops giving one', async t => {
  const { gql, calls } = fakeGql((_op, v) =>
    v.after === undefined
      ? { endCursor: 'c1', items: [{ notionId: 'a' }, { notionId: 'b' }] }
      : v.after === 'c1'
        ? { endCursor: null, items: [{ notionId: 'c' }] }
        : (() => {
            throw new Error('too far');
          })()
  );
  const items = await new NotionApi(gql).items('r', 'page');
  t.deepEqual(
    items.map(i => i.notionId),
    ['a', 'b', 'c']
  );
  t.is(calls.length, 2);
});

test('files are paged by skip, and the ledger goes up in slices the server accepts', async t => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ownerId: `o${i}` }));
  const { gql } = fakeGql((_op, v) =>
    (v.skip as number) === 0 ? rows(FILE_PAGE_SIZE) : rows(3)
  );
  t.is((await new NotionApi(gql).files('r')).length, FILE_PAGE_SIZE + 3);

  const sizes: number[] = [];
  const ledger = fakeGql((_op, v) => {
    sizes.push((v.entries as unknown[]).length);
    return { mapped: 0, degraded: 0, preservedOnly: 0, unrecoverable: 0 };
  });
  const entries = Array.from({ length: LEDGER_SLICE * 2 + 7 }, (_, i) => ({
    notionId: `n${i}`,
    subject: 's',
    outcome: 'mapped' as const,
    codes: [],
  }));
  await new NotionApi(ledger.gql).reportLedger('r', entries as never);
  t.deepEqual(sizes, [LEDGER_SLICE, LEDGER_SLICE, 7]);
});

test('a malformed reply is an error, not a silent empty result', async t => {
  const api = new NotionApi(async () => ({}));
  const err = await t.throwsAsync(() => api.run('x'));
  t.true(/missing notionImport/.test(err?.message ?? ''));
});

test('roots: links, bare ids, view ids and duplicates', t => {
  const id = '0123456789abcdef0123456789abcdef';
  const dashedId = '01234567-89ab-cdef-0123-456789abcdef';
  const view = 'fedcba9876543210fedcba9876543210';
  t.is(parseRoot(`https://www.notion.so/team/My-Page-${id}`), dashedId);
  t.is(parseRoot(`https://www.notion.so/${id}?v=${view}`), dashedId);
  t.is(parseRoot(dashedId.toUpperCase()), dashedId);
  t.is(parseRoot('not an id'), undefined);
  const r = parseRoots(
    `${id}\n\n${dashedId}\nhello, https://notion.so/x-${view}`
  );
  t.deepEqual(r.ids, [
    dashedId,
    dashedId.replace(
      '01234567-89ab-cdef-0123-456789abcdef',
      'fedcba98-7654-3210-fedc-ba9876543210'
    ),
  ]);
  t.deepEqual(r.invalid, ['hello']);
});

test('overall progress only moves forward through the phases', t => {
  const base = { importedDocIds: [], warnings: [] };
  const extract = {
    doneTasks: 5,
    failedTasks: 0,
    pendingTasks: 5,
    warningCount: 0,
    warnings: [],
  };
  const steps = [
    overallProgress({ ...base, phase: 'creating' }),
    overallProgress({ ...base, phase: 'extracting', extract }),
    overallProgress({ ...base, phase: 'loading' }),
    overallProgress({ ...base, phase: 'transforming' }),
    overallProgress({
      ...base,
      phase: 'committing',
      commit: { completed: 10, total: 20 },
    }),
    overallProgress({ ...base, phase: 'reporting' }),
    overallProgress({ ...base, phase: 'done' }),
  ];
  t.is(steps[1], 0.2);
  t.deepEqual(
    [...steps].sort((a, b) => a - b),
    steps
  );
  t.is(steps[steps.length - 1], 1);
  t.true(
    isRunning({ ...base, phase: 'paused' }) &&
      !isRunning({ ...base, phase: 'done' })
  );
});
