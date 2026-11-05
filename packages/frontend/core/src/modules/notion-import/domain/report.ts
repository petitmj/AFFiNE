import { type SnapBlock } from './blocks';
import { notionUrl } from './ids';
import { CODES, type Ledger, type LedgerEntry } from './ledger';
import { textValue } from './rich-text';
import type { OutDoc } from './transform';

/** what each code means for the person reading the report */
export const CODE_HELP: Record<string, string> = {
  [CODES.unsupportedBlock]:
    'Has no AFFiNE equivalent. A placeholder marks its place and the original is in the preserved file.',
  [CODES.fileUnavailable]:
    'Notion no longer served the file, so it could not be copied. The name is kept.',
  [CODES.formulaStatic]:
    'Formulas keep the value Notion had calculated and the expression text. They do not recalculate.',
  [CODES.rollupStatic]:
    'Rollups keep the value Notion had calculated. They do not recalculate.',
  [CODES.rollupIncomplete]:
    'Notion reported this rollup as incomplete, so the value may be partial.',
  [CODES.relationUnresolved]:
    'Related rows that were not part of this import keep their Notion id and title.',
  [CODES.mentionUnresolved]:
    'Mentioned pages that were not part of this import appear as links back to Notion.',
  [CODES.colorDropped]: 'Text and highlight colors are not carried over.',
  [CODES.columnsFlattened]: 'Column layouts are placed one after another.',
  [CODES.syncedBlockCopied]:
    'Synced blocks are copied into each place they appear. They no longer stay in sync.',
  [CODES.toggleAsList]: 'Toggles became collapsed list items.',
  [CODES.tocIsWidget]:
    'A table of contents is a built-in AFFiNE widget, so the block was dropped.',
  [CODES.dateEndPreserved]:
    'Date ranges keep their start. The end date and time zone are in the preserved file.',
  [CODES.uniqueIdStatic]:
    'Unique ids are kept as text and do not count up for new rows.',
  [CODES.coverAsImage]: 'Page covers became the first image of the doc.',
  [CODES.iconDropped]: 'Only emoji icons are carried over.',
  [CODES.commentPreserved]:
    'Comments cannot be created by an import. They are in the preserved file.',
  [CODES.numberFormatDropped]:
    'Currency and percent formats are not carried over. The numbers are.',
  [CODES.nestedHoisted]:
    'A block AFFiNE cannot nest was moved to sit just after its parent.',
  [CODES.externalImageAsLink]:
    'Externally hosted images became link cards, because AFFiNE images need a stored file.',
  [CODES.tableHeaderFlag]: 'Header row and column flags are not carried over.',
  [CODES.databaseMissing]:
    'The database was not part of this import. A placeholder marks its place.',
  [CODES.titleEmpty]: 'Untitled pages are named "Untitled".',
  [CODES.commitFailed]:
    'AFFiNE refused to store this page. Its raw data is in the preserved file; import again to retry.',
};

export const PRESERVED_FORMAT = 'affine-notion-preserved/1';

export interface ReportMeta {
  runId: string;
  notionWorkspaceName?: string;
  /** epoch ms, passed in so output is reproducible */
  now: number;
}

export interface PreservedFile {
  format: typeof PRESERVED_FORMAT;
  runId: string;
  generatedAt: string;
  notionWorkspaceName?: string;
  summary: ReturnType<Ledger['summary']>;
  entries: LedgerEntry[];
  records: ReturnType<Ledger['preserved']>;
}

export function buildPreservedFile(ledger: Ledger, meta: ReportMeta): string {
  const file: PreservedFile = {
    format: PRESERVED_FORMAT,
    runId: meta.runId,
    generatedAt: new Date(meta.now).toISOString(),
    notionWorkspaceName: meta.notionWorkspaceName,
    summary: ledger.summary(),
    entries: ledger.entries(),
    records: ledger.preserved(),
  };
  return JSON.stringify(file, null, 2);
}

export interface ReportBlob {
  blobId: string;
  sourcePath: string;
  fileName: string;
  mime: string;
  bytes: Uint8Array;
}

/** rows listed in the report table; the preserved file always has them all */
export const REPORT_TABLE_LIMIT = 200;

const para = (id: string, text: string, type = 'text'): SnapBlock => ({
  type: 'block',
  id,
  flavour: 'affine:paragraph',
  props: { type, text: textValue([{ insert: text }]), collapsed: false },
  children: [],
});

const bullet = (id: string, text: string): SnapBlock => ({
  type: 'block',
  id,
  flavour: 'affine:list',
  props: {
    type: 'bulleted',
    text: textValue([{ insert: text }]),
    checked: false,
    collapsed: false,
    order: null,
  },
  children: [],
});

export async function buildReport(
  ledger: Ledger,
  meta: ReportMeta,
  hashBytes: (bytes: Uint8Array) => Promise<string>
): Promise<{ doc: OutDoc; blob: ReportBlob }> {
  const bytes = new TextEncoder().encode(buildPreservedFile(ledger, meta));
  const blobId = await hashBytes(bytes);
  const blob: ReportBlob = {
    blobId,
    sourcePath: 'notion-import-preserved.json',
    fileName: 'notion-import-preserved.json',
    mime: 'application/json',
    bytes,
  };

  const s = ledger.summary();
  const day = new Date(meta.now).toISOString().slice(0, 10);
  const title = `Notion import report ${day}`;
  const rid = `report-${meta.runId}`;
  const body: SnapBlock[] = [];
  body.push(
    para(
      `${rid}-summary`,
      `${ledger.entries().length} items from ${meta.notionWorkspaceName ?? 'your Notion workspace'}: ` +
        `${s.mapped} imported as they were, ${s.degraded} imported with a difference, ` +
        `${s.preservedOnly} kept as raw data only, ${s.unrecoverable} could not be read.`
    )
  );

  const byCode = new Map<string, number>();
  for (const e of ledger.entries()) {
    if (e.outcome === 'mapped') continue;
    for (const c of e.codes) byCode.set(c, (byCode.get(c) ?? 0) + 1);
  }
  if (byCode.size) {
    body.push(para(`${rid}-h-diff`, 'What is different', 'h2'));
    [...byCode.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .forEach(([code, n], i) =>
        body.push(
          bullet(
            `${rid}-code-${i}`,
            `${code} (${n}): ${CODE_HELP[code] ?? 'See the preserved file.'}`
          )
        )
      );
  } else {
    body.push(
      para(`${rid}-clean`, 'Everything arrived in a native AFFiNE form.')
    );
  }

  const flagged = ledger.entries().filter(e => e.outcome !== 'mapped');
  if (flagged.length) {
    body.push(para(`${rid}-h-items`, 'Items to review', 'h2'));
    const shown = flagged.slice(0, REPORT_TABLE_LIMIT);
    const cols: Record<string, unknown> = {};
    const rows: Record<string, unknown> = {};
    const cells: Record<string, unknown> = {};
    const pad = (n: number) => `a${String(n).padStart(4, '0')}`;
    ['Item', 'Kind', 'Result', 'Why'].forEach(
      (_, i) =>
        (cols[`${rid}-c${i}`] = { columnId: `${rid}-c${i}`, order: pad(i) })
    );
    const header = ['Item', 'Kind', 'Result', 'Why'];
    const all = [
      header,
      ...shown.map(e => [e.notionId, e.subject, e.outcome, e.codes.join(', ')]),
    ];
    all.forEach((cellsOfRow, r) => {
      const rowId = `${rid}-r${r}`;
      rows[rowId] = { rowId, order: pad(r) };
      cellsOfRow.forEach((text, c) => {
        const link = r > 0 && c === 0 ? { link: notionUrl(text) } : undefined;
        cells[`${rowId}:${rid}-c${c}`] = {
          text: {
            delta: [{ insert: text, ...(link ? { attributes: link } : {}) }],
          },
        };
      });
    });
    body.push({
      type: 'block',
      id: `${rid}-table`,
      flavour: 'affine:table',
      props: { rows, columns: cols, cells },
      children: [],
    });
    if (flagged.length > shown.length) {
      body.push(
        para(
          `${rid}-more`,
          `${flagged.length - shown.length} more items are listed in the preserved file.`
        )
      );
    }
  }

  body.push(para(`${rid}-h-file`, 'Preserved data', 'h2'));
  body.push({
    type: 'block',
    id: `${rid}-file`,
    flavour: 'affine:attachment',
    props: {
      name: blob.fileName,
      size: bytes.byteLength,
      type: blob.mime,
      sourceId: blobId,
      caption:
        'Everything AFFiNE could not store natively, exactly as Notion returned it.',
      embed: false,
      style: 'horizontalThin',
      footnoteIdentifier: null,
      index: 'a0',
      xywh: '[0,0,0,0]',
      rotate: 0,
      lockedBySelf: false,
    },
    children: [],
  });

  const root = `root-${rid}`;
  const docId = `notion-report-${meta.runId}`;
  return {
    blob,
    doc: {
      id: docId,
      sourcePath: `notion-import-report:${meta.runId}`,
      snapshot: {
        type: 'page',
        meta: { id: docId, title, createDate: meta.now, tags: [] },
        blocks: {
          type: 'block',
          id: root,
          flavour: 'affine:page',
          props: { title: textValue([{ insert: title }]) },
          children: [
            {
              type: 'block',
              id: `${root}-surface`,
              flavour: 'affine:surface',
              props: { elements: {} },
              children: [],
            },
            {
              type: 'block',
              id: `${root}-note`,
              flavour: 'affine:note',
              props: {
                xywh: '[0,0,800,95]',
                index: 'a0',
                hidden: false,
                displayMode: 'both',
              },
              children: body,
            },
          ],
        },
      },
      meta: { title, createDate: meta.now, updatedDate: meta.now },
    },
  };
}
