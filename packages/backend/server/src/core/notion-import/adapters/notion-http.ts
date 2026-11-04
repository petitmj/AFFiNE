// ============================================================================
// Notion HTTP Adapter
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';

import { SafeFetch } from '../../../base/utils/ssrf';
import type { HttpPort, HttpRequest, HttpResponse } from '../domain/ports';

const NOTION_API_HOST = 'api.notion.com';

/**
 * HTTP adapter for making requests to Notion's API.
 * Uses SafeFetch to prevent SSRF attacks.
 * Only allows requests to api.notion.com with no redirects.
 */
@Injectable()
export class NotionHttpAdapter implements HttpPort {
  private readonly logger = new Logger(NotionHttpAdapter.name);
  private readonly safeFetch: SafeFetch;

  constructor() {
    // Create a SafeFetch instance that only allows requests to Notion
    this.safeFetch = new SafeFetch({
      allowedHosts: [NOTION_API_HOST],
      maxBytes: 100 * 1024 * 1024, // 100 MB max response
      maxRedirects: 0, // No redirects allowed
    });
  }

  async request(
    request: HttpRequest,
    token: string,
    apiVersion: string
  ): Promise<HttpResponse> {
    const url = this.buildUrl(request.path, request.query);

    const headers = {
      ...request.headers,
      'Authorization': `Bearer ${token}`,
      'Notion-Version': apiVersion,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const options: RequestInit = {
      method: request.method,
      headers,
    };

    if (request.body) {
      options.body = JSON.stringify(request.body);
    }

    try {
      const response = await this.safeFetch.fetch(url, options);
      return new NotionHttpResponse(response);
    } catch (error) {
      this.logger.error(`Notion API request failed: ${error}`);
      throw error;
    }
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    let url = `https://${NOTION_API_HOST}${path}`;

    if (query && Object.keys(query).length > 0) {
      const searchParams = new URLSearchParams(query);
      url += `?${searchParams.toString()}`;
    }

    return url;
  }
}

/**
 * Wrapper around the Fetch API response to implement the HttpResponse interface.
 */
class NotionHttpResponse implements HttpResponse {
  private readonly headersMap: Map<string, string>;

  constructor(private readonly response: Response) {
    this.headersMap = new Map();
    response.headers.forEach((value, key) => {
      this.headersMap.set(key.toLowerCase(), value);
    });
  }

  get status(): number {
    return this.response.status;
  }

  async json(): Promise<unknown> {
    return this.response.json();
  }

  header(name: string): string | null {
    return this.headersMap.get(name.toLowerCase()) || null;
  }
}
