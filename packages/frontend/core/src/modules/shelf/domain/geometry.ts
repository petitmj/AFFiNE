/**
 * Where the four bookcase bays sit in the 1376x768 scene (the proportions of
 * the approved home-page picture). Pages of books are cut by real spine widths
 * (`paginateBooks`), so a page always fits its bay and no book can be placed
 * outside it.
 */
export const SCENE_WIDTH = 1376;
export const SCENE_HEIGHT = 768;
export const MIN_SPINE_WIDTH = 12;
export const MAX_SPINE_WIDTH = 18;
export const MIN_BOOK_HEIGHT = 62;
/** clears every plank and the lowest ceiling (bay B, 83 units) */
export const MAX_BOOK_HEIGHT = 80;
/** thickness of a plank; books stand on its top edge */
export const PLANK_HEIGHT = 10;

export interface BayGeometry {
  /** inner left edge of the bay */
  readonly x: number;
  /** inner width */
  readonly w: number;
  /** y of the inside of the bay's top cap */
  readonly ceiling: number;
  /** y of each shelf plank the books stand on, top row first */
  readonly rows: readonly number[];
}

export const BAY_GEOMETRY: readonly BayGeometry[] = [
  { x: 886, w: 89, ceiling: 377, rows: [486, 604, 712] },
  { x: 990, w: 72, ceiling: 521, rows: [604, 712] },
  { x: 1076, w: 107, ceiling: 222, rows: [355, 486, 604, 712] },
  { x: 1199, w: 99, ceiling: 366, rows: [486, 604, 712] },
];

/** top edge of each bay's outer frame, for the artwork */
export const BAY_TOPS: readonly number[] = [368, 512, 213, 357];
/** y where the bookcases end and the floor border starts */
export const BAY_BOTTOM = 722;

export interface PlacedBook {
  readonly x: number;
  /** y of the plank the book stands on */
  readonly baseline: number;
}

/**
 * Packs spines left to right, row by row. Returns null if they do not fit.
 * Pages produced by `paginateBooks` always fit.
 */
export function packRows(
  widths: readonly number[],
  g: BayGeometry
): PlacedBook[] | null {
  const out: PlacedBook[] = [];
  let row = 0;
  let cursor = 0;
  for (const raw of widths) {
    const w = Math.min(raw, MAX_SPINE_WIDTH);
    if (cursor + w > g.w) {
      row++;
      cursor = 0;
    }
    if (row >= g.rows.length) return null;
    out.push({ x: g.x + cursor, baseline: g.rows[row] });
    cursor += w;
  }
  return out;
}

/**
 * Cuts an ordered list into pages that each fit the bay. Greedy and stable:
 * the same widths always give the same pages. Never returns an empty list.
 */
export function paginateBooks<T extends { look: { width: number } }>(
  items: readonly T[],
  g: BayGeometry
): T[][] {
  const pages: T[][] = [[]];
  let row = 0;
  let cursor = 0;
  for (const item of items) {
    const w = Math.min(item.look.width, MAX_SPINE_WIDTH);
    if (cursor + w > g.w) {
      row++;
      cursor = 0;
    }
    if (row >= g.rows.length) {
      pages.push([]);
      row = 0;
      cursor = 0;
    }
    pages[pages.length - 1].push(item);
    cursor += w;
  }
  return pages;
}

/** the six sticky-note slots on the pin board, scene units */
export const NOTE_SLOTS: readonly {
  x: number;
  y: number;
  w: number;
  h: number;
}[] = [
  { x: 192, y: 311, w: 74, h: 58 },
  { x: 285, y: 314, w: 74, h: 58 },
  { x: 378, y: 311, w: 74, h: 58 },
  { x: 194, y: 388, w: 72, h: 57 },
  { x: 285, y: 391, w: 74, h: 57 },
  { x: 378, y: 388, w: 74, h: 57 },
];
