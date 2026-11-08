import test from 'ava';

import { RUNNING_PHASES } from '../services/progress';
import type { Phase, RunState } from '../services/run-controller';
import {
  type ConnectForm,
  connectForm,
  outcomeRows,
  wizardStep,
} from '../services/wizard-model';

const PAGE = 'https://www.notion.so/Roadmap-0123456789abcdef0123456789abcdef';
const PAGE_ID = '01234567-89ab-cdef-0123-456789abcdef';
const DB =
  'https://www.notion.so/ws/fedcba9876543210fedcba9876543210?v=0123456789abcdef0123456789abcdef';
const DB_ID = 'fedcba98-7654-3210-fedc-ba9876543210';

const form = (over: Partial<ConnectForm> = {}): ConnectForm => ({
  token: 'secret_abc',
  scope: 'all',
  rootsText: '',
  includeBlockComments: false,
  available: true,
  ...over,
});

const state = (phase: Phase): RunState => ({
  phase,
  importedDocIds: [],
  warnings: [],
});

test('every phase lands on exactly one screen', t => {
  const all: Phase[] = [
    'idle',
    'creating',
    'extracting',
    'paused',
    'loading',
    'transforming',
    'committing',
    'reporting',
    'done',
    'failed',
    'cancelled',
    'detached',
  ];
  const steps = Object.fromEntries(all.map(p => [p, wizardStep(state(p))]));
  t.deepEqual(steps, {
    idle: 'connect',
    creating: 'running',
    extracting: 'running',
    paused: 'running',
    loading: 'running',
    transforming: 'running',
    committing: 'running',
    reporting: 'running',
    done: 'done',
    failed: 'failed',
    cancelled: 'connect',
    detached: 'connect',
  });
  for (const p of RUNNING_PHASES) t.is(wizardStep(state(p)), 'running');
});

test('the form is complete with a token when everything is imported', t => {
  const r = connectForm(form());
  t.is(r.blocked, undefined);
  t.deepEqual(r.request, {
    token: 'secret_abc',
    roots: [],
    includeBlockComments: false,
  });
});

test('the token is trimmed and an empty one blocks the start', t => {
  t.is(
    connectForm(form({ token: '  secret_abc \n' })).request?.token,
    'secret_abc'
  );
  for (const token of ['', '   ', '\n']) {
    const r = connectForm(form({ token }));
    t.is(r.blocked, 'token');
    t.is(r.request, undefined);
  }
});

test('a workspace without a server cannot start, whatever else is filled in', t => {
  const r = connectForm(form({ available: false }));
  t.is(r.blocked, 'unavailable');
  t.is(r.request, undefined);
  t.is(
    connectForm(form({ available: false, token: '' })).blocked,
    'unavailable'
  );
});

test('"only these pages" turns links and ids into deduplicated root ids', t => {
  const r = connectForm(
    form({
      scope: 'some',
      rootsText: `${PAGE}\n${DB}, ${PAGE_ID.toUpperCase()}\n\n`,
    })
  );
  t.is(r.blocked, undefined);
  t.deepEqual(r.request?.roots, [PAGE_ID, DB_ID]);
});

test('"only these pages" with nothing typed is blocked, not treated as everything', t => {
  for (const rootsText of ['', '  \n , \n']) {
    const r = connectForm(form({ scope: 'some', rootsText }));
    t.is(r.blocked, 'roots');
    t.is(r.request, undefined);
  }
});

test('one unreadable line blocks the start and is reported back', t => {
  const r = connectForm(
    form({
      scope: 'some',
      rootsText: `${PAGE}\nnot a notion link\nhttps://example.com/x`,
    })
  );
  t.is(r.blocked, 'invalid-roots');
  t.deepEqual(r.invalid, ['not a notion link', 'https://example.com/x']);
  t.is(r.request, undefined);
});

test('text left in the roots box is ignored while "everything" is chosen', t => {
  const r = connectForm(form({ scope: 'all', rootsText: 'garbage' }));
  t.is(r.blocked, undefined);
  t.deepEqual(r.invalid, []);
  t.deepEqual(r.request?.roots, []);
});

test('the comments choice is passed through', t => {
  t.true(
    connectForm(form({ includeBlockComments: true })).request
      ?.includeBlockComments
  );
});

test('outcome rows keep the order of the results screen and default to zero', t => {
  t.deepEqual(outcomeRows(), [
    { key: 'mapped', count: 0 },
    { key: 'degraded', count: 0 },
    { key: 'preserved', count: 0 },
    { key: 'unrecoverable', count: 0 },
  ]);
  t.deepEqual(
    outcomeRows({
      mapped: 120,
      degraded: 7,
      preservedOnly: 3,
      unrecoverable: 1,
    }),
    [
      { key: 'mapped', count: 120 },
      { key: 'degraded', count: 7 },
      { key: 'preserved', count: 3 },
      { key: 'unrecoverable', count: 1 },
    ]
  );
});
