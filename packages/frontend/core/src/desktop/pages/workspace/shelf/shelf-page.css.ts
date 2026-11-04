// vanilla-extract styling - the repo's verified styling pattern.
// Visual direction: vibrant geometric patterns, colourful book spines,
// matching the user's reference site (image supplied in chat).
import { style, keyframes } from '@vanilla-extract/css';

export const scene = style({
  position: 'relative',
  height: '100%',
  overflow: 'hidden',
  background: 'linear-gradient(160deg, #f6e7c1 0%, #e9f0d4 55%, #cfe3e8 100%)',
});

export const patternBackdrop = style({
  position: 'absolute',
  inset: '-40px',
  // vibrant geometric pattern: layered repeating gradients (triangles,
  // diamonds, zig-zags in saturated colours) - asset slots can later
  // replace this with the site's SVG tiles without touching the layout.
  backgroundImage: [
    'repeating-linear-gradient(45deg, rgba(230,111,0,.22) 0 14px, transparent 14px 28px)',
    'repeating-linear-gradient(-45deg, rgba(26,140,196,.18) 0 18px, transparent 18px 36px)',
    'repeating-linear-gradient(90deg, rgba(212,63,105,.14) 0 10px, transparent 10px 30px)',
  ],
  transition: 'transform 120ms ease-out',
  zIndex: 0,
});

export const headerRow = style({ display: 'flex', gap: 8, justifyContent: 'flex-end' });

export const welcome = style({
  position: 'absolute', top: '18%', left: 0, right: 0,
  textAlign: 'center', zIndex: 2,
  selectors: {
    '& h1': { fontSize: 34, fontWeight: 700, margin: 0 },
    '& p': { opacity: 0.75, marginTop: 6 },
  },
});

export const shelfZone = style({ position: 'absolute', left: 24, bottom: 24, zIndex: 2, width: '38%' });
export const shelfBoard = style({ display: 'flex', gap: 18, alignItems: 'flex-end', height: 220 });

export const stack = style({
  display: 'flex', flexDirection: 'column-reverse', gap: 2,
  padding: 6, borderRadius: 4,
  background: 'linear-gradient(180deg, #a9714b, #7a4a2b)',
  boxShadow: '0 10px 24px rgba(60,35,10,.35)',
  cursor: 'pointer',
  ':hover': { transform: 'translateY(-4px)' },
  transition: 'transform 150ms ease',
});

export const bookSpine = style({
  width: 26, height: 84, borderRadius: 2,
  // colourful spines rotate per index via inline style variance
  background: 'linear-gradient(180deg, hsl(calc(var(--stack-index, 0) * 47 + 18) 78% 52%), hsl(calc(var(--stack-index, 0) * 47 + 18) 70% 38%))',
  ':hover': { filter: 'brightness(1.15)' },
});

export const pinBoardRow = style({ display: 'flex', gap: 16, marginTop: 14, alignItems: 'flex-start' });

export const plant = style({
  position: 'relative', width: 120, height: 150, flexShrink: 0,
  // plant pot + stems are CSS shapes in v1; replaceable by assets later
  selectors: {
    '::before': { content: '""', position: 'absolute', bottom: 0, left: 30, width: 60, height: 44, background: '#b5583a', borderRadius: '0 0 10px 10px' },
    '::after': { content: '""', position: 'absolute', bottom: 44, left: 57, width: 6, height: 96, background: '#3e7a3e', borderRadius: 3 },
  },
});

const bloom = keyframes({
  '0%': { transform: 'scale(0)' },
  '70%': { transform: 'scale(1.25)' },
  '100%': { transform: 'scale(1)' },
});

export const flower = style({
  position: 'absolute', width: 22, height: 22, border: 'none', cursor: 'pointer',
  background: 'radial-gradient(circle at 35% 35%, #ffd1e0, #e0446f)',
  borderRadius: '50% 50% 50% 4px', // petal shape
  animation: `${bloom} 380ms ease-out both`,
  ':hover': { transform: 'scale(1.2)' },
  selectors: {
    '&:nth-child(1)': { left: 30, top: 20 },
    '&:nth-child(2)': { left: 74, top: 44 },
    '&:nth-child(3)': { left: 46, top: 66 },
    '&:nth-child(4)': { left: 82, top: 12 },
  },
});

export const wateringCan = style({
  position: 'absolute', bottom: 4, right: -6, width: 26, height: 20,
  background: '#5f8aa9', border: 'none', borderRadius: 4, cursor: 'pointer',
});

export const pinBoard = style({
  flex: 1, minHeight: 132,
  background: '#d9b38c',
  border: '8px solid #8a5a34',
  display: 'flex', flexWrap: 'wrap', gap: 10, padding: 12,
  boxShadow: 'inset 0 0 24px rgba(90,50,20,.25)',
});

export const pinnedCard = style({
  position: 'relative', width: 96, padding: 8, border: 'none',
  background: '#fffbe8', boxShadow: '0 2px 6px rgba(0,0,0,.25)',
  transform: 'rotate(-2deg)', cursor: 'pointer',
  selectors: { ':hover': { transform: 'rotate(0deg) scale(1.04)' } },
});

export const pin = style({
  position: 'absolute', top: -6, left: '50%', marginLeft: -5,
  width: 10, height: 10, borderRadius: '50%',
  background: 'radial-gradient(circle at 30% 30%, #ff8fa3, #b3123a)',
});

export const pinnedLabel = style({ fontSize: 11, color: '#6b5b45' });
export const pinBoardEmpty = style({ color: '#7a5f3d', fontSize: 13 });

export const eaglePedestal = style({
  position: 'absolute', right: 48, bottom: 96, zIndex: 2,
  display: 'flex', flexDirection: 'column', alignItems: 'center',
  background: 'none', border: 'none', cursor: 'pointer',
});

export const eagle = style({
  width: 72, height: 72,
  // v1: stylised CSS/SVG eagle silhouette; asset slot for the final art
  background: 'radial-gradient(circle at 40% 40%, #f4f1ea 0 40%, #c9c2b4 41% 100%)',
  clipPath: 'polygon(50% 0, 68% 18%, 88% 30%, 74% 52%, 84% 74%, 50% 66%, 16% 74%, 26% 52%, 12% 30%, 32% 18%)',
  transition: 'transform 200ms ease',
  selectors: { ':hover': { transform: 'scale(1.1) rotate(-6deg)' } },
});

export const eagleLabel = style({
  marginTop: 8, fontSize: 13, fontWeight: 600,
  background: '#fffbe8', padding: '4px 10px', borderRadius: 999,
  boxShadow: '0 2px 8px rgba(0,0,0,.2)',
});

export const easterEgg = style({
  position: 'absolute', width: 14, height: 14, opacity: 0,
  border: 'none', background: 'transparent', cursor: 'pointer',
  selectors: {
    '&:hover': { opacity: 0.35 },
    // each egg positioned by its id via inline --egg-id map in constants
    '&[style*="--egg-id:\'globe\'"]': { right: 160, bottom: 120 },
    '&[style*="--egg-id:\'radio\'"]': { left: 30, bottom: 260 },
    '&[style*="--egg-id:\'teapot\'"]': { left: 120, bottom: 220 },
    '&[style*="--egg-id:\'eagle-feather\'"]': { right: 80, bottom: 220 },
    '&[style*="--egg-id:\'map\'"]': { left: 200, bottom: 60 },
  },
});

export const eggToast = style({
  position: 'absolute', top: 90, left: '50%', transform: 'translateX(-50%)',
  background: 'rgba(30,30,30,.85)', color: '#fff', padding: '6px 14px',
  borderRadius: 8, zIndex: 5,
});

export const hintsOverlay = style({
  position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none',
  background: 'rgba(255, 235, 130, 0.16)',
  outline: '2px dashed rgba(180, 120, 0, .6)',
  display: 'grid', placeItems: 'center', fontWeight: 600,
});

export const discoveryBar = style({
  position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 3,
  display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center',
  padding: 10, background: 'rgba(255,251,232,.8)',
});
