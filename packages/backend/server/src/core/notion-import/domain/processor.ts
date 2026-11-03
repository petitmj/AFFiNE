import { NotionApiError, RetryTaskError } from './errors';
import type { TaskExecutor } from './executor';
import { retryDelayMs } from './lifecycle';
import type { RunRepository } from './ports';
import { type Clock, systemClock } from './rate-limiter';
import type { ImportWarning, TaskRef } from './types';

export type ProcessOutcome =
  /** No tasks left: the Extract stage is complete. */
  | 'finished'
  /** Tasks remain but none is due yet (all backing off). */
  | 'waiting'
  /** The time budget ran out: call again. */
  | 'yielded'
  /** The run was paused, cancelled or otherwise left `running`. */
  | 'stopped';

/** The integration lost access: no further task can succeed. */
export class RunFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunFatalError';
  }
}

export interface ProcessorOptions {
  maxTaskAttempts?: number;
  clock?: Clock;
}

/**
 * Drives the task queue of one run. It owns retry policy and nothing else:
 * what a task does is the executor's concern, where tasks live is the
 * repository's.
 */
export class RunProcessor {
  private readonly clock: Clock;
  private readonly maxAttempts: number;

  constructor(
    private readonly repo: RunRepository,
    private readonly executor: TaskExecutor,
    options: ProcessorOptions = {}
  ) {
    this.clock = options.clock ?? systemClock;
    this.maxAttempts = options.maxTaskAttempts ?? 5;
  }

  async process(runId: string, budgetMs: number): Promise<ProcessOutcome> {
    const deadline = this.clock.now() + budgetMs;
    while (this.clock.now() < deadline) {
      if ((await this.repo.status(runId)) !== 'running') return 'stopped';

      const task = await this.repo.claimNextTask(
        runId,
        new Date(this.clock.now())
      );
      if (!task) {
        return (await this.repo.unfinishedCount(runId)) === 0
          ? 'finished'
          : 'waiting';
      }
      await this.run(runId, task);
    }
    return 'yielded';
  }

  private async run(runId: string, task: TaskRef): Promise<void> {
    try {
      const result = await this.executor.execute(runId, task);
      // New work first: if we crash before completing, the replay is harmless.
      if (result.newTasks.length) await this.repo.enqueue(runId, result.newTasks);
      if (result.warnings.length) {
        await this.repo.appendWarnings(runId, result.warnings);
      }
      if (result.nextCursor !== null) {
        await this.repo.checkpoint(task.id, result.nextCursor);
      } else {
        await this.repo.complete(task.id);
      }
    } catch (error) {
      await this.handleFailure(runId, task, error);
    }
  }

  private async handleFailure(
    runId: string,
    task: TaskRef,
    error: unknown
  ): Promise<void> {
    if (error instanceof NotionApiError && error.isFatalForRun) {
      throw new RunFatalError(error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    const retriable =
      error instanceof RetryTaskError ||
      (error instanceof NotionApiError && error.retriable) ||
      !(error instanceof NotionApiError);
    const attempts = task.attempts + 1;

    if (retriable && attempts < this.maxAttempts) {
      await this.repo.fail(task.id, {
        error: message,
        retryAt: new Date(this.clock.now() + retryDelayMs(attempts)),
      });
      return;
    }

    // Giving up. The loss is recorded, never silent.
    await this.repo.fail(task.id, { error: message, retryAt: null });
    const warning: ImportWarning = {
      code: 'task_failed',
      notionId: task.targetId,
      message: `${task.kind} ${task.targetId} could not be read after ${attempts} attempt(s): ${message}`,
    };
    await this.repo.appendWarnings(runId, [warning]);
    if (task.kind === 'download_file') {
      const ownerId = task.targetId.slice(task.targetId.indexOf(':') + 1);
      await this.repo.markOwnerFilesUnavailable(runId, ownerId, message);
    }
  }
}
