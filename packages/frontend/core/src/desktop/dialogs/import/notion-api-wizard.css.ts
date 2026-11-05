import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const wizard = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});

export const lead = style({
  fontSize: cssVar('fontSm'),
  lineHeight: cssVar('lineHeight'),
  color: cssVar('textSecondaryColor'),
});

export const field = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  width: '100%',
});

export const label = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  color: cssVar('textPrimaryColor'),
});

export const help = style({
  fontSize: cssVar('fontXs'),
  lineHeight: cssVar('lineHeight'),
  color: cssVar('textSecondaryColor'),
});

const inputBase = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  background: cssVarV2('layer/background/primary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: '8px',
  outline: 'none',
  selectors: {
    '&:focus-visible': {
      borderColor: cssVar('brandColor'),
      boxShadow: `0 0 0 2px ${cssVar('brandColor')}33`,
    },
  },
} as const;

export const input = style(inputBase);
export const textarea = style({
  ...inputBase,
  minHeight: '84px',
  resize: 'vertical',
  fontFamily: 'inherit',
});

export const choice = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  cursor: 'pointer',
});

export const notice = style({
  fontSize: cssVar('fontSm'),
  lineHeight: cssVar('lineHeight'),
  padding: '8px 10px',
  borderRadius: '8px',
  background: cssVarV2('layer/background/secondary'),
  color: cssVar('textPrimaryColor'),
});

export const errorText = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('errorColor'),
  overflowWrap: 'anywhere',
});

export const bar = style({
  width: '100%',
  height: '8px',
  appearance: 'none',
  border: 0,
  borderRadius: '4px',
  overflow: 'hidden',
  background: cssVarV2('layer/background/secondary'),
  selectors: {
    '&::-webkit-progress-bar': {
      background: cssVarV2('layer/background/secondary'),
    },
    '&::-webkit-progress-value': { background: cssVar('brandColor') },
    '&::-moz-progress-bar': { background: cssVar('brandColor') },
  },
});

export const outcomes = style({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
});

export const outcome = style({
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
});

export const outcomeCount = style({ fontWeight: 600 });

export const buttons = style({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'end',
  gap: '12px',
  marginTop: '8px',
});
