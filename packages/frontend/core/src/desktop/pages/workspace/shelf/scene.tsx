import type { ShelfPalette } from '@affine/core/modules/shelf';
import { SCENE_HEIGHT, SCENE_WIDTH } from '@affine/core/modules/shelf';
import type { ReactElement } from 'react';

const PAPER = '#F6EFDD';

/**
 * Decorative backdrop of the Shelf home: wall, light shaft, floating shelf,
 * plant, pin-board frame, bookcase frame and the eagle. It draws no books and
 * no notes; those are real buttons layered on top (see `books.tsx`), so the
 * art can change without touching behaviour.
 *
 * Patterns are drawn, not copied: a triangle frieze after Ndebele house
 * painting, block stripes after kente weaving and ring-and-dot cloth after
 * Yoruba adire. None of them is a sacred or Adinkra symbol.
 */
export function ShelfScene({ palette: p }: { palette: ShelfPalette }) {
  const [b0, , , b3, b4] = p.books;
  return (
    <svg
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      style={{ display: 'block' }}
    >
      <defs>
        <pattern
          id="shelf-nd"
          width="52"
          height="52"
          patternUnits="userSpaceOnUse"
        >
          <rect width="52" height="52" fill={PAPER} />
          <polygon
            points="0,52 26,6 52,52"
            fill={b0}
            stroke={p.ink}
            strokeWidth="3"
          />
          <polygon
            points="13,52 26,28 39,52"
            fill={p.leaf}
            stroke={p.ink}
            strokeWidth="2.5"
          />
          <rect x="0" y="0" width="52" height="4" fill={p.ink} />
        </pattern>
        <pattern
          id="shelf-kt"
          width="32"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <rect x="0" y="0" width="8" height="8" fill={p.gold} />
          <rect x="8" y="0" width="8" height="8" fill={p.ink} />
          <rect x="16" y="0" width="8" height="8" fill={p.edge} />
          <rect x="24" y="0" width="8" height="8" fill={p.gold} />
          <rect x="0" y="3" width="32" height="2" fill={b3} />
        </pattern>
        <pattern
          id="shelf-ad"
          width="26"
          height="26"
          patternUnits="userSpaceOnUse"
        >
          <circle
            cx="13"
            cy="13"
            r="8"
            fill="none"
            stroke={PAPER}
            strokeOpacity="0.35"
            strokeWidth="2"
          />
          <circle cx="0" cy="0" r="2.5" fill={PAPER} fillOpacity="0.35" />
          <circle cx="26" cy="26" r="2.5" fill={PAPER} fillOpacity="0.35" />
        </pattern>
        <ellipse id="shelf-leaf" rx="8" ry="4" fill={p.leaf} />
      </defs>

      {/* wall, light, floor */}
      <rect x="0" y="0" width="1200" height="600" fill={p.wall} />
      <polygon
        points="300,0 560,0 470,548 210,548"
        fill={p.light}
        fillOpacity="0.5"
      />
      <polygon
        points="400,0 424,0 334,548 310,548"
        fill={p.wallShade}
        fillOpacity="0.35"
      />
      <polygon
        points="470,0 486,0 396,548 380,548"
        fill={p.wallShade}
        fillOpacity="0.3"
      />
      <rect x="0" y="548" width="1200" height="52" fill="url(#shelf-nd)" />
      <rect x="0" y="596" width="1200" height="8" fill={p.ink} />
      <rect x="0" y="604" width="1200" height="36" fill={p.floor} />
      <rect x="0" y="0" width="1200" height="8" fill="url(#shelf-kt)" />

      {/* floating shelf with plant and frames */}
      <rect
        x="70"
        y="150"
        width="320"
        height="14"
        fill={p.shelf}
        stroke={p.ink}
        strokeWidth="2"
      />
      <rect x="70" y="150" width="320" height="8" fill="url(#shelf-kt)" />
      <polygon
        points="144,150 192,150 186,118 150,118"
        fill={p.pot}
        stroke={p.ink}
        strokeWidth="2"
      />
      <path
        d="M160,120 C130,150 126,200 134,250"
        fill="none"
        stroke={p.leaf}
        strokeWidth="2.5"
      />
      <path
        d="M170,120 C176,170 168,220 176,278"
        fill="none"
        stroke={p.leaf}
        strokeWidth="2.5"
      />
      <path
        d="M180,120 C206,150 214,190 206,232"
        fill="none"
        stroke={p.leaf}
        strokeWidth="2.5"
      />
      {[
        [138, 160],
        [132, 196],
        [134, 236],
        [174, 170],
        [170, 212],
        [176, 262],
        [204, 150],
        [210, 186],
        [206, 224],
        [158, 132],
        [182, 136],
      ].map(([x, y]) => (
        <use key={`${x}-${y}`} href="#shelf-leaf" x={x} y={y} />
      ))}
      <ellipse cx="168" cy="118" rx="20" ry="4" fill={p.ink} />
      <rect x="226" y="88" width="38" height="62" fill={p.ink} />
      <g transform="translate(231,93)">
        <rect width="28" height="52" fill="url(#shelf-kt)" />
      </g>
      <rect x="282" y="102" width="34" height="48" fill={p.ink} />
      <rect x="286" y="106" width="26" height="40" fill={p.edge} />
      <circle
        cx="299"
        cy="126"
        r="9"
        fill="none"
        stroke={PAPER}
        strokeOpacity="0.6"
        strokeWidth="2"
      />
      <circle cx="299" cy="126" r="3" fill={p.gold} />

      {/* art panel (original geometry, replaces the poster) */}
      <rect x="56" y="248" width="76" height="104" fill={p.ink} />
      <rect x="60" y="252" width="68" height="96" fill={PAPER} />
      <polygon
        points="94,258 122,300 94,342 66,300"
        fill={b0}
        stroke={p.ink}
        strokeWidth="3"
      />
      <polygon
        points="94,274 112,300 94,326 76,300"
        fill={p.leaf}
        stroke={p.ink}
        strokeWidth="3"
      />
      <polygon
        points="94,288 102,300 94,312 86,300"
        fill={p.gold}
        stroke={p.ink}
        strokeWidth="2.5"
      />

      {/* pin board frame; notes are buttons layered on top */}
      <rect
        x="146"
        y="236"
        width="258"
        height="154"
        fill={p.edge}
        stroke={p.ink}
        strokeWidth="2"
      />
      <rect x="154" y="244" width="242" height="138" fill={p.board} />
      <rect x="154" y="244" width="242" height="138" fill="url(#shelf-ad)" />
      <rect
        x="186"
        y="214"
        width="180"
        height="22"
        fill={PAPER}
        stroke={p.ink}
        strokeWidth="1.5"
      />

      {/* bookcase: back panels, planks, posts. Books are HTML buttons. */}
      <g fill={p.wallShade} fillOpacity="0.55">
        <rect x="738" y="318" width="90" height="282" />
        <rect x="828" y="438" width="75" height="162" />
        <rect x="903" y="188" width="105" height="412" />
        <rect x="1008" y="308" width="100" height="292" />
      </g>
      <rect x="766" y="308" width="78" height="284" fill={p.back} />
      <rect x="856" y="428" width="63" height="164" fill={p.back} />
      <rect x="931" y="178" width="93" height="414" fill={p.back} />
      <rect x="1036" y="298" width="88" height="294" fill={p.back} />
      <g fill={p.shelf} stroke={p.ink} strokeWidth="2">
        {[300, 400, 500, 592].map(y => (
          <rect key={`a${y}`} x="760" y={y} width="90" height="8" />
        ))}
        {[420, 500, 592].map(y => (
          <rect key={`b${y}`} x="850" y={y} width="75" height="8" />
        ))}
        {[170, 290, 400, 500, 592].map(y => (
          <rect key={`c${y}`} x="925" y={y} width="105" height="8" />
        ))}
        {[290, 400, 500, 592].map(y => (
          <rect key={`d${y}`} x="1030" y={y} width="100" height="8" />
        ))}
        <rect x="760" y="300" width="6" height="300" />
        <rect x="844" y="300" width="6" height="300" />
        <rect x="919" y="420" width="6" height="180" />
        <rect x="925" y="170" width="6" height="430" />
        <rect x="1024" y="170" width="6" height="430" />
        <rect x="1124" y="290" width="6" height="310" />
      </g>
      <g transform="translate(760,300)">
        <rect width="90" height="8" fill="url(#shelf-kt)" />
      </g>
      <g transform="translate(850,420)">
        <rect width="75" height="8" fill="url(#shelf-kt)" />
      </g>
      <g transform="translate(925,170)">
        <rect width="105" height="8" fill="url(#shelf-kt)" />
      </g>
      <g transform="translate(1030,290)">
        <rect width="100" height="8" fill="url(#shelf-kt)" />
      </g>
      <circle
        cx="805"
        cy="278"
        r="20"
        fill={p.edge}
        stroke={p.ink}
        strokeWidth="2"
      />
      <path
        d="M788,272 C796,262 806,262 812,270 C806,278 796,282 788,272 Z"
        fill={b4}
      />
      <path
        d="M800,290 C808,284 818,284 822,292 C814,298 806,298 800,290 Z"
        fill={b4}
      />
      <path
        d="M870,420 C870,400 904,400 904,420 Z"
        fill={p.gold}
        stroke={p.ink}
        strokeWidth="2"
      />
      <rect
        x="948"
        y="156"
        width="58"
        height="14"
        fill={p.edge}
        stroke={p.ink}
        strokeWidth="2"
      />

      {/* eagle on its post */}
      <ellipse
        cx="562"
        cy="602"
        rx="56"
        ry="6"
        fill={p.ink}
        fillOpacity="0.2"
      />
      <rect
        x="546"
        y="528"
        width="32"
        height="72"
        fill={p.edge}
        stroke={p.ink}
        strokeWidth="2"
      />
      <polygon
        points="552,478 578,478 584,522 566,530 548,522"
        fill="#F4EFE6"
        stroke={p.ink}
        strokeOpacity="0.6"
        strokeWidth="1.5"
      />
      <ellipse
        cx="564"
        cy="446"
        rx="30"
        ry="52"
        fill="#4A3426"
        transform="rotate(6 564 446)"
      />
      <path
        d="M548,410 C532,444 540,490 568,508 C586,472 588,432 574,410 Z"
        fill="#3A2820"
      />
      <path
        d="M552,430 L566,452 M548,450 L562,474 M552,470 L568,490"
        fill="none"
        stroke="#5B4332"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <ellipse cx="552" cy="408" rx="17" ry="14" fill="#FBF7EE" />
      <circle cx="548" cy="386" r="20" fill="#FBF7EE" />
      <path
        d="M533,380 C522,378 514,384 515,393 C516,399 520,404 523,410 C526,402 531,398 534,394 Z"
        fill="#E8B923"
        stroke="#B8860B"
        strokeWidth="1.5"
      />
      <circle cx="542" cy="380" r="3" fill={p.ink} />
      <path
        d="M533,374 Q542,371 551,377"
        fill="none"
        stroke={p.ink}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M538,408 C546,414 556,414 564,408"
        fill="none"
        stroke={p.gold}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="552" y="500" width="8" height="22" fill="#E8B923" />
      <rect x="566" y="500" width="8" height="22" fill="#E8B923" />
      <rect
        x="534"
        y="520"
        width="52"
        height="12"
        fill={p.gold}
        stroke={p.ink}
        strokeWidth="2"
      />
    </svg>
  ) as ReactElement;
}
