import {
  type Bay,
  BAY_GEOMETRY,
  type Book,
  NOTE_SLOTS,
  packRows,
  type PinNote,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type ShelfPalette,
} from '@affine/core/modules/shelf';
import { useI18n } from '@affine/i18n';
import clsx from 'clsx';
import type { CSSProperties } from 'react';

import * as styles from './index.css';

const pctX = (x: number) => `${(x / SCENE_WIDTH) * 100}%`;
const pctY = (y: number) => `${(y / SCENE_HEIGHT) * 100}%`;

export type OpenDoc = (docId: string) => void;

function useBookLabel() {
  const t = useI18n();
  return (title: string, extra: { favorite?: boolean; opened?: boolean }) => {
    const name = title || t['Untitled']();
    const flags = [
      extra.favorite ? t['com.affine.shelf.book.favorite']() : null,
      extra.opened ? t['com.affine.shelf.book.opened']() : null,
    ].filter(Boolean);
    return flags.length ? `${name} (${flags.join(', ')})` : name;
  };
}

export function SceneBay({
  bay,
  index,
  palette,
  openDoc,
  onPage,
}: {
  bay: Bay;
  index: number;
  palette: ShelfPalette;
  openDoc: OpenDoc;
  onPage: (bayId: string, page: number) => void;
}) {
  const t = useI18n();
  const label = useBookLabel();
  const geometry = BAY_GEOMETRY[index] ?? BAY_GEOMETRY[BAY_GEOMETRY.length - 1];
  const placed = packRows(
    bay.books.map(b => b.look.width),
    geometry
  );
  const name = bay.unfiled ? t['com.affine.shelf.bay.unfiled']() : bay.name;
  const left = geometry.x;
  const top = geometry.rows[0] - 80;
  const width = geometry.w;
  const bottom = geometry.rows[geometry.rows.length - 1];
  return (
    <div
      role="group"
      aria-label={name}
      className={styles.bay}
      style={{
        left: pctX(left),
        top: pctY(top),
        width: pctX(width),
        height: pctY(bottom - top),
      }}
    >
      <span className={styles.bayLabel}>{name}</span>
      {placed?.map((spot, i) => (
        <BookButton
          key={bay.books[i].docId}
          book={bay.books[i]}
          palette={palette}
          label={label(bay.books[i].title, bay.books[i])}
          style={{
            left: `${((spot.x - left) / width) * 100}%`,
            top: `${((spot.baseline - bay.books[i].look.height - top) / (bottom - top)) * 100}%`,
            width: `${(bay.books[i].look.width / width) * 100}%`,
            height: `${(bay.books[i].look.height / (bottom - top)) * 100}%`,
          }}
          onOpen={openDoc}
        />
      ))}
      {bay.pageCount > 1 ? (
        <div
          className={styles.pager}
          style={{
            left: 0,
            top: `${((bottom + 6 - top) / (bottom - top)) * 100}%`,
          }}
        >
          <button
            type="button"
            className={styles.pagerButton}
            disabled={bay.page === 0}
            aria-label={t['com.affine.shelf.bay.previous']({ name })}
            onClick={() => onPage(bay.id, bay.page - 1)}
          >
            ‹
          </button>
          <span aria-hidden="true">
            {bay.page + 1}/{bay.pageCount}
          </span>
          <button
            type="button"
            className={styles.pagerButton}
            disabled={bay.page >= bay.pageCount - 1}
            aria-label={t['com.affine.shelf.bay.more']({ name })}
            onClick={() => onPage(bay.id, bay.page + 1)}
          >
            ›
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BookButton({
  book,
  palette,
  label,
  style,
  onOpen,
}: {
  book: Book;
  palette: ShelfPalette;
  label: string;
  style: CSSProperties;
  onOpen: OpenDoc;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={clsx(
        styles.book,
        book.favorite && styles.bookFavorite,
        !book.opened && styles.bookUnopened
      )}
      style={{ ...style, background: palette.books[book.look.color] }}
      onClick={() => onOpen(book.docId)}
    />
  );
}

export function PinNotes({
  notes,
  palette,
  openDoc,
}: {
  notes: readonly PinNote[];
  palette: ShelfPalette;
  openDoc: OpenDoc;
}) {
  const t = useI18n();
  const noteColors = [palette.books[3], palette.gold, palette.books[3]];
  return (
    <>
      {notes.map((n, i) => {
        const slot = NOTE_SLOTS[i];
        if (!slot) return null;
        const title = n.title || t['Untitled']();
        const tilt = ((n.look.width % 5) - 2) * 1.2;
        return (
          <button
            key={n.docId}
            type="button"
            aria-label={title}
            title={title}
            className={styles.note}
            style={{
              left: pctX(slot.x),
              top: pctY(slot.y),
              width: pctX(slot.w),
              height: pctY(slot.h),
              background: noteColors[(n.look.color + i) % noteColors.length],
              transform: `rotate(${tilt}deg)`,
            }}
            onClick={() => openDoc(n.docId)}
          />
        );
      })}
    </>
  );
}
