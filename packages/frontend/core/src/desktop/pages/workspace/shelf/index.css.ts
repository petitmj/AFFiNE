import {
  FLOWER_SIZE,
  SCENE_HEIGHT,
  SCENE_WIDTH,
} from '@affine/core/modules/shelf';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, globalStyle, keyframes, style } from '@vanilla-extract/css';

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

/** one scene unit = 1/1376 of the stage width */
const u = (n: number) => `calc(${n} * 100cqw / ${SCENE_WIDTH})`;
const px = (x: number) => `${(x / SCENE_WIDTH) * 100}%`;
const py = (y: number) => `${(y / SCENE_HEIGHT) * 100}%`;

export const root = style({
  // `size` so the stage below can fit the window height as well as its width
  containerType: 'size',
  width: '100%',
  height: '100%',
  overflow: 'auto',
  background: vars.wall,
  color: vars.ink,
  fontFamily: 'Karla, var(--affine-font-family, system-ui), sans-serif',
});

/** the scene fills the window without scrolling: it is centred, and the wall colour covers any spare width or height */
export const rootScene = style({
  overflow: 'hidden',
  display: 'grid',
  placeItems: 'center',
});

export const stage = style({
  position: 'relative',
  // the stage is the container the scene units (cqw) are measured against
  containerType: 'inline-size',
  width: `min(100cqw, calc(100cqh * ${SCENE_WIDTH} / ${SCENE_HEIGHT}))`,
  aspectRatio: `${SCENE_WIDTH} / ${SCENE_HEIGHT}`,
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
const mark = `color-mix(in srgb, ${vars.ink} 55%, transparent)`;
/** spines alternate between two engraved looks so a shelf reads as varied */
export const bookBand = style({
  backgroundImage: [0, 1]
    .map(() => `linear-gradient(${mark}, ${mark})`)
    .join(', '),
  backgroundRepeat: 'no-repeat',
  backgroundSize: '100% 5%, 100% 5%',
  backgroundPosition: '0 16%, 0 84%',
});
export const bookMarked = style({
  backgroundImage: [0, 1, 2]
    .map(() => `linear-gradient(${mark}, ${mark})`)
    .join(', '),
  backgroundRepeat: 'no-repeat',
  backgroundSize: '56% 4%, 40% 4%, 56% 4%',
  backgroundPosition: '50% 38%, 50% 50%, 50% 62%',
});
export const bookFavorite = style({
  boxShadow: `inset 0 ${u(5)} 0 ${vars.gold}`,
});
export const bookUnopened = style({ filter: 'saturate(0.85)' });

export const note = style({
  position: 'absolute',
  boxSizing: 'border-box',
  padding: 0,
  border: `1px solid ${vars.ink}`,
  cursor: 'pointer',
  selectors: { '&:focus-visible': { ...focusRing, zIndex: 3 } },
  '@media': {
    '(prefers-reduced-motion: no-preference)': {
      transition: 'transform 120ms ease-out',
      selectors: { '&:hover': { transform: 'scale(1.06)' } },
    },
  },
});
export const noteArt = style({
  display: 'block',
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
});

export const pinLabel = style({
  position: 'absolute',
  left: px(219),
  top: py(264),
  width: px(209),
  height: py(26),
  // a block, not a flex box: only a block gets the ellipsis when the folder
  // name is long, instead of being cut off on both sides
  display: 'block',
  textAlign: 'center',
  lineHeight: u(26),
  fontSize: `max(9px, ${u(11.5)})`,
  fontWeight: 500,
  letterSpacing: '0.08em',
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
  background: vars.floor,
  borderRadius: '999px',
  padding: '1px 4px',
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
  height: `max(44px, ${u(51)})`,
  padding: `0 max(18px, ${u(24)})`,
  borderRadius: '999px',
  border: `1.5px solid ${vars.ink}`,
  background: vars.paper,
  color: vars.ink,
  fontFamily: 'inherit',
  fontSize: `max(12px, ${u(14.5)})`,
  fontWeight: 500,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  selectors: { '&:focus-visible': focusRing },
});
export const pillDark = style({ background: vars.ink, color: vars.paper });
export const pillAccent = style({
  background: vars.accent,
  color: vars.accentText,
  border: `1.5px solid color-mix(in srgb, ${vars.ink} 40%, ${vars.accent})`,
  letterSpacing: 'normal',
  textTransform: 'none',
  fontWeight: 400,
  fontSize: `max(13px, ${u(17)})`,
  lineHeight: 1.15,
  textAlign: 'center',
  whiteSpace: 'normal',
  padding: '0 12px',
});

export const topRight = style({
  position: 'absolute',
  right: u(31),
  top: u(79),
  display: 'flex',
  gap: u(14),
  zIndex: 5,
});

export const popover = style({
  position: 'absolute',
  right: u(31),
  top: `calc(${u(79 + 51)} + 8px)`,
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
  left: u(66),
  top: u(506),
  margin: 0,
  fontFamily: "'Playfair Display', Georgia, serif",
  fontWeight: 700,
  // sized to end before the eagle (x 590) even where the serif falls back to Georgia
  fontSize: `max(22px, ${u(43)})`,
  whiteSpace: 'nowrap',
  lineHeight: 1.1,
  color: vars.headline,
});
export const subtitle = style({
  position: 'absolute',
  left: u(66),
  top: u(588),
  width: u(440),
  margin: 0,
  fontSize: `max(13px, ${u(17)})`,
  lineHeight: 1.45,
});
export const subtitleEmpty = style({ fontWeight: 700 });
export const counter = style({
  position: 'absolute',
  left: u(66),
  top: py(725),
  height: py(43),
  width: u(263),
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  fontSize: `max(11px, ${u(13.5)})`,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: vars.counter,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
export const eagleHit = style({
  position: 'absolute',
  left: px(590),
  top: py(436),
  width: px(140),
  height: py(286),
  background: 'transparent',
  border: 0,
  cursor: 'pointer',
  borderRadius: '12px',
  selectors: { '&:focus-visible': focusRing },
});
export const eagleNote = style({
  position: 'absolute',
  left: px(612),
  top: py(512),
  width: u(250),
  padding: '10px 12px',
  borderRadius: '12px',
  border: `1.5px solid ${vars.ink}`,
  background: vars.paper,
  color: vars.ink,
  fontSize: `max(12px, ${u(14)})`,
  lineHeight: 1.45,
  zIndex: 6,
});
export const eagleButton = style({
  position: 'absolute',
  left: px(693),
  top: py(451),
  width: px(137),
  height: py(53),
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

/* notification flowers on the plant */
const flowerBloom = keyframes({
  from: { transform: 'translate(-50%, -50%) scale(0.2)' },
  to: { transform: 'translate(-50%, -50%) scale(1)' },
});
export const flowers = style({
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 4,
});
export const flower = style({
  position: 'absolute',
  width: `max(24px, ${u(FLOWER_SIZE)})`,
  height: `max(24px, ${u(FLOWER_SIZE)})`,
  padding: 0,
  border: 0,
  borderRadius: '50%',
  background: 'transparent',
  cursor: 'pointer',
  pointerEvents: 'auto',
  transform: 'translate(-50%, -50%)',
  selectors: {
    '&:focus-visible': focusRing,
    '&[aria-expanded="true"]': { outline: `2px solid ${vars.ink}` },
  },
  '@media': {
    '(prefers-reduced-motion: no-preference)': {
      animation: `${flowerBloom} 420ms ease-out`,
      transition: 'filter 120ms ease-out',
      selectors: { '&:hover': { filter: 'brightness(1.08)' } },
    },
  },
});
export const flowerArt = style({
  display: 'block',
  width: '100%',
  height: '100%',
  overflow: 'visible',
});
export const flowerMore = style({
  position: 'absolute',
  pointerEvents: 'none',
  transform: 'translate(-50%, 0)',
  padding: '1px 8px',
  borderRadius: '999px',
  border: `1.5px solid ${vars.ink}`,
  background: vars.paper,
  color: vars.ink,
  fontSize: `max(10px, ${u(11)})`,
  fontWeight: 700,
  whiteSpace: 'nowrap',
});
export const flowerCard = style({
  position: 'absolute',
  zIndex: 7,
  width: 'min(380px, calc(100% - 24px))',
  boxSizing: 'border-box',
  padding: '8px',
  borderRadius: '12px',
  border: `1.5px solid ${vars.ink}`,
  background: cssVarV2('layer/background/overlayPanel'),
  boxShadow: cssVar('overlayShadow'),
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  selectors: { '&:focus-visible': focusRing },
});
export const flowerCardActions = style({
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
});
export const listNotifications = style({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});
