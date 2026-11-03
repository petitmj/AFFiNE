import { createHash } from 'node:crypto';

import type { JsonValue } from './types';

/** JSON with object keys sorted, so equal objects always hash equally. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`)
    .join(',')}}`;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function payloadHash(value: JsonValue): string {
  return sha256Hex(canonicalJson(value));
}
