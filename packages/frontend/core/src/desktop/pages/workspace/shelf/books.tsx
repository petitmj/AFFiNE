import {
  type Bay,
  BAY_BOTTOM,
  BAY_GEOMETRY,
  type Book,
  MAX_BOOK_HEIGHT,
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
  const top = geometry.rows[0] - MAX_BOOK_HEIGHT;
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
            top: `${((BAY_BOTTOM + 4 - top) / (bottom - top)) * 100}%`,
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
        book.look.band ? styles.bookBand : styles.bookMarked,
        book.favorite && styles.bookFavorite,
        !book.opened && styles.bookUnopened
      )}
      style={{ ...style, background: palette.books[book.look.color] }}
      onClick={() => onOpen(book.docId)}
    />
  );
}

type NoteMotif = 'diamond' | 'cross' | 'hourglass' | 'lines' | 'pillar';
type Tone = 'cream' | 'gold' | 'blue' | 'terra';

/** each pin-board slot has a fixed face, like the notes in the approved art */
const NOTE_FACES: readonly {
  bg: Tone;
  motif: NoteMotif;
  pin: Tone;
}[] = [
  { bg: 'cream', motif: 'diamond', pin: 'blue' },
  { bg: 'gold', motif: 'cross', pin: 'terra' },
  { bg: 'cream', motif: 'hourglass', pin: 'terra' },
  { bg: 'blue', motif: 'lines', pin: 'gold' },
  { bg: 'cream', motif: 'diamond', pin: 'gold' },
  { bg: 'gold', motif: 'pillar', pin: 'blue' },
];

function toneOf(p: ShelfPalette, tone: Tone) {
  return {
    cream: p.books[3],
    gold: p.gold,
    blue: p.board,
    terra: p.edge,
  }[tone];
}

function NoteArt({
  motif,
  palette: p,
  pin,
}: {
  motif: NoteMotif;
  palette: ShelfPalette;
  pin: string;
}) {
  const ink = p.ink;
  return (
    <svg
      viewBox="0 0 74 58"
      className={styles.noteArt}
      aria-hidden="true"
      focusable="false"
    >
      {motif === 'diamond' ? (
        <g stroke={ink} strokeWidth="1.6">
          <polygon points="37,12 58,31 37,50 16,31" fill={p.edge} />
          <polygon points="37,21 49,31 37,41 25,31" fill={p.leaf} />
          <polygon points="37,27 42,31 37,35 32,31" fill={p.books[3]} />
        </g>
      ) : null}
      {motif === 'cross' ? (
        <g fill="none" strokeLinecap="round">
          <path d="M20,16 L54,46 M54,16 L20,46" stroke={ink} strokeWidth="8" />
          <path
            d="M20,16 L54,46 M54,16 L20,46"
            stroke={p.edge}
            strokeWidth="4"
          />
          <polygon
            points="37,24 44,31 37,38 30,31"
            fill={p.leaf}
            stroke={ink}
            strokeWidth="1.4"
          />
        </g>
      ) : null}
      {motif === 'hourglass' ? (
        <g stroke={ink} strokeWidth="1.6">
          <polygon points="14,14 60,14 37,31" fill={p.edge} />
          <polygon points="14,48 60,48 37,31" fill={p.gold} />
          <polygon points="37,25 43,31 37,37 31,31" fill={p.leaf} />
        </g>
      ) : null}
      {motif === 'lines' ? (
        <g fill={p.books[3]}>
          <rect x="14" y="17" width="46" height="4" />
          <rect x="14" y="28" width="40" height="4" />
          <rect x="14" y="39" width="46" height="4" />
        </g>
      ) : null}
      {motif === 'pillar' ? (
        <g fill={ink}>
          <rect x="22" y="12" width="30" height="7" />
          <rect x="26" y="19" width="5" height="22" />
          <rect x="34" y="19" width="5" height="22" />
          <rect x="43" y="19" width="5" height="22" />
          <rect x="22" y="41" width="30" height="7" />
        </g>
      ) : null}
      <circle cx="37" cy="6" r="4" fill={pin} stroke={ink} strokeWidth="1" />
    </svg>
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
  return (
    <>
      {notes.map((n, i) => {
        const slot = NOTE_SLOTS[i];
        if (!slot) return null;
        const face = NOTE_FACES[i % NOTE_FACES.length];
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
              background: toneOf(palette, face.bg),
              transform: `rotate(${tilt}deg)`,
            }}
            onClick={() => openDoc(n.docId)}
          >
            <NoteArt
              motif={face.motif}
              palette={palette}
              pin={toneOf(palette, face.pin)}
            />
          </button>
        );
      })}
    </>
  );
}
