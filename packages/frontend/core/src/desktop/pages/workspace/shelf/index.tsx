import { AppSidebarService } from '@affine/core/modules/app-sidebar';
import { useNewDoc } from '@affine/core/modules/app-sidebar/views/add-page-button';
import { ServerService } from '@affine/core/modules/cloud';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { CMDKQuickSearchService } from '@affine/core/modules/quicksearch/services/cmdk';
import {
  HERITAGE_CREDIT,
  PALETTES,
  SCENE_HEIGHT,
  SHELF_NAV,
  type ShelfPaletteId,
  ShelfService,
  type ShelfViewMode,
  UNFILED_BAY_ID,
} from '@affine/core/modules/shelf';
import {
  ViewBody,
  ViewIcon,
  ViewImmersive,
  ViewTitle,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { useLiveData, useServices } from '@toeverything/infra';
import clsx from 'clsx';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PinNotes, SceneBay } from './books';
import { NotificationsList, PlantFlowers } from './flowers';
import * as styles from './index.css';
import { ShelfScene } from './scene';

/** below this container width the scene is unreadable: show the list */
const MIN_SCENE_WIDTH = 720;

function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export const Component = () => {
  const t = useI18n();
  const {
    shelfService,
    workbenchService,
    featureFlagService,
    serverService,
    appSidebarService,
    cMDKQuickSearchService,
    workspaceDialogService,
  } = useServices({
    ShelfService,
    WorkbenchService,
    FeatureFlagService,
    ServerService,
    AppSidebarService,
    CMDKQuickSearchService,
    WorkspaceDialogService,
  });
  const workbench = workbenchService.workbench;
  const sidebar = appSidebarService.sidebar;
  const createDoc = useNewDoc();

  const model = useLiveData(shelfService.model$);
  const palette = useLiveData(shelfService.palette$);
  const paletteId = useLiveData(shelfService.paletteId$);
  const savedMode = useLiveData(shelfService.viewMode$);
  const enableAI = useLiveData(featureFlagService.flags.enable_ai.$);
  const serverFeatures = useLiveData(serverService.server.features$);
  const aiAvailable = !!enableAI && !!serverFeatures?.copilot;

  const [rootRef, width] = useElementWidth();
  const tooNarrow = width > 0 && width < MIN_SCENE_WIDTH;
  const mode: ShelfViewMode = tooNarrow ? 'list' : savedMode;

  const [hintsOpen, setHintsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [eagleNoteOpen, setEagleNoteOpen] = useState(false);
  // the Shelf is the whole screen: the sidebar stays hidden until asked for,
  // and comes back by itself when this page goes away
  const [sidebarShown, setSidebarShown] = useState(false);
  useEffect(() => {
    sidebar.setSuppressed(!sidebarShown);
    return () => sidebar.setSuppressed(false);
  }, [sidebar, sidebarShown]);

  const openDoc = useCallback(
    (docId: string) => workbench.openDoc(docId),
    [workbench]
  );
  const openPath = useCallback(
    (path: string) => workbench.open(path),
    [workbench]
  );
  const openAll = useCallback(() => workbench.open('/all'), [workbench]);
  const onEagle = useCallback(() => {
    if (aiAvailable) {
      workbench.open('/chat');
    } else {
      setEagleNoteOpen(v => !v);
    }
  }, [aiAvailable, workbench]);
  const onSearch = useCallback(
    () => cMDKQuickSearchService.toggle(),
    [cMDKQuickSearchService]
  );
  const onNewDoc = useCallback(() => createDoc(), [createDoc]);
  const onSettings = useCallback(
    () => workspaceDialogService.open('setting', { activeTab: 'appearance' }),
    [workspaceDialogService]
  );
  const onToggleSidebar = useCallback(() => {
    if (!sidebarShown) sidebar.setOpen(true);
    setSidebarShown(v => !v);
  }, [sidebar, sidebarShown]);
  const onBayPage = useCallback(
    (bayId: string, page: number) => shelfService.setBayPage(bayId, page),
    [shelfService]
  );

  const vars = assignInlineVars({
    [styles.vars.wall]: palette.wall,
    [styles.vars.ink]: palette.ink,
    [styles.vars.floor]: palette.floor,
    [styles.vars.headline]: palette.headline,
    [styles.vars.counter]: palette.counterText,
    [styles.vars.accent]: palette.accent,
    [styles.vars.accentText]: palette.accentText,
    [styles.vars.gold]: palette.gold,
    [styles.vars.paper]: '#F6EFDD',
  });

  const counterText = t['com.affine.shelf.opened']({
    opened: String(model.opened),
    total: String(model.total),
  });
  const pinLabel = model.pinBoard.folderName
    ? t['com.affine.shelf.pin-board.folder']({
        name: model.pinBoard.folderName,
      })
    : t['com.affine.shelf.pin-board.recent']();
  const empty = model.total === 0;

  const menu = (
    <>
      <div className={styles.topRight}>
        <button
          type="button"
          className={styles.pill}
          aria-expanded={hintsOpen}
          onClick={() => {
            setHintsOpen(v => !v);
            setMenuOpen(false);
          }}
        >
          {t['com.affine.shelf.hints']()}
        </button>
        <button
          type="button"
          className={clsx(styles.pill, styles.pillDark)}
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen(v => !v);
            setHintsOpen(false);
          }}
        >
          {t['com.affine.shelf.menu']()}
        </button>
      </div>
      {hintsOpen ? (
        <div
          className={styles.popover}
          role="region"
          aria-label={t['com.affine.shelf.hints']()}
        >
          <span>{t['com.affine.shelf.hints.body']()}</span>
        </div>
      ) : null}
      {menuOpen ? (
        <div
          className={styles.popover}
          role="region"
          aria-label={t['com.affine.shelf.menu']()}
        >
          {!tooNarrow ? (
            <div className={styles.popoverRow}>
              {(['scene', 'list'] as const).map(m => (
                <button
                  key={m}
                  type="button"
                  className={styles.chip}
                  aria-pressed={mode === m}
                  onClick={() => shelfService.setViewMode(m)}
                >
                  {m === 'scene'
                    ? t['com.affine.shelf.view.scene']()
                    : t['com.affine.shelf.view.list']()}
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.popoverRow}>
            <button type="button" className={styles.chip} onClick={onSearch}>
              {t['Quick search']()}
            </button>
            <button type="button" className={styles.chip} onClick={onNewDoc}>
              {t['New Page']()}
            </button>
          </div>
          <nav
            className={styles.popoverRow}
            aria-label={t['com.affine.shelf.menu']()}
          >
            {SHELF_NAV.map(entry => (
              <button
                key={entry.id}
                type="button"
                className={styles.chip}
                onClick={() => openPath(entry.path)}
              >
                {t[entry.labelKey]()}
              </button>
            ))}
          </nav>
          <div className={styles.popoverRow}>
            <button type="button" className={styles.chip} onClick={onSettings}>
              {t['com.affine.settingSidebar.title']()}
            </button>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={sidebarShown}
              onClick={onToggleSidebar}
            >
              {sidebarShown
                ? t['com.affine.shelf.menu.hide-sidebar']()
                : t['com.affine.shelf.menu.show-sidebar']()}
            </button>
          </div>
          <div
            role="group"
            aria-label={t['com.affine.shelf.palette']()}
            className={styles.popoverRow}
          >
            {(Object.keys(PALETTES) as ShelfPaletteId[]).map(id => (
              <button
                key={id}
                type="button"
                className={styles.chip}
                aria-pressed={paletteId === id}
                onClick={() => shelfService.setPalette(id)}
              >
                {t[`com.affine.shelf.palette.${id}`]()}
              </button>
            ))}
          </div>
          <span className={styles.credit}>{HERITAGE_CREDIT}</span>
        </div>
      ) : null}
    </>
  );

  const shelfPager =
    model.pageCount > 1 ? (
      <div
        className={styles.pager}
        style={{ right: '3%', top: `${(729 / SCENE_HEIGHT) * 100}%` }}
      >
        <button
          type="button"
          className={styles.pagerButton}
          disabled={model.page === 0}
          aria-label={t['com.affine.shelf.shelves.previous']()}
          onClick={() => shelfService.setPage(model.page - 1)}
        >
          ‹
        </button>
        <span>
          {t['com.affine.shelf.bay.page']({
            page: String(model.page + 1),
            count: String(model.pageCount),
          })}
        </span>
        <button
          type="button"
          className={styles.pagerButton}
          disabled={model.page >= model.pageCount - 1}
          aria-label={t['com.affine.shelf.shelves.next']()}
          onClick={() => shelfService.setPage(model.page + 1)}
        >
          ›
        </button>
      </div>
    ) : null;

  return (
    <>
      <ViewTitle title={t['com.affine.workspaceSubPath.shelf']()} />
      <ViewIcon icon="allDocs" />
      <ViewImmersive />
      <ViewBody>
        <div
          ref={rootRef}
          className={clsx(styles.root, mode === 'scene' && styles.rootScene)}
          style={vars}
        >
          {mode === 'scene' ? (
            <div className={styles.stage}>
              <div className={styles.art}>
                <ShelfScene palette={palette} />
              </div>
              <div className={styles.pinLabel}>{pinLabel}</div>
              <PinNotes
                notes={model.pinBoard.notes}
                palette={palette}
                openDoc={openDoc}
              />
              <PlantFlowers palette={palette} />
              {model.bays.map((bay, i) => (
                <SceneBay
                  key={bay.id}
                  bay={bay}
                  index={i}
                  palette={palette}
                  openDoc={openDoc}
                  onPage={onBayPage}
                />
              ))}
              <button
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                className={styles.eagleHit}
                onClick={onEagle}
              />
              <button
                type="button"
                className={clsx(
                  styles.pill,
                  styles.pillAccent,
                  styles.eagleButton
                )}
                aria-label={t['com.affine.shelf.ask-eagle.aria']()}
                aria-expanded={aiAvailable ? undefined : eagleNoteOpen}
                onClick={onEagle}
              >
                {t['com.affine.shelf.ask-eagle']()}
              </button>
              {eagleNoteOpen && !aiAvailable ? (
                <div className={styles.eagleNote} role="status">
                  {t['com.affine.shelf.eagle.unavailable']()}
                </div>
              ) : null}
              <h1 className={styles.headline}>
                {t['com.affine.shelf.title']()}
              </h1>
              <p
                className={clsx(styles.subtitle, empty && styles.subtitleEmpty)}
              >
                {empty
                  ? t['com.affine.shelf.empty']()
                  : t['com.affine.shelf.subtitle']()}
              </p>
              <p
                className={styles.counter}
                aria-live="polite"
                title={counterText}
              >
                {counterText}
              </p>
              {shelfPager}
              {menu}
            </div>
          ) : (
            <div className={styles.listRoot}>
              <div className={styles.listBar}>
                <h1 className={styles.listTitle}>
                  {t['com.affine.shelf.title']()}
                </h1>
              </div>
              <p>{counterText}</p>
              <div className={styles.listBar}>
                {!tooNarrow ? (
                  <button
                    type="button"
                    className={styles.chip}
                    onClick={() => shelfService.setViewMode('scene')}
                  >
                    {t['com.affine.shelf.view.scene']()}
                  </button>
                ) : null}
                <button type="button" className={styles.chip} onClick={openAll}>
                  {t['com.affine.shelf.all-docs']()}
                </button>
                <button type="button" className={styles.chip} onClick={onEagle}>
                  {t['com.affine.shelf.ask-eagle']()}
                </button>
                {eagleNoteOpen && !aiAvailable ? (
                  <span role="status">
                    {t['com.affine.shelf.eagle.unavailable']()}
                  </span>
                ) : null}
              </div>
              {empty ? <p>{t['com.affine.shelf.empty']()}</p> : null}
              <NotificationsList />
              {model.pinBoard.notes.length ? (
                <section
                  className={styles.listSection}
                  aria-labelledby="shelf-pin"
                >
                  <h2 id="shelf-pin" className={styles.listHeading}>
                    {pinLabel}
                  </h2>
                  <ul className={styles.listItems}>
                    {model.pinBoard.notes.map(n => (
                      <li key={n.docId}>
                        <button
                          type="button"
                          className={styles.listLink}
                          onClick={() => openDoc(n.docId)}
                        >
                          {n.title || t['Untitled']()}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {model.bays.map(bay => {
                const name =
                  bay.id === UNFILED_BAY_ID
                    ? t['com.affine.shelf.bay.unfiled']()
                    : bay.name;
                return (
                  <section
                    key={bay.id}
                    className={styles.listSection}
                    aria-labelledby={`shelf-bay-${bay.id}`}
                  >
                    <h2
                      id={`shelf-bay-${bay.id}`}
                      className={styles.listHeading}
                    >
                      {name}
                      <span className={styles.listMeta}>{bay.total}</span>
                    </h2>
                    {bay.total === 0 ? (
                      <p>{t['com.affine.shelf.bay.empty']()}</p>
                    ) : (
                      <ul className={styles.listItems}>
                        {bay.books.map(b => (
                          <li key={b.docId}>
                            <button
                              type="button"
                              className={styles.listLink}
                              onClick={() => openDoc(b.docId)}
                            >
                              {b.title || t['Untitled']()}
                              {b.favorite ? (
                                <span className={styles.listMeta}>
                                  {t['com.affine.shelf.book.favorite']()}
                                </span>
                              ) : null}
                              {b.opened ? (
                                <span className={styles.listMeta}>
                                  {t['com.affine.shelf.book.opened']()}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {bay.pageCount > 1 ? (
                      <div className={styles.listBar}>
                        <button
                          type="button"
                          className={styles.chip}
                          disabled={bay.page === 0}
                          aria-label={t['com.affine.shelf.bay.previous']({
                            name,
                          })}
                          onClick={() => onBayPage(bay.id, bay.page - 1)}
                        >
                          ‹
                        </button>
                        <span>
                          {t['com.affine.shelf.bay.page']({
                            page: String(bay.page + 1),
                            count: String(bay.pageCount),
                          })}
                        </span>
                        <button
                          type="button"
                          className={styles.chip}
                          disabled={bay.page >= bay.pageCount - 1}
                          aria-label={t['com.affine.shelf.bay.more']({ name })}
                          onClick={() => onBayPage(bay.id, bay.page + 1)}
                        >
                          ›
                        </button>
                      </div>
                    ) : null}
                  </section>
                );
              })}
              {model.pageCount > 1 ? (
                <div className={styles.listBar}>
                  <button
                    type="button"
                    className={styles.chip}
                    disabled={model.page === 0}
                    onClick={() => shelfService.setPage(model.page - 1)}
                  >
                    {t['com.affine.shelf.shelves.previous']()}
                  </button>
                  <button
                    type="button"
                    className={styles.chip}
                    disabled={model.page >= model.pageCount - 1}
                    onClick={() => shelfService.setPage(model.page + 1)}
                  >
                    {t['com.affine.shelf.shelves.next']()}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </ViewBody>
    </>
  );
};
