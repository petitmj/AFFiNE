/**
 * Where the four bookcase bays sit in the 1200x640 scene. Pages of books are
 * cut by real spine widths (`paginateBooks`), so a page always fits its bay
 * and no book can be placed outside it.
 */
export const SCENE_WIDTH = 1200;
export const SCENE_HEIGHT = 640;
export const MAX_SPINE_WIDTH = 16;

export interface BayGeometry {
  /** inner left edge of the bay */
  readonly x: number;
  /** inner width */
  readonly w: number;
  /** y of each shelf plank the books stand on, top row first */
  readonly rows: readonly number[];
}

export const BAY_GEOMETRY: readonly BayGeometry[] = [
  { x: 766, w: 78, rows: [400, 500, 592] },
  { x: 856, w: 63, rows: [500, 592] },
  { x: 931, w: 93, rows: [290, 400, 500, 592] },
  { x: 1036, w: 88, rows: [400, 500, 592] },
];

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
  { x: 164, y: 254, w: 62, h: 46 },
  { x: 244, y: 256, w: 62, h: 46 },
  { x: 324, y: 254, w: 62, h: 46 },
  { x: 164, y: 318, w: 62, h: 46 },
  { x: 244, y: 320, w: 62, h: 46 },
  { x: 324, y: 318, w: 62, h: 46 },
];
