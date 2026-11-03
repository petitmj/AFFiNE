import { createHash } from 'node:crypto';

import {
  BlobQuotaExceeded,
  ResponseTooLargeError,
  SsrfBlockedError,
  StorageQuotaExceeded,
} from '../../../base';
import { safeFetch } from '../../../base/utils/ssrf';
import type { BackendRuntimeProvider } from '../../backend-runtime';
import type { WorkspaceBlobStorage } from '../../storage';
import { FileMirrorError } from '../domain/errors';
import type { FileMirror } from '../domain/ports';
import type { MirroredFile } from '../domain/types';

export interface BlobFileMirrorOptions {
  workspaceId: string;
  userId: string;
  maxBytes: number;
}

/**
 * Copies a Notion-hosted file into the workspace blob store using the same
 * reserve, write, finalise sequence as the `setBlob` mutation. That path
 * enforces the storage quota and rejects a key that does not match the bytes.
 *
 * The key is the base64url SHA-256 of the content, so a file that appears in
 * many places is stored once.
 */
export class BlobFileMirror implements FileMirror {
  constructor(
    private readonly runtime: BackendRuntimeProvider,
    private readonly storage: WorkspaceBlobStorage,
    private readonly options: BlobFileMirrorOptions
  ) {}

  async mirror(input: {
    url: string;
    name: string | null;
  }): Promise<MirroredFile> {
    const bytes = await this.download(input.url);
    const key = createHash('sha256').update(bytes).digest('base64url');
    const mime = this.mimeOf(bytes, input.name);
    await this.store(key, bytes, mime);
    return { blobKey: key, size: bytes.byteLength, mime };
  }

  private async download(url: string): Promise<Buffer> {
    let response: Response;
    try {
      response = await safeFetch(
        url,
        { method: 'GET' },
        {
          timeoutMs: 60_000,
          maxRedirects: 3,
          maxBytes: this.options.maxBytes,
          allowedHeaders: [],
        }
      );
    } catch (error) {
      if (error instanceof ResponseTooLargeError) {
        throw new FileMirrorError(
          `File is larger than the ${this.options.maxBytes} byte limit`,
          false
        );
      }
      if (error instanceof SsrfBlockedError) {
        throw new FileMirrorError('File host is not allowed', false);
      }
      throw new FileMirrorError(
        error instanceof Error ? error.message : String(error),
        true
      );
    }
    if (response.status === 403 || response.status === 410) {
      // Signed URLs expire after about an hour: a fresh one fixes this.
      throw new FileMirrorError(`File URL expired (${response.status})`, true);
    }
    if (response.status === 404) {
      throw new FileMirrorError('File no longer exists in Notion', false);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new FileMirrorError(
        `Unexpected status ${response.status}`,
        response.status >= 500 || response.status === 429
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private mimeOf(_bytes: Buffer, name: string | null): string {
    const ext = name?.split('.').at(-1)?.toLowerCase();
    return (ext && EXTENSION_MIME[ext]) || 'application/octet-stream';
  }

  private async store(key: string, bytes: Buffer, mime: string) {
    const { workspaceId, userId } = this.options;
    let reservation;
    try {
      reservation = await this.runtime.reserveStorageQuotaV1({
        workspaceId,
        userId,
        key,
        size: bytes.byteLength,
        mime,
        kind: 'blob',
      });
    } catch (error) {
      throw new FileMirrorError(
        error instanceof Error ? error.message : String(error),
        true
      );
    }
    if (!reservation.allowed) {
      const error =
        reservation.reason === 'blob_limit'
          ? new BlobQuotaExceeded()
          : new StorageQuotaExceeded();
      throw new FileMirrorError(error.message, false);
    }
    if (reservation.alreadyUploaded) return;
    if (!reservation.reservationId) {
      throw new FileMirrorError('Missing blob reservation', true);
    }

    try {
      const metadata = await this.storage.putReservation(
        workspaceId,
        key,
        reservation.reservationId,
        bytes,
        { contentType: mime, contentLength: bytes.byteLength }
      );
      const finalized = await this.runtime.finalizeStorageReservationV1({
        workspaceId,
        userId,
        key,
        reservationId: reservation.reservationId,
        kind: 'blob',
        size: metadata.contentLength,
        mime: metadata.contentType,
      });
      if (!finalized) throw new Error('Blob reservation changed');
    } catch (error) {
      await this.runtime
        .abortStorageReservationV1({
          workspaceId,
          userId,
          key,
          reservationId: reservation.reservationId,
          kind: 'blob',
        })
        .catch(() => undefined);
      throw new FileMirrorError(
        error instanceof Error ? error.message : String(error),
        true
      );
    }
  }
}

const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
};
