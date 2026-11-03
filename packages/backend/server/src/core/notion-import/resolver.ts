import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { NotionImportRun } from '@prisma/client';

import { BadRequest, NotionImportNotFound } from '../../base';
import { Models } from '../../models';
import { CurrentUser } from '../auth/session';
import { PermissionAccess } from '../permission';
import { readProgress } from './adapters/repositories';
import { NotionImportService } from './service';
import {
  CreateNotionImportInput,
  NotionImportFileType,
  NotionImportItemPageType,
  NotionImportLedgerEntryInput,
  NotionImportLedgerSummaryType,
  NotionImportType,
  NotionPreservedRecordPageType,
} from './types';

const ITEM_KINDS = [
  'page',
  'database',
  'data_source',
  'block',
  'property',
  'comment',
  'user',
] as const;
type ItemKind = (typeof ITEM_KINDS)[number];

const OUTCOMES = ['mapped', 'degraded', 'preserved_only', 'unrecoverable'] as const;
type Outcome = (typeof OUTCOMES)[number];

const MAX_PAGE = 500;
const PRESERVED_KINDS = ['database', 'data_source', 'page_properties', 'property_page'];

/**
 * Permissions reuse existing workspace actions because the permission table
 * is owned by the Rust runtime: creating an import needs the right to create
 * documents and to upload blobs. Seeing or steering a run needs either having
 * started it or being able to change workspace settings.
 */
@Resolver(() => NotionImportType)
export class NotionImportResolver {
  constructor(
    private readonly ac: PermissionAccess,
    private readonly service: NotionImportService,
    private readonly models: Models
  ) {}

  @Mutation(() => NotionImportType)
  async createNotionImport(
    @CurrentUser() user: CurrentUser,
    @Args('input') input: CreateNotionImportInput
  ) {
    const workspace = this.ac.user(user.id).workspace(input.workspaceId);
    await workspace.assert('Workspace.CreateDoc');
    await workspace.assert('Workspace.Blobs.Upload');
    if (!input.token.trim()) throw new BadRequest('A Notion token is required');
    const run = await this.service.create({
      workspaceId: input.workspaceId,
      userId: user.id,
      token: input.token.trim(),
      roots: input.roots ?? [],
      includeBlockComments: input.includeBlockComments ?? false,
    });
    return this.present(run);
  }

  @Query(() => NotionImportType)
  async notionImport(
    @CurrentUser() user: CurrentUser,
    @Args('id') id: string
  ) {
    return this.present(await this.authorized(user, id));
  }

  @Query(() => [NotionImportType])
  async notionImports(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string
  ) {
    await this.ac.user(user.id).workspace(workspaceId).assert('Workspace.CreateDoc');
    const runs = await this.models.notionImport.listRuns(workspaceId);
    return runs.map(run => this.present(run));
  }

  @Mutation(() => Boolean)
  async cancelNotionImport(@CurrentUser() user: CurrentUser, @Args('id') id: string) {
    await this.authorized(user, id);
    await this.service.cancel(id);
    return true;
  }

  @Mutation(() => Boolean)
  async pauseNotionImport(@CurrentUser() user: CurrentUser, @Args('id') id: string) {
    await this.authorized(user, id);
    await this.service.pause(id);
    return true;
  }

  @Mutation(() => Boolean)
  async resumeNotionImport(
    @CurrentUser() user: CurrentUser,
    @Args('id') id: string,
    @Args('token', { nullable: true }) token?: string
  ) {
    await this.authorized(user, id);
    await this.service.resume(id, token?.trim() || undefined);
    return true;
  }

  /** Staged Notion objects, oldest first, for the client-side pipeline to read. */
  @Query(() => NotionImportItemPageType)
  async notionImportItems(
    @CurrentUser() user: CurrentUser,
    @Args('id') id: string,
    @Args('kind') kind: string,
    @Args('after', { nullable: true }) after?: string,
    @Args('first', { type: () => Int, nullable: true }) first?: number
  ) {
    await this.authorized(user, id);
    if (!(ITEM_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequest(`Unknown item kind: ${kind}`);
    }
    const take = Math.min(Math.max(first ?? 100, 1), MAX_PAGE);
    // One extra row tells whether there is another page.
    const rows = await this.models.notionImport.listItems(id, kind as ItemKind, {
      afterId: after,
      take: take + 1,
    });
    const page = rows.slice(0, take);
    return {
      items: page.map(row => ({
        kind: row.kind,
        notionId: row.notionId,
        parentId: row.parentId ?? undefined,
        position: row.position,
        payload: row.payload as object,
      })),
      endCursor: rows.length > take ? page.at(-1)?.notionId : undefined,
    };
  }

  @Query(() => [NotionImportFileType])
  async notionImportFiles(
    @CurrentUser() user: CurrentUser,
    @Args('id') id: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('first', { type: () => Int, nullable: true }) first?: number
  ) {
    await this.authorized(user, id);
    const rows = await this.models.notionImport.listFiles(
      id,
      Math.min(Math.max(first ?? 200, 1), 1000),
      Math.max(skip ?? 0, 0)
    );
    return rows.map(row => ({
      ownerId: row.ownerId,
      slot: row.slot,
      status: row.status,
      blobKey: row.blobKey ?? undefined,
      size: row.size ?? undefined,
      mime: row.mime ?? undefined,
      lastError: row.lastError ?? undefined,
    }));
  }

  /** Lets the client pipeline record, per Notion object, what became of it. */
  @Mutation(() => NotionImportLedgerSummaryType)
  async reportNotionImportLedger(
    @CurrentUser() user: CurrentUser,
    @Args('id') id: string,
    @Args({ name: 'entries', type: () => [NotionImportLedgerEntryInput] })
    entries: NotionImportLedgerEntryInput[]
  ) {
    const run = await this.authorized(user, id);
    if (run.status === 'expired') throw new NotionImportNotFound();
    if (entries.length > MAX_PAGE) {
      throw new BadRequest(`At most ${MAX_PAGE} entries per call`);
    }
    for (const entry of entries) {
      if (!(OUTCOMES as readonly string[]).includes(entry.outcome)) {
        throw new BadRequest(`Unknown outcome: ${entry.outcome}`);
      }
    }
    await this.models.notionImport.upsertLedger(
      id,
      entries.map(entry => ({ ...entry, outcome: entry.outcome as Outcome }))
    );
    const summary = await this.models.notionImport.ledgerSummary(id);
    return {
      mapped: summary.mapped ?? 0,
      degraded: summary.degraded ?? 0,
      preservedOnly: summary.preserved_only ?? 0,
      unrecoverable: summary.unrecoverable ?? 0,
    };
  }

  /**
   * Notion data AFFiNE cannot represent natively yet, kept per workspace and
   * outliving the import run. `kind` is database, data_source, page_properties
   * or property_page.
   */
  @Query(() => NotionPreservedRecordPageType)
  async notionPreservedRecords(
    @CurrentUser() user: CurrentUser,
    @Args('workspaceId') workspaceId: string,
    @Args('kind') kind: string,
    @Args('after', { nullable: true }) after?: string,
    @Args('first', { type: () => Int, nullable: true }) first?: number
  ) {
    await this.ac.user(user.id).workspace(workspaceId).assert('Workspace.Read');
    if (!PRESERVED_KINDS.includes(kind)) {
      throw new BadRequest(`Unknown record kind: ${kind}`);
    }
    const take = Math.min(Math.max(first ?? 100, 1), MAX_PAGE);
    const rows = await this.models.notionImport.listPreserved(workspaceId, kind, {
      afterId: after,
      take: take + 1,
    });
    const page = rows.slice(0, take);
    return {
      records: page.map(row => ({
        kind: row.kind,
        notionId: row.notionId,
        payload: row.payload as object,
      })),
      endCursor: rows.length > take ? page.at(-1)?.notionId : undefined,
    };
  }

  private async authorized(user: CurrentUser, id: string) {
    const run = await this.models.notionImport.getRun(id);
    if (!run) throw new NotionImportNotFound();
    const workspace = this.ac.user(user.id).workspace(run.workspaceId);
    if (run.createdBy === user.id) {
      await workspace.assert('Workspace.CreateDoc');
    } else {
      await workspace.assert('Workspace.Settings.Update');
    }
    return run;
  }

  private present(run: NotionImportRun) {
    const progress = readProgress(run.progress);
    const tasks = (run.progress as { tasks?: Record<string, number> } | null)?.tasks ?? {};
    return {
      id: run.id,
      workspaceId: run.workspaceId,
      status: run.status,
      notionWorkspaceName: run.notionWorkspaceName ?? undefined,
      apiVersion: run.apiVersion,
      lastError: run.lastError ?? undefined,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      finishedAt: run.finishedAt ?? undefined,
      expiresAt: run.expiresAt,
      progress: {
        pendingTasks: (tasks.pending ?? 0) + (tasks.leased ?? 0),
        doneTasks: tasks.done ?? 0,
        failedTasks: tasks.failed ?? 0,
        warningCount: progress.warningCount,
        warnings: progress.warnings,
      },
    };
  }
}
