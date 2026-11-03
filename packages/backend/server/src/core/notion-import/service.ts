import { Injectable } from '@nestjs/common';
import type { NotionImportItemKind, Prisma } from '@prisma/client';

import { Config, CryptoHelper } from '../../base';
import {
  NotionImportInProgress,
  NotionImportNotFound,
  NotionImportTokenInvalid,
} from '../../base';
import { Models } from '../../models';
import { BackendRuntimeProvider } from '../backend-runtime';
import { WorkspaceBlobStorage } from '../storage';
import { BlobFileMirror } from './adapters/blob-file-mirror';
import { NotionHttpAdapter } from './adapters/notion-http';
import {
  ModelFileRegistry,
  ModelRunRepository,
  ModelStagingStore,
} from './adapters/repositories';
import { NotionApiError } from './domain/errors';
import { initialTasks, TaskExecutor } from './domain/executor';
import { assertTransition } from './domain/lifecycle';
import { NotionClient } from './domain/notion-client';
import { payloadHash } from './domain/canonical';
import { type PreservedRecord, preservedPageProperties } from './domain/preserve';
import { RunProcessor } from './domain/processor';
import type { JsonObject, RunOptions } from './domain/types';

export interface CreateImportInput {
  workspaceId: string;
  userId: string;
  token: string;
  roots: string[];
  includeBlockComments: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESERVE_BATCH = 200;

@Injectable()
export class NotionImportService {
  constructor(
    private readonly config: Config,
    private readonly models: Models,
    private readonly crypto: CryptoHelper,
    private readonly http: NotionHttpAdapter,
    private readonly runtime: BackendRuntimeProvider,
    private readonly storage: WorkspaceBlobStorage
  ) {}

  get enabled() {
    return this.config.notionImport.enabled;
  }

  /** Checks the token with Notion, then stores it encrypted with the new run. */
  async create(input: CreateImportInput) {
    if (await this.models.notionImport.hasActiveRun(input.workspaceId)) {
      throw new NotionImportInProgress();
    }
    const apiVersion = this.config.notionImport.apiVersion;
    const probe = new NotionClient(this.http, {
      token: input.token,
      apiVersion,
      maxAttempts: 2,
    });
    let notionWorkspaceName: string | null = null;
    try {
      const bot = await probe.retrieveBotUser();
      const info = bot.bot;
      if (typeof info === 'object' && info !== null && !Array.isArray(info)) {
        const name = (info as Record<string, unknown>).workspace_name;
        if (typeof name === 'string') notionWorkspaceName = name;
      }
    } catch (error) {
      if (error instanceof NotionApiError && error.status < 500) {
        throw new NotionImportTokenInvalid();
      }
      throw error;
    }

    const run = await this.models.notionImport.createRun({
      workspaceId: input.workspaceId,
      createdBy: input.userId,
      apiVersion,
      scope: {
        roots: input.roots,
        includeBlockComments: input.includeBlockComments,
      },
      tokenCipher: this.crypto.encrypt(input.token),
      notionWorkspaceName,
      expiresAt: new Date(
        Date.now() + this.config.notionImport.retentionDays * DAY_MS
      ),
    });
    await this.models.notionImport.enqueue(
      run.id,
      initialTasks(this.optionsOf(run.scope))
    );
    return run;
  }

  async get(id: string) {
    const run = await this.models.notionImport.getRun(id);
    if (!run) throw new NotionImportNotFound();
    return run;
  }

  async cancel(id: string) {
    const run = await this.get(id);
    assertTransition(run.status, 'cancelled');
    await this.models.notionImport.setStatus(id, 'cancelled', {
      clearToken: true,
    });
  }

  async pause(id: string) {
    const run = await this.get(id);
    assertTransition(run.status, 'paused');
    await this.models.notionImport.setStatus(id, 'paused');
  }

  /**
   * Resumes a paused run, or a failed one. A failed run no longer holds a
   * token, so resuming it needs a new one.
   */
  async resume(id: string, token?: string) {
    const run = await this.get(id);
    assertTransition(run.status, 'running');
    if (!run.tokenCipher) {
      if (!token) throw new NotionImportTokenInvalid();
      await this.models.notionImport.replaceToken(id, this.crypto.encrypt(token));
    }
    await this.models.notionImport.setStatus(id, 'pending', { lastError: null });
  }

  /**
   * Copies what AFFiNE cannot represent natively yet out of the run's staging
   * area into the workspace's durable preserved-record store, before the
   * staging area is deleted at expiry. Safe to repeat.
   */
  async preserveRun(run: { id: string; workspaceId: string }) {
    const model = this.models.notionImport;
    const select: Array<{
      from: NotionImportItemKind;
      pick: (item: { notionId: string; payload: unknown }) => PreservedRecord | null;
    }> = [
      {
        from: 'database',
        pick: item => ({
          kind: 'database',
          notionId: item.notionId,
          payload: item.payload as JsonObject,
        }),
      },
      {
        from: 'data_source',
        pick: item => ({
          kind: 'data_source',
          notionId: item.notionId,
          payload: item.payload as JsonObject,
        }),
      },
      {
        from: 'page',
        pick: item => preservedPageProperties(item.payload as JsonObject),
      },
      {
        from: 'property',
        pick: item => ({
          kind: 'property_page',
          notionId: item.notionId,
          payload: item.payload as JsonObject,
        }),
      },
    ];

    let total = 0;
    for (const { from, pick } of select) {
      let after: string | undefined;
      for (;;) {
        const rows = await model.listItems(run.id, from, {
          afterId: after,
          take: PRESERVE_BATCH,
        });
        if (rows.length === 0) break;
        const records = rows
          .map(row => pick(row))
          .filter((record): record is PreservedRecord => record !== null)
          .map(record => ({
            kind: record.kind,
            notionId: record.notionId,
            payload: record.payload as Prisma.InputJsonValue,
            payloadHash: payloadHash(record.payload),
          }));
        await model.upsertPreserved(run.workspaceId, run.id, records);
        total += records.length;
        after = rows.at(-1)?.notionId;
        if (rows.length < PRESERVE_BATCH) break;
      }
    }
    return total;
  }

  /** Builds everything needed to drive one run. */
  buildProcessor(run: {
    id: string;
    workspaceId: string;
    createdBy: string | null;
    apiVersion: string;
    scope: unknown;
    tokenCipher: string | null;
  }) {
    if (!run.tokenCipher || !run.createdBy) return null;
    const model = this.models.notionImport;
    const client = new NotionClient(this.http, {
      token: this.crypto.decrypt(run.tokenCipher),
      apiVersion: run.apiVersion,
    });
    const executor = new TaskExecutor(
      {
        api: client,
        store: new ModelStagingStore(model),
        files: new ModelFileRegistry(model),
        mirror: new BlobFileMirror(this.runtime, this.storage, {
          workspaceId: run.workspaceId,
          userId: run.createdBy,
          maxBytes: this.config.notionImport.maxFileBytes,
        }),
      },
      this.optionsOf(run.scope)
    );
    return new RunProcessor(new ModelRunRepository(model), executor, {
      maxTaskAttempts: this.config.notionImport.maxTaskAttempts,
    });
  }

  optionsOf(scope: unknown): RunOptions {
    const raw =
      typeof scope === 'object' && scope !== null
        ? (scope as Partial<RunOptions>)
        : {};
    return {
      roots: Array.isArray(raw.roots)
        ? raw.roots.filter((r): r is string => typeof r === 'string')
        : [],
      includeBlockComments: raw.includeBlockComments === true,
    };
  }
}
