import test from 'ava';

import { NotionApiError } from '../domain/errors';
import { NotionClient } from '../domain/notion-client';
import { RateLimiter } from '../domain/rate-limiter';
import { FakeClock, ScriptedHttp } from './helpers';

const ok = (json: unknown) => ({ status: 200, headers: {}, json });

function client(http: ScriptedHttp, clock = new FakeClock()) {
  return {
    clock,
    client: new NotionClient(http, {
      token: 'secret_token_value',
      apiVersion: '2025-09-03',
      clock,
      limiter: new RateLimiter(clock, 350),
      baseDelayMs: 100,
    }),
  };
}

test('limiter spaces requests by the minimum interval', async t => {
  const clock = new FakeClock();
  const limiter = new RateLimiter(clock, 350);
  await limiter.acquire();
  await limiter.acquire();
  await limiter.acquire();
  t.deepEqual(clock.sleeps, [350, 350]);
});

test('limiter pause after a 429 delays everyone', async t => {
  const clock = new FakeClock();
  const limiter = new RateLimiter(clock, 350);
  limiter.penalize(5000);
  await limiter.acquire();
  t.deepEqual(clock.sleeps, [5000]);
});

test('sends token and version only in headers', async t => {
  const http = new ScriptedHttp([ok({ object: 'list', results: [] })]);
  const { client: c } = client(http);
  await c.listUsers(null);
  const [request] = http.requests;
  t.is(request.headers.Authorization, 'Bearer secret_token_value');
  t.is(request.headers['Notion-Version'], '2025-09-03');
  t.false(request.url.includes('secret_token_value'));
});

test('429 honours Retry-After and then succeeds', async t => {
  const http = new ScriptedHttp([
    { status: 429, headers: { 'retry-after': '2' }, json: { code: 'rate_limited' } },
    ok({ object: 'list', results: [{ id: 'a' }], has_more: false, next_cursor: null }),
  ]);
  const { client: c, clock } = client(http);
  const result = await c.listUsers(null);
  t.is(result.results.length, 1);
  t.true(clock.sleeps.includes(2000));
  t.is(http.requests.length, 2);
});

test('5xx is retried with backoff', async t => {
  const http = new ScriptedHttp([
    { status: 503, headers: {}, json: { code: 'service_unavailable' } },
    ok({ object: 'page', id: 'p' }),
  ]);
  const { client: c } = client(http);
  const result = await c.retrievePage('p');
  t.is(result.id, 'p');
});

test('4xx is not retried and never leaks the token', async t => {
  const http = new ScriptedHttp([
    { status: 401, headers: {}, json: { code: 'unauthorized', message: 'API token is invalid.' } },
  ]);
  const { client: c } = client(http);
  const error = await t.throwsAsync<NotionApiError>(() => c.retrievePage('p'), {
    instanceOf: NotionApiError,
  });
  t.is(error?.status, 401);
  t.true(error?.isFatalForRun);
  t.false(error?.retriable);
  t.false(String(error?.message).includes('secret_token_value'));
  t.is(http.requests.length, 1);
});

test('gives up after the attempt limit and reports a retriable error', async t => {
  const responses = Array.from({ length: 6 }, () => ({
    status: 500,
    headers: {},
    json: { code: 'internal_server_error' },
  }));
  const { client: c } = client(new ScriptedHttp(responses));
  const error = await t.throwsAsync(() => c.retrievePage('p'));
  t.true(error instanceof NotionApiError && error.retriable);
});

test('data source query sorts by created_time and windows with a filter', async t => {
  const http = new ScriptedHttp([
    ok({
      object: 'list',
      results: [],
      has_more: false,
      next_cursor: null,
      request_status: { type: 'incomplete', incomplete_reason: 'query_result_limit_reached' },
    }),
  ]);
  const { client: c } = client(http);
  const result = await c.queryDataSource('ds1', {
    cursor: 'abc',
    createdOnOrAfter: '2024-01-15T09:30:00.000Z',
  });
  t.true(result.incomplete);
  const [request] = http.requests;
  t.is(request.method, 'POST');
  t.true(request.url.endsWith('/v1/data_sources/ds1/query'));
  t.deepEqual(JSON.parse(request.body ?? '{}'), {
    page_size: 100,
    sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
    filter: {
      timestamp: 'created_time',
      created_time: { on_or_after: '2024-01-15T09:30:00.000Z' },
    },
    start_cursor: 'abc',
  });
});

test('property endpoint accepts both a single item and a list', async t => {
  const http = new ScriptedHttp([
    ok({ object: 'property_item', id: 'x', type: 'number', number: 3 }),
    ok({
      object: 'list',
      results: [{ object: 'property_item', id: 'r1' }],
      has_more: true,
      next_cursor: 'next',
    }),
  ]);
  const { client: c } = client(http);
  const single = await c.retrievePageProperty('p', 'x', null);
  t.is(single.results.length, 1);
  t.false(single.hasMore);
  const list = await c.retrievePageProperty('p', 'r', null);
  t.true(list.hasMore);
  t.is(list.nextCursor, 'next');
});
