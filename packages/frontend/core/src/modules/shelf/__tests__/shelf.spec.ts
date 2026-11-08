import test from 'ava';

import {
  BAY_GEOMETRY,
  MAX_BOOK_HEIGHT,
  MAX_SPINE_WIDTH,
  MIN_BOOK_HEIGHT,
  MIN_SPINE_WIDTH,
  PLANK_HEIGHT,
  BAY_BOTTOM,
  NOTE_SLOTS,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  packRows,
  paginateBooks,
} from '../domain/geometry';
import {
  assignSlots,
  FLOWER_SIZE,
  FLOWER_SLOTS,
  flowerHue,
  flowerLook,
} from '../domain/flowers';
import { bookLook, fnv1a } from '../domain/hash';
import { SHELF_NAV } from '../domain/nav';
import { layoutShelf } from '../domain/layout';
import {
  countOpened,
  docIdFromPathname,
  markOpened,
  MAX_OPENED_IDS,
} from '../domain/opened';
import { contrast, PALETTES } from '../domain/palette';
import {
  DEFAULT_SHELF_OPTIONS,
  type ShelfDoc,
  type ShelfFolder,
  UNFILED_BAY_ID,
} from '../domain/types';

const doc = (id: string, updatedAt: number, favorite = false): ShelfDoc => ({
  id,
  title: `Doc ${id}`,
  updatedAt,
  favorite,
});
const folder = (id: string, docIds: string[]): ShelfFolder => ({
  id,
  name: `Folder ${id}`,
  docIds,
});

test('bookLook is deterministic and within bounds', t => {
  t.deepEqual(bookLook('abc'), bookLook('abc'));
  t.is(fnv1a('a'), 0xe40c292c);
  for (let i = 0; i < 500; i++) {
    const l = bookLook(`doc-${i}`);
    t.true(l.color >= 0 && l.color <= 4);
    t.true(l.width >= MIN_SPINE_WIDTH && l.width <= MAX_SPINE_WIDTH);
    t.true(l.height >= MIN_BOOK_HEIGHT && l.height <= MAX_BOOK_HEIGHT);
  }
});

test('bays are ordered by latest activity, unfiled bay is always last', t => {
  const m = layoutShelf({
    docs: [doc('a', 10), doc('b', 50), doc('c', 30), doc('loose', 99)],
    folders: [folder('f1', ['a']), folder('f2', ['b', 'c'])],
    openedIds: [],
  });
  t.deepEqual(
    m.bays.map(b => b.id),
    ['f2', 'f1', UNFILED_BAY_ID]
  );
  t.true(m.bays[2].unfiled);
  t.deepEqual(
    m.bays[2].books.map(b => b.docId),
    ['loose']
  );
});

test('every live doc appears on the shelf (no doc is lost to a bay cap)', t => {
  const docs = Array.from({ length: 40 }, (_, i) => doc(`d${i}`, i));
  const m = layoutShelf({ docs, folders: [], openedIds: [] });
  const bay = m.bays[0];
  t.is(bay.total, 40);
  t.true(bay.books.length < 40);
  t.true(bay.pageCount > 1);
  t.is(bay.hidden, 40 - bay.books.length);
  // walking the bay pages reaches every doc exactly once
  const seen: string[] = [];
  for (let p = 0; p < bay.pageCount; p++) {
    const mp = layoutShelf({ docs, folders: [], openedIds: [] }, 0, undefined, {
      [UNFILED_BAY_ID]: p,
    });
    seen.push(...mp.bays[0].books.map(b => b.docId));
  }
  t.is(new Set(seen).size, 40);
  t.is(seen.length, 40);
  // out-of-range bay page clamps
  const last = layoutShelf({ docs, folders: [], openedIds: [] }, 0, undefined, {
    [UNFILED_BAY_ID]: 99,
  }).bays[0];
  t.is(last.page, last.pageCount - 1);
});

test('the tallest book clears the ceiling and every plank above its row', t => {
  BAY_GEOMETRY.forEach(g => {
    g.rows.forEach((row, i) => {
      const roof = i === 0 ? g.ceiling : g.rows[i - 1] + PLANK_HEIGHT;
      t.true(row - roof >= MAX_BOOK_HEIGHT);
    });
  });
});

test('bays and note slots sit inside the scene and do not overlap', t => {
  for (const g of BAY_GEOMETRY) {
    t.true(g.x >= 0 && g.x + g.w <= SCENE_WIDTH);
    t.true(g.rows.every(r => r + PLANK_HEIGHT <= BAY_BOTTOM));
  }
  const sorted = [...BAY_GEOMETRY].sort((a, b) => a.x - b.x);
  sorted.slice(1).forEach((g, i) => t.true(sorted[i].x + sorted[i].w < g.x));
  NOTE_SLOTS.forEach((n, i) => {
    t.true(n.x + n.w <= SCENE_WIDTH && n.y + n.h <= SCENE_HEIGHT);
    NOTE_SLOTS.slice(i + 1).forEach(m =>
      t.true(
        n.x + n.w <= m.x ||
          m.x + m.w <= n.x ||
          n.y + n.h <= m.y ||
          m.y + m.h <= n.y
      )
    );
  });
});

test('every page of books fits its bay, even with the widest spines', t => {
  BAY_GEOMETRY.forEach(g => {
    const widest = Array.from({ length: 200 }, (_, i) => ({
      id: i,
      look: { width: MAX_SPINE_WIDTH },
    }));
    const mixed = Array.from({ length: 200 }, (_, i) => ({
      id: i,
      look: bookLook(`mixed-${i}`),
    }));
    for (const items of [widest, mixed]) {
      const pages = paginateBooks(items, g);
      t.is(pages.flat().length, items.length); // nothing lost, nothing repeated
      for (const page of pages) {
        const placed = packRows(
          page.map(b => b.look.width),
          g
        );
        t.truthy(placed);
        placed!.forEach((p, k) => {
          t.true(p.x >= g.x);
          t.true(p.x + page[k].look.width <= g.x + g.w);
          t.true(g.rows.includes(p.baseline));
        });
      }
    }
  });
  t.deepEqual(paginateBooks([], BAY_GEOMETRY[0]), [[]]);
});

test('favourites come first, then newest', t => {
  const m = layoutShelf({
    docs: [doc('old-fav', 1, true), doc('new', 100), doc('mid', 50)],
    folders: [],
    openedIds: [],
  });
  t.deepEqual(
    m.bays[0].books.map(b => b.docId),
    ['old-fav', 'new', 'mid']
  );
});

test('trashed or missing docs linked in a folder are ignored', t => {
  const m = layoutShelf({
    docs: [doc('a', 1)],
    folders: [folder('f', ['a', 'gone', 'a'])],
    openedIds: [],
  });
  t.deepEqual(
    m.bays[0].books.map(b => b.docId),
    ['a']
  );
});

test('a doc linked in two folders shows in both and is not unfiled', t => {
  const m = layoutShelf({
    docs: [doc('a', 1)],
    folders: [folder('f1', ['a']), folder('f2', ['a'])],
    openedIds: [],
  });
  t.is(m.bays.filter(b => b.books.some(x => x.docId === 'a')).length, 2);
  t.false(m.bays.some(b => b.unfiled));
});

test('paging: bays beyond the page size move to the next page', t => {
  const folders = Array.from({ length: 6 }, (_, i) =>
    folder(`f${i}`, [`d${i}`])
  );
  const docs = folders.map((f, i) => doc(`d${i}`, 100 - i));
  const p0 = layoutShelf({ docs, folders, openedIds: [] }, 0);
  const p1 = layoutShelf({ docs, folders, openedIds: [] }, 1);
  t.is(p0.pageCount, 2);
  t.is(p0.bays.length, 4);
  t.is(p1.bays.length, 2);
  // out-of-range pages clamp
  t.is(layoutShelf({ docs, folders, openedIds: [] }, 99).page, 1);
  t.is(layoutShelf({ docs, folders, openedIds: [] }, -3).page, 0);
});

test('pin board shows the most recently edited folder, newest docs first', t => {
  const m = layoutShelf({
    docs: [doc('a', 10), doc('b', 90), doc('c', 80), doc('x', 95)],
    folders: [folder('f1', ['a']), folder('f2', ['b', 'c'])],
    openedIds: [],
  });
  t.is(m.pinBoard.folderId, 'f2');
  t.is(m.pinBoard.folderName, 'Folder f2');
  t.deepEqual(
    m.pinBoard.notes.map(n => n.docId),
    ['b', 'c']
  );
});

test('pin board falls back to the newest docs when there are no folders', t => {
  const m = layoutShelf({
    docs: Array.from({ length: 9 }, (_, i) => doc(`d${i}`, i)),
    folders: [],
    openedIds: [],
  });
  t.is(m.pinBoard.folderName, null);
  t.is(m.pinBoard.notes.length, DEFAULT_SHELF_OPTIONS.noteCount);
  t.is(m.pinBoard.notes.length, NOTE_SLOTS.length);
  t.is(m.pinBoard.notes[0].docId, 'd8');
});

test('empty workspace yields one empty unfiled bay and an empty board', t => {
  const m = layoutShelf({ docs: [], folders: [], openedIds: [] });
  t.is(m.bays.length, 1);
  t.is(m.bays[0].total, 0);
  t.is(m.pinBoard.notes.length, 0);
  t.is(m.total, 0);
  t.is(m.opened, 0);
});

test('opened counter counts live docs once and drops deleted ones', t => {
  const m = layoutShelf({
    docs: [doc('a', 1), doc('b', 2)],
    folders: [],
    openedIds: ['a', 'a', 'deleted'],
  });
  t.is(m.opened, 1);
  t.is(m.total, 2);
  t.true(m.bays[0].books.find(b => b.docId === 'a')!.opened);
  t.false(m.bays[0].books.find(b => b.docId === 'b')!.opened);
});

test('markOpened is idempotent and bounded', t => {
  const a = markOpened([], 'x');
  t.deepEqual(a, ['x']);
  t.is(markOpened(a, 'x'), a); // same reference, no write needed
  t.is(markOpened(a, ''), a);
  const full = Array.from({ length: MAX_OPENED_IDS }, (_, i) => `i${i}`);
  const next = markOpened(full, 'new');
  t.is(next.length, MAX_OPENED_IDS);
  t.is(next.at(-1), 'new');
  t.is(next[0], 'i1');
});

test('countOpened ignores duplicates and unknown ids', t => {
  t.is(countOpened(['a', 'a', 'b', 'z'], new Set(['a', 'b'])), 2);
});

test('docIdFromPathname', t => {
  t.is(docIdFromPathname('/abc123'), 'abc123');
  t.is(docIdFromPathname('/abc123/attachments/x'), 'abc123');
  t.is(docIdFromPathname('/'), null);
});

test('palettes: text on the surfaces it sits on meets WCAG AA (4.5:1)', t => {
  const failures: string[] = [];
  for (const p of Object.values(PALETTES)) {
    const pairs: [string, string, string][] = [
      ['headline on wall', p.headline, p.wall],
      ['ink on wall', p.ink, p.wall],
      ['counter on floor', p.counterText, p.floor],
      ['accent button text', p.accentText, p.accent],
    ];
    for (const [name, fg, bg] of pairs) {
      const c = contrast(fg, bg);
      if (c < 4.5) failures.push(`${p.id}: ${name} is ${c.toFixed(2)}:1`);
    }
  }
  t.deepEqual(failures, []);
});

test('flowers: slots are inside the scene, apart, and clear of the pin board', t => {
  for (const [i, a] of FLOWER_SLOTS.entries()) {
    t.true(a.x > FLOWER_SIZE && a.x < SCENE_WIDTH - FLOWER_SIZE);
    t.true(a.y > FLOWER_SIZE && a.y < SCENE_HEIGHT - FLOWER_SIZE);
    // pin board label: x 219..428 from y=264; the board itself: x 171..473 from y=289
    const r = FLOWER_SIZE / 2;
    const overLabel = a.y + r > 264 && a.x + r > 219 && a.x - r < 428;
    const overBoard = a.y + r > 289 && a.x + r > 171 && a.x - r < 473;
    t.false(overLabel);
    t.false(overBoard);
    for (const b of FLOWER_SLOTS.slice(i + 1)) {
      t.true(Math.hypot(a.x - b.x, a.y - b.y) >= 24);
    }
  }
});

test('flowers: every notification gets its own slot, up to the capacity', t => {
  const ids = Array.from({ length: 30 }, (_, i) => `n-${i}`);
  const slots = assignSlots(ids, new Map());
  t.is(slots.size, FLOWER_SLOTS.length);
  t.is(new Set(slots.values()).size, FLOWER_SLOTS.length);
  // newest first: the first ids are the ones that bloom
  t.true(ids.slice(0, FLOWER_SLOTS.length).every(id => slots.has(id)));
  t.false(slots.has('n-29'));
});

test('flowers: reading one leaves the others where they were', t => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const before = assignSlots(ids, new Map());
  const after = assignSlots(['a', 'c', 'd', 'e'], before);
  for (const id of ['a', 'c', 'd', 'e']) t.is(after.get(id), before.get(id));
  t.false(after.has('b'));
});

test('flowers: a waiting notification takes the slot that frees up', t => {
  const ids = Array.from(
    { length: FLOWER_SLOTS.length + 1 },
    (_, i) => `n-${i}`
  );
  const first = assignSlots(ids, new Map());
  const waiting = ids[ids.length - 1];
  t.false(first.has(waiting));
  const freed = first.get('n-3');
  const next = assignSlots(
    ids.filter(id => id !== 'n-3'),
    first
  );
  t.is(next.get(waiting), freed);
  for (const id of ids.filter(id => id !== 'n-3' && id !== waiting)) {
    t.is(next.get(id), first.get(id));
  }
});

test('flowers: new notifications avoid occupied slots and duplicates are ignored', t => {
  const prev = new Map([['a', 4]]);
  const slots = assignSlots(['a', 'a', 'b'], prev);
  t.is(slots.get('a'), 4);
  t.is(slots.size, 2);
  t.not(slots.get('b'), 4);
  // a stale slot beyond the capacity is not trusted
  t.true(
    (assignSlots(['z'], new Map([['z', 99]])).get('z') ?? 99) <
      FLOWER_SLOTS.length
  );
});

test('flowers: colour follows the kind of notification, and a look is stable', t => {
  t.is(flowerHue('Mention'), 'terra');
  t.is(flowerHue('CommentMention'), 'terra');
  t.is(flowerHue('Comment'), 'terra');
  t.is(flowerHue('InvitationReviewRequest'), 'gold');
  t.is(flowerHue('Something'), 'cream');
  t.deepEqual(flowerLook('id-1', 'Mention'), flowerLook('id-1', 'Mention'));
  const turns = new Set(
    Array.from({ length: 20 }, (_, i) => flowerLook(`id-${i}`, 'x').turn)
  );
  t.true(turns.size > 5);
});

test('shelf navigation entries are unique and start with All docs', t => {
  const ids = SHELF_NAV.map(e => e.id);
  const paths = SHELF_NAV.map(e => e.path);
  t.is(new Set(ids).size, ids.length);
  t.is(new Set(paths).size, paths.length);
  t.is(paths[0], '/all');
  for (const p of paths) t.true(p.startsWith('/') && p.length > 1);
});
