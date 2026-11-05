import { type JsonValue, at, isObj, str } from './json';
import { CODES, type Outcome } from './ledger';
import { notionUrl } from './ids';

export interface DeltaAttributes {
  bold?: true;
  italic?: true;
  underline?: true;
  strike?: true;
  code?: true;
  link?: string;
  reference?: { type: 'LinkedPage'; pageId: string };
  latex?: string;
}

export interface DeltaInsert {
  insert: string;
  attributes?: DeltaAttributes;
}

export interface TextContext {
  /** AFFiNE doc id for a Notion page/row id, when that doc is in this import */
  resolveDoc(notionId: string): string | undefined;
  /** report something that was reduced while converting this text */
  note(code: string, outcome: Outcome): void;
}

export interface TextResult {
  delta: DeltaInsert[];
  plain: string;
}

const isDefaultColor = (c: unknown) =>
  c === undefined || c === null || c === 'default';

function attributesFrom(item: Record<string, JsonValue>, ctx: TextContext) {
  const a = at(item, 'annotations');
  const out: DeltaAttributes = {};
  if (isObj(a)) {
    if (a.bold === true) out.bold = true;
    if (a.italic === true) out.italic = true;
    if (a.underline === true) out.underline = true;
    if (a.strikethrough === true) out.strike = true;
    if (a.code === true) out.code = true;
    if (!isDefaultColor(a.color)) ctx.note(CODES.colorDropped, 'degraded');
  }
  return out;
}

/**
 * Notion rich_text array to a BlockSuite delta.
 * Adjacent runs with identical attributes are merged so the delta stays
 * small; nothing else is reordered or dropped.
 */
export function richTextToDelta(
  items: readonly JsonValue[],
  ctx: TextContext
): TextResult {
  const delta: DeltaInsert[] = [];
  const push = (insert: string, attributes: DeltaAttributes) => {
    if (!insert) return;
    const last = delta[delta.length - 1];
    const same =
      last &&
      JSON.stringify(last.attributes ?? {}) === JSON.stringify(attributes);
    if (same) last.insert += insert;
    else
      delta.push(
        Object.keys(attributes).length ? { insert, attributes } : { insert }
      );
  };

  for (const raw of items) {
    if (!isObj(raw)) continue;
    const base = attributesFrom(raw, ctx);
    const type = str(raw.type);
    const plain = str(raw.plain_text);

    if (type === 'equation') {
      const expr = str(at(raw, 'equation', 'expression'), plain);
      // the inline latex attribute carries the formula on a placeholder char
      delta.push({ insert: ' ', attributes: { ...base, latex: expr } });
      continue;
    }

    if (type === 'mention') {
      const m = at(raw, 'mention');
      const mt = str(at(m, 'type'));
      if (mt === 'page' || mt === 'database') {
        const target = str(at(m, mt, 'id'));
        const docId = target ? ctx.resolveDoc(target) : undefined;
        if (docId) {
          delta.push({
            insert: ' ',
            attributes: {
              ...base,
              reference: { type: 'LinkedPage', pageId: docId },
            },
          });
        } else {
          ctx.note(CODES.mentionUnresolved, 'degraded');
          push(plain || target, {
            ...base,
            ...(target ? { link: notionUrl(target) } : {}),
          });
        }
        continue;
      }
      if (mt === 'user') {
        push(plain.startsWith('@') ? plain : `@${plain}`, base);
        continue;
      }
      // date, link_preview, template_mention, custom_emoji: keep the text
      const href = str(raw.href);
      push(plain, href ? { ...base, link: href } : base);
      continue;
    }

    const content = str(at(raw, 'text', 'content'), plain);
    const link = str(at(raw, 'text', 'link', 'url')) || str(raw.href);
    push(content, link ? { ...base, link } : base);
  }

  return { delta, plain: delta.map(d => d.insert).join('') };
}

/** plain text of a rich_text array, no formatting */
export const richTextPlain = (items: readonly JsonValue[]): string =>
  items
    .map(i =>
      isObj(i) ? str(i.plain_text, str(at(i, 'text', 'content'))) : ''
    )
    .join('');

export const textValue = (delta: DeltaInsert[]) => ({
  '$blocksuite:internal:text$': true as const,
  delta,
});
