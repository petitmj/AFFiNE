import {
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type ShelfPalette,
} from '@affine/core/modules/shelf';

/**
 * The colours the scene is drawn with, named by role. They are read from the
 * active palette, so palettes B and C recolour the same traced drawing.
 */
export interface Tones {
  readonly blue: string;
  readonly terra: string;
  readonly green: string;
  readonly gold: string;
  readonly cream: string;
  readonly ink: string;
  readonly back: string;
  readonly wall: string;
  readonly shade: string;
  readonly light: string;
  readonly floor: string;
  /** deep tint laid over the pin board cloth: ink drawn toward the board blue */
  readonly cloth: string;
}

const channel = (hex: string, i: number) =>
  parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

/** `k` of the way from colour `a` to colour `b`, both `#rrggbb` */
export function mix(a: string, b: string, k: number): string {
  const out = [0, 1, 2].map(i => {
    const v = Math.round(channel(a, i) * (1 - k) + channel(b, i) * k);
    return v.toString(16).padStart(2, '0');
  });
  return `#${out.join('')}`;
}

export const tonesOf = (p: ShelfPalette): Tones => ({
  blue: p.board,
  terra: p.edge,
  green: p.leaf,
  gold: p.gold,
  cream: p.books[3],
  ink: p.ink,
  back: p.back,
  wall: p.wall,
  shade: p.wallShade,
  light: p.light,
  floor: p.floor,
  cloth: mix(p.ink, p.board, 0.35),
});

/**
 * Wall, the slanted light and the two soft wall shadows behind the bookcases.
 * These are the only parts of the picture that are drawn rather than traced,
 * because they are plain translucent shapes.
 */
export function Wall({ t }: { t: Tones }) {
  return (
    <g>
      <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill={t.wall} />
      <polygon
        points="344,56 642,56 539,660 241,660"
        fill={t.light}
        fillOpacity="0.5"
      />
      <polygon
        points="459,56 487,56 383,660 355,660"
        fill={t.shade}
        fillOpacity="0.35"
      />
      <polygon
        points="540,56 559,56 455,660 436,660"
        fill={t.shade}
        fillOpacity="0.3"
      />
      <rect
        x="846"
        y="392"
        width="40"
        height="330"
        fill={t.shade}
        fillOpacity="0.55"
      />
      <rect
        x="1036"
        y="232"
        width="40"
        height="290"
        fill={t.shade}
        fillOpacity="0.55"
      />
    </g>
  );
}
