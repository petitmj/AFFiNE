import type { Tones } from './scene-room';

const BODY = '#3A2B2B';
const WING = '#4B3B3C';
const SHADOW = '#2A1B14';
const SPOT = '#8E7B86';
const HEAD = '#FBF7EE';
const BEAK = '#E8B923';
const BEAK_EDGE = '#B8860B';
const TAIL = '#CFD2D8';

const tri = (x: number, y: number, s = 4.5) =>
  `${x - s},${y - s * 0.8} ${x + s},${y - s * 0.8} ${x},${y + s * 0.9}`;

const CHEST = [
  [615, 519],
  [628, 519],
  [639, 519],
  [621, 531],
  [634, 530],
  [618, 544],
  [628, 544],
  [639, 543],
  [623, 555],
  [635, 554],
  [633, 565],
];
const WING_SPOTS = [
  [659, 530],
  [671, 533],
  [683, 537],
  [695, 538],
  [665, 542],
  [677, 546],
  [689, 549],
  [697, 527],
];

/**
 * An original bald eagle, drawn here for the Shelf. It perches on a post
 * patterned in the room's own motifs. The click target is a button in
 * index.tsx, laid over this drawing.
 */
export function Eagle({ t }: { t: Tones }) {
  return (
    <g strokeLinejoin="round">
      <g fill={TAIL} stroke={t.ink} strokeWidth="1.5">
        <polygon points="677,598 690,596 697,646 688,650" />
        <polygon points="690,602 703,604 714,646 706,652" fill="#EEF0F2" />
        <polygon points="704,610 716,616 722,644 714,650" />
      </g>
      <path
        d="M611,498 L662,498 C690,506 708,540 720,620 L700,606 C690,615 684,605 678,612 L636,612 C634,596 624,590 614,578 C598,556 596,520 611,498 Z"
        fill={BODY}
        stroke={t.ink}
        strokeWidth="2"
      />
      <path
        d="M600,520 C596,552 610,580 632,596 L636,570 C618,556 608,540 612,500 Z"
        fill={SHADOW}
      />
      <path
        d="M648,502 C676,500 700,520 708,552 L722,620 L690,598 C668,580 650,540 648,502 Z"
        fill={WING}
        stroke={t.ink}
        strokeWidth="2"
      />
      <g fill={SHADOW}>
        <polygon points="690,566 698,566 718,616 708,606" />
        <polygon points="678,574 686,574 704,610 696,602" />
        <polygon points="668,572 674,576 690,604 684,600" />
      </g>
      <g fill={SPOT}>
        {CHEST.map(([x, y]) => (
          <polygon key={`c${x}-${y}`} points={tri(x, y)} />
        ))}
        {WING_SPOTS.map(([x, y]) => (
          <polygon key={`w${x}-${y}`} points={tri(x, y, 4)} />
        ))}
      </g>

      {/* legs and feet */}
      <rect x="632" y="596" width="14" height="18" fill={BODY} />
      <rect x="652" y="596" width="14" height="18" fill={BODY} />
      <g fill={BEAK} stroke={BEAK_EDGE} strokeWidth="1.5">
        <path d="M618,626 C618,616 630,611 642,613 L644,628 L622,630 Z" />
        <path d="M645,626 C646,615 660,610 674,613 L678,628 L648,630 Z" />
      </g>

      {/* head */}
      <path
        d="M612,500 L618,478 C618,458 626,442 645,441 C662,441 672,452 672,468 L670,488 L666,503 L658,494 L650,505 L642,494 L634,505 L626,494 L618,503 Z"
        fill={HEAD}
        stroke={t.ink}
        strokeWidth="2"
      />
      <path d="M613,490 C620,500 628,498 634,492 L626,486 Z" fill="#D9D3DC" />
      <path
        d="M598,462 C598,452 610,451 623,452 L635,456 L633,470 L616,471 C611,472 606,475 602,477 C599,473 598,468 598,462 Z"
        fill={BEAK}
        stroke={BEAK_EDGE}
        strokeWidth="1.5"
      />
      <circle
        cx="634"
        cy="456"
        r="3.5"
        fill="#5B3A1E"
        stroke={t.ink}
        strokeWidth="1"
      />
      <path
        d="M626,453 L643,449"
        stroke={t.ink}
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* post: cap and patterned column */}
      <rect
        x="618"
        y="628"
        width="62"
        height="14"
        fill={t.gold}
        stroke={t.ink}
        strokeWidth="2"
      />
      {[0, 1, 2, 3, 4, 5].map(k => (
        <rect
          key={k}
          x={620 + k * 10}
          y="630"
          width="5"
          height="10"
          fill={k % 2 ? t.terra : t.ink}
        />
      ))}
      <rect x="632" y="642" width="38" height="80" fill={t.ink} />
      <rect x="635" y="645" width="32" height="74" fill={t.cream} />
      <rect x="635" y="645" width="32" height="8" fill={t.green} />
      <rect x="635" y="711" width="32" height="8" fill={t.green} />
      <rect x="635" y="655" width="32" height="3" fill={t.terra} />
      <rect x="635" y="706" width="32" height="3" fill={t.terra} />
      {[
        [26, t.blue],
        [20, t.green],
        [14, t.gold],
        [8, t.terra],
        [3.5, t.cream],
      ].map(([r, c]) => {
        const rr = r as number;
        return (
          <polygon
            key={rr}
            points={`651,${682 - rr * 1.5} ${651 + rr * 0.6},${682} 651,${682 + rr * 1.5} ${651 - rr * 0.6},${682}`}
            fill={c as string}
            stroke={t.ink}
            strokeWidth="1"
          />
        );
      })}
    </g>
  );
}
