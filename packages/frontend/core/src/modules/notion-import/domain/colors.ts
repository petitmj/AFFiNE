/**
 * Notion colour names to AFFiNE tag colours. AFFiNE has ten tag colours and
 * Notion has ten named colours, so the mapping is one to one except brown,
 * which has no counterpart and lands on orange. Colour is cosmetic here: it
 * never changes whether an item counts as mapped.
 */
const TAG = (n: string) => `var(--affine-tag-${n})`;

const TAG_COLORS: Record<string, string> = {
  default: TAG('gray'),
  gray: TAG('gray'),
  brown: TAG('orange'),
  orange: TAG('orange'),
  yellow: TAG('yellow'),
  green: TAG('green'),
  blue: TAG('blue'),
  purple: TAG('purple'),
  pink: TAG('pink'),
  red: TAG('red'),
};

export const tagColor = (notionColor: unknown): string =>
  TAG_COLORS[typeof notionColor === 'string' ? notionColor : 'default'] ??
  TAG_COLORS.default;

/** callout background names AFFiNE accepts; anything else falls back to grey */
const CALLOUT: Record<string, string> = {
  gray_background: 'grey',
  brown_background: 'orange',
  orange_background: 'orange',
  yellow_background: 'yellow',
  green_background: 'green',
  blue_background: 'blue',
  purple_background: 'purple',
  pink_background: 'pink',
  red_background: 'red',
};
export const calloutColor = (notionColor: unknown): string =>
  CALLOUT[typeof notionColor === 'string' ? notionColor : ''] ?? 'grey';
