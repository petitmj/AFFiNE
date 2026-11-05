import { LiveData, Service } from '@toeverything/infra';

import type { WorkspaceServerService } from '../../cloud';
import type { ImportService } from '../../import';
import type { WorkspaceService } from '../../workspace';
import { blobIdOf, sha256Hex } from './hashing';
import { type GqlTransport, NotionApi, type NotionRun } from './notion-api';
import {
  INITIAL_STATE,
  NotionImportController,
  type RunState,
} from './run-controller';

export interface StartInput {
  /** the Notion integration token; sent to the server once and never stored here */
  token: string;
  /** page or database ids; empty imports everything the integration can see */
  roots: string[];
  includeBlockComments: boolean;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true }
    );
  });

/**
 * The Notion API import as an app service: it owns one controller at a time
 * and exposes its state as LiveData for the wizard. All rules (staging, the
 * transform, batching, the ledger) live in the plain modules next to it.
 */
export class NotionImportService extends Service {
  readonly state$ = new LiveData<RunState>(INITIAL_STATE);

  private controller?: NotionImportController;
  private abort?: AbortController;

  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly importService: ImportService
  ) {
    super();
  }

  /** local-only workspaces have no server to stage the import on */
  get available(): boolean {
    return !!this.workspaceServerService.server;
  }

  private get api(): NotionApi {
    const server = this.workspaceServerService.server;
    if (!server) {
      throw new Error(
        'The Notion API import needs a cloud workspace. Use the zip import for local workspaces.'
      );
    }
    const gql: GqlTransport = request =>
      server.gql(request as never) as Promise<unknown>;
    return new NotionApi(gql);
  }

  private makeController(api: NotionApi) {
    const commit = this.importService.createBatchCommitter();
    this.controller = new NotionImportController(
      {
        api,
        hash: sha256Hex,
        hashBytes: blobIdOf,
        commit: batch => commit(batch as never),
        now: () => Date.now(),
        sleep,
      },
      state => this.state$.next(state)
    );
    this.abort = new AbortController();
    return this.controller;
  }

  start(input: StartInput) {
    this.leave();
    const controller = this.makeController(this.api);
    return controller.start(
      {
        token: input.token,
        workspaceId: this.workspaceService.workspace.id,
        roots: input.roots,
        includeBlockComments: input.includeBlockComments,
      },
      this.abort?.signal
    );
  }

  /** the newest run of this workspace that can still be picked up */
  async findResumable(): Promise<NotionRun | undefined> {
    const runs = await this.api.runs(this.workspaceService.workspace.id);
    return runs.find(r => r.status !== 'cancelled' && r.status !== 'expired');
  }

  attach(run: NotionRun) {
    this.leave();
    return this.makeController(this.api).attach(run, this.abort?.signal);
  }

  pause() {
    return this.controller?.pause();
  }

  resume(token?: string) {
    return this.controller?.resume(token, this.abort?.signal);
  }

  cancel() {
    return this.controller?.cancel();
  }

  downloadPreserved() {
    return this.controller?.downloadPreserved();
  }

  /** stop following; a run in progress carries on at the server */
  leave() {
    this.abort?.abort();
    this.abort = undefined;
    this.controller = undefined;
  }

  reset() {
    this.leave();
    this.state$.next(INITIAL_STATE);
  }

  override dispose() {
    this.leave();
    super.dispose();
  }
}
