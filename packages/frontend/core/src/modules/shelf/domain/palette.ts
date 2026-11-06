/**
 * Palette tokens for the Shelf scene. Colours are data so the palette can be
 * swapped without touching the scene markup.
 *
 * Heritage references used for the patterns are named in `HERITAGE_CREDIT`.
 * No Marvel marks, no Adinkra symbols, no orisha colour codes.
 */
export interface ShelfPalette {
  readonly id: 'sunlit-gold' | 'royal-violet' | 'blend';
  readonly wall: string;
  readonly wallShade: string;
  readonly light: string;
  readonly floor: string;
  readonly shelf: string;
  readonly edge: string;
  readonly back: string;
  readonly ink: string;
  /** the five spine colours, indexed by `BookLook.color` */
  readonly books: readonly [string, string, string, string, string];
  readonly gold: string;
  readonly glow: string;
  readonly board: string;
  readonly pot: string;
  readonly leaf: string;
  /** overlay text colour on the floor strip (counter) */
  readonly counterText: string;
  readonly headline: string;
  readonly accent: string;
  readonly accentText: string;
}

export const PALETTES = {
  'sunlit-gold': {
    id: 'sunlit-gold',
    wall: '#E7CCA6',
    wallShade: '#D9B990',
    light: '#F3E3C2',
    floor: '#5E3B23',
    shelf: '#D09B24',
    edge: '#9F533B',
    back: '#1E100A',
    ink: '#060506',
    books: ['#283B62', '#9F533B', '#355C3E', '#EFE4CD', '#D09B24'],
    gold: '#D09B24',
    glow: '#D09B24',
    board: '#283B62',
    pot: '#9F533B',
    leaf: '#355C3E',
    counterText: '#EFE4CD',
    headline: '#2A1B14',
    accent: '#D09B24',
    accentText: '#2A1B14',
  },
  'royal-violet': {
    id: 'royal-violet',
    wall: '#F1E4C8',
    wallShade: '#DFCCA6',
    light: '#FFF4DC',
    floor: '#3A2459',
    shelf: '#4B2A7B',
    edge: '#B26A3B',
    back: '#1E1730',
    ink: '#1E1730',
    books: ['#6B45A3', '#B26A3B', '#1FA89A', '#F6EBD2', '#C99A2E'],
    gold: '#C99A2E',
    glow: '#1FA89A',
    board: '#4B2A7B',
    pot: '#B26A3B',
    leaf: '#1FA89A',
    counterText: '#F6EBD2',
    headline: '#4B2A7B',
    accent: '#C99A2E',
    accentText: '#1E1730',
  },
  blend: {
    id: 'blend',
    wall: '#EAD7AE',
    wallShade: '#D6BF8F',
    light: '#FBEFD2',
    floor: '#2B3358',
    shelf: '#C99A2E',
    edge: '#B26A3B',
    back: '#243B6B',
    ink: '#1E1730',
    books: ['#F6EBD2', '#B26A3B', '#1FA89A', '#F6EBD2', '#C99A2E'],
    gold: '#C99A2E',
    glow: '#1FA89A',
    board: '#243B6B',
    pot: '#B26A3B',
    leaf: '#1FA89A',
    counterText: '#F6EBD2',
    headline: '#243B6B',
    accent: '#4B2A7B',
    accentText: '#F6EBD2',
  },
} as const satisfies Record<string, ShelfPalette>;

export type ShelfPaletteId = keyof typeof PALETTES;
export const DEFAULT_PALETTE: ShelfPaletteId = 'sunlit-gold';

export const HERITAGE_CREDIT =
  'Patterns inspired by Ndebele house painting, Ghanaian kente weaving and Yoruba adire indigo cloth.';

/** WCAG 2.x relative luminance contrast ratio of two #RRGGBB colours */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
