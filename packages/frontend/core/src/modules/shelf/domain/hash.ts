import {
  MAX_BOOK_HEIGHT,
  MAX_SPINE_WIDTH,
  MIN_BOOK_HEIGHT,
  MIN_SPINE_WIDTH,
} from './geometry';
import type { BookLook } from './types';

/** FNV-1a, 32 bit. Stable across devices so a doc keeps its look. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function bookLook(docId: string): BookLook {
  const h = fnv1a(docId);
  return {
    color: h % 5,
    width:
      MIN_SPINE_WIDTH + ((h >>> 3) % (MAX_SPINE_WIDTH - MIN_SPINE_WIDTH + 1)),
    height:
      MIN_BOOK_HEIGHT + ((h >>> 7) % (MAX_BOOK_HEIGHT - MIN_BOOK_HEIGHT + 1)),
    band: ((h >>> 11) & 1) === 1,
  };
}
