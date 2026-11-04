// ============================================================================
// Canonical JSON for Notion Import
// ============================================================================

import { createHash } from 'node:crypto';

/**
 * Canonicalize a JSON value for stable hashing.
 * This ensures that equivalent objects produce the same hash,
 * regardless of property order or formatting.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

/**
 * Recursively canonicalize a value.
 * - Objects: sort keys alphabetically
 * - Arrays: keep order (order matters in Notion)
 * - Primitives: keep as-is
 */
function canonicalValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalValue);
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const canonical: Record<string, unknown> = {};

    // Sort keys alphabetically for deterministic ordering
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
      canonical[key] = canonicalValue(obj[key]);
    }

    return canonical;
  }

  // For any other type (Date, etc.), convert to string
  return String(value);
}

/**
 * Compute a SHA-256 hash of a canonical JSON value.
 * Returns the hash as a hex string.
 */
export function hashPayload(payload: unknown): string {
  const canonical = canonicalize(payload);
  const hash = createHash('sha256');
  hash.update(canonical, 'utf8');
  return hash.digest('hex');
}

/**
 * Compute a SHA-256 hash of a string.
 * Returns the hash as a hex string.
 */
export function hashString(str: string): string {
  const hash = createHash('sha256');
  hash.update(str, 'utf8');
  return hash.digest('hex');
}

/**
 * Compute a SHA-256 hash of binary data.
 * Returns the hash as a hex string.
 */
export function hashBinary(data: Buffer | Uint8Array): string {
  const hash = createHash('sha256');
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Create a blob key from a SHA-256 hash.
 * The key format matches the client's sha() function:
 * base64url alphabet with = padding retained.
 */
export function blobKeyFromHash(hash: string): string {
  // Convert hex to base64
  const buffer = Buffer.from(hash, 'hex');
  const base64 = buffer.toString('base64');
  // Convert to base64url: replace + with -, / with _
  const base64url = base64.replace(/\+/g, '-').replace(/\//g, '_');
  // Keep = padding
  return base64url;
}

/**
 * Create a deterministic blob key from a payload.
 * This ensures the same file gets the same blob key across imports.
 */
export function blobKeyFromPayload(payload: unknown): string {
  const hash = hashPayload(payload);
  return blobKeyFromHash(hash);
}
