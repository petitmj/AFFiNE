// ============================================================================
// Notion Import Background Job
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotionImportModel } from '../../models/notion-import';
import { NotionImportService } from './service';
import { NotionImportRepositories } from './adapters/repositories';
import { TaskExecutor } from './domain/executor';
import { RunProcessor } from './domain/processor';
import type { RunId } from './domain/types';

const LEASE_TTL_MS = 15 * 1000; // 15 seconds
const EXPIRY_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Background job that processes Notion import runs.
 * Uses @Cron to poll for runs that need processing.
 */
@Injectable()
export class NotionImportJob {
  private readonly logger = new Logger(NotionImportJob.name);
  private readonly activeProcessors = new Map<RunId, RunProcessor>();

  constructor(
    private readonly model: NotionImportModel,
    private readonly service: NotionImportService
  ) {}

  /**
   * Cron job that runs every 30 seconds to check for runs to process.
   */
  @Cron(CronExpression.EVERY_30_SECONDS, { waitForCompletion: true })
  async processRuns(): Promise<void> {
    this.logger.debug('Checking for Notion import runs to process');

    try {
      // Get all pending and running runs
      const runs = await this.model.listRuns('workspaceId', [
        'Pending',
        'Running',
        'Paused',
      ]);

      for (const run of runs) {
        // Skip runs that are already being processed
        if (this.activeProcessors.has(run.id)) {
          continue;
        }

        // Try to claim the lease
        const claimed = await this.model.claimRunLease(run.id, this.owner);

        if (claimed) {
          // Start processing this run
          this.startProcessor(run.id);
        }
      }

      // Clean up expired runs
      await this.cleanupExpiredRuns();
    } catch (error) {
      this.logger.error(`Error processing Notion import runs: ${error}`);
    }
  }

  /**
   * Cron job that runs hourly to clean up expired runs.
   */
  @Cron(CronExpression.EVERY_HOUR, { waitForCompletion: true })
  async cleanupExpiredRuns(): Promise<void> {
    this.logger.debug('Cleaning up expired Notion import runs');

    try {
      const count = await this.model.expireRuns();
      this.logger.debug(`Expired ${count} Notion import runs`);
    } catch (error) {
      this.logger.error(`Error cleaning up expired runs: ${error}`);
    }
  }

  /**
   * Start a processor for a run.
   */
  private startProcessor(runId: RunId): void {
    this.logger.debug(`Starting processor for run ${runId}`);

    const repos = new NotionImportRepositories(this.model);
    const executor = new TaskExecutor(repos.staging, repos.files);
    const processor = new RunProcessor(runId, this.owner, repos, executor);

    // Store the processor so we can stop it later
    this.activeProcessors.set(runId, processor);

    // Start processing
    processor.start().then(() => {
      // Processor finished - remove it from the active map
      this.activeProcessors.delete(runId);
      this.logger.debug(`Processor finished for run ${runId}`);
    }).catch(error => {
      // Processor failed - remove it from the active map
      this.activeProcessors.delete(runId);
      this.logger.error(`Processor failed for run ${runId}: ${error}`);
    });
  }

  /**
   * Stop all active processors.
   */
  stopAll(): void {
    this.logger.debug('Stopping all active processors');

    for (const processor of this.activeProcessors.values()) {
      processor.stop();
    }

    this.activeProcessors.clear();
  }

  /**
   * Stop a specific processor.
   */
  stopProcessor(runId: RunId): void {
    const processor = this.activeProcessors.get(runId);

    if (processor) {
      processor.stop();
      this.activeProcessors.delete(runId);
    }
  }

  /**
   * Get the owner identifier for this job instance.
   */
  private get owner(): string {
    // In a real implementation, this would be the worker ID or server ID
    return 'job-worker-1';
  }
}
