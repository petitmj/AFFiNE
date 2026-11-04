import { paginateBooks } from './geometry';
import { bookLook } from './hash';
import { countOpened } from './opened';
import {
  type Bay,
  type Book,
  DEFAULT_SHELF_OPTIONS,
  type PinBoard,
  type ShelfDoc,
  type ShelfFolder,
  type ShelfInput,
  type ShelfModel,
  type ShelfOptions,
  UNFILED_BAY_ID,
} from './types';

const byRecency = (a: ShelfDoc, b: ShelfDoc) =>
  (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.id.localeCompare(b.id);

/** favourites first, then newest first; ties broken by id so order is stable */
function orderBooks(docs: ShelfDoc[]): ShelfDoc[] {
  return [...docs].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return byRecency(a, b);
  });
}

function latest(docs: readonly ShelfDoc[]): number {
  let max = 0;
  for (const d of docs) max = Math.max(max, d.updatedAt ?? 0);
  return max;
}

export function layoutShelf(
  input: ShelfInput,
  page = 0,
  options: ShelfOptions = DEFAULT_SHELF_OPTIONS,
  /** per-bay page of books, keyed by bay id */
  bayPages: Readonly<Record<string, number>> = {}
): ShelfModel {
  const docById = new Map(input.docs.map(d => [d.id, d]));
  const opened = new Set(input.openedIds);

  const toBook = (d: ShelfDoc): Book => ({
    docId: d.id,
    title: d.title,
    favorite: d.favorite,
    opened: opened.has(d.id),
    look: bookLook(d.id),
  });

  // resolve folder membership against live docs only (links to trashed or
  // missing docs are dropped here, not in the folder tree)
  const resolved = input.folders.map(f => {
    const seen = new Set<string>();
    const docs: ShelfDoc[] = [];
    for (const id of f.docIds) {
      const d = docById.get(id);
      if (d && !seen.has(id)) {
        seen.add(id);
        docs.push(d);
      }
    }
    return { folder: f, docs };
  });

  const filed = new Set<string>();
  for (const r of resolved) for (const d of r.docs) filed.add(d.id);
  const unfiled = input.docs.filter(d => !filed.has(d.id));

  // folders by latest activity, empty folders last; the unfiled bay is
  // always the final bay so "everything I saved" is never lost
  const folderBays = [...resolved].sort(
    (a, b) =>
      latest(b.docs) - latest(a.docs) ||
      a.folder.name.localeCompare(b.folder.name) ||
      a.folder.id.localeCompare(b.folder.id)
  );

  type Entry = { id: string; name: string; unfiled: boolean; docs: ShelfDoc[] };
  const entries: Entry[] = folderBays.map(r => ({
    id: r.folder.id,
    name: r.folder.name,
    unfiled: false,
    docs: r.docs,
  }));
  if (unfiled.length > 0 || entries.length === 0) {
    entries.push({
      id: UNFILED_BAY_ID,
      name: '',
      unfiled: true,
      docs: unfiled,
    });
  }

  const perPage = Math.max(1, options.baysPerPage);
  const pageCount = Math.max(1, Math.ceil(entries.length / perPage));
  const safePage = Math.min(Math.max(0, Math.floor(page)), pageCount - 1);

  const bays: Bay[] = entries
    .slice(safePage * perPage, safePage * perPage + perPage)
    .map((e, position) => {
      const ordered = orderBooks(e.docs).map(toBook);
      const geometry =
        options.geometry[position] ??
        options.geometry[options.geometry.length - 1];
      const pages = paginateBooks(ordered, geometry);
      const pageCount = pages.length;
      const bayPage = Math.min(
        Math.max(0, Math.floor(bayPages[e.id] ?? 0)),
        pageCount - 1
      );
      const shown = pages[bayPage];
      return {
        id: e.id,
        name: e.name,
        unfiled: e.unfiled,
        total: ordered.length,
        books: shown,
        hidden: ordered.length - shown.length,
        page: bayPage,
        pageCount,
      };
    });

  return {
    bays,
    page: safePage,
    pageCount,
    pinBoard: layoutPinBoard(resolved, input.docs, options),
    opened: countOpened(input.openedIds, new Set(input.docs.map(d => d.id))),
    total: input.docs.length,
  };
}

/**
 * The pin board shows the most recently edited folder (the folder holding the
 * most recently updated doc). With no folders it shows the newest docs and
 * has no folder name.
 */
export function layoutPinBoard(
  resolved: readonly { folder: ShelfFolder; docs: ShelfDoc[] }[],
  allDocs: readonly ShelfDoc[],
  options: ShelfOptions = DEFAULT_SHELF_OPTIONS
): PinBoard {
  let best: { folder: ShelfFolder; docs: ShelfDoc[]; at: number } | null = null;
  for (const r of resolved) {
    if (r.docs.length === 0) continue;
    const at = latest(r.docs);
    if (
      !best ||
      at > best.at ||
      (at === best.at && r.folder.id.localeCompare(best.folder.id) < 0)
    ) {
      best = { ...r, at };
    }
  }
  const source = best ? best.docs : [...allDocs];
  const notes = [...source]
    .sort(byRecency)
    .slice(0, options.noteCount)
    .map(d => ({ docId: d.id, title: d.title, look: bookLook(d.id) }));
  return {
    folderName: best ? best.folder.name : null,
    folderId: best ? best.folder.id : null,
    notes,
  };
}
