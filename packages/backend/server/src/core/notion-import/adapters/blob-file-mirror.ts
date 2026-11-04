// ============================================================================
// Blob File Mirror for Notion Import
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { BlobModel } from '../../../models/blob';
import { NotionHttpAdapter } from './notion-http';
import type { FileMirror } from '../domain/ports';
import type { FileRef } from '../domain/types';
import { hashBinary, blobKeyFromHash } from '../domain/canonical';

const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB chunks for checksum

/**
 * Mirrors files from Notion to AFFiNE blob storage.
 * Downloads files from Notion, computes SHA-256 checksum, and stores them
 * with a key that matches the client's sha() function.
 */
@Injectable()
export class BlobFileMirror implements FileMirror {
  private readonly logger = new Logger(BlobFileMirror.name);

  constructor(
    private readonly http: NotionHttpAdapter,
    private readonly blobModel: BlobModel
  ) {}

  async mirror(
    runId: string,
    ref: FileRef,
    maxBytes: number = MAX_DOWNLOAD_BYTES
  ): Promise<string> {
    this.logger.debug(`Mirroring file ${ref.url} for run ${runId}`);

    // Download the file
    const { data, mimeType, size } = await this.downloadFile(ref.url, maxBytes);

    // Compute SHA-256 hash
    const hash = hashBinary(data);

    // Create blob key matching client's sha() function
    const blobKey = blobKeyFromHash(hash);

    // Check if blob already exists with this key (idempotent)
    const existing = await this.blobModel.getByKey(blobKey);
    if (existing) {
      this.logger.debug(`Blob already exists with key ${blobKey}`);
      return blobKey;
    }

    // Reserve storage quota
    const reservation = await this.blobModel.reserveStorageQuotaV1({
      workspaceId: runId, // Using runId as workspaceId for now
      size: BigInt(data.length),
      mimeType,
    });

    try {
      // Upload the blob
      await this.blobModel.putReservation({
        reservationId: reservation.id,
        blobId: reservation.blobId,
        data,
        checksum: hash,
      });

      // Finalize the reservation
      await this.blobModel.finalizeStorageReservationV1({
        reservationId: reservation.id,
        checksum: hash,
      });

      this.logger.debug(`Successfully mirrored file to blob ${blobKey}`);
      return blobKey;
    } catch (error) {
      this.logger.error(`Failed to mirror file ${ref.url}: ${error}`);
      // Abort the reservation
      await this.blobModel.abortStorageReservationV1(reservation.id);
      throw error;
    }
  }

  private async downloadFile(
    url: string,
    maxBytes: number
  ): Promise<{ data: Buffer; mimeType: string; size: number }> {
    // Extract the path from the Notion URL
    // Notion file URLs are typically: https://www.notion.so/images/page-cover.jpg
    // or S3 URLs: https://s3.us-west-2.amazonaws.com/secure.notion-static.com/...
    const path = new URL(url).pathname;

    // For now, we'll use a simple approach: download the file using the HTTP adapter
    // In production, this would need to handle Notion's signed URLs properly
    const response = await this.http.request(
      { method: 'GET', path },
      '', // No token needed for public file URLs
      '2025-09-03'
    );

    if (response.status !== 200) {
      throw new Error(`Failed to download file: HTTP ${response.status}`);
    }

    const data = Buffer.from(await response.json() as any);

    if (data.length > maxBytes) {
      throw new Error(`File size ${data.length} exceeds maximum ${maxBytes}`);
    }

    // Try to determine MIME type from Content-Type header or file extension
    const contentType = response.header('content-type') || '';
    const mimeType = contentType.split(';')[0] || this.guessMimeType(url);

    return {
      data,
      mimeType,
      size: data.length,
    };
  }

  private guessMimeType(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'svg':
        return 'image/svg+xml';
      case 'pdf':
        return 'application/pdf';
      case 'json':
        return 'application/json';
      case 'txt':
        return 'text/plain';
      case 'csv':
        return 'text/csv';
      case 'mp4':
        return 'video/mp4';
      case 'mp3':
        return 'audio/mpeg';
      default:
        return 'application/octet-stream';
    }
  }
}
