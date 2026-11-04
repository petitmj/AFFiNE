import { createVar, globalStyle, style } from '@vanilla-extract/css';

/** palette tokens; values are assigned inline from the active ShelfPalette */
export const vars = {
  wall: createVar(),
  ink: createVar(),
  floor: createVar(),
  headline: createVar(),
  counter: createVar(),
  accent: createVar(),
  accentText: createVar(),
  gold: createVar(),
  paper: createVar(),
};

/** one scene unit = 1/1200 of the stage width */
const u = (n: number) => `calc(${n} * 100cqw / 1200)`;

export const root = style({
  containerType: 'inline-size',
  width: '100%',
  height: '100%',
  overflow: 'auto',
  background: vars.wall,
  color: vars.ink,
  fontFamily: 'Karla, var(--affine-font-family, system-ui), sans-serif',
});

export const stage = style({
  position: 'relative',
  width: '100%',
  aspectRatio: '1200 / 640',
  overflow: 'hidden',
});

export const art = style({ position: 'absolute', inset: 0 });

const focusRing = {
  outline: `3px solid ${vars.accent}`,
  outlineOffset: '2px',
} as const;

export const book = style({
  position: 'absolute',
  boxSizing: 'border-box',
  padding: 0,
  border: `1px solid ${vars.ink}`,
  borderRadius: '1px',
  cursor: 'pointer',
  selectors: {
    '&:focus-visible': { ...focusRing, zIndex: 3 },
  },
  '@media': {
    '(prefers-reduced-motion: no-preference)': {
      transition: 'transform 120ms ease-out',
      selectors: { '&:hover': { transform: 'translateY(-4%)' } },
    },
  },
});
export const bookFavorite = style({
  boxShadow: `inset 0 ${u(5)} 0 ${vars.gold}`,
});
export const bookUnopened = style({ filter: 'saturate(0.85)' });

const line = `color-mix(in srgb, ${vars.ink} 60%, transparent)`;

export const note = style({
  position: 'absolute',
  boxSizing: 'border-box',
  padding: 0,
  border: `1px solid ${vars.ink}`,
  cursor: 'pointer',
  backgroundImage: [0, 1, 2]
    .map(() => `linear-gradient(${line}, ${line})`)
    .join(', '),
  backgroundRepeat: 'no-repeat',
  backgroundSize: '74% 6%, 62% 6%, 68% 6%',
  backgroundPosition: '50% 46%, 50% 64%, 50% 82%',
  selectors: { '&:focus-visible': { ...focusRing, zIndex: 3 } },
  '@media': {
    '(prefers-reduced-motion: no-preference)': {
      transition: 'transform 120ms ease-out',
      selectors: { '&:hover': { transform: 'scale(1.06)' } },
    },
  },
});

export const pinLabel = style({
  position: 'absolute',
  left: `${(186 / 1200) * 100}%`,
  top: `${(214 / 640) * 100}%`,
  width: `${(180 / 1200) * 100}%`,
  height: `${(22 / 640) * 100}%`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: `max(10px, ${u(11)})`,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  padding: '0 4px',
  boxSizing: 'border-box',
});

export const bay = style({ position: 'absolute' });
export const bayLabel = style({
  position: 'absolute',
  left: 0,
  bottom: '100%',
  maxWidth: '240px',
  padding: '2px 6px',
  background: vars.ink,
  color: vars.paper,
  fontSize: '12px',
  fontWeight: 700,
  borderRadius: '4px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  opacity: 0,
  pointerEvents: 'none',
  zIndex: 4,
  selectors: {
    [`${bay}:hover &`]: { opacity: 1 },
    [`${bay}:focus-within &`]: { opacity: 1 },
  },
});

export const pager = style({
  position: 'absolute',
  display: 'flex',
  gap: '2px',
  alignItems: 'center',
  color: vars.counter,
  fontSize: '11px',
  fontWeight: 700,
});
export const pagerButton = style({
  width: '22px',
  height: '22px',
  borderRadius: '999px',
  border: `1px solid ${vars.counter}`,
  background: 'transparent',
  color: vars.counter,
  cursor: 'pointer',
  lineHeight: 1,
  selectors: {
    '&:disabled': { opacity: 0.4, cursor: 'default' },
    '&:focus-visible': focusRing,
  },
});

export const pill = style({
  height: '44px',
  padding: '0 22px',
  borderRadius: '999px',
  border: `1.5px solid ${vars.ink}`,
  background: vars.paper,
  color: vars.ink,
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 700,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  selectors: { '&:focus-visible': focusRing },
});
export const pillDark = style({ background: vars.ink, color: vars.paper });
export const pillAccent = style({
  background: vars.accent,
  color: vars.accentText,
  letterSpacing: 'normal',
  textTransform: 'none',
  padding: '0 18px',
});

export const topRight = style({
  position: 'absolute',
  right: '28px',
  top: '28px',
  display: 'flex',
  gap: '12px',
  zIndex: 5,
});

export const popover = style({
  position: 'absolute',
  right: '28px',
  top: '84px',
  width: 'min(340px, calc(100% - 56px))',
  padding: '16px',
  borderRadius: '12px',
  border: `1.5px solid ${vars.ink}`,
  background: vars.paper,
  color: vars.ink,
  fontSize: '14px',
  lineHeight: 1.5,
  zIndex: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
});
export const popoverRow = style({
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
});
export const chip = style({
  height: '32px',
  padding: '0 12px',
  borderRadius: '999px',
  border: `1.5px solid ${vars.ink}`,
  background: 'transparent',
  color: vars.ink,
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  selectors: {
    '&[aria-pressed="true"]': { background: vars.ink, color: vars.paper },
    '&:focus-visible': focusRing,
  },
});
export const credit = style({ fontSize: '12px', opacity: 0.8 });

export const headline = style({
  position: 'absolute',
  left: u(56),
  top: u(424),
  margin: 0,
  fontFamily: "'Playfair Display', Georgia, serif",
  fontWeight: 500,
  fontSize: `max(26px, ${u(44)})`,
  lineHeight: 1.1,
  color: vars.headline,
});
export const subtitle = style({
  position: 'absolute',
  left: u(56),
  top: u(486),
  width: u(380),
  margin: 0,
  fontSize: `max(13px, ${u(15)})`,
  lineHeight: 1.45,
});
export const counter = style({
  position: 'absolute',
  left: u(56),
  top: u(610),
  margin: 0,
  fontSize: `max(11px, ${u(12)})`,
  fontWeight: 700,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: vars.counter,
  whiteSpace: 'nowrap',
});
export const eagleHit = style({
  position: 'absolute',
  left: `${(520 / 1200) * 100}%`,
  top: `${(370 / 640) * 100}%`,
  width: `${(96 / 1200) * 100}%`,
  height: `${(236 / 640) * 100}%`,
  background: 'transparent',
  border: 0,
  cursor: 'pointer',
  borderRadius: '12px',
  selectors: { '&:focus-visible': focusRing },
});
export const eagleButton = style({
  position: 'absolute',
  left: `${(598 / 1200) * 100}%`,
  top: `${(370 / 640) * 100}%`,
});
export const emptyNote = style({
  position: 'absolute',
  left: u(56),
  top: u(330),
  width: u(560),
  margin: 0,
  fontSize: `max(13px, ${u(15)})`,
  fontWeight: 700,
});

// list view
export const listRoot = style({
  maxWidth: '860px',
  margin: '0 auto',
  padding: '24px 20px 48px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
});
export const listTitle = style({
  margin: 0,
  fontFamily: "'Playfair Display', Georgia, serif",
  fontWeight: 500,
  fontSize: '30px',
  color: vars.headline,
});
export const listSection = style({
  border: `1.5px solid ${vars.ink}`,
  borderRadius: '12px',
  background: vars.paper,
  padding: '12px 16px',
});
export const listHeading = style({
  margin: '0 0 8px',
  fontSize: '16px',
  fontWeight: 700,
});
export const listItems = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gap: '2px',
});
export const listLink = style({
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  border: 0,
  borderRadius: '8px',
  background: 'transparent',
  color: vars.ink,
  fontFamily: 'inherit',
  fontSize: '14px',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      background: `color-mix(in srgb, ${vars.ink} 8%, transparent)`,
    },
    '&:focus-visible': focusRing,
  },
});
export const listMeta = style({
  opacity: 0.7,
  marginLeft: '8px',
  fontSize: '12px',
});
export const listBar = style({
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  alignItems: 'center',
});

globalStyle(`${root} *`, { boxSizing: 'border-box' });
