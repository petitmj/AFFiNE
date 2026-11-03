import { Injectable } from '@nestjs/common';

import { safeFetch } from '../../../base/utils/ssrf';
import type { HttpPort, HttpRequest, HttpResponse } from '../domain/ports';

const NOTION_HOST = 'api.notion.com';
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

/**
 * Sends Notion API requests through the SSRF-safe fetch. The host is pinned
 * and redirects are refused, so the integration token can only ever reach
 * api.notion.com.
 */
@Injectable()
export class NotionHttpAdapter implements HttpPort {
  async send(request: HttpRequest): Promise<HttpResponse> {
    const response = await safeFetch(
      request.url,
      { method: request.method, headers: request.headers, body: request.body },
      {
        timeoutMs: 30_000,
        maxRedirects: 0,
        maxBytes: MAX_RESPONSE_BYTES,
        allowedHosts: [NOTION_HOST],
        allowedHeaders: ['authorization', 'content-type', 'notion-version'],
      }
    );
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      json,
    };
  }
}
