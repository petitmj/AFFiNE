import type {
  FileMirror,
  FileRegistry,
  HttpPort,
  HttpRequest,
  HttpResponse,
  NotionApi,
  StagingStore,
} from '../domain/ports';
import type { Clock } from '../domain/rate-limiter';
import type {
  FileRecord,
  JsonObject,
  ListPage,
  MirroredFile,
  StagedItem,
} from '../domain/types';

export class FakeClock implements Clock {
  time = 0;
  sleeps: number[] = [];
  now() {
    return this.time;
  }
  async sleep(ms: number) {
    this.sleeps.push(ms);
    this.time += ms;
  }
}

export class ScriptedHttp implements HttpPort {
  requests: HttpRequest[] = [];
  constructor(private readonly responses: HttpResponse[]) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.requests.push(request);
    const next = this.responses.shift();
    if (!next) throw new Error('no scripted response left');
    return next;
  }
}

export class MemoryStore implements StagingStore {
  items = new Map<string, StagedItem>();
  async putItems(runId: string, items: StagedItem[]) {
    for (const item of items) {
      this.items.set(`${runId}/${item.kind}/${item.notionId}`, item);
    }
  }
}

export class MemoryFiles implements FileRegistry {
  records = new Map<string, FileRecord>();
  async get(runId: string, ownerId: string, slot: string) {
    return this.records.get(`${runId}/${ownerId}/${slot}`) ?? null;
  }
  async upsert(runId: string, record: FileRecord) {
    this.records.set(`${runId}/${record.ownerId}/${record.slot}`, record);
  }
}

export class ScriptedMirror implements FileMirror {
  calls: string[] = [];
  constructor(
    private readonly behaviour: (url: string) => MirroredFile | Error
  ) {}
  async mirror(input: { url: string; name: string | null }) {
    this.calls.push(input.url);
    const result = this.behaviour(input.url);
    if (result instanceof Error) throw result;
    return result;
  }
}

export function page(items: JsonObject[], next: string | null = null): ListPage {
  return {
    results: items,
    nextCursor: next,
    hasMore: next !== null,
    incomplete: false,
  };
}

/** A NotionApi where every method throws unless a test overrides it. */
export function api(overrides: Partial<NotionApi>): NotionApi {
  const fail = (name: string) => async () => {
    throw new Error(`unexpected call: ${name}`);
  };
  return {
    search: fail('search'),
    listUsers: fail('listUsers'),
    retrievePage: fail('retrievePage'),
    retrieveBlock: fail('retrieveBlock'),
    retrieveDatabase: fail('retrieveDatabase'),
    retrieveDataSource: fail('retrieveDataSource'),
    queryDataSource: fail('queryDataSource'),
    listBlockChildren: fail('listBlockChildren'),
    retrievePageProperty: fail('retrievePageProperty'),
    listComments: fail('listComments'),
    ...overrides,
  } as NotionApi;
}
