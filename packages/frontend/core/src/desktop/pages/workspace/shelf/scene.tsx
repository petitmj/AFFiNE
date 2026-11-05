import type { ShelfPalette } from '@affine/core/modules/shelf';
import { SCENE_HEIGHT, SCENE_WIDTH } from '@affine/core/modules/shelf';
import type { ReactElement } from 'react';

import { Eagle } from './scene-eagle';
import {
  PinBoardFrame,
  RugPanel,
  ShelfWithThings,
  StickyCard,
} from './scene-props';
import { Bookcases, Patterns, Room, tonesOf } from './scene-room';

/**
 * Decorative backdrop of the Shelf home, drawn to the proportions of the
 * approved home-page picture: Ndebele top and floor bands, side strips, the
 * floating shelf with plant and radio, the rug panel, the pin board, the
 * four bookcases and the eagle on its post. It draws no books and no notes;
 * those are real buttons layered on top (see `books.tsx`), so the art can
 * change without touching behaviour.
 */
export function ShelfScene({ palette }: { palette: ShelfPalette }) {
  const t = tonesOf(palette);
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
      <Patterns t={t} />
      <Room t={t} />
      <ShelfWithThings t={t} />
      <RugPanel t={t} />
      <PinBoardFrame t={t} />
      <StickyCard t={t} />
      <Eagle t={t} />
      <Bookcases t={t} />
    </svg>
  ) as ReactElement;
}
