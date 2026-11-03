import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import {
  type NotionImportItemKind,
  type NotionImportOutcome,
  type NotionImportRun,
  type NotionImportRunStatus,
  Prisma,
} from '@prisma/client';

import { BaseModel } from './base';

export interface CreateNotionImportRun {
  workspaceId: string;
  createdBy: string;
  apiVersion: string;
  scope: { roots: string[]; includeBlockComments: boolean };
  tokenCipher: string;
  notionWorkspaceName: string | null;
  expiresAt: Date;
}

export interface NotionImportTaskInput {
  kind: Prisma.NotionImportTaskCreateManyInput['kind'];
  targetId: string;
}

export interface NotionImportLedgerInput {
  notionId: string;
  subject: string;
  outcome: NotionImportOutcome;
  codes: string[];
  affineDocId?: string | null;
  contentHash?: string | null;
}

const ACTIVE: NotionImportRunStatus[] = ['pending', 'running', 'paused'];
const CLAIMABLE: NotionImportRunStatus[] = ['pending', 'running'];

/**
 * Persistence for Notion import runs: the run, its durable task queue, the
 * staged raw Notion objects, mirrored files and the client-reported ledger.
 * Pure data access; lifecycle rules live in the domain layer.
 */
@Injectable()
export class NotionImportModel extends BaseModel {
  // ---- runs --------------------------------------------------------------

  async createRun(input: CreateNotionImportRun) {
    return await this.db.notionImportRun.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        createdBy: input.createdBy,
        apiVersion: input.apiVersion,
        scope: input.scope,
        tokenCipher: input.tokenCipher,
        notionWorkspaceName: input.notionWorkspaceName,
        expiresAt: input.expiresAt,
      },
    });
  }

  async getRun(id: string) {
    return await this.db.notionImportRun.findUnique({ where: { id } });
  }

  async listRuns(workspaceId: string, take = 20) {
    return await this.db.notionImportRun.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async hasActiveRun(workspaceId: string) {
    const count = await this.db.notionImportRun.count({
      where: { workspaceId, status: { in: ACTIVE } },
    });
    return count > 0;
  }

  /**
   * Takes the lease of one run that nobody is working on. The conditional
   * update makes two server instances racing for the same run safe: exactly
   * one `updateMany` matches.
   */
  async claimRun(owner: string, leaseMs: number, now = new Date()) {
    const candidate = await this.db.notionImportRun.findFirst({
      where: {
        status: { in: CLAIMABLE },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!candidate) return null;
    const claimed = await this.db.notionImportRun.updateMany({
      where: {
        id: candidate.id,
        status: { in: CLAIMABLE },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      },
      data: {
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        status: 'running',
      },
    });
    if (claimed.count !== 1) return null;
    // A crashed owner may have left tasks leased: put them back in the queue.
    await this.db.notionImportTask.updateMany({
      where: { runId: candidate.id, status: 'leased' },
      data: { status: 'pending' },
    });
    return await this.getRun(candidate.id);
  }

  async renewLease(id: string, owner: string, leaseMs: number) {
    const result = await this.db.notionImportRun.updateMany({
      where: { id, leaseOwner: owner },
      data: { leaseExpiresAt: new Date(Date.now() + leaseMs) },
    });
    return result.count === 1;
  }

  async releaseLease(id: string, owner: string) {
    await this.db.notionImportRun.updateMany({
      where: { id, leaseOwner: owner },
      data: { leaseOwner: null, leaseExpiresAt: null },
    });
  }

  /**
   * Moves a run to a new status. `clearToken` must be true for every state in
   * which the Notion token may no longer be kept.
   */
  async setStatus(
    id: string,
    status: NotionImportRunStatus,
    options: { clearToken?: boolean; lastError?: string | null } = {}
  ) {
    const terminal = ['staged', 'failed', 'cancelled', 'expired'].includes(status);
    await this.db.notionImportRun.update({
      where: { id },
      data: {
        status,
        ...(options.clearToken ? { tokenCipher: null } : {}),
        ...(options.lastError !== undefined
          ? { lastError: options.lastError }
          : {}),
        ...(terminal ? { finishedAt: new Date() } : {}),
        ...(terminal ? { leaseOwner: null, leaseExpiresAt: null } : {}),
      },
    });
  }

  async replaceToken(id: string, tokenCipher: string) {
    await this.db.notionImportRun.update({
      where: { id },
      data: { tokenCipher },
    });
  }

  async updateProgress(id: string, progress: Prisma.InputJsonValue) {
    await this.db.notionImportRun.update({ where: { id }, data: { progress } });
  }

  // ---- task queue --------------------------------------------------------

  async enqueue(runId: string, tasks: NotionImportTaskInput[]) {
    if (!tasks.length) return;
    await this.db.notionImportTask.createMany({
      data: tasks.map(task => ({
        id: randomUUID(),
        runId,
        kind: task.kind,
        targetId: task.targetId,
      })),
      skipDuplicates: true,
    });
  }

  /** Leases the oldest due task; conditional update guards against a race. */
  async claimNextTask(runId: string, now: Date) {
    const candidate = await this.db.notionImportTask.findFirst({
      where: { runId, status: 'pending', notBefore: { lte: now } },
      orderBy: { createdAt: 'asc' },
    });
    if (!candidate) return null;
    const claimed = await this.db.notionImportTask.updateMany({
      where: { id: candidate.id, status: 'pending' },
      data: { status: 'leased' },
    });
    return claimed.count === 1 ? candidate : null;
  }

  async checkpointTask(id: string, cursor: string) {
    await this.db.notionImportTask.update({
      where: { id },
      data: { cursor, status: 'pending' },
    });
  }

  async completeTask(id: string) {
    await this.db.notionImportTask.update({
      where: { id },
      data: { status: 'done', lastError: null },
    });
  }

  async failTask(id: string, error: string, retryAt: Date | null) {
    await this.db.notionImportTask.update({
      where: { id },
      data: {
        attempts: { increment: 1 },
        lastError: error.slice(0, 2000),
        ...(retryAt
          ? { status: 'pending', notBefore: retryAt }
          : { status: 'failed' }),
      },
    });
  }

  async countUnfinishedTasks(runId: string) {
    return await this.db.notionImportTask.count({
      where: { runId, status: { in: ['pending', 'leased'] } },
    });
  }

  async taskCounts(runId: string) {
    const rows = await this.db.notionImportTask.groupBy({
      by: ['status'],
      where: { runId },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map(r => [r.status, r._count._all]));
  }

  // ---- staged data -------------------------------------------------------

  async putItems(
    runId: string,
    items: Array<{
      kind: NotionImportItemKind;
      notionId: string;
      parentId: string | null;
      position: number;
      payload: Prisma.InputJsonValue;
      payloadHash: string;
    }>
  ) {
    if (!items.length) return;
    await this.db.notionImportItem.createMany({
      data: items.map(item => ({ runId, ...item })),
      skipDuplicates: true,
    });
  }

  async listItems(
    runId: string,
    kind: NotionImportItemKind,
    options: { afterPosition?: number; afterId?: string; take: number }
  ) {
    return await this.db.notionImportItem.findMany({
      where: { runId, kind },
      orderBy: [{ position: 'asc' }, { notionId: 'asc' }],
      take: options.take,
      ...(options.afterId
        ? {
            cursor: {
              runId_kind_notionId: { runId, kind, notionId: options.afterId },
            },
            skip: 1,
          }
        : {}),
    });
  }

  async listChildren(runId: string, parentId: string, take: number, skip = 0) {
    return await this.db.notionImportItem.findMany({
      where: { runId, parentId },
      orderBy: [{ position: 'asc' }, { notionId: 'asc' }],
      take,
      skip,
    });
  }

  // ---- files -------------------------------------------------------------

  async getFile(runId: string, ownerId: string, slot: string) {
    return await this.db.notionImportFile.findUnique({
      where: { runId_ownerId_slot: { runId, ownerId, slot } },
    });
  }

  async upsertFile(
    runId: string,
    file: {
      ownerId: string;
      slot: string;
      status: 'pending' | 'stored' | 'unavailable';
      blobKey: string | null;
      size: number | null;
      mime: string | null;
      lastError: string | null;
    }
  ) {
    const { ownerId, slot, ...data } = file;
    await this.db.notionImportFile.upsert({
      where: { runId_ownerId_slot: { runId, ownerId, slot } },
      create: { runId, ownerId, slot, ...data },
      update: data,
    });
  }

  async markOwnerFilesUnavailable(
    runId: string,
    ownerId: string,
    message: string
  ) {
    await this.db.notionImportFile.updateMany({
      where: { runId, ownerId, status: 'pending' },
      data: { status: 'unavailable', lastError: message.slice(0, 2000) },
    });
  }

  async listFiles(runId: string, take: number, skip = 0) {
    return await this.db.notionImportFile.findMany({
      where: { runId },
      orderBy: [{ ownerId: 'asc' }, { slot: 'asc' }],
      take,
      skip,
    });
  }

  // ---- ledger ------------------------------------------------------------

  async upsertLedger(runId: string, entries: NotionImportLedgerInput[]) {
    for (const entry of entries) {
      const data = {
        outcome: entry.outcome,
        codes: entry.codes,
        affineDocId: entry.affineDocId ?? null,
        contentHash: entry.contentHash ?? null,
        reportedAt: new Date(),
      };
      await this.db.notionImportLedger.upsert({
        where: {
          runId_notionId_subject: {
            runId,
            notionId: entry.notionId,
            subject: entry.subject,
          },
        },
        create: { runId, notionId: entry.notionId, subject: entry.subject, ...data },
        update: data,
      });
    }
  }

  async ledgerSummary(runId: string) {
    const rows = await this.db.notionImportLedger.groupBy({
      by: ['outcome'],
      where: { runId },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map(r => [r.outcome, r._count._all]));
  }

  // ---- preserved records -------------------------------------------------

  /** Latest write wins: a re-import refreshes what an earlier run stored. */
  async upsertPreserved(
    workspaceId: string,
    sourceRunId: string,
    records: Array<{
      kind: string;
      notionId: string;
      payload: Prisma.InputJsonValue;
      payloadHash: string;
    }>
  ) {
    for (const record of records) {
      const data = {
        payload: record.payload,
        payloadHash: record.payloadHash,
        sourceRunId,
      };
      await this.db.notionPreservedRecord.upsert({
        where: {
          workspaceId_kind_notionId: {
            workspaceId,
            kind: record.kind,
            notionId: record.notionId,
          },
        },
        create: {
          workspaceId,
          kind: record.kind,
          notionId: record.notionId,
          ...data,
        },
        update: data,
      });
    }
  }

  async listPreserved(
    workspaceId: string,
    kind: string,
    options: { afterId?: string; take: number }
  ) {
    return await this.db.notionPreservedRecord.findMany({
      where: { workspaceId, kind },
      orderBy: { notionId: 'asc' },
      take: options.take,
      ...(options.afterId
        ? {
            cursor: {
              workspaceId_kind_notionId: {
                workspaceId,
                kind,
                notionId: options.afterId,
              },
            },
            skip: 1,
          }
        : {}),
    });
  }

  // ---- retention ---------------------------------------------------------

  /**
   * Expires runs past their retention date: the token is cleared and staged
   * data (items, tasks, file rows) is deleted. The run row, its ledger and the
   * preserved records stay as the migration record.
   */
  async expireRuns(now = new Date()): Promise<NotionImportRun[]> {
    const due = await this.db.notionImportRun.findMany({
      where: { expiresAt: { lt: now }, status: { not: 'expired' } },
    });
    for (const run of due) {
      await this.db.notionImportItem.deleteMany({ where: { runId: run.id } });
      await this.db.notionImportTask.deleteMany({ where: { runId: run.id } });
      await this.db.notionImportFile.deleteMany({ where: { runId: run.id } });
      await this.db.notionImportRun.update({
        where: { id: run.id },
        data: {
          status: 'expired',
          tokenCipher: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          finishedAt: run.finishedAt ?? now,
        },
      });
    }
    return due;
  }
}
