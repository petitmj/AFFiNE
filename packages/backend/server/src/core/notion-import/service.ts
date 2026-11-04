// ============================================================================
// Notion Import Service
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { CryptoHelper } from '../../base/helpers/crypto';
import { NotionImportModel } from '../../models/notion-import';
import { NotionImportRepositories } from './adapters/repositories';
import { NotionHttpAdapter } from './adapters/notion-http';
import { RunProcessor } from './domain/processor';
import { TaskExecutor } from './domain/executor';
import { NotionClient } from './domain/notion-client';
import { RateLimiter } from './domain/rate-limiter';
import { EMPTY_CHECKPOINT } from './domain/cursor';
import type {
  NotionImportInput,
  NotionImportRunOutput,
  NotionImportMode,
} from './types';
import type { RunId } from './domain/types';

@Injectable()
export class NotionImportService {
  private readonly logger = new Logger(NotionImportService.name);

  constructor(
    private readonly model: NotionImportModel,
    private readonly http: NotionHttpAdapter
  ) {}

  // ============================================================================
  // Run Management
  // ============================================================================

  /**
   * Create a new import run.
   * The token is encrypted before being stored.
   */
  async createRun(input: NotionImportInput): Promise<NotionImportRunOutput> {
    // Encrypt the token
    const tokenCipher = CryptoHelper.encrypt(input.token);

    // Create the run
    const row = await this.model.createRun({
      workspaceId: input.workspaceId,
      createdBy: null, // Will be set by the resolver
      tokenCipher,
      scope: {}, // Will be populated after token probe
      includeBlockComments: input.includeBlockComments,
    });

    // Create a client to probe the token and get the scope
    try {
      const client = this.createClient(row.id, input.token, input.mode);
      const me = await client.me();

      // Update the run with the scope
      await this.model.updateRunProgress(row.id, this.owner, {
        ...row.progress,
        user: me,
      });
    } catch (error) {
      this.logger.error(`Failed to probe Notion token: ${error}`);
      // Token is invalid - delete the run
      // In a real implementation, we'd mark it as failed
    }

    return this.mapRunOutput(row);
  }

  /**
   * Get a run by ID.
   */
  async getRun(workspaceId: string, runId: RunId): Promise<NotionImportRunOutput | null> {
    const row = await this.model.getRun(workspaceId, runId);
    return row ? this.mapRunOutput(row) : null;
  }

  /**
   * List runs for a workspace.
   */
  async listRuns(
    workspaceId: string,
    statuses?: string[]
  ): Promise<NotionImportRunOutput[]> {
    const rows = await this.model.listRuns(workspaceId, statuses as any);
    return rows.map(this.mapRunOutput);
  }

  /**
   * Pause a running import.
   */
  async pauseRun(runId: RunId, owner: string): Promise<NotionImportRunOutput | null> {
    const row = await this.model.releaseRunLease(runId, owner, 'Paused');
    return row ? this.mapRunOutput(row) : null;
  }

  /**
   * Resume a paused import.
   */
  async resumeRun(runId: RunId, owner: string): Promise<NotionImportRunOutput | null> {
    const row = await this.model.claimRunLease(runId, owner);
    return row ? this.mapRunOutput(row) : null;
  }

  /**
   * Cancel an import run.
   */
  async cancelRun(runId: RunId, owner: string): Promise<NotionImportRunOutput | null> {
    const row = await this.model.releaseRunLease(runId, owner, 'Cancelled');
    return row ? this.mapRunOutput(row) : null;
  }

  /**
   * Retry a failed import run.
   */
  async retryRun(runId: RunId, owner: string): Promise<NotionImportRunOutput | null> {
    // Reset the run status to Pending
    const row = await this.model.releaseRunLease(runId, owner, 'Pending');

    if (!row) {
      return null;
    }

    // Claim the run to start processing
    const claimed = await this.model.claimRunLease(runId, owner);
    return claimed ? this.mapRunOutput(claimed) : null;
  }

  // ============================================================================
  // Run Processing
  // ============================================================================

  /**
   * Start processing a run.
   * This creates a processor and starts it in the background.
   */
  async startProcessing(runId: RunId, owner: string): Promise<void> {
    // Get the run
    const run = await this.model.getRun('workspaceId', runId);

    if (!run) {
      throw new Error(`Run ${runId} not found`);
    }

    // Create repositories
    const repos = new NotionImportRepositories(this.model);

    // Create executor
    const executor = new TaskExecutor(repos.staging, repos.files);

    // Create processor
    const processor = new RunProcessor(runId, owner, repos, executor);

    // Start processing in the background
    processor.start().catch(error => {
      this.logger.error(`Error processing run ${runId}: ${error}`);
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Create a Notion client for a run.
   */
  private createClient(
    runId: RunId,
    token: string,
    mode: NotionImportMode
  ): NotionClient {
    const limiter = new RateLimiter(350);
    const apiVersion = '2025-09-03';
    return new NotionClient(this.http, limiter, token, apiVersion);
  }

  /**
   * Map a database row to a run output.
   */
  private mapRunOutput(row: any): NotionImportRunOutput {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      createdBy: row.createdBy,
      status: row.status,
      mode: row.mode || 'merge',
      scope: row.scope || {},
      progress: row.progress || {},
      includeBlockComments: row.includeBlockComments || false,
      lastError: row.lastError,
      leaseOwner: row.leaseOwner,
      leaseExpiresAt: row.leaseExpiresAt,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      canRetry: this.canRetry(row),
      canCancel: this.canCancel(row),
    };
  }

  /**
   * Check if a run can be retried.
   */
  private canRetry(row: any): boolean {
    return row.status === 'Failed' || row.status === 'Cancelled';
  }

  /**
   * Check if a run can be cancelled.
   */
  private canCancel(row: any): boolean {
    return row.status === 'Pending' || row.status === 'Running' || row.status === 'Paused';
  }

  /**
   * Get the owner identifier for this service instance.
   */
  private get owner(): string {
    // In a real implementation, this would be the worker ID or server ID
    return 'server-1';
  }
}
