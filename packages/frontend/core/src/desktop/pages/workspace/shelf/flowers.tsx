import { notify } from '@affine/component';
import { NotificationItem } from '@affine/core/components/notification/list';
import { AuthService } from '@affine/core/modules/cloud';
import {
  type Notification,
  NotificationCountService,
  NotificationListService,
} from '@affine/core/modules/notification';
import {
  assignSlots,
  FLOWER_SLOTS,
  type FlowerLook,
  flowerLook,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type ShelfPalette,
} from '@affine/core/modules/shelf';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import * as styles from './index.css';

const pctX = (x: number) => `${(x / SCENE_WIDTH) * 100}%`;
const pctY = (y: number) => `${(y / SCENE_HEIGHT) * 100}%`;

/**
 * The person's unread notifications, newest first. Reading one removes it
 * from this list, which is what takes its flower off the plant. It shares the
 * list the sidebar uses, so both always agree.
 */
export function useUnreadNotifications() {
  const list = useService(NotificationListService);
  const count = useService(NotificationCountService);
  const auth = useService(AuthService);
  const status = useLiveData(auth.session.status$);
  const notifications = useLiveData(list.notifications$);
  const hasMore = useLiveData(list.hasMore$);
  const loading = useLiveData(list.isLoading$);
  const error = useLiveData(list.error$);
  const total = useLiveData(count.count$);
  const signedIn = status === 'authenticated';

  // fetch until the plant is full or there is nothing more; a failed fetch
  // is not retried here, so an error cannot turn into a request loop
  useEffect(() => {
    if (
      signedIn &&
      notifications.length < FLOWER_SLOTS.length &&
      hasMore &&
      !loading &&
      !error
    ) {
      list.loadMore();
    }
  }, [signedIn, notifications.length, hasMore, loading, error, list]);

  const markRead = useCallback(
    (id: string) => {
      list.readNotification(id).catch(err => {
        notify.error(UserFriendlyError.fromAny(err));
      });
    },
    [list]
  );

  return {
    notifications: signedIn ? notifications : [],
    total: signedIn ? total : 0,
    markRead,
  };
}

const PETAL_ANGLES = {
  5: [0, 72, 144, 216, 288],
  6: [0, 60, 120, 180, 240, 300],
} as const;

function FlowerArt({
  look,
  palette,
}: {
  look: FlowerLook;
  palette: ShelfPalette;
}) {
  const petal =
    look.hue === 'terra'
      ? palette.edge
      : look.hue === 'gold'
        ? palette.gold
        : palette.books[3];
  const heart = look.hue === 'gold' ? palette.ink : palette.gold;
  return (
    <svg
      className={styles.flowerArt}
      viewBox="-11 -11 22 22"
      aria-hidden="true"
      focusable="false"
    >
      {PETAL_ANGLES[look.petals].map(a => (
        <ellipse
          key={a}
          cx="0"
          cy="-5.4"
          rx="3.9"
          ry="5.6"
          transform={`rotate(${a + look.turn})`}
          fill={petal}
          stroke={palette.ink}
          strokeWidth="1"
        />
      ))}
      <circle r="3.3" fill={heart} stroke={palette.ink} strokeWidth="1" />
    </svg>
  );
}

/**
 * One flower per unread notification, laid over the hanging plant. A flower
 * is a real button: it opens a card with the notification itself. The flower
 * leaves the plant when the notification is read, either with "Mark as read"
 * or by using the notification (opening the doc it points to, answering the
 * invitation, or dismissing it).
 */
export function PlantFlowers({ palette }: { palette: ShelfPalette }) {
  const t = useI18n();
  const { notifications, total, markRead } = useUnreadNotifications();

  // a flower keeps its slot until its notification is read
  const kept = useRef(new Map<string, number>());
  const slots = useMemo(
    () =>
      assignSlots(
        notifications.map(n => n.id),
        kept.current
      ),
    [notifications]
  );
  useEffect(() => {
    kept.current = slots;
  }, [slots]);

  const flowers = useMemo(
    () =>
      notifications.flatMap(n => {
        const slot = slots.get(n.id);
        return slot === undefined
          ? []
          : [{ n, slot, look: flowerLook(n.id, String(n.type)) }];
      }),
    [notifications, slots]
  );
  const hidden = Math.max(total - flowers.length, 0);

  const [openId, setOpenId] = useState<string | null>(null);
  const open = flowers.find(f => f.n.id === openId) ?? null;
  const openKey = open?.n.id ?? null;
  const cardRef = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const close = useCallback((returnFocus: boolean) => {
    setOpenId(current => {
      if (returnFocus && current) buttons.current.get(current)?.focus();
      return null;
    });
  }, []);

  useEffect(() => {
    if (!openKey) return;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const onPointer = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest('[data-flower-ui]')) {
        close(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [openKey, close]);

  if (flowers.length === 0) return null;
  const at = open ? FLOWER_SLOTS[open.slot] : null;
  return (
    <>
      <div
        className={styles.flowers}
        role="group"
        aria-label={t['com.affine.shelf.notifications']()}
      >
        {flowers.map(({ n, slot, look }, i) => (
          <button
            key={n.id}
            ref={el => {
              if (el) buttons.current.set(n.id, el);
              else buttons.current.delete(n.id);
            }}
            type="button"
            data-flower-ui=""
            className={styles.flower}
            style={{
              left: pctX(FLOWER_SLOTS[slot].x),
              top: pctY(FLOWER_SLOTS[slot].y),
            }}
            aria-expanded={openId === n.id}
            aria-label={t['com.affine.shelf.flower.aria']({
              index: String(i + 1),
              count: String(Math.max(total, flowers.length)),
            })}
            onClick={() => setOpenId(openId === n.id ? null : n.id)}
          >
            <FlowerArt look={look} palette={palette} />
          </button>
        ))}
        {hidden > 0 ? (
          <span
            className={styles.flowerMore}
            style={{ left: pctX(138), top: pctY(112) }}
          >
            {t['com.affine.shelf.flower.more']({ count: String(hidden) })}
          </span>
        ) : null}
      </div>
      {open && at ? (
        <div
          ref={cardRef}
          data-flower-ui=""
          className={styles.flowerCard}
          role="region"
          aria-label={t['com.affine.shelf.flower.card']()}
          tabIndex={-1}
          style={{ left: pctX(at.x + 16), top: pctY(at.y + 12) }}
        >
          <NotificationItem notification={open.n} />
          <div className={styles.flowerCardActions}>
            <button
              type="button"
              className={styles.chip}
              onClick={() => markRead(open.n.id)}
            >
              {t['com.affine.shelf.flower.mark-read']()}
            </button>
            <button
              type="button"
              className={styles.chip}
              onClick={() => close(true)}
            >
              {t['com.affine.shelf.flower.close']()}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** the same notifications as a plain list, for the list view */
export function NotificationsList() {
  const t = useI18n();
  const { notifications, markRead } = useUnreadNotifications();
  if (notifications.length === 0) return null;
  return (
    <section
      className={styles.listSection}
      aria-labelledby="shelf-notifications"
    >
      <h2 id="shelf-notifications" className={styles.listHeading}>
        {t['com.affine.shelf.notifications']()}
      </h2>
      <ul className={styles.listNotifications}>
        {notifications.map((n: Notification) => (
          <li key={n.id}>
            <NotificationItem notification={n} />
            <button
              type="button"
              className={clsx(styles.chip)}
              onClick={() => markRead(n.id)}
            >
              {t['com.affine.shelf.flower.mark-read']()}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
