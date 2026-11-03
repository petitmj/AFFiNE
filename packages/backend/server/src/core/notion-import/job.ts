import { randomUUID } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Prisma } from '@prisma/client';

import { Models } from '../../models';
import { readProgress } from './adapters/repositories';
import { initialTasks } from './domain/executor';
import { RunFatalError } from './domain/processor';
import { NotionImportService } from './service';

const LEASE_MS = 2 * 60_000;
const SLICE_MS = 15_000;
const MAX_CRASHES = 5;

/**
 * Background worker for Notion imports. Polls the database, like the other
 * jobs in this server: there is no queue service to depend on. A run is held
 * by a lease, so only one instance works on it, and an instance that dies
 * loses the lease after two minutes and another continues from the saved
 * checkpoints.
 */
@Injectable()
export class NotionImportJob {
  private readonly logger = new Logger(NotionImportJob.name);
  private readonly owner = randomUUID();
  private busy = false;

  constructor(
    private readonly models: Models,
    private readonly service: NotionImportService
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async tick() {
    if (this.busy || !this.service.enabled) return;
    this.busy = true;
    try {
      const run = await this.models.notionImport.claimRun(this.owner, LEASE_MS);
      if (run) await this.work(run);
    } catch (error) {
      this.logger.error('Notion import tick failed', error);
    } finally {
      this.busy = false;
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expire() {
    const expired = await this.models.notionImport.expireRuns();
    if (expired.length) {
      this.logger.log(`Expired ${expired.length} Notion import run(s)`);
    }
  }

  private async work(
    run: NonNullable<Awaited<ReturnType<Models['notionImport']['claimRun']>>>
  ) {
    const model = this.models.notionImport;
    const processor = this.service.buildProcessor(run);
    if (!processor) {
      await model.setStatus(run.id, 'failed', {
        clearToken: true,
        lastError: 'The run has no Notion token. Resume it with a new one.',
      });
      return;
    }

    try {
      // Seeding is idempotent, so a resumed run can always repeat it.
      await model.enqueue(run.id, initialTasks(this.service.optionsOf(run.scope)));
      for (;;) {
        const outcome = await processor.process(run.id, SLICE_MS);
        await this.recordProgress(run.id);
        if (outcome === 'yielded') {
          if (!(await model.renewLease(run.id, this.owner, LEASE_MS))) return;
          continue;
        }
        if (outcome === 'finished') {
          // A cancel that arrived during the last task must not be overwritten.
          const current = await model.getRun(run.id);
          if (current?.status === 'running') {
            // Preserve first: a crash here repeats it, a crash after loses nothing.
            await this.service.preserveRun(run);
            await model.setStatus(run.id, 'staged', { clearToken: true });
          }
        }
        // 'waiting' and 'stopped': give the lease back, the next tick decides.
        break;
      }
    } catch (error) {
      if (error instanceof RunFatalError) {
        await model.setStatus(run.id, 'failed', {
          clearToken: true,
          lastError: error.message,
        });
        return;
      }
      await this.recordCrash(run.id, error);
    } finally {
      await model.releaseLease(run.id, this.owner);
    }
  }

  private async recordProgress(runId: string) {
    const model = this.models.notionImport;
    const run = await model.getRun(runId);
    if (!run) return;
    const counts = await model.taskCounts(runId);
    const progress = {
      ...readProgress(run.progress),
      tasks: counts,
    };
    await model.updateProgress(runId, progress as unknown as Prisma.InputJsonValue);
  }

  /** An unexpected error is retried a few times, then the run is failed. */
  private async recordCrash(runId: string, error: unknown) {
    const model = this.models.notionImport;
    this.logger.error(`Notion import ${runId} crashed`, error);
    const run = await model.getRun(runId);
    if (!run) return;
    const progress = readProgress(run.progress);
    const crashCount = progress.crashCount + 1;
    if (crashCount >= MAX_CRASHES) {
      await model.setStatus(runId, 'failed', {
        clearToken: true,
        lastError: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    await model.updateProgress(runId, {
      ...progress,
      crashCount,
    } as unknown as Prisma.InputJsonValue);
  }
}
