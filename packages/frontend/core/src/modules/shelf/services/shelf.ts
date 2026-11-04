import { LiveData, Service } from '@toeverything/infra';

import { DocsService } from '../../doc';
import { FavoriteService } from '../../favorite';
import type { FolderNode } from '../../organize';
import { OrganizeService } from '../../organize';
import { GlobalStateService } from '../../storage';
import { WorkbenchService } from '../../workbench';
import { WorkspaceService } from '../../workspace';
import { layoutShelf } from '../domain/layout';
import { docIdFromPathname, markOpened } from '../domain/opened';
import {
  DEFAULT_PALETTE,
  PALETTES,
  type ShelfPalette,
  type ShelfPaletteId,
} from '../domain/palette';
import type {
  ShelfDoc,
  ShelfFolder,
  ShelfInput,
  ShelfModel,
} from '../domain/types';

const openedKey = (workspaceId: string) => `shelf:opened:v1:${workspaceId}`;
/** per device, not per workspace: the look is a personal preference */
const PALETTE_KEY = 'shelf:palette:v1';
const VIEW_KEY = 'shelf:view:v1';

export type ShelfViewMode = 'scene' | 'list';

type Get = <T>(liveData: LiveData<T>) => T;

/**
 * Adapter between AFFiNE's live entities (DocRecord, FolderNode,
 * FavoriteList) and the pure layout in `../domain`. All shelf rules live in
 * the domain; this class only gathers inputs and persists two per-device
 * values: the opened-doc list and the chosen palette.
 *
 * Instantiating the service starts the opened-doc tracker, so something that
 * is always mounted (the sidebar entry) must resolve it.
 */
export class ShelfService extends Service {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly docsService: DocsService,
    private readonly organizeService: OrganizeService,
    private readonly favoriteService: FavoriteService,
    private readonly workbenchService: WorkbenchService,
    private readonly globalStateService: GlobalStateService
  ) {
    super();
    this.startOpenedTracker();
  }

  private get state() {
    return this.globalStateService.globalState;
  }

  private get workspaceId() {
    return this.workspaceService.workspace.id;
  }

  readonly page$ = new LiveData(0);

  readonly openedIds$ = LiveData.from<readonly string[]>(
    this.state.watch<string[]>(openedKey(this.workspaceId)),
    []
  ).map(v => v ?? []);

  readonly paletteId$ = LiveData.from<ShelfPaletteId>(
    this.state.watch<ShelfPaletteId>(PALETTE_KEY),
    DEFAULT_PALETTE
  ).map(id => (id && id in PALETTES ? id : DEFAULT_PALETTE));

  readonly palette$ = this.paletteId$.map<ShelfPalette>(id => PALETTES[id]);

  readonly viewMode$ = LiveData.from<ShelfViewMode>(
    this.state.watch<ShelfViewMode>(VIEW_KEY),
    'scene'
  ).map(v => (v === 'list' ? 'list' : 'scene'));

  setViewMode(mode: ShelfViewMode) {
    this.state.set(VIEW_KEY, mode);
  }

  setPalette(id: ShelfPaletteId) {
    this.state.set(PALETTE_KEY, id);
  }

  setPage(page: number) {
    this.page$.next(Math.max(0, Math.floor(page)));
  }

  /** page of books inside each bay, keyed by bay id; session only */
  readonly bayPages$ = new LiveData<Readonly<Record<string, number>>>({});

  setBayPage(bayId: string, page: number) {
    this.bayPages$.next({
      ...this.bayPages$.value,
      [bayId]: Math.max(0, Math.floor(page)),
    });
  }

  readonly input$ = LiveData.computed<ShelfInput>(get => {
    const docs: ShelfDoc[] = [];
    const favoriteDocs = new Set(
      get(this.favoriteService.favoriteList.list$)
        .filter(r => r.type === 'doc')
        .map(r => r.id)
    );
    for (const record of get(this.docsService.list.docs$)) {
      if (get(record.trash$)) continue;
      docs.push({
        id: record.id,
        title: get(record.title$),
        updatedAt: get(record.updatedAt$) ?? get(record.createdAt$),
        favorite: favoriteDocs.has(record.id),
      });
    }
    return {
      docs,
      folders: this.collectTopLevelFolders(get),
      openedIds: get(this.openedIds$),
    };
  });

  readonly model$ = LiveData.computed<ShelfModel>(get =>
    layoutShelf(
      get(this.input$),
      get(this.page$),
      undefined,
      get(this.bayPages$)
    )
  );

  private collectTopLevelFolders(get: Get): ShelfFolder[] {
    const root = this.organizeService.folderTree.rootFolder;
    const folders: ShelfFolder[] = [];
    for (const node of get(root.sortedChildren$)) {
      if (get(node.type$) !== 'folder' || !node.id) continue;
      const docIds: string[] = [];
      this.collectDocIds(get, node, docIds);
      folders.push({ id: node.id, name: get(node.name$), docIds });
    }
    return folders;
  }

  /** docs linked in `node` or any descendant folder (folders cannot cycle) */
  private collectDocIds(get: Get, node: FolderNode, out: string[]) {
    for (const child of get(node.sortedChildren$)) {
      const type = get(child.type$);
      if (type === 'folder') {
        this.collectDocIds(get, child, out);
      } else if (type === 'doc') {
        const id = get(child.data$);
        if (id) out.push(id);
      }
    }
  }

  /**
   * "Documents opened" counts a doc when it becomes the active route on this
   * device, from the shelf or from anywhere else. Stored per device and per
   * workspace; never synced.
   */
  private startOpenedTracker() {
    const subscription = this.workbenchService.workbench.location$.subscribe(
      location => {
        const id = docIdFromPathname(location.pathname);
        if (!id || !this.docsService.list.docsMap$.value.has(id)) return;
        const key = openedKey(this.workspaceId);
        const current = this.state.get<string[]>(key) ?? [];
        const next = markOpened(current, id);
        if (next !== current) this.state.set(key, [...next]);
      }
    );
    this.disposables.push(() => subscription.unsubscribe());
  }
}
