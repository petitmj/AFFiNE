import { NotionApiError } from './errors';
import type { HttpPort, HttpResponse, NotionApi } from './ports';
import { type Clock, RateLimiter, systemClock } from './rate-limiter';
import type { JsonObject, ListPage } from './types';

export const NOTION_API_BASE = 'https://api.notion.com';
const PAGE_SIZE = 100;

export interface NotionClientOptions {
  token: string;
  apiVersion: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  clock?: Clock;
  limiter?: RateLimiter;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRetryAfterMs(headers: Record<string, string>): number | null {
  const raw = headers['retry-after'] ?? headers['Retry-After'];
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

function errorFrom(response: HttpResponse, retriable: boolean) {
  const body = isObject(response.json) ? response.json : {};
  const code = typeof body.code === 'string' ? body.code : 'unknown';
  const message =
    typeof body.message === 'string'
      ? body.message
      : `Notion API returned ${response.status}`;
  return new NotionApiError(response.status, code, message, retriable);
}

/**
 * Notion REST client. Handles pagination envelopes, the 3 req/s limit,
 * `Retry-After`, and transient failures. The token only ever appears in the
 * Authorization header, never in an error or a log line.
 */
export class NotionClient implements NotionApi {
  private readonly clock: Clock;
  private readonly limiter: RateLimiter;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(
    private readonly http: HttpPort,
    private readonly options: NotionClientOptions
  ) {
    this.clock = options.clock ?? systemClock;
    this.limiter = options.limiter ?? new RateLimiter(this.clock);
    this.maxAttempts = options.maxAttempts ?? 6;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
  }

  search(cursor: string | null) {
    return this.list('POST', '/v1/search', {
      page_size: PAGE_SIZE,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
  }

  /** The bot user of the token. Used once, to check a token before a run starts. */
  retrieveBotUser() {
    return this.object('GET', '/v1/users/me');
  }

  listUsers(cursor: string | null) {
    return this.list('GET', `/v1/users${this.query({ cursor })}`);
  }

  retrievePage(id: string) {
    return this.object('GET', `/v1/pages/${encodeURIComponent(id)}`);
  }

  retrieveBlock(id: string) {
    return this.object('GET', `/v1/blocks/${encodeURIComponent(id)}`);
  }

  retrieveDatabase(id: string) {
    return this.object('GET', `/v1/databases/${encodeURIComponent(id)}`);
  }

  retrieveDataSource(id: string) {
    return this.object('GET', `/v1/data_sources/${encodeURIComponent(id)}`);
  }

  /**
   * One query returns at most 10,000 rows and then reports
   * `request_status.type = "incomplete"` while `has_more` is false. Callers
   * must window on `created_time` using `createdOnOrAfter`.
   */
  queryDataSource(
    id: string,
    options: { cursor: string | null; createdOnOrAfter: string | null }
  ) {
    return this.list(
      'POST',
      `/v1/data_sources/${encodeURIComponent(id)}/query`,
      {
        page_size: PAGE_SIZE,
        sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
        ...(options.createdOnOrAfter
          ? {
              filter: {
                timestamp: 'created_time',
                created_time: { on_or_after: options.createdOnOrAfter },
              },
            }
          : {}),
        ...(options.cursor ? { start_cursor: options.cursor } : {}),
      }
    );
  }

  listBlockChildren(id: string, cursor: string | null) {
    return this.list(
      'GET',
      `/v1/blocks/${encodeURIComponent(id)}/children${this.query({ cursor })}`
    );
  }

  async retrievePageProperty(
    pageId: string,
    propertyId: string,
    cursor: string | null
  ): Promise<ListPage> {
    const path = `/v1/pages/${encodeURIComponent(pageId)}/properties/${encodeURIComponent(propertyId)}${this.query({ cursor })}`;
    const body = await this.call('GET', path);
    // A property is either one property_item or a list of them.
    if (body.object === 'list') return this.toListPage(body);
    return { results: [body], nextCursor: null, hasMore: false, incomplete: false };
  }

  listComments(blockId: string, cursor: string | null) {
    return this.list(
      'GET',
      `/v1/comments${this.query({ cursor, extra: { block_id: blockId } })}`
    );
  }

  // ---- plumbing ----------------------------------------------------------

  private query(input: { cursor: string | null; extra?: Record<string, string> }) {
    const params = new URLSearchParams({
      page_size: String(PAGE_SIZE),
      ...(input.extra ?? {}),
    });
    if (input.cursor) params.set('start_cursor', input.cursor);
    return `?${params.toString()}`;
  }

  private async object(method: 'GET' | 'POST', path: string) {
    return this.call(method, path);
  }

  private async list(
    method: 'GET' | 'POST',
    path: string,
    body?: JsonObject
  ): Promise<ListPage> {
    return this.toListPage(await this.call(method, path, body));
  }

  private toListPage(body: JsonObject): ListPage {
    const results = Array.isArray(body.results)
      ? body.results.filter(isObject)
      : [];
    const status = isObject(body.request_status) ? body.request_status : null;
    return {
      results,
      nextCursor: typeof body.next_cursor === 'string' ? body.next_cursor : null,
      hasMore: body.has_more === true,
      incomplete: status?.type === 'incomplete',
    };
  }

  private async call(
    method: 'GET' | 'POST',
    path: string,
    body?: JsonObject
  ): Promise<JsonObject> {
    let lastError: NotionApiError | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      await this.limiter.acquire();
      const response = await this.http.send({
        method,
        url: `${NOTION_API_BASE}${path}`,
        headers: {
          Authorization: `Bearer ${this.options.token}`,
          'Notion-Version': this.options.apiVersion,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (response.status >= 200 && response.status < 300) {
        if (!isObject(response.json)) {
          throw new NotionApiError(
            response.status,
            'invalid_response',
            'Notion returned a body that is not a JSON object',
            true
          );
        }
        return response.json;
      }

      if (response.status === 429) {
        const wait =
          parseRetryAfterMs(response.headers) ??
          this.baseDelayMs * 2 ** attempt;
        this.limiter.penalize(wait);
        lastError = errorFrom(response, true);
        continue;
      }

      const transient =
        response.status === 409 ||
        response.status === 408 ||
        response.status >= 500;
      if (!transient) throw errorFrom(response, false);

      lastError = errorFrom(response, true);
      if (attempt < this.maxAttempts) {
        await this.clock.sleep(this.baseDelayMs * 2 ** (attempt - 1));
      }
    }
    // Out of attempts: surface as retriable so the task queue can back off.
    throw lastError ?? new NotionApiError(0, 'unknown', 'Request failed', true);
  }
}
