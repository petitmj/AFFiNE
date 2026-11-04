// ============================================================================
// Run Processor for Notion Import
// ============================================================================

import type { RateLimiter } from './rate-limiter';
import type { TaskExecutor } from './executor';
import type { NotionClient } from './notion-client';
import type {
  ImportRepositories,
  StagingStore,
  FileRegistry,
  RunRepository,
  TaskRepository,
} from './ports';
import type {
  Checkpoint,
  RunId,
  RunRecord,
  RunStatus,
  TaskKind,
  TaskRecord,
  TaskOutcome,
  TaskWarning,
} from './types';
import {
  isRetriableError,
  isFatalError,
  LeaseLostError,
  TaskLeaseLostError,
} from './errors';
import {
  assertTransition,
  canCancel,
  isActive,
  isTerminal,
} from './lifecycle';
import { decodeCheckpoint, encodeCheckpoint, EMPTY_CHECKPOINT } from './cursor';

const TASK_SLICE_MS = 15 * 1000; // 15 second slices
const MAX_TASK_ATTEMPTS = 5;
const BACKOFF_BASE_MS = 5 * 1000; // 5 seconds base backoff

/**
 * Configuration for the run processor.
 */
export interface ProcessorConfig {
  maxTaskAttempts: number;
  taskSliceMs: number;
  leaseTtlMs: number;
  runTtlHours: number;
}

/**
 * Orchestrates the processing of a Notion import run.
 *
 * The processor:
 * 1. Claims the run's lease
 * 2. Executes tasks in slices (15 seconds at a time)
 * 3. Handles task retries with exponential backoff
 * 4. Updates progress and checkpoints
 * 5. Handles lease renewal and expiry
 * 6. Transitions the run through its lifecycle states
 */
export class RunProcessor {
  private readonly owner: string;
  private readonly config: ProcessorConfig;
  private active = false;

  constructor(
    private readonly runId: RunId,
    owner: string,
    private readonly repos: ImportRepositories,
    private readonly executor: TaskExecutor,
    private readonly configOverrides: Partial<ProcessorConfig> = {}
  ) {
    this.owner = owner;
    this.config = {
      maxTaskAttempts: MAX_TASK_ATTEMPTS,
      taskSliceMs: TASK_SLICE_MS,
      leaseTtlMs: 15 * 1000, // 15 seconds
      runTtlHours: 1, // 1 hour
      ...configOverrides,
    };
  }

  /**
   * Start processing the run.
   * This will claim the lease and start processing tasks.
   */
  async start(): Promise<void> {
    if (this.active) {
      return; // Already running
    }

    this.active = true;

    try {
      // Claim the run's lease
      const run = await this.repos.runs.claimLease(this.runId, this.owner);

      if (!run) {
        // Could not claim the lease - another worker has it
        this.active = false;
        return;
      }

      // Process until the run is no longer active or we lose the lease
      while (this.active && !isTerminal(run.status)) {
        // Renew the lease periodically
        const leaseRenewed = await this.maybeRenewLease(run);

        if (!leaseRenewed) {
          // Lost the lease - stop processing
          this.active = false;
          return;
        }

        // Process a slice of tasks
        const processed = await this.processSlice(run);

        if (!processed) {
          // No tasks processed - check if we're done
          if (await this.isRunComplete(run)) {
            await this.completeRun(run);
            this.active = false;
            return;
          }
        }

        // Get updated run state
        const updatedRun = await this.repos.runs.get(this.runId);
        if (!updatedRun) {
          // Run was deleted
          this.active = false;
          return;
        }

        run = updatedRun;
      }
    } catch (error) {
      this.logger.error(`Error processing run ${this.runId}: ${error}`);
      await this.handleError(error);
    } finally {
      this.active = false;
    }
  }

  /**
   * Stop processing the run.
   */
  stop(): void {
    this.active = false;
  }

  /**
   * Process a slice of tasks (15 seconds worth).
   */
  private async processSlice(run: RunRecord): Promise<boolean> {
    const sliceStart = Date.now();
    let processedCount = 0;

    // Claim a batch of tasks
    const tasks = await this.repos.tasks.claimTasks(
      this.runId,
      this.owner,
      10 // Claim up to 10 tasks at a time
    );

    if (tasks.length === 0) {
      // No tasks to process
      return false;
    }

    // Process each task
    for (const task of tasks) {
      // Check if we've exceeded the slice time
      if (Date.now() - sliceStart >= this.config.taskSliceMs) {
        break;
      }

      // Execute the task
      const outcome = await this.executeTask(run, task);

      if (outcome) {
        processedCount++;
      }
    }

    return processedCount > 0;
  }

  /**
   * Execute a single task.
   */
  private async executeTask(
    run: RunRecord,
    task: TaskRecord
  ): Promise<boolean> {
    try {
      // Build the task context
      const context: TaskContext = {
        run,
        task,
        client: this.createClient(run),
      };

      // Execute the task
      const outcome = await this.executor.execute(context);

      // Handle the outcome
      await this.handleOutcome(task, outcome);

      return true;
    } catch (error) {
      // Handle task execution error
      await this.handleTaskError(task, error);
      return false;
    }
  }

  /**
   * Create a Notion client for the run.
   */
  private createClient(run: RunRecord): NotionClient {
    // In a real implementation, this would decrypt the token
    // For now, we'll just create a client with the cipher as the token
    // (the actual token would be decrypted by the service layer)
    const token = run.tokenCipher || '';
    const apiVersion = '2025-09-03';

    // Create a rate limiter for this run
    const limiter = new RateLimiter(350);

    // Create the HTTP adapter
    // This would be injected in a real implementation
    throw new Error('Not implemented: createClient needs HttpPort injection');
  }

  /**
   * Handle the outcome of a task execution.
   */
  private async handleOutcome(
    task: TaskRecord,
    outcome: TaskOutcome
  ): Promise<void> {
    // Check if the task is complete
    if (outcome.nextCursor === null) {
      // Task is complete
      const checkpoint = encodeCheckpoint({
        nextCursor: null,
        staged: true,
        windowStart: outcome.windowStart || null,
      });

      await this.repos.tasks.completeTask(
        task.id,
        this.owner,
        checkpoint
      );
    } else {
      // Task needs to continue with a new cursor
      const checkpoint = encodeCheckpoint({
        nextCursor: outcome.nextCursor,
        staged: false,
        windowStart: outcome.windowStart || null,
      });

      await this.repos.tasks.completeTask(
        task.id,
        this.owner,
        checkpoint
      );
    }
  }

  /**
   * Handle a task execution error.
   */
  private async handleTaskError(
    task: TaskRecord,
    error: Error
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (isFatalError(error)) {
      // Fatal error - mark task as permanently failed
      await this.repos.tasks.markFailed(
        task.id,
        this.owner,
        errorMessage
      );
    } else if (isRetriableError(error)) {
      // Retriable error - fail with retry
      const nextAttemptAt = this.calculateNextAttempt(task.attempts);

      await this.repos.tasks.failTask(
        task.id,
        this.owner,
        errorMessage,
        nextAttemptAt
      );
    } else {
      // Unknown error - treat as fatal
      await this.repos.tasks.markFailed(
        task.id,
        this.owner,
        errorMessage
      );
    }
  }

  /**
   * Calculate the next attempt time for a task.
   */
  private calculateNextAttempt(attempts: number): Date {
    const backoffMs = BACKOFF_BASE_MS * 2 ** attempts;
    const maxBackoffMs = 10 * 60 * 1000; // 10 minutes max
    const actualBackoffMs = Math.min(backoffMs, maxBackoffMs);

    return new Date(Date.now() + actualBackoffMs);
  }

  /**
   * Renew the run's lease if it's about to expire.
   */
  private async maybeRenewLease(run: RunRecord): Promise<boolean> {
    if (!run.leaseExpiresAt) {
      return true; // No lease to renew
    }

    const now = new Date();
    const expiresIn = run.leaseExpiresAt.getTime() - now.getTime();

    // Renew if lease expires within the next 5 seconds
    if (expiresIn < 5000) {
      const renewed = await this.repos.runs.renewLease(
        this.runId,
        this.owner
      );

      return renewed !== null;
    }

    return true;
  }

  /**
   * Check if the run is complete (all tasks done or failed).
   */
  private async isRunComplete(run: RunRecord): Promise<boolean> {
    const counts = await this.repos.tasks.countByStatus(this.runId);

    // Run is complete if there are no pending or leased tasks
    return (counts.Pending || 0) + (counts.Leased || 0) === 0;
  }

  /**
   * Mark the run as staged (extraction complete).
   */
  private async completeRun(run: RunRecord): Promise<void> {
    try {
      assertTransition(run.status, 'Staged');
      await this.repos.runs.releaseLease(this.runId, this.owner, 'Staged');
    } catch (error) {
      this.logger.error(`Error completing run ${this.runId}: ${error}`);
      await this.repos.runs.setError(
        this.runId,
        this.owner,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Handle a processor-level error.
   */
  private async handleError(error: Error): Promise<void> {
    if (error instanceof LeaseLostError || error instanceof TaskLeaseLostError) {
      // Lease was lost - this is expected, just stop processing
      return;
    }

    // Try to update the run with the error
    try {
      const run = await this.repos.runs.get(this.runId);
      if (run) {
        await this.repos.runs.setError(
          this.runId,
          this.owner,
          error.message
        );
      }
    } catch {
      // Ignore errors when trying to set the error
    }
  }

  private get logger(): any {
    // In a real implementation, this would use the NestJS Logger
    return console;
  }
}
