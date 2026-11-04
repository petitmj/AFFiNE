import { Button, Tooltip } from '@affine/component';
import { ShelfService } from '@affine/core/modules/shelf';
import { WorkspaceLocalState } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useEffect, useMemo, useRef, useState } from 'react';

import { ViewBody, ViewHeader, ViewIcon, ViewTitle } from '../../../../modules/workbench';
import { AllPage } from '../all-page/all-page';
import * as styles from './shelf-page.css';

// ---------------------------------------------------------------------------
// Hidden easter eggs, discovery-style (mirrors the reference site's
// "0 of 17 discovered"): fun objects on the scene with ids; clicking
// records them in WorkspaceLocalState and shows a toast line.
// ---------------------------------------------------------------------------
const EASTER_EGGS = [
  { id: 'globe', label: 'com.affine.shelf.easteregg.globe' },
  { id: 'radio', label: 'com.affine.shelf.easteregg.radio' },
  { id: 'teapot', label: 'com.affine.shelf.easteregg.teapot' },
  { id: 'eagle-feather', label: 'com.affine.shelf.easteregg.feather' },
  { id: 'map', label: 'com.affine.shelf.easteregg.map' },
] as const;

export const ShelfPage = () => {
  const t = useI18n();
  const shelf = useService(ShelfService);
  const workspaceLocalState = useService(WorkspaceLocalState);

  const [showHints, setShowHints] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  const stacks = useLiveData(shelf.stacks$) ?? [];
  const books = useLiveData(shelf.books$) ?? [];
  const pinBoardItems = useLiveData(shelf.pinBoardItems$) ?? [];
  const flowers = (useLiveData(shelf.flowers$) ?? []) as {
    id: string;
    body: string;
  }[];
  const discovery = useLiveData(shelf.discovery$) ?? { opened: 0, total: 0 };

  // Track opened docs while the shelf is the active home
  useEffect(() => {
    const sub = shelf.trackOpenedDocs();
    return () => sub.unsubscribe();
  }, [shelf]);

  // Parallax: cheap 2.5D - background layers shift against the pointer.
  const onPointerMove = (e: React.PointerEvent) => {
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return;
    setParallax({
      x: (e.clientX - rect.left) / rect.width - 0.5,
      y: (e.clientY - rect.top) / rect.height - 0.5,
    });
  };

  const eggKey = 'shelf:eastereggs';
  const eggsFound = new Set(workspaceLocalState.get<string[]>(eggKey) ?? []);
  const [eggToast, setEggToast] = useState<string | null>(null);
  const onEggFound = (id: string, label: string) => {
    if (eggsFound.has(id)) return;
    eggsFound.add(id);
    workspaceLocalState.set(eggKey, [...eggsFound]);
    setEggToast(label);
    setTimeout(() => setEggToast(null), 2500);
  };

  return (
    <>
      <ViewTitle title={t['com.affine.shelf.title']()} />
      <ViewIcon icon="allDocs" />
      <ViewHeader>
        <div className={styles.headerRow}>
          <Button
            variant="plain"
            data-testid="shelf-hints"
            onClick={() => setShowHints(v => !v)}
          >
            {t['com.affine.shelf.hints']()}
          </Button>
          <Button
            variant="plain"
            data-testid="shelf-menu"
            onClick={() => shelf.openMenu()}
          >
            {t['com.affine.shelf.menu']()}
          </Button>
          <Button
            variant="plain"
            data-testid="shelf-classic-toggle"
            onClick={() => shelf.setHomeMode('classic')}
          >
            {t['com.affine.shelf.classic-view']()}
          </Button>
        </div>
      </ViewHeader>
      <ViewBody>
        <div
          ref={sceneRef}
          className={styles.scene}
          onPointerMove={onPointerMove}
          data-testid="shelf-scene"
        >
          {/* background: vibrant geometric pattern (user's site aesthetic) */}
          <div
            className={styles.patternBackdrop}
            style={{
              transform: `translate(${parallax.x * -12}px, ${parallax.y * -8}px)`,
            }}
          />

          {/* center welcome */}
          <div className={styles.welcome}>
            <h1>{t['com.affine.shelf.welcome.title']()}</h1>
            <p>{t['com.affine.shelf.welcome.subtitle']()}</p>
          </div>

          {/* left: shelf with stacks (collections) and books (docs) */}
          <div className={styles.shelfZone}>
            <div className={styles.shelfBoard}>
              {stacks.map((stack, i) => (
                <Tooltip key={stack.id} content={t['com.affine.shelf.open-collection']()}>
                  <div
                    className={styles.stack}
                    style={{
                      transform: `translate(${parallax.x * (4 + i)}px, 0)`,
                      ['--stack-index' as any]: i,
                    }}
                    data-testid={`shelf-stack-${i}`}
                    onClick={() => shelf.openStack(stack.id)}
                  >
                    {books.slice(i * 5, i * 5 + 5).map(book => (
                      <div
                        key={book.id}
                        className={styles.bookSpine}
                        title={book.title}
                        onClick={e => {
                          e.stopPropagation();
                          shelf.openDoc(book.id);
                        }}
                      />
                    ))}
                  </div>
                </Tooltip>
              ))}
            </div>

            {/* pin board under the plant: recent + favourites */}
            <div className={styles.pinBoardRow}>
              <div className={styles.plant}>
                {flowers.map(flower => (
                  <button
                    key={flower.id}
                    className={styles.flower}
                    data-testid="shelf-flower"
                    title={flower.body}
                    onClick={() => shelf.readFlower(flower.id)}
                    aria-label={t['com.affine.shelf.flower.read']()}
                  />
                ))}
                {flowers.length > 1 && (
                  <button
                    className={styles.wateringCan}
                    onClick={() => shelf.waterPlant()}
                    aria-label={t['com.affine.shelf.flower.water']()}
                  />
                )}
              </div>
              <div className={styles.pinBoard} data-testid="shelf-pin-board">
                {pinBoardItems.map(item => (
                  <button
                    key={item.id}
                    className={styles.pinnedCard}
                    onClick={() => shelf.openDoc(item.id)}
                  >
                    <span className={styles.pin} />
                    <span className={styles.pinnedLabel}>
                      {t['com.affine.shelf.last-edited']()}
                    </span>
                  </button>
                ))}
                {pinBoardItems.length === 0 && (
                  <span className={styles.pinBoardEmpty}>
                    {t['com.affine.shelf.pin-board.empty']()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* right: eagle on pedestal => Copilot */}
          <button
            className={styles.eaglePedestal}
            data-testid="shelf-eagle"
            onClick={() => shelf.askTheEagle()}
          >
            <span className={styles.eagle} />
            <span className={styles.eagleLabel}>
              {t['com.affine.shelf.ask-eagle']()}
            </span>
          </button>

          {/* easter eggs */}
          {EASTER_EGGS.map(egg => (
            <button
              key={egg.id}
              className={styles.easterEgg}
              data-testid={`easteregg-${egg.id}`}
              style={{ ['--egg-id' as any]: `'${egg.id}'` }}
              onClick={() => onEggFound(egg.id, t[egg.label]())}
              aria-label={t[egg.label]()}
            />
          ))}
          {eggToast && <div className={styles.eggToast}>{eggToast}</div>}

          {/* hints overlay: outlines every clickable element */}
          {showHints && (
            <div className={styles.hintsOverlay} data-testid="shelf-hints-overlay">
              {t['com.affine.shelf.hints.message']()}
            </div>
          )}

          {/* bottom: discovery progress */}
          <div className={styles.discoveryBar}>
            <progress
              value={discovery.opened}
              max={Math.max(discovery.total, 1)}
            />
            <span data-testid="shelf-discovery-counter">
              {t['com.affine.shelf.discovery.counter']({
                opened: discovery.opened,
                total: discovery.total,
              })}
            </span>
          </div>
        </div>
      </ViewBody>
    </>
  );
};

export const Component = ShelfPage;

/** Classic view kept for the toggle (renders the untouched AllPage). */
export const ClassicHome = AllPage;
