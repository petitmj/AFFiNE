import { ServerService } from '@affine/core/modules/cloud';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import {
  HERITAGE_CREDIT,
  PALETTES,
  type ShelfPaletteId,
  ShelfService,
  type ShelfViewMode,
  UNFILED_BAY_ID,
} from '@affine/core/modules/shelf';
import {
  ViewBody,
  ViewIcon,
  ViewTitle,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { useLiveData, useServices } from '@toeverything/infra';
import clsx from 'clsx';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PinNotes, SceneBay } from './books';
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
  const { shelfService, workbenchService, featureFlagService, serverService } =
    useServices({
      ShelfService,
      WorkbenchService,
      FeatureFlagService,
      ServerService,
    });
  const workbench = workbenchService.workbench;

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

  const openDoc = useCallback(
    (docId: string) => workbench.openDoc(docId),
    [workbench]
  );
  const openChat = useCallback(() => workbench.open('/chat'), [workbench]);
  const openAll = useCallback(() => workbench.open('/all'), [workbench]);
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
          <button type="button" className={styles.chip} onClick={openAll}>
            {t['com.affine.shelf.all-docs']()}
          </button>
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
        style={{ right: '3%', top: `${(612 / 640) * 100}%` }}
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
      <ViewBody>
        <div ref={rootRef} className={styles.root} style={vars}>
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
              {aiAvailable ? (
                <>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    className={styles.eagleHit}
                    onClick={openChat}
                  />
                  <button
                    type="button"
                    className={clsx(
                      styles.pill,
                      styles.pillAccent,
                      styles.eagleButton
                    )}
                    aria-label={t['com.affine.shelf.ask-eagle.aria']()}
                    onClick={openChat}
                  >
                    {t['com.affine.shelf.ask-eagle']()}
                  </button>
                </>
              ) : null}
              <h1 className={styles.headline}>
                {t['com.affine.shelf.title']()}
              </h1>
              <p className={styles.subtitle}>
                {t['com.affine.shelf.subtitle']()}
              </p>
              {empty ? (
                <p className={styles.emptyNote}>
                  {t['com.affine.shelf.empty']()}
                </p>
              ) : null}
              <p className={styles.counter} aria-live="polite">
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
                {aiAvailable ? (
                  <button
                    type="button"
                    className={styles.chip}
                    onClick={openChat}
                  >
                    {t['com.affine.shelf.ask-eagle']()}
                  </button>
                ) : null}
              </div>
              {empty ? <p>{t['com.affine.shelf.empty']()}</p> : null}
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
