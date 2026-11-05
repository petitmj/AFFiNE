import type { JsonObject } from '../domain/json';
import type { LedgerEntry } from '../domain/ledger';
import type { FileRow, StagedItemLike } from '../domain/transform';

/**
 * The server contract written in Phase 3 (`schema.gql`), as one typed client.
 * It talks through `GqlTransport`, so the app plugs in `GraphQLService.gql`
 * and tests plug in a fake. The documents live here rather than in the
 * generated `@affine/graphql` package because codegen is a build step.
 */
export interface GqlDocument {
  id: string;
  op: string;
  query: string;
}

export type GqlTransport = (request: {
  query: GqlDocument;
  variables?: Record<string, unknown>;
}) => Promise<unknown>;

export type RunStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'staged'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface RunWarning {
  code: string;
  message: string;
  notionId?: string | null;
}

export interface NotionRun {
  id: string;
  workspaceId: string;
  status: RunStatus;
  apiVersion: string;
  notionWorkspaceName?: string | null;
  lastError?: string | null;
  progress: {
    doneTasks: number;
    failedTasks: number;
    pendingTasks: number;
    warningCount: number;
    warnings: RunWarning[];
  };
}

export interface CreateRunInput {
  token: string;
  workspaceId: string;
  /** page or database ids to import; empty means everything shared */
  roots?: string[];
  includeBlockComments?: boolean;
}

export interface PreservedRecord {
  kind: string;
  notionId: string;
  payload: JsonObject;
}

export interface LedgerSummaryResult {
  mapped: number;
  degraded: number;
  preservedOnly: number;
  unrecoverable: number;
}

/** the run can no longer change state */
export const isSettled = (s: RunStatus) =>
  s === 'staged' || s === 'failed' || s === 'cancelled' || s === 'expired';

/** item kinds the transform reads, in the order they are fetched */
export const ITEM_KINDS = [
  'user',
  'database',
  'data_source',
  'page',
  'property',
  'block',
  'comment',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** kinds of preserved record the server keeps after staging expires */
export const PRESERVED_KINDS = [
  'database',
  'data_source',
  'page_properties',
  'property_page',
] as const;

const RUN_FIELDS = `id workspaceId status apiVersion notionWorkspaceName lastError
  progress { doneTasks failedTasks pendingTasks warningCount warnings { code message notionId } }`;

const doc = (op: string, query: string): GqlDocument => ({
  id: `${op}Mutation`,
  op,
  query,
});

const DOCS = {
  create: doc(
    'createNotionImport',
    `mutation createNotionImport($input: CreateNotionImportInput!) {
  createNotionImport(input: $input) { ${RUN_FIELDS} }
}`
  ),
  run: doc(
    'notionImport',
    `query notionImport($id: String!) { notionImport(id: $id) { ${RUN_FIELDS} } }`
  ),
  runs: doc(
    'notionImports',
    `query notionImports($workspaceId: String!) { notionImports(workspaceId: $workspaceId) { ${RUN_FIELDS} } }`
  ),
  items: doc(
    'notionImportItems',
    `query notionImportItems($id: String!, $kind: String!, $after: String, $first: Int) {
  notionImportItems(id: $id, kind: $kind, after: $after, first: $first) {
    endCursor
    items { kind notionId parentId payload position }
  }
}`
  ),
  files: doc(
    'notionImportFiles',
    `query notionImportFiles($id: String!, $first: Int, $skip: Int) {
  notionImportFiles(id: $id, first: $first, skip: $skip) {
    ownerId slot status blobKey size mime lastError
  }
}`
  ),
  preserved: doc(
    'notionPreservedRecords',
    `query notionPreservedRecords($workspaceId: String!, $kind: String!, $after: String, $first: Int) {
  notionPreservedRecords(workspaceId: $workspaceId, kind: $kind, after: $after, first: $first) {
    endCursor
    records { kind notionId payload }
  }
}`
  ),
  ledger: doc(
    'reportNotionImportLedger',
    `mutation reportNotionImportLedger($id: String!, $entries: [NotionImportLedgerEntryInput!]!) {
  reportNotionImportLedger(id: $id, entries: $entries) { mapped degraded preservedOnly unrecoverable }
}`
  ),
  pause: doc(
    'pauseNotionImport',
    `mutation pauseNotionImport($id: String!) { pauseNotionImport(id: $id) }`
  ),
  resume: doc(
    'resumeNotionImport',
    `mutation resumeNotionImport($id: String!, $token: String) { resumeNotionImport(id: $id, token: $token) }`
  ),
  cancel: doc(
    'cancelNotionImport',
    `mutation cancelNotionImport($id: String!) { cancelNotionImport(id: $id) }`
  ),
} as const;

export const ITEM_PAGE_SIZE = 200;
export const FILE_PAGE_SIZE = 500;
/** the server limits one ledger report; entries go up in slices of this size */
export const LEDGER_SLICE = 500;
/** hard stop for a cursor that never ends, so a server bug cannot hang the app */
const MAX_PAGES = 100_000;

function pick<T>(data: unknown, field: string): T {
  if (typeof data !== 'object' || data === null || !(field in data)) {
    throw new Error(`Unexpected server reply: missing ${field}`);
  }
  return (data as Record<string, T>)[field];
}

export class NotionApi {
  constructor(private readonly gql: GqlTransport) {}

  async create(input: CreateRunInput): Promise<NotionRun> {
    return pick<NotionRun>(
      await this.gql({ query: DOCS.create, variables: { input } }),
      'createNotionImport'
    );
  }

  async run(id: string): Promise<NotionRun> {
    return pick<NotionRun>(
      await this.gql({ query: DOCS.run, variables: { id } }),
      'notionImport'
    );
  }

  /** every run of this workspace, newest first, for picking one back up */
  async runs(workspaceId: string): Promise<NotionRun[]> {
    return pick<NotionRun[]>(
      await this.gql({ query: DOCS.runs, variables: { workspaceId } }),
      'notionImports'
    );
  }

  async pause(id: string): Promise<void> {
    await this.gql({ query: DOCS.pause, variables: { id } });
  }

  /** a failed or paused run needs the token again, because the server never keeps it readable */
  async resume(id: string, token?: string): Promise<void> {
    await this.gql({ query: DOCS.resume, variables: { id, token } });
  }

  async cancel(id: string): Promise<void> {
    await this.gql({ query: DOCS.cancel, variables: { id } });
  }

  async items(id: string, kind: ItemKind): Promise<StagedItemLike[]> {
    const out: StagedItemLike[] = [];
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = pick<{
        endCursor?: string | null;
        items: StagedItemLike[];
      }>(
        await this.gql({
          query: DOCS.items,
          variables: { id, kind, after, first: ITEM_PAGE_SIZE },
        }),
        'notionImportItems'
      );
      out.push(...res.items);
      if (!res.endCursor || res.items.length === 0) return out;
      after = res.endCursor;
    }
    throw new Error(`Paging of ${kind} items did not end`);
  }

  async files(id: string): Promise<FileRow[]> {
    const out: FileRow[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const rows = pick<FileRow[]>(
        await this.gql({
          query: DOCS.files,
          variables: { id, first: FILE_PAGE_SIZE, skip: out.length },
        }),
        'notionImportFiles'
      );
      out.push(...rows);
      if (rows.length < FILE_PAGE_SIZE) return out;
    }
    throw new Error('Paging of files did not end');
  }

  async preserved(
    workspaceId: string,
    kind: (typeof PRESERVED_KINDS)[number]
  ): Promise<PreservedRecord[]> {
    const out: PreservedRecord[] = [];
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = pick<{
        endCursor?: string | null;
        records: PreservedRecord[];
      }>(
        await this.gql({
          query: DOCS.preserved,
          variables: { workspaceId, kind, after, first: ITEM_PAGE_SIZE },
        }),
        'notionPreservedRecords'
      );
      out.push(...res.records);
      if (!res.endCursor || res.records.length === 0) return out;
      after = res.endCursor;
    }
    throw new Error(`Paging of preserved ${kind} records did not end`);
  }

  /**
   * Reports what the client did with every item. The server sums its own
   * ledger, so a repeated slice is idempotent there; the last slice's
   * summary is the whole-run summary.
   */
  async reportLedger(
    id: string,
    entries: readonly LedgerEntry[]
  ): Promise<LedgerSummaryResult> {
    let summary: LedgerSummaryResult = {
      mapped: 0,
      degraded: 0,
      preservedOnly: 0,
      unrecoverable: 0,
    };
    for (let i = 0; i < Math.max(entries.length, 1); i += LEDGER_SLICE) {
      const slice = entries.slice(i, i + LEDGER_SLICE).map(e => ({
        notionId: e.notionId,
        subject: e.subject,
        outcome: e.outcome,
        codes: e.codes,
        affineDocId: e.affineDocId,
        contentHash: e.contentHash,
      }));
      summary = pick<LedgerSummaryResult>(
        await this.gql({
          query: DOCS.ledger,
          variables: { id, entries: slice },
        }),
        'reportNotionImportLedger'
      );
    }
    return summary;
  }
}
