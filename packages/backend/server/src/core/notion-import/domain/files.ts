import type { FileRef, JsonObject, OwnerKind } from './types';

function obj(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

/** `{ type: 'file', file: { url } }` as Notion shapes a Notion-hosted file. */
function hostedUrl(value: unknown): string | null {
  const node = obj(value);
  if (!node || node.type !== 'file') return null;
  const file = obj(node.file);
  return file && typeof file.url === 'string' ? file.url : null;
}

function nameOf(value: unknown): string | null {
  const node = obj(value);
  return node && typeof node.name === 'string' ? node.name : null;
}

/**
 * Finds every Notion-hosted file an object points at. External URLs are
 * not listed: they do not expire, so they are kept as links.
 */
export function extractFileRefs(
  ownerKind: OwnerKind,
  payload: JsonObject
): FileRef[] {
  const refs: FileRef[] = [];
  const push = (slot: string, node: unknown) => {
    const url = hostedUrl(node);
    if (url) refs.push({ slot, url, name: nameOf(node) });
  };

  switch (ownerKind) {
    case 'block': {
      const type = typeof payload.type === 'string' ? payload.type : null;
      const inner = type ? obj(payload[type]) : null;
      if (inner) {
        push('file', inner);
        push('icon', inner.icon);
      }
      break;
    }
    case 'page':
    case 'database': {
      push('cover', payload.cover);
      push('icon', payload.icon);
      const properties = obj(payload.properties);
      for (const prop of Object.values(properties ?? {})) {
        const property = obj(prop);
        if (!property || property.type !== 'files') continue;
        const files = Array.isArray(property.files) ? property.files : [];
        files.forEach((file, index) =>
          push(`prop:${String(property.id)}:${index}`, file)
        );
      }
      break;
    }
    case 'comment': {
      const attachments = Array.isArray(payload.attachments)
        ? payload.attachments
        : [];
      attachments.forEach((attachment, index) =>
        push(`attachment:${index}`, attachment)
      );
      break;
    }
  }
  return refs;
}
