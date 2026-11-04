import { type BayGeometry, BAY_GEOMETRY, NOTE_SLOTS } from './geometry';

/**
 * Pure data types for the Shelf home. No framework imports: everything here
 * is derived from DocRecord / FolderNode / FavoriteList by `ShelfService`
 * and can be unit-tested without the infra container.
 */

export interface ShelfDoc {
  readonly id: string;
  readonly title: string;
  /** epoch ms, undefined when the doc has no recorded update time */
  readonly updatedAt?: number;
  readonly favorite: boolean;
}

export interface ShelfFolder {
  readonly id: string;
  readonly name: string;
  /** every doc id linked in this folder or in any descendant folder */
  readonly docIds: readonly string[];
}

export interface ShelfInput {
  /** non-trashed docs only */
  readonly docs: readonly ShelfDoc[];
  /** top-level folders only */
  readonly folders: readonly ShelfFolder[];
  /** ids of docs the user opened on this device */
  readonly openedIds: readonly string[];
}

export interface ShelfOptions {
  /** bays visible at once; the scene draws four */
  readonly baysPerPage: number;
  /** bay shapes by position on the page; books are paged to fit them */
  readonly geometry: readonly BayGeometry[];
  /** sticky notes on the pin board */
  readonly noteCount: number;
}

export const DEFAULT_SHELF_OPTIONS: ShelfOptions = {
  baysPerPage: BAY_GEOMETRY.length,
  geometry: BAY_GEOMETRY,
  noteCount: NOTE_SLOTS.length,
};

export const UNFILED_BAY_ID = '__unfiled__';

export interface Book {
  readonly docId: string;
  readonly title: string;
  readonly favorite: boolean;
  readonly opened: boolean;
  /** stable visual seed, see `bookLook` */
  readonly look: BookLook;
}

export interface BookLook {
  /** index into the five book colours of the palette (0..4) */
  readonly color: number;
  /** spine width in scene units */
  readonly width: number;
  /** spine height in scene units, never above 70 so it clears every plank */
  readonly height: number;
  /** whether the spine carries a gold band */
  readonly band: boolean;
}

export interface Bay {
  readonly id: string;
  readonly name: string;
  readonly unfiled: boolean;
  /** all books in the bay after ordering, before the per-bay cap */
  readonly total: number;
  readonly books: readonly Book[];
  /** books on other pages of this bay; 0 means the bay fits on one page */
  readonly hidden: number;
  /** zero-based page of books currently shown */
  readonly page: number;
  readonly pageCount: number;
}

export interface PinNote {
  readonly docId: string;
  readonly title: string;
  readonly look: BookLook;
}

export interface PinBoard {
  /** folder name, or null when the board falls back to the newest docs */
  readonly folderName: string | null;
  readonly folderId: string | null;
  readonly notes: readonly PinNote[];
}

export interface ShelfModel {
  readonly bays: readonly Bay[];
  readonly page: number;
  readonly pageCount: number;
  readonly pinBoard: PinBoard;
  readonly opened: number;
  readonly total: number;
}
