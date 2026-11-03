import test from 'ava';

import { canonicalJson, payloadHash } from '../domain/canonical';
import { extractFileRefs } from '../domain/files';
import { assertTransition, canTransition, retryDelayMs, TOKEN_FREE_STATES } from '../domain/lifecycle';
import { preservedPageProperties } from '../domain/preserve';
import { needsPropertyPage, truncatedPropertyIds } from '../domain/properties';

test('canonical JSON ignores key order', t => {
  t.is(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 }));
  t.is(payloadHash({ a: 1, b: 2 }), payloadHash({ b: 2, a: 1 }));
  t.not(payloadHash({ a: 1 }), payloadHash({ a: 2 }));
});

test('file refs: hosted block files are found, external ones are not', t => {
  t.deepEqual(
    extractFileRefs('block', { type: 'pdf', pdf: { type: 'file', name: 'a.pdf', file: { url: 'https://s3/a' } } }),
    [{ slot: 'file', url: 'https://s3/a', name: 'a.pdf' }]
  );
  t.deepEqual(extractFileRefs('block', { type: 'image', image: { type: 'external', external: { url: 'https://x' } } }), []);
  t.is(extractFileRefs('block', { type: 'callout', callout: { icon: { type: 'file', file: { url: 'https://s3/i' } } } })[0].slot, 'icon');
});

test('file refs: page cover, icon and files properties', t => {
  const refs = extractFileRefs('page', {
    cover: { type: 'file', file: { url: 'https://s3/c' } },
    icon: { type: 'emoji', emoji: 'x' },
    properties: {
      Files: { id: 'fid', type: 'files', files: [{ name: 'one', type: 'file', file: { url: 'https://s3/1' } }, { name: 'two', type: 'external', external: { url: 'https://x/2' } }, { name: 'three', type: 'file', file: { url: 'https://s3/3' } }] },
    },
  });
  t.deepEqual(refs.map(r => r.slot), ['cover', 'prop:fid:0', 'prop:fid:2']);
});

test('property pages are needed only where Notion truncates', t => {
  t.true(needsPropertyPage({ type: 'relation', has_more: true, relation: [] }));
  t.false(needsPropertyPage({ type: 'relation', has_more: false, relation: [] }));
  t.true(needsPropertyPage({ type: 'rollup', rollup: { type: 'incomplete' } }));
  t.true(needsPropertyPage({ type: 'rollup', rollup: { type: 'array', array: new Array(25).fill({}) } }));
  t.false(needsPropertyPage({ type: 'rollup', rollup: { type: 'number', number: 3 } }));
  t.true(needsPropertyPage({ type: 'people', people: new Array(25).fill({}) }));
  t.false(needsPropertyPage({ type: 'people', people: [{}] }));
  t.false(needsPropertyPage({ type: 'number', number: 1 }));
  t.deepEqual(
    truncatedPropertyIds({ properties: { a: { id: 'x', type: 'relation', has_more: true }, b: { id: 'y', type: 'number' } } }),
    ['x']
  );
});

test('run lifecycle only allows the documented transitions', t => {
  t.true(canTransition('pending', 'running'));
  t.true(canTransition('running', 'staged'));
  t.true(canTransition('failed', 'running'));
  t.false(canTransition('staged', 'running'));
  t.false(canTransition('expired', 'running'));
  t.throws(() => assertTransition('cancelled', 'running'));
  t.deepEqual([...TOKEN_FREE_STATES].sort(), ['cancelled', 'expired', 'failed', 'staged']);
});

test('retry delay grows and is capped', t => {
  t.is(retryDelayMs(1), 5000);
  t.is(retryDelayMs(2), 10000);
  t.is(retryDelayMs(30), 600000);
});

test('preserved page properties keep raw values of non-native types only', t => {
  const relation = { id: 'r', type: 'relation', relation: [{ id: 'x' }], has_more: false };
  const record = preservedPageProperties({
    id: 'page1',
    properties: {
      Name: { id: 't', type: 'title', title: [] },
      Count: { id: 'n', type: 'number', number: 2 },
      Links: relation,
      Due: { id: 'd', type: 'date', date: { start: '2024-01-01', end: null, time_zone: 'Europe/Paris' } },
    },
  });
  t.deepEqual(record?.kind, 'page_properties');
  t.deepEqual(Object.keys(record?.payload.properties as object).sort(), ['Due', 'Links']);
  t.is((record?.payload.properties as Record<string, unknown>).Links, relation); // not reshaped
  t.is(preservedPageProperties({ id: 'p', properties: { Name: { id: 't', type: 'title', title: [] } } }), null);
  t.is(preservedPageProperties({ properties: {} }), null);
});
