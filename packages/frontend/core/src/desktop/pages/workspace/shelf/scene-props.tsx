import type { Tones } from './scene-room';

/** floating shelf with plant, radio and a book, plus the hanging vines */
export function ShelfWithThings({ t }: { t: Tones }) {
  const o = { stroke: t.ink, strokeWidth: 1.5 };
  return (
    <g>
      {[110, 411].map(x => (
        <g key={x}>
          <rect x={x} y="199" width="23" height="47" fill={t.ink} />
          <polygon
            points={`${x + 2},201 ${x + 21},201 ${x + 11.5},214`}
            fill={t.terra}
          />
          <polygon
            points={`${x + 11.5},214 ${x + 21},223 ${x + 11.5},232 ${x + 2},223`}
            fill={t.green}
            stroke={t.cream}
            strokeWidth="0.8"
          />
          <polygon
            points={`${x + 2},244 ${x + 21},244 ${x + 11.5},232`}
            fill={t.gold}
          />
        </g>
      ))}
      <rect
        x="69"
        y="178"
        width="406"
        height="21"
        rx="2"
        fill={t.blue}
        stroke={t.ink}
        strokeWidth="2.5"
      />
      <g {...o}>
        <polygon points="76,188.5 90,181 90,196" fill={t.gold} />
        <polygon points="112,181 126,188.5 112,196" fill={t.terra} />
        <polygon points="132,181 146,188.5 132,196" fill={t.terra} />
        <polygon points="187,188.5 205,181 223,188.5 205,196" fill={t.terra} />
        <polygon points="252,188.5 280,181 308,188.5 280,196" fill={t.gold} />
        <polygon points="345,188.5 365,181 385,188.5 365,196" fill={t.terra} />
        <polygon points="413,181 399,188.5 413,196" fill={t.terra} />
        <polygon points="468,181 454,188.5 468,196" fill={t.gold} />
      </g>
      <circle cx="100" cy="188.5" r="2" fill={t.ink} />

      {/* vines first, so the pot and leaves sit over them */}
      <g fill="none" stroke={t.green} strokeWidth="2.5" strokeLinecap="round">
        <path d="M180,168 C160,200 150,255 158,303" />
        <path d="M203,172 C207,205 200,250 203,288" />
        <path d="M226,160 C256,176 254,210 249,240" />
      </g>
      <polygon
        points="171,140 230,140 222,178 179,178"
        fill={t.terra}
        stroke={t.ink}
        strokeWidth="2.5"
      />
      <ellipse cx="200.5" cy="140" rx="29.5" ry="5" fill={t.ink} />
      <rect
        x="176"
        y="156"
        width="49"
        height="5"
        fill={t.gold}
        fillOpacity="0.9"
      />
      {[
        [190, 130],
        [183, 170],
        [162, 232],
        [158, 296],
        [204, 196],
        [202, 262],
        [233, 168],
        [249, 233],
        [172, 200],
      ].map(([x, y]) => (
        <ellipse
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          rx="11"
          ry="5.5"
          fill={t.green}
          stroke={t.ink}
          strokeWidth="1.5"
        />
      ))}

      {/* radio */}
      <line
        x1="290"
        y1="111"
        x2="360"
        y2="82"
        stroke={t.ink}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="360" cy="82" r="2.5" fill={t.ink} />
      <rect
        x="264"
        y="110"
        width="115"
        height="68"
        rx="11"
        fill={t.blue}
        stroke={t.ink}
        strokeWidth="2.5"
      />
      <rect
        x="273"
        y="118"
        width="48"
        height="17"
        fill={t.gold}
        stroke={t.ink}
        strokeWidth="1.5"
      />
      <rect
        x="321"
        y="118"
        width="50"
        height="17"
        fill={t.terra}
        stroke={t.ink}
        strokeWidth="1.5"
      />
      <rect x="320" y="118" width="2" height="17" fill={t.cream} />
      {[0, 1, 2, 3, 4, 5, 6].map(k => (
        <line
          key={k}
          x1={279 + k * 6.5}
          y1="121"
          x2={279 + k * 6.5}
          y2="131"
          stroke={t.ink}
          strokeWidth="1"
        />
      ))}
      <rect
        x="270"
        y="143"
        width="68"
        height="29"
        fill={t.green}
        stroke={t.ink}
        strokeWidth="1.5"
      />
      <polyline
        points="272,166 281,148 290,166 299,148 308,166 317,148 326,166 335,148"
        fill="none"
        stroke={t.gold}
        strokeWidth="3"
      />
      <polyline
        points="272,150 281,166 290,150 299,166 308,150 317,166 326,150 335,166"
        fill="none"
        stroke={t.terra}
        strokeWidth="2"
      />
      <circle
        cx="351"
        cy="156"
        r="14"
        fill={t.terra}
        stroke={t.gold}
        strokeWidth="3"
      />
      <circle
        cx="351"
        cy="156"
        r="6"
        fill={t.gold}
        stroke={t.ink}
        strokeWidth="1.5"
      />

      {/* book lying on the shelf */}
      <rect
        x="391"
        y="159"
        width="76"
        height="19"
        fill={t.terra}
        stroke={t.ink}
        strokeWidth="2"
      />
      <rect
        x="397"
        y="163"
        width="68"
        height="11"
        fill={t.cream}
        stroke={t.ink}
        strokeWidth="1"
      />
      <line
        x1="399"
        y1="167"
        x2="463"
        y2="167"
        stroke={t.ink}
        strokeOpacity="0.5"
        strokeWidth="1"
      />
      <line
        x1="399"
        y1="171"
        x2="463"
        y2="171"
        stroke={t.ink}
        strokeOpacity="0.5"
        strokeWidth="1"
      />
      <rect
        x="398"
        y="166"
        width="6"
        height="16"
        fill={t.gold}
        stroke={t.ink}
        strokeWidth="1.2"
      />
    </g>
  );
}

/** wall art left of the pin board: layered diamonds, original geometry */
export function RugPanel({ t }: { t: Tones }) {
  const cx = 111.5;
  const cy = 367;
  const layers: [number, number, string][] = [
    [38, 54, t.blue],
    [32, 46, t.cream],
    [27, 39, t.terra],
    [21, 31, t.green],
    [15, 22, t.gold],
    [9, 14, t.blue],
    [4, 7, t.cream],
  ];
  return (
    <g>
      <rect x="67" y="306" width="89" height="122" fill={t.ink} />
      <rect x="71" y="310" width="81" height="114" fill={t.cream} />
      <polygon points="71,310 90,310 71,329" fill={t.green} />
      <polygon points="152,310 133,310 152,329" fill={t.green} />
      <polygon points="71,424 90,424 71,405" fill={t.green} />
      <polygon points="152,424 133,424 152,405" fill={t.green} />
      {layers.map(([hw, hh, fill]) => (
        <polygon
          key={hw}
          points={`${cx},${cy - hh} ${cx + hw},${cy} ${cx},${cy + hh} ${cx - hw},${cy}`}
          fill={fill}
          stroke={t.ink}
          strokeWidth="1.8"
        />
      ))}
    </g>
  );
}

/** frame and cloth of the pin board. Notes are buttons laid over it. */
export function PinBoardFrame({ t }: { t: Tones }) {
  return (
    <g>
      <rect
        x="219"
        y="264"
        width="209"
        height="26"
        fill={t.cream}
        stroke={t.ink}
        strokeWidth="1.5"
      />
      <rect x="171" y="289" width="302" height="186" fill={t.ink} />
      <rect x="176" y="294" width="292" height="176" fill={t.blue} />
      <rect
        x="176"
        y="294"
        width="292"
        height="176"
        fill={t.ink}
        fillOpacity="0.55"
      />
      <rect x="176" y="294" width="292" height="176" fill="url(#shelf-adire)" />
      <rect
        x="181"
        y="300"
        width="282"
        height="165"
        fill="none"
        stroke={t.ink}
        strokeWidth="3"
      />
    </g>
  );
}

/** the loose taped card to the right of the board */
export function StickyCard({ t }: { t: Tones }) {
  const bars = [t.gold, t.ink, t.terra, t.gold, t.ink, t.gold];
  return (
    <g transform="rotate(5 528 378)">
      <rect
        x="487"
        y="347"
        width="82"
        height="64"
        fill={t.cream}
        stroke={t.ink}
        strokeWidth="1.5"
      />
      <rect
        x="512"
        y="340"
        width="32"
        height="10"
        fill={t.shade}
        fillOpacity="0.85"
      />
      {[0, 1].map(r =>
        bars.map((c, k) => (
          <rect
            key={`${r}-${k}`}
            x={496 + k * 10}
            y={357 + r * 8}
            width="10"
            height="8"
            fill={r ? bars[(k + 2) % 6] : c}
          />
        ))
      )}
      <rect
        x="496"
        y="357"
        width="60"
        height="16"
        fill="none"
        stroke={t.ink}
        strokeWidth="1"
      />
      <rect
        x="496"
        y="383"
        width="46"
        height="4"
        fill={t.ink}
        fillOpacity="0.45"
      />
      <rect
        x="496"
        y="393"
        width="32"
        height="4"
        fill={t.ink}
        fillOpacity="0.45"
      />
    </g>
  );
}
