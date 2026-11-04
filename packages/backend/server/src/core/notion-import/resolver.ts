// ============================================================================
// Notion Import GraphQL Resolver
// ============================================================================

import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PermissionAccess } from '../../base/permission/decorator';
import { NotionImportService } from './service';
import type {
  NotionImportInput,
  NotionImportRunOutput,
} from './types';
import { UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../base/identity/decorator';
import type { User } from '@prisma/client';

@Resolver('NotionImport')
export class NotionImportResolver {
  constructor(private readonly service: NotionImportService) {}

  // ============================================================================
  // Mutations
  // ============================================================================

  @Mutation()
  @PermissionAccess('Workspace.NotionImport.Create')
  async notionImport(
    @Args('input') input: NotionImportInput,
    @CurrentUser() user: User
  ): Promise<NotionImportRunOutput> {
    // Set the createdBy field to the current user's ID
    const runInput = {
      ...input,
      createdBy: user.id,
    };

    const run = await this.service.createRun(runInput);

    // Start processing the run in the background
    this.service.startProcessing(run.id, user.id);

    return run;
  }

  @Mutation()
  @PermissionAccess('Workspace.NotionImport.Pause')
  async pauseNotionImport(
    @Args('input') input: { runId: string },
    @CurrentUser() user: User
  ): Promise<NotionImportRunOutput | null> {
    return this.service.pauseRun(input.runId, user.id);
  }

  @Mutation()
  @PermissionAccess('Workspace.NotionImport.Resume')
  async resumeNotionImport(
    @Args('input') input: { runId: string },
    @CurrentUser() user: User
  ): Promise<NotionImportRunOutput | null> {
    const run = await this.service.resumeRun(input.runId, user.id);

    if (run) {
      // Start processing again
      this.service.startProcessing(input.runId, user.id);
    }

    return run;
  }

  @Mutation()
  @PermissionAccess('Workspace.NotionImport.Cancel')
  async cancelNotionImport(
    @Args('input') input: { runId: string },
    @CurrentUser() user: User
  ): Promise<NotionImportRunOutput | null> {
    return this.service.cancelRun(input.runId, user.id);
  }

  @Mutation()
  @PermissionAccess('Workspace.NotionImport.Retry')
  async retryNotionImport(
    @Args('input') input: { runId: string },
    @CurrentUser() user: User
  ): Promise<NotionImportRunOutput | null> {
    const run = await this.service.retryRun(input.runId, user.id);

    if (run) {
      // Start processing again
      this.service.startProcessing(input.runId, user.id);
    }

    return run;
  }

  // ============================================================================
  // Queries
  // ============================================================================

  @Query()
  @PermissionAccess('Workspace.NotionImport.Read')
  async notionImportRun(
    @Args('runId') runId: string,
    @CurrentUser() user: User
  ): Promise<NotionImportRunOutput | null> {
    // In a real implementation, we'd get the workspaceId from the context
    // For now, we'll use a placeholder
    return this.service.getRun('workspaceId', runId);
  }

  @Query()
  @PermissionAccess('Workspace.NotionImport.Read')
  async notionImportRuns(
    @Args('pagination') pagination: { first?: number; after?: string },
    @CurrentUser() user: User
  ): Promise<{ edges: NotionImportRunOutput[]; pageInfo: any; totalCount: number }> {
    // In a real implementation, we'd paginate the results
    const runs = await this.service.listRuns(user.id);

    return {
      edges: runs,
      pageInfo: {
        hasNextPage: false,
        endCursor: null,
      },
      totalCount: runs.length,
    };
  }
}
