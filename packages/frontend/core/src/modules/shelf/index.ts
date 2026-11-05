import type { Framework } from '@toeverything/infra';

import { DocsService } from '../doc';
import { FavoriteService } from '../favorite';
import { OrganizeService } from '../organize';
import { GlobalStateService } from '../storage';
import { WorkbenchService } from '../workbench';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { ShelfService } from './services/shelf';

export {
  DEFAULT_PALETTE,
  HERITAGE_CREDIT,
  PALETTES,
  type ShelfPalette,
  type ShelfPaletteId,
} from './domain/palette';
export type {
  Bay,
  Book,
  BookLook,
  PinBoard,
  PinNote,
  ShelfModel,
} from './domain/types';
export { UNFILED_BAY_ID } from './domain/types';
export { ShelfService, type ShelfViewMode } from './services/shelf';
export {
  BAY_BOTTOM,
  BAY_GEOMETRY,
  BAY_TOPS,
  MAX_BOOK_HEIGHT,
  NOTE_SLOTS,
  packRows,
  PLANK_HEIGHT,
  SCENE_HEIGHT,
  SCENE_WIDTH,
} from './domain/geometry';

export function configureShelfModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(ShelfService, [
      WorkspaceService,
      DocsService,
      OrganizeService,
      FavoriteService,
      WorkbenchService,
      GlobalStateService,
    ]);
}
