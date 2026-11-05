import {
  planDocBatches,
  planFinalBatch,
  type PlannedBatch,
} from '../domain/batching';
import { CODES } from '../domain/ledger';
import { buildReport, type ReportMeta } from '../domain/report';
import {
  type StagedItemLike,
  transformRun,
  type TransformOutput,
} from '../domain/transform';
import {
  type CreateRunInput,
  isSettled,
  ITEM_KINDS,
  type LedgerSummaryResult,
  type NotionRun,
  PRESERVED_KINDS,
  type PreservedRecord,
} from './notion-api';

/** what the controller needs from the server; `NotionApi` implements it */
export interface NotionApiPort {
  create(input: CreateRunInput): Promise<NotionRun>;
  run(id: string): Promise<NotionRun>;
  runs(workspaceId: string): Promise<NotionRun[]>;
  pause(id: string): Promise<void>;
  resume(id: string, token?: string): Promise<void>;
  cancel(id: string): Promise<void>;
  items(
    id: string,
    kind: (typeof ITEM_KINDS)[number]
  ): Promise<StagedItemLike[]>;
  files: import('./notion-api').NotionApi['files'];
  preserved(
    workspaceId: string,
    kind: (typeof PRESERVED_KINDS)[number]
  ): Promise<PreservedRecord[]>;
  reportLedger: import('./notion-api').NotionApi['reportLedger'];
}

export interface CommitResult {
  docIds: string[];
  warnings: { code: string; message: string; sourcePath?: string }[];
}

export interface ControllerDeps {
  api: NotionApiPort;
  /** SHA-256 of a string, hex */
  hash(input: string): Promise<string>;
  /** blob id of some bytes (base64url SHA-256, as the server names its blobs) */
  hashBytes(bytes: Uint8Array): Promise<string>;
  /** writes one batch into the workspace; the app passes `ImportService` */
  commit(batch: PlannedBatch): Promise<CommitResult>;
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
  pollMs?: number;
  docsPerBatch?: number;
}

export type Phase =
  | 'idle'
  | 'creating'
  | 'extracting'
  | 'paused'
  | 'loading'
  | 'transforming'
  | 'committing'
  | 'reporting'
  | 'done'
  | 'failed'
  | 'cancelled'
  /** the person left; the run carries on at the server and can be picked up again */
  | 'detached';

export interface RunState {
  phase: Phase;
  runId?: string;
  notionWorkspaceName?: string | null;
  extract?: NotionRun['progress'];
  loaded?: number;
  commit?: { completed: number; total: number };
  summary?: LedgerSummaryResult;
  reportDocId?: string;
  importedDocIds: string[];
  warnings: { code: string; message: string }[];
  /** the preserved file as written into the report, for download */
  preservedJson?: string;
  error?: string;
}

export const INITIAL_STATE: RunState = {
  phase: 'idle',
  importedDocIds: [],
  warnings: [],
};

class Detached extends Error {}

export class NotionImportController {
  private state: RunState = INITIAL_STATE;
  private runId?: string;
  private workspaceId?: string;
  private finishing = false;

  constructor(
    private readonly deps: ControllerDeps,
    private readonly onState: (state: RunState) => void = () => {}
  ) {}

  get current(): RunState {
    return this.state;
  }

  private set(patch: Partial<RunState>) {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }

  /** starts a new run and follows it to the end */
  async start(input: CreateRunInput, signal?: AbortSignal): Promise<RunState> {
    this.set({ ...INITIAL_STATE, phase: 'creating' });
    try {
      const run = await this.deps.api.create(input);
      this.workspaceId = input.workspaceId;
      return await this.follow(run, signal);
    } catch (error) {
      return this.fail(error);
    }
  }

  /** picks up a run that already exists (after a reload, or a paused run) */
  async attach(run: NotionRun, signal?: AbortSignal): Promise<RunState> {
    this.set({ ...INITIAL_STATE, phase: 'extracting' });
    this.workspaceId = run.workspaceId;
    try {
      return await this.follow(run, signal);
    } catch (error) {
      return this.fail(error);
    }
  }

  async pause(): Promise<void> {
    if (this.runId) await this.deps.api.pause(this.runId);
  }

  /** a paused or failed run needs the Notion token again */
  async resume(token?: string): Promise<void> {
    if (!this.runId) return;
    await this.deps.api.resume(this.runId, token);
    this.set({ phase: 'extracting', error: undefined });
  }

  async cancel(): Promise<void> {
    if (this.runId) await this.deps.api.cancel(this.runId);
  }

  private fail(error: unknown): RunState {
    if (error instanceof Detached) {
      this.set({ phase: 'detached' });
    } else {
      this.set({
        phase: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return this.state;
  }

  private async follow(first: NotionRun, signal?: AbortSignal) {
    this.runId = first.id;
    let run = first;
    for (;;) {
      if (signal?.aborted) throw new Detached();
      this.report(run);
      if (run.status === 'staged') return await this.finish(run, signal);
      if (run.status === 'cancelled') {
        this.set({ phase: 'cancelled' });
        return this.state;
      }
      if (run.status === 'expired') {
        throw new Error(
          'This import expired before it could be loaded. Start it again.'
        );
      }
      if (run.status === 'failed') {
        // resumable: the person can supply the token again
        this.set({
          phase: 'failed',
          error: run.lastError ?? 'The import stopped.',
        });
        return this.state;
      }
      await this.deps.sleep(this.deps.pollMs ?? 2000, signal).catch(() => {
        throw new Detached();
      });
      run = await this.deps.api.run(first.id);
    }
  }

  private report(run: NotionRun) {
    this.set({
      phase: isSettled(run.status)
        ? this.state.phase
        : run.status === 'paused'
          ? 'paused'
          : 'extracting',
      runId: run.id,
      notionWorkspaceName: run.notionWorkspaceName,
      extract: run.progress,
    });
  }

  /** Load, Transform, Legalize, Commit, Report */
  private async finish(run: NotionRun, signal?: AbortSignal) {
    if (this.finishing) return this.state;
    this.finishing = true;
    try {
      const { api } = this.deps;
      this.set({ phase: 'loading', loaded: 0 });
      const items: StagedItemLike[] = [];
      for (const kind of ITEM_KINDS) {
        if (signal?.aborted) throw new Detached();
        items.push(...(await api.items(run.id, kind)));
        this.set({ loaded: items.length });
      }
      const files = await api.files(run.id);

      this.set({ phase: 'transforming' });
      const now = this.deps.now();
      const out = await transformRun(
        { items, files },
        { hash: this.deps.hash, now }
      );

      // commit docs first; folders, icons and the report go in the last batch
      const batches = planDocBatches(out, this.deps.docsPerBatch);
      const committed = new Set<string>();
      const warnings: RunState['warnings'] = [];
      this.set({
        phase: 'committing',
        commit: { completed: 0, total: out.docs.length + 1 },
      });
      for (const batch of batches) {
        if (signal?.aborted) throw new Detached();
        const result = await this.deps.commit(batch);
        result.docIds.forEach(id => committed.add(id));
        warnings.push(...result.warnings);
        this.set({ commit: batch.progress });
      }

      this.markFailedCommits(out, items, committed);

      const meta: ReportMeta = {
        runId: run.id,
        notionWorkspaceName: run.notionWorkspaceName ?? undefined,
        now,
      };
      const report = await buildReport(out.ledger, meta, this.deps.hashBytes);
      const last = await this.deps.commit(planFinalBatch(out, report));
      warnings.push(...last.warnings);
      last.docIds.forEach(id => committed.add(id));

      this.set({ phase: 'reporting' });
      let summary: LedgerSummaryResult = out.ledger.summary();
      try {
        summary = await api.reportLedger(run.id, out.ledger.entries());
      } catch (error) {
        warnings.push({
          code: 'ledger_report_failed',
          message: `The result could not be sent to the server: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }

      this.set({
        phase: 'done',
        summary,
        reportDocId: committed.has(report.doc.id) ? report.doc.id : undefined,
        importedDocIds: [...committed].filter(id => id !== report.doc.id),
        warnings: [...out.warnings, ...warnings],
        preservedJson: new TextDecoder().decode(report.blob.bytes),
      });
      return this.state;
    } finally {
      this.finishing = false;
    }
  }

  /** a page AFFiNE refused is unrecoverable here, but its raw data is kept */
  private markFailedCommits(
    out: TransformOutput,
    items: readonly StagedItemLike[],
    committed: ReadonlySet<string>
  ) {
    const raw = new Map(
      items.filter(i => i.kind === 'page').map(i => [i.notionId, i.payload])
    );
    for (const e of out.ledger.entries()) {
      if (e.affineDocId && !committed.has(e.affineDocId)) {
        out.ledger.record(
          {
            notionId: e.notionId,
            subject: e.subject,
            outcome: 'unrecoverable',
            codes: [CODES.commitFailed],
          },
          raw.get(e.notionId)
        );
      }
    }
  }

  /** every preserved record the server holds for the workspace, as one JSON file */
  async downloadPreserved(): Promise<string> {
    if (!this.workspaceId) throw new Error('No import has been started.');
    const kinds: Record<string, PreservedRecord[]> = {};
    for (const kind of PRESERVED_KINDS) {
      kinds[kind] = await this.deps.api.preserved(this.workspaceId, kind);
    }
    return JSON.stringify(
      {
        format: 'affine-notion-server-preserved/1',
        workspaceId: this.workspaceId,
        records: kinds,
      },
      null,
      2
    );
  }
}
