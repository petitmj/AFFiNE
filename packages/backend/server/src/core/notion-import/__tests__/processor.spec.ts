import test from 'ava';

import { NotionApiError, RetryTaskError } from '../domain/errors';
import { TaskExecutor } from '../domain/executor';
import type { RunStatus } from '../domain/lifecycle';
import { RunProcessor, RunFatalError } from '../domain/processor';
import type { RunRepository, TaskFailure } from '../domain/ports';
import type { ImportWarning, NewTask, TaskRef } from '../domain/types';
import { api, FakeClock, MemoryFiles, MemoryStore, page, ScriptedMirror } from './helpers';

class MemoryRepo implements RunRepository {
  runStatus: RunStatus = 'running';
  tasks: Array<TaskRef & { state: 'pending' | 'leased' | 'done' | 'failed'; notBefore: number }> = [];
  warnings: ImportWarning[] = [];
  unavailable: string[] = [];
  private seq = 0;
  constructor(private readonly clock: FakeClock) {}

  async status() { return this.runStatus; }
  async claimNextTask(runId: string, now: Date) {
    const task = this.tasks.find(x => x.state === 'pending' && x.notBefore <= now.getTime());
    if (!task) return null;
    task.state = 'leased';
    return { ...task, runId };
  }
  async checkpoint(id: string, cursor: string) {
    const task = this.get(id); task.cursor = cursor; task.state = 'pending';
  }
  async complete(id: string) { this.get(id).state = 'done'; }
  async fail(id: string, failure: TaskFailure) {
    const task = this.get(id); task.attempts += 1;
    if (failure.retryAt) { task.state = 'pending'; task.notBefore = failure.retryAt.getTime(); }
    else task.state = 'failed';
  }
  async enqueue(runId: string, tasks: NewTask[]) {
    for (const t of tasks) {
      if (this.tasks.some(x => x.kind === t.kind && x.targetId === t.targetId)) continue;
      this.tasks.push({ id: `t${this.seq++}`, runId, kind: t.kind, targetId: t.targetId, cursor: null, attempts: 0, state: 'pending', notBefore: 0 });
    }
  }
  async unfinishedCount() { return this.tasks.filter(x => x.state === 'pending' || x.state === 'leased').length; }
  async appendWarnings(_r: string, w: ImportWarning[]) { this.warnings.push(...w); }
  async markOwnerFilesUnavailable(_r: string, owner: string) { this.unavailable.push(owner); }
  private get(id: string) { const t = this.tasks.find(x => x.id === id); if (!t) throw new Error('no task'); return t; }
}

function build(overrides: Parameters<typeof api>[0]) {
  const clock = new FakeClock();
  const repo = new MemoryRepo(clock);
  const store = new MemoryStore();
  const executor = new TaskExecutor(
    { api: api(overrides), store, files: new MemoryFiles(), mirror: new ScriptedMirror(() => ({ blobKey: 'k', size: 1, mime: 'x' })) },
    { roots: [], includeBlockComments: false }
  );
  return { clock, repo, store, processor: new RunProcessor(repo, executor, { clock, maxTaskAttempts: 3 }) };
}

test('crawls a small workspace to completion through the queue', async t => {
  const tree: Record<string, ReturnType<typeof page>> = {
    root: page([{ object: 'block', id: 'child', type: 'paragraph', has_children: true }]),
    child: page([{ object: 'block', id: 'leaf', type: 'paragraph', has_children: false }]),
  };
  const { repo, store, processor } = build({
    listBlockChildren: async id => tree[id] ?? page([]),
  });
  await repo.enqueue('r', [{ kind: 'block_children', targetId: 'root' }]);
  t.is(await processor.process('r', 1000), 'finished');
  t.truthy(store.items.get('r/block/leaf'));
  t.true(repo.tasks.every(x => x.state === 'done'));
});

test('a transient failure backs off and then succeeds', async t => {
  let calls = 0;
  const { repo, clock, processor } = build({
    listBlockChildren: async () => {
      if (++calls === 1) throw new NotionApiError(503, 'service_unavailable', 'x', true);
      return page([]);
    },
  });
  await repo.enqueue('r', [{ kind: 'block_children', targetId: 'p' }]);
  t.is(await processor.process('r', 100), 'waiting');
  t.is(repo.tasks[0].state, 'pending');
  clock.time += 10_000;
  t.is(await processor.process('r', 100), 'finished');
  t.is(calls, 2);
});

test('a task that keeps failing is given up on and recorded, not dropped', async t => {
  const { repo, clock, processor } = build({
    listBlockChildren: async () => { throw new NotionApiError(500, 'internal_server_error', 'boom', true); },
  });
  await repo.enqueue('r', [{ kind: 'block_children', targetId: 'p' }]);
  for (let i = 0; i < 5; i++) { await processor.process('r', 100); clock.time += 600_000; }
  t.is(repo.tasks[0].state, 'failed');
  t.is(repo.warnings.at(-1)?.code, 'task_failed');
});

test('a permission error is final at once', async t => {
  const { repo, processor } = build({
    listBlockChildren: async () => { throw new NotionApiError(403, 'restricted_resource', 'no', false); },
  });
  await repo.enqueue('r', [{ kind: 'block_children', targetId: 'p' }]);
  t.is(await processor.process('r', 100), 'finished');
  t.is(repo.tasks[0].state, 'failed');
  t.is(repo.tasks[0].attempts, 1);
  t.is(repo.warnings[0].code, 'task_failed');
});

test('a revoked token stops the whole run', async t => {
  const { repo, processor } = build({
    listBlockChildren: async () => { throw new NotionApiError(401, 'unauthorized', 'bad', false); },
  });
  await repo.enqueue('r', [{ kind: 'block_children', targetId: 'p' }]);
  await t.throwsAsync(() => processor.process('r', 100), { instanceOf: RunFatalError });
});

test('a download task that gives up marks its files unavailable', async t => {
  const { repo, processor } = build({
    retrieveBlock: async () => { throw new RetryTaskError('still failing'); },
  });
  await repo.enqueue('r', [{ kind: 'download_file', targetId: 'block:img1' }]);
  repo.tasks[0].attempts = 2; // last allowed attempt
  await processor.process('r', 100);
  t.deepEqual(repo.unavailable, ['img1']);
});

test('pausing the run stops processing at the next task boundary', async t => {
  const { repo, processor } = build({ listBlockChildren: async () => page([]) });
  await repo.enqueue('r', [{ kind: 'block_children', targetId: 'p' }]);
  repo.runStatus = 'paused';
  t.is(await processor.process('r', 100), 'stopped');
  t.is(repo.tasks[0].state, 'pending');
});

test('a paged task resumes from the cursor saved after each page', async t => {
  const cursors: Array<string | null> = [];
  const { repo, processor } = build({
    listBlockChildren: async (_id, cursor) => {
      cursors.push(cursor);
      return cursor === null ? page([{ object: 'block', id: 'a', type: 'paragraph' }], 'c2') : page([]);
    },
  });
  await repo.enqueue('r', [{ kind: 'block_children', targetId: 'p' }]);
  await processor.process('r', 1000);
  // the second request carried the Notion cursor saved after the first page
  t.deepEqual(cursors, [null, 'c2']);
});
