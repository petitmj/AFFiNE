import type { JsonObject } from './json';

/**
 * Per item, what happened to it. Same vocabulary as the server ledger
 * (`NotionImportOutcome`), so the client can report it unchanged.
 *
 *  mapped          lands in a native AFFiNE structure, nothing lost
 *  degraded        lands natively but some behaviour or detail is reduced;
 *                  the data itself is kept (for example a formula's value)
 *  preserved_only  has no native structure; the raw Notion JSON is kept in the
 *                  preserved file and a visible placeholder marks its place
 *  unrecoverable   could not be read at all (for example an expired file)
 */
export type Outcome =
  | 'mapped'
  | 'degraded'
  | 'preserved_only'
  | 'unrecoverable';

const RANK: Record<Outcome, number> = {
  mapped: 0,
  degraded: 1,
  preserved_only: 2,
  unrecoverable: 3,
};

export const worse = (a: Outcome, b: Outcome): Outcome =>
  RANK[a] >= RANK[b] ? a : b;

export interface LedgerEntry {
  notionId: string;
  /** what kind of thing, e.g. `block:callout`, `property:formula`, `page` */
  subject: string;
  outcome: Outcome;
  codes: string[];
  affineDocId?: string;
  contentHash?: string;
}

export interface LedgerSummary {
  mapped: number;
  degraded: number;
  preservedOnly: number;
  unrecoverable: number;
}

export class Ledger {
  private readonly map = new Map<string, LedgerEntry>();
  /** raw Notion JSON of everything that is not plain `mapped` */
  private readonly raw = new Map<string, JsonObject>();

  record(
    entry: {
      notionId: string;
      subject: string;
      outcome: Outcome;
      codes?: string[];
      affineDocId?: string;
      contentHash?: string;
    },
    rawPayload?: JsonObject
  ): void {
    const key = `${entry.notionId}\u0000${entry.subject}`;
    const prev = this.map.get(key);
    const codes = [
      ...new Set([...(prev?.codes ?? []), ...(entry.codes ?? [])]),
    ];
    this.map.set(key, {
      notionId: entry.notionId,
      subject: entry.subject,
      outcome: prev ? worse(prev.outcome, entry.outcome) : entry.outcome,
      codes,
      affineDocId: entry.affineDocId ?? prev?.affineDocId,
      contentHash: entry.contentHash ?? prev?.contentHash,
    });
    if (rawPayload && entry.outcome !== 'mapped') {
      this.raw.set(key, rawPayload);
    }
  }

  entries(): LedgerEntry[] {
    return [...this.map.values()];
  }

  /** raw payloads keyed by `notionId` for every non-mapped entry */
  preserved(): { notionId: string; subject: string; payload: JsonObject }[] {
    const out: { notionId: string; subject: string; payload: JsonObject }[] =
      [];
    for (const [key, payload] of this.raw) {
      const e = this.map.get(key);
      if (e && e.outcome !== 'mapped') {
        out.push({ notionId: e.notionId, subject: e.subject, payload });
      }
    }
    return out;
  }

  summary(): LedgerSummary {
    const s: LedgerSummary = {
      mapped: 0,
      degraded: 0,
      preservedOnly: 0,
      unrecoverable: 0,
    };
    for (const e of this.map.values()) {
      if (e.outcome === 'mapped') s.mapped++;
      else if (e.outcome === 'degraded') s.degraded++;
      else if (e.outcome === 'preserved_only') s.preservedOnly++;
      else s.unrecoverable++;
    }
    return s;
  }
}

/** Phase 2 warning codes. One place, so docs and code cannot drift apart. */
export const CODES = {
  unsupportedBlock: 'unsupported_block',
  fileUnavailable: 'file_unavailable',
  formulaStatic: 'formula_static_value',
  rollupStatic: 'rollup_static_value',
  rollupIncomplete: 'rollup_incomplete',
  relationUnresolved: 'relation_unresolved',
  mentionUnresolved: 'mention_unresolved',
  colorDropped: 'color_dropped',
  columnsFlattened: 'column_layout_flattened',
  syncedBlockCopied: 'synced_block_copied',
  toggleAsList: 'toggle_as_list',
  tocIsWidget: 'toc_is_widget',
  dateEndPreserved: 'date_end_preserved',
  uniqueIdStatic: 'unique_id_static',
  coverAsImage: 'cover_as_image',
  commentPreserved: 'comment_preserved',
  numberFormatDropped: 'number_format_dropped',
  rowLimitReached: 'row_limit_reached',
  titleEmpty: 'title_empty',
  commitFailed: 'commit_failed',
  nestedHoisted: 'nested_block_hoisted',
  externalImageAsLink: 'external_image_as_link',
  tableHeaderFlag: 'table_header_flag',
  databaseMissing: 'database_not_staged',
  iconDropped: 'icon_dropped',
} as const;
