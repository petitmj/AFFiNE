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
    width: 10 + ((h >>> 3) % 7), // 10..16
    height: 54 + ((h >>> 7) % 17), // 54..70 (fits the shortest shelf gap)
    band: ((h >>> 11) & 1) === 1,
  };
}
