import {
  BAY_BOTTOM,
  BAY_GEOMETRY,
  BAY_TOPS,
  PLANK_HEIGHT,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type ShelfPalette,
} from '@affine/core/modules/shelf';

/**
 * The colours the scene is drawn with, named by role. They are read from the
 * active palette, so palettes B and C recolour the same drawing.
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
});

/** y of the bands that frame the room */
export const TOP_BAND = { h: 52, rule: 4 } as const;
export const FLOOR = {
  top: 659,
  row1: 662,
  mid: 692,
  row2: 695,
  rule2: 722,
  bar: 725,
} as const;
/** the plate the "documents opened" counter sits on */
export const COUNTER_PLATE = { x: 52, y: FLOOR.bar, w: 291 } as const;

/**
 * Patterns are drawn, not copied: a triangle frieze after Ndebele house
 * painting, block stripes after kente weaving and ring-and-dot cloth after
 * Yoruba adire. None of them is a sacred or Adinkra symbol.
 */
export function Patterns({ t }: { t: Tones }) {
  const o = { stroke: t.ink, strokeLinejoin: 'miter' as const };
  return (
    <defs>
      {/* top Ndebele band, 344 x 52 */}
      <pattern
        id="shelf-top"
        width="344"
        height="52"
        patternUnits="userSpaceOnUse"
      >
        <rect width="344" height="52" fill={t.cream} />
        <polygon
          points="0,2 86,40 172,2 172,16 86,54 0,16"
          fill={t.blue}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="56,0 116,0 86,20"
          fill={t.green}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="20,52 46,30 72,52"
          fill={t.gold}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="100,52 126,30 152,52"
          fill={t.gold}
          strokeWidth="2"
          {...o}
        />
        <rect
          x="176"
          y="5"
          width="164"
          height="42"
          fill={t.cream}
          strokeWidth="2.5"
          {...o}
        />
        <polygon
          points="176,5 216,5 176,26"
          fill={t.green}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="340,5 300,5 340,26"
          fill={t.gold}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="176,47 216,47 176,26"
          fill={t.blue}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="340,47 300,47 340,26"
          fill={t.terra}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="258,8 300,26 258,44 216,26"
          fill={t.terra}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="258,15 284,26 258,37 232,26"
          fill={t.cream}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="258,21 270,26 258,31 246,26"
          fill={t.blue}
          strokeWidth="2"
          {...o}
        />
      </pattern>

      {/* floor frieze, row one: blue ground, green and cream triangles */}
      <pattern
        id="shelf-fl1"
        x="0"
        y={FLOOR.row1}
        width="92"
        height="30"
        patternUnits="userSpaceOnUse"
      >
        <rect width="92" height="30" fill={t.blue} />
        <polygon
          points="4,30 26,2 48,30"
          fill={t.green}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="48,0 92,0 70,28"
          fill={t.cream}
          strokeWidth="2"
          {...o}
        />
      </pattern>
      {/* row two: cream ground, blue triangles */}
      <pattern
        id="shelf-fl2"
        x="0"
        y={FLOOR.row2}
        width="92"
        height="27"
        patternUnits="userSpaceOnUse"
      >
        <rect width="92" height="27" fill={t.cream} />
        <polygon
          points="26,27 46,3 66,27"
          fill={t.blue}
          strokeWidth="2"
          {...o}
        />
      </pattern>
      {/* bottom bar: nested diamonds and chevrons, 172 x 43 */}
      <pattern
        id="shelf-bar"
        x="0"
        y={FLOOR.bar}
        width="172"
        height="43"
        patternUnits="userSpaceOnUse"
      >
        <rect width="172" height="43" fill={t.cream} />
        <rect width="86" height="43" fill={t.terra} />
        <polygon
          points="43,1 85,21.5 43,42 1,21.5"
          fill={t.blue}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="43,8 71,21.5 43,35 15,21.5"
          fill={t.gold}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="43,14 57,21.5 43,29 29,21.5"
          fill={t.terra}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="43,18 49,21.5 43,25 37,21.5"
          fill={t.cream}
          strokeWidth="1.5"
          {...o}
        />
        <polygon
          points="96,2 116,2 136,21.5 116,41 96,41 116,21.5"
          fill={t.blue}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="118,2 138,2 158,21.5 138,41 118,41 138,21.5"
          fill={t.green}
          strokeWidth="2"
          {...o}
        />
        <polygon
          points="140,2 160,2 172,14 172,29 160,41 140,41 160,21.5"
          fill={t.gold}
          strokeWidth="2"
          {...o}
        />
      </pattern>

      {/* side strips: nested triangle lines in the wall's own shade */}
      <pattern
        id="shelf-side"
        x="0"
        y="56"
        width="50"
        height="60"
        patternUnits="userSpaceOnUse"
      >
        <polygon
          points="5,2 45,30 5,58"
          fill="none"
          stroke={t.shade}
          strokeWidth="2.5"
        />
        <polygon
          points="13,14 33,30 13,46"
          fill="none"
          stroke={t.shade}
          strokeWidth="2"
        />
        <polygon
          points="45,2 5,30 45,58"
          fill="none"
          stroke={t.shade}
          strokeOpacity="0.55"
          strokeWidth="1.5"
        />
      </pattern>

      {/* bookcase frame stripes, kente-like, 8 units wide */}
      <pattern
        id="shelf-fv"
        width="8"
        height="40"
        patternUnits="userSpaceOnUse"
      >
        <rect width="8" height="40" fill={t.cream} />
        <rect width="8" height="7" fill={t.blue} />
        <rect y="11" width="8" height="6" fill={t.terra} />
        <rect y="21" width="8" height="7" fill={t.green} />
        <rect y="31" width="8" height="6" fill={t.gold} />
      </pattern>
      <pattern
        id="shelf-fh"
        width="40"
        height="9"
        patternUnits="userSpaceOnUse"
      >
        <rect width="40" height="9" fill={t.cream} />
        <rect width="7" height="9" fill={t.blue} />
        <rect x="11" width="6" height="9" fill={t.terra} />
        <rect x="21" width="7" height="9" fill={t.green} />
        <rect x="31" width="6" height="9" fill={t.gold} />
      </pattern>

      {/* pin board cloth: ring and dot, after adire */}
      <pattern
        id="shelf-adire"
        width="34"
        height="34"
        patternUnits="userSpaceOnUse"
      >
        <circle
          cx="17"
          cy="17"
          r="12"
          fill="none"
          stroke={t.cream}
          strokeOpacity="0.38"
          strokeWidth="2"
        />
        <circle
          cx="17"
          cy="17"
          r="6"
          fill="none"
          stroke={t.terra}
          strokeOpacity="0.9"
          strokeWidth="2"
        />
        <circle cx="17" cy="17" r="2" fill={t.gold} />
        <circle cx="0" cy="0" r="3" fill={t.gold} fillOpacity="0.8" />
        <circle cx="34" cy="34" r="3" fill={t.gold} fillOpacity="0.8" />
        <circle cx="34" cy="0" r="3" fill={t.terra} fillOpacity="0.8" />
        <circle cx="0" cy="34" r="3" fill={t.terra} fillOpacity="0.8" />
      </pattern>
    </defs>
  );
}

/** wall, light, side strips, top band, floor friezes and counter plate */
export function Room({ t }: { t: Tones }) {
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

      <rect y="56" width="50" height="603" fill="url(#shelf-side)" />
      <rect x="1326" y="56" width="50" height="603" fill="url(#shelf-side)" />

      <rect width={SCENE_WIDTH} height={TOP_BAND.h} fill="url(#shelf-top)" />
      <rect
        y={TOP_BAND.h}
        width={SCENE_WIDTH}
        height={TOP_BAND.rule}
        fill={t.ink}
      />

      <rect y={FLOOR.top} width={SCENE_WIDTH} height="3" fill={t.ink} />
      <rect
        y={FLOOR.row1}
        width={SCENE_WIDTH}
        height="30"
        fill="url(#shelf-fl1)"
      />
      <rect y={FLOOR.mid} width={SCENE_WIDTH} height="3" fill={t.ink} />
      <rect
        y={FLOOR.row2}
        width={SCENE_WIDTH}
        height="27"
        fill="url(#shelf-fl2)"
      />
      <rect y={FLOOR.rule2} width={SCENE_WIDTH} height="3" fill={t.ink} />
      <rect
        y={FLOOR.bar}
        width={SCENE_WIDTH}
        height={SCENE_HEIGHT - FLOOR.bar}
        fill="url(#shelf-bar)"
      />
      <rect
        x={COUNTER_PLATE.x}
        y={COUNTER_PLATE.y}
        width={COUNTER_PLATE.w}
        height={SCENE_HEIGHT - COUNTER_PLATE.y}
        fill={t.floor}
        stroke={t.ink}
        strokeWidth="2"
      />
    </g>
  );
}

const PLATED = new Set([486, 604]);

/**
 * The four bookcase bays: frame, back, planks, and the objects standing on
 * top. Books are HTML buttons laid over this (see `books.tsx`).
 */
export function Bookcases({ t }: { t: Tones }) {
  return (
    <g>
      {BAY_GEOMETRY.map((g, i) => {
        const x = g.x - 8;
        const w = g.w + 16;
        const top = BAY_TOPS[i];
        return (
          <g key={i}>
            <rect
              x={x}
              y={top}
              width={w}
              height={BAY_BOTTOM - top}
              fill={t.ink}
              stroke={t.ink}
              strokeWidth="2.5"
            />
            <rect
              x={g.x}
              y={top + 9}
              width={g.w}
              height={BAY_BOTTOM - top - 9}
              fill={t.back}
            />
            <rect
              x={x}
              y={top}
              width="8"
              height={BAY_BOTTOM - top}
              fill="url(#shelf-fv)"
            />
            <rect
              x={x + w - 8}
              y={top}
              width="8"
              height={BAY_BOTTOM - top}
              fill="url(#shelf-fv)"
            />
            <rect x={x} y={top} width={w} height="9" fill="url(#shelf-fh)" />
            {g.rows.map(row => (
              <Plank
                key={row}
                t={t}
                x={g.x}
                w={g.w}
                y={row}
                plated={PLATED.has(row)}
              />
            ))}
          </g>
        );
      })}
      <VaseTop t={t} />
      <Dome t={t} />
      <Finial t={t} />
      <Globe t={t} />
    </g>
  );
}

function Plank({
  t,
  x,
  w,
  y,
  plated,
}: {
  t: Tones;
  x: number;
  w: number;
  y: number;
  plated: boolean;
}) {
  const pw = Math.round(w * 0.56);
  const cx = x + w / 2;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={PLANK_HEIGHT}
        fill={t.gold}
        stroke={t.ink}
        strokeWidth="1.5"
      />
      {plated ? (
        <>
          <rect x={x + 3} y={y + 2.5} width={w - 6} height="5" fill={t.terra} />
          <rect
            x={cx - pw / 2}
            y={y + 1.5}
            width={pw}
            height="7"
            fill={t.blue}
            stroke={t.ink}
            strokeWidth="1"
          />
          {[-1, 0, 1].map(k => (
            <rect
              key={k}
              x={cx + k * (pw / 4) - 3}
              y={y + 4}
              width="6"
              height="2"
              fill={t.cream}
            />
          ))}
        </>
      ) : null}
    </g>
  );
}

function VaseTop({ t }: { t: Tones }) {
  const cx = 929;
  const cy = 336;
  return (
    <g>
      <ellipse
        cx={cx}
        cy="291"
        rx="16"
        ry="4"
        fill={t.terra}
        stroke={t.ink}
        strokeWidth="2"
      />
      <polygon
        points="915,292 943,292 948,305 910,305"
        fill={t.terra}
        stroke={t.ink}
        strokeWidth="2"
      />
      <clipPath id="shelf-clip-vase">
        <ellipse cx={cx} cy={cy} rx="36" ry="32" />
      </clipPath>
      <g clipPath="url(#shelf-clip-vase)">
        <rect x="890" y="300" width="80" height="72" fill={t.terra} />
        <rect x="890" y="312" width="80" height="6" fill={t.gold} />
        <rect x="890" y="354" width="80" height="6" fill={t.gold} />
        <rect x="890" y="318" width="80" height="36" fill={t.cream} />
        {[0, 1, 2, 3, 4, 5].map(k => (
          <polygon
            key={k}
            points={`${896 + k * 14},336 ${903 + k * 14},325 ${910 + k * 14},336 ${903 + k * 14},347`}
            fill={k % 2 ? t.green : t.blue}
            stroke={t.ink}
            strokeWidth="1.5"
          />
        ))}
        <line
          x1="890"
          y1="318"
          x2="970"
          y2="318"
          stroke={t.ink}
          strokeWidth="2"
        />
        <line
          x1="890"
          y1="354"
          x2="970"
          y2="354"
          stroke={t.ink}
          strokeWidth="2"
        />
      </g>
      <ellipse
        cx={cx}
        cy={cy}
        rx="36"
        ry="32"
        fill="none"
        stroke={t.ink}
        strokeWidth="2.5"
      />
    </g>
  );
}

function Dome({ t }: { t: Tones }) {
  return (
    <g stroke={t.ink} strokeWidth="2">
      <path d="M1003,512 C1003,490 1043,490 1043,512 Z" fill={t.gold} />
      <path d="M1011,512 C1011,498 1035,498 1035,512 Z" fill={t.terra} />
      <path d="M1018,512 C1018,505 1028,505 1028,512 Z" fill={t.green} />
    </g>
  );
}

function Finial({ t }: { t: Tones }) {
  return (
    <g>
      <rect
        x="1094"
        y="197"
        width="70"
        height="16"
        fill={t.terra}
        stroke={t.ink}
        strokeWidth="2.5"
      />
      {[0, 1, 2, 3].map(k => (
        <polygon
          key={k}
          points={`${1098 + k * 16},205 ${1106 + k * 16},199 ${1114 + k * 16},205 ${1106 + k * 16},211`}
          fill={k % 2 ? t.cream : t.green}
          stroke={t.ink}
          strokeWidth="1.2"
        />
      ))}
      <rect
        x="1121"
        y="190"
        width="16"
        height="8"
        fill={t.terra}
        stroke={t.ink}
        strokeWidth="2"
      />
      <clipPath id="shelf-clip-finial">
        <ellipse cx="1129" cy="170" rx="20" ry="24" />
      </clipPath>
      <g clipPath="url(#shelf-clip-finial)">
        <rect x="1105" y="144" width="48" height="52" fill={t.terra} />
        <rect x="1105" y="154" width="48" height="6" fill={t.gold} />
        <rect x="1105" y="160" width="48" height="14" fill={t.cream} />
        <polygon
          points="1109,174 1119,162 1129,174 1139,162 1149,174"
          fill={t.blue}
          stroke={t.ink}
          strokeWidth="1.2"
        />
        <rect x="1105" y="178" width="48" height="5" fill={t.green} />
      </g>
      <ellipse
        cx="1129"
        cy="170"
        rx="20"
        ry="24"
        fill="none"
        stroke={t.ink}
        strokeWidth="2.5"
      />
      <ellipse
        cx="1129"
        cy="147"
        rx="8"
        ry="3"
        fill={t.gold}
        stroke={t.ink}
        strokeWidth="1.5"
      />
    </g>
  );
}

function Globe({ t }: { t: Tones }) {
  const cx = 1250;
  const cy = 285;
  const gores = [
    t.blue,
    t.gold,
    t.terra,
    t.green,
    t.blue,
    t.gold,
    t.terra,
    t.green,
  ];
  return (
    <g>
      <ellipse
        cx="1253"
        cy="353"
        rx="24"
        ry="5"
        fill={t.terra}
        stroke={t.ink}
        strokeWidth="2"
      />
      <rect x="1249" y="324" width="8" height="28" fill={t.ink} />
      <clipPath id="shelf-clip-globe">
        <circle cx={cx} cy={cy} r="40" />
      </clipPath>
      <g clipPath="url(#shelf-clip-globe)">
        <g transform={`rotate(-20 ${cx} ${cy})`}>
          {gores.map((c, k) => (
            <rect
              key={k}
              x={cx - 44 + k * 11}
              y={cy - 46}
              width="11"
              height="92"
              fill={c}
              stroke={t.ink}
              strokeWidth="1"
            />
          ))}
          <rect
            x={cx - 46}
            y={cy - 8}
            width="92"
            height="16"
            fill={t.cream}
            stroke={t.ink}
            strokeWidth="1.5"
          />
          <polyline
            points={Array.from(
              { length: 12 },
              (_, k) => `${cx - 44 + k * 8},${k % 2 ? cy + 5 : cy - 5}`
            ).join(' ')}
            fill="none"
            stroke={t.ink}
            strokeWidth="1.5"
          />
        </g>
      </g>
      <circle
        cx={cx}
        cy={cy}
        r="40"
        fill="none"
        stroke={t.ink}
        strokeWidth="2.5"
      />
      <path
        d="M1272,243 C1318,262 1316,326 1260,342"
        fill="none"
        stroke={t.ink}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M1272,243 C1318,262 1316,326 1260,342"
        fill="none"
        stroke={t.terra}
        strokeWidth="5"
        strokeLinecap="round"
      />
    </g>
  );
}
