import { LiveData, Service } from '@toeverything/infra';
import { map, switchMap, of, from } from 'rxjs';

import { CollectionService, PinnedCollectionService } from '../../collection';
import { CollectionRulesService } from '../../collection-rules';
import type { FavoriteService } from '../../favorite';
import { NotificationStore } from '../../notification';
import type { WorkbenchService } from '../../workbench';
import type { GlobalState, WorkspaceLocalState } from '../../workspace';

export type ShelfDoc = {
  id: string;
  title: string;
  icon: string | null;
  updatedAt: number;
  isFavorite: boolean;
};

export type ShelfStack = {
  id: string;
  name: string;
};

export type ShelfFlower = {
  id: string;
  body: string; // rendered as a tooltip / preview near the flower
  createdAt: string;
  read: boolean;
};

const HOME_MODE_KEY = 'homeMode';            // WorkspaceLocalState (per workspace)
const DISCOVERED_DOCS_KEY = 'shelf:discoveredDocs'; // GlobalState (per client)

/**
 * The shelf scene's single read model. Every visual element of the home
 * screen is a projection of LiveData exposed here:
 *
 *   stacks$        => book stacks (pinned collections)
 *   books$         => books on the shelf (docs)
 *   pinBoardItems$ => pinned cards under the plant (recent + favourites)
 *   flowers$       => unread notifications blooming on the plant
 *   discovery$     => "X of Y documents opened" progress
 */
export class ShelfService extends Service {
  constructor(
    private readonly collectionService: CollectionService,
    private readonly pinnedCollectionService: PinnedCollectionService,
    private readonly collectionRulesService: CollectionRulesService,
    private readonly favoriteService: FavoriteService,
    private readonly notificationStore: NotificationStore,
    private readonly workbenchService: WorkbenchService,
    private readonly globalState: GlobalState,
    private readonly workspaceLocalState: WorkspaceLocalState
  ) {
    super();
  }

  // ---- mode toggle (shelf is the default) --------------------------------

  homeMode$ = LiveData.from(
    this.workspaceLocalState.watch<'shelf' | 'classic'>(HOME_MODE_KEY),
    'shelf'
  );

  setHomeMode(mode: 'shelf' | 'classic') {
    this.workspaceLocalState.set(HOME_MODE_KEY, mode);
  }

  // ---- stacks: all collections as book stacks ---------------------------

  stacks$ = LiveData.from(
    this.pinnedCollectionService.pinnedCollections$,
    []
  ).pipe(map(collections => collections.map(c => ({ id: c.collectionId, name: '' }))));

  // names resolve lazily via collectionService.collection$(id).info$
  stackName$(id: string) {
    return LiveData.from(
      this.collectionService.collection$(id).pipe(
        switchMap(c => c ? c.info$ : of(null))
      ),
      null
    ).pipe(map(info => info?.name ?? ''));
  }

  // ---- books: docs on the shelf ------------------------------------------

  /**
   * Same query shape as the verified AllPage list (CollectionRulesService
   * with a trash:false system filter), so shelf contents always match the
   * classic All docs view.
   */
  private readonly docsRules$ = this.collectionRulesService.watch({
    filters: [
      { type: 'system', key: 'trash', method: 'is', value: 'false' },
    ],
    groupBy: undefined,
    orderBy: { type: 'system', key: 'updatedAt', desc: true },
  });

  books$ = LiveData.from(this.docsRules$, { groups: [] }).pipe(
    map(({ groups }) => {
      const docs: ShelfDoc[] = [];
      const walk = (nodes: any[]) => {
        for (const node of nodes ?? []) {
          if (node.data) docs.push(node.data as ShelfDoc);
          walk(node.children ?? []);
        }
      };
      walk(groups);
      return docs;
    })
  );

  // ---- pin board: recently opened + favourites ---------------------------

  pinBoardItems$ = LiveData.computed(get => {
    const favourites = get(this.favorites$).map(id => ({ id, favourite: true }));
    const recents = get(this.recents$)
      .filter(id => !favourites.some(f => f.id === id))
      .map(id => ({ id, favourite: false }));
    return [...favourites, ...recents].slice(0, 12); // pin board size
  });

  private readonly recentsKey = 'shelf:recentDocs';
  private readonly recents$ = LiveData.from(
    this.workspaceLocalState.watch<string[]>(this.recentsKey),
    []
  );

  /**
   * Track opened docs: subscribe once from the page; records every doc
   * location the workbench navigates to, newest first, capped at 20.
   */
  trackOpenedDocs() {
    return this.workbenchService.workbench.location$.subscribe(location => {
      const match = location.pathname.match(/^\/([0-9a-zA-Z_-]{20,})$/);
      if (!match) return;
      const docId = match[1];
      const prev = this.workspaceLocalState.get<string[]>(this.recentsKey) ?? [];
      const next = [docId, ...prev.filter(id => id !== docId)].slice(0, 20);
      this.workspaceLocalState.set(this.recentsKey, next);
      this.markDiscovered(docId);
    });
  }

  private readonly favorites$ = LiveData.from(
    // FavoriteList entity emits the favourited doc ids (verified module)
    this.favoriteService.favoriteList.favorites$ ?? of([]),
    []
  ).pipe(map(list => (list as { id: string }[]).map(f => f.id)));

  // ---- plant: notifications bloom as flowers -----------------------------

  flowers$ = LiveData.from(
    from(
      this.notificationStore.listNotification({ first: 20 })
    ).pipe(map(result => (result?.edges ?? []).map(e => e.node))),
    []
  );

  /** Reading one flower makes it disappear (verified readNotification). */
  async readFlower(id: string) {
    await this.notificationStore.readNotification(id);
    this.flowers$.next(
      this.flowers$.value.filter(flower => (flower as { id: string }).id !== id)
    );
  }

  /** Watering the plant clears every flower at once. */
  async waterPlant() {
    await this.notificationStore.readAllNotifications();
  }

  // ---- discovery counter + easter eggs ------------------------------------

  private markDiscovered(docId: string) {
    const discovered = new Set(
      this.globalState.get<string[]>(DISCOVERED_DOCS_KEY) ?? []
    );
    const before = discovered.size;
    discovered.add(docId);
    this.globalState.set(DISCOVERED_DOCS_KEY, [...discovered]);
    if (discovered.size > before) {
      this.discoveredCount$.next(discovered.size);
    }
  }

  private readonly discoveredCount$ = new LiveData(
    (this.globalState.get<string[]>(DISCOVERED_DOCS_KEY) ?? []).length
  );

  discovery$ = LiveData.computed(get => {
    const opened = get(this.discoveredCount$);
    const total = get(this.books$).length;
    return { opened, total };
  });

  // ---- eagle => Copilot ----------------------------------------------------

  askTheEagle() {
    // '/chat' is the verified workspace Copilot chat route
    this.workbenchService.workbench.open('/chat');
  }

  openDoc(id: string) {
    this.workbenchService.workbench.openDoc(id);
  }

  openStack(id: string) {
    this.workbenchService.workbench.openCollection(id);
  }

  openMenu() {
    this.workbenchService.workbench.openSidebar();
  }
}
