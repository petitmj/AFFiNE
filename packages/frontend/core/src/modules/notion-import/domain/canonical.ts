import type { JsonValue } from './json';

/** JSON with object keys sorted; same bytes as the server's `canonicalJson` */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map(k => `${JSON.stringify(k)}:${canonicalJson(value[k] as JsonValue)}`)
    .join(',')}}`;
}
