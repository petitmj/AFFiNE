// ============================================================================
// Notion REST Client for Notion Import
// ============================================================================

import type { HttpPort, HttpRequest } from './ports';
import { NotionHttpError, TokenRevokedError } from './errors';
import type { RateLimiter } from './rate-limiter';

/**
 * Envelope returned by Notion's paginated endpoints.
 */
export type Envelope<T> = {
  results?: T[];
  next_cursor?: string | null;
  has_more?: boolean;
  request_status?: { state?: string; reason?: string } | null;
};

const RETRIABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const INLINE_ATTEMPTS = 6;

/**
 * Notion REST client.
 * Keeps every Notion limit in one place: pagination envelopes,
 * Retry-After, backoff, and the 401 that is fatal for a run.
 * The token is only ever placed in the Authorization header by the adapter.
 */
export class NotionClient {
  constructor(
    private readonly http: HttpPort,
    private readonly limiter: RateLimiter,
    private readonly token: string,
    private readonly apiVersion: string
  ) {}

  async me(): Promise<unknown> {
    return this.request({ method: 'GET', path: '/v1/users/me' });
  }

  async users(cursor: string | null): Promise<Envelope<unknown>> {
    return this.page({ method: 'GET', path: '/v1/users' }, cursor);
  }

  async search(cursor: string | null): Promise<Envelope<unknown>> {
    return this.page(
      {
        method: 'POST',
        path: '/v1/search',
        body: {
          page_size: 100,
          sort: { direction: 'ascending', timestamp: 'last_edited_time' },
        },
      },
      cursor
    );
  }

  async page(id: string): Promise<unknown> {
    return this.request({ method: 'GET', path: `/v1/pages/${id}` });
  }

  async database(id: string): Promise<unknown> {
    return this.request({ method: 'GET', path: `/v1/databases/${id}` });
  }

  async dataSource(id: string): Promise<unknown> {
    return this.request({ method: 'GET', path: `/v1/data_sources/${id}` });
  }

  async queryDataSource(
    id: string,
    cursor: string | null,
    windowStart: string | null
  ): Promise<Envelope<unknown>> {
    const filter = windowStart
      ? {
          timestamp: 'created_time',
          created_time: { on_or_after: windowStart },
        }
      : undefined;

    return this.page(
      {
        method: 'POST',
        path: `/v1/data_sources/${id}/query`,
        body: {
          page_size: 100,
          ...(filter
            ? {
                filter,
                sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
              }
            : {}),
        },
      },
      cursor
    );
  }

  async blockChildren(blockId: string, cursor: string | null): Promise<Envelope<unknown>> {
    return this.page({ method: 'GET', path: `/v1/blocks/${blockId}/children` }, cursor);
  }

  async propertyItems(
    pageId: string,
    propertyId: string,
    cursor: string | null
  ): Promise<Envelope<unknown>> {
    return this.page(
      { method: 'GET', path: `/v1/pages/${pageId}/properties/${propertyId}` },
      cursor
    );
  }

  async comments(blockId: string, cursor: string | null): Promise<Envelope<unknown>> {
    return this.page(
      { method: 'GET', path: '/v1/comments', query: { block_id: blockId } },
      cursor
    );
  }

  async downloadFile(url: string): Promise<{ data: Buffer; mimeType: string }> {
    // For file downloads, we use a GET request to the URL
    // Note: This might need special handling for Notion's signed URLs
    const response = await this.http.request(
      { method: 'GET', path: new URL(url).pathname },
      this.token,
      this.apiVersion
    );

    if (response.status !== 200) {
      throw new NotionHttpError(response.status, `Failed to download file: HTTP ${response.status}`);
    }

    const data = Buffer.from(await response.json() as any);
    const contentType = response.header('content-type') || 'application/octet-stream';

    return {
      data,
      mimeType: contentType.split(';')[0],
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async page(request: HttpRequest, cursor: string | null): Promise<Envelope<unknown>> {
    if (cursor) {
      request = {
        ...request,
        query: { ...(request.query ?? {}), start_cursor: cursor },
      };
    }

    const payload = await this.request(request);
    return (payload ?? {}) as Envelope<unknown>;
  }

  private async request(request: HttpRequest): Promise<unknown> {
    let attempt = 0;

    for (;;) {
      await this.limiter.acquire();

      const response = await this.http.request(request, this.token, this.apiVersion);

      // 401 means the token is invalid or revoked - fatal for the run
      if (response.status === 401) {
        throw new TokenRevokedError();
      }

      // 429 means rate limited - pause the limiter and retry
      if (response.status === 429) {
        const retryAfter = Number(response.header('retry-after') ?? '1');
        this.limiter.pauseFor(
          (Number.isFinite(retryAfter) ? retryAfter : 1) * 1000
        );

        attempt += 1;
        if (attempt > INLINE_ATTEMPTS) {
          throw new NotionHttpError(
            429,
            'Notion rate limit persisted after multiple attempts',
            true
          );
        }
        continue;
      }

      // Other retriable status codes
      if (RETRIABLE_STATUS.has(response.status)) {
        attempt += 1;
        if (attempt > INLINE_ATTEMPTS) {
          throw new NotionHttpError(
            response.status,
            `Notion error ${response.status} persisted`,
            true
          );
        }
        // Exponential backoff
        await sleep(250 * 2 ** attempt);
        continue;
      }

      // Any other 4xx or 5xx is a fatal error for this request
      if (response.status >= 400) {
        throw new NotionHttpError(
          response.status,
          `Notion error ${response.status}`,
          false
        );
      }

      // Success!
      return response.json();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type { Envelope };
