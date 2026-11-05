import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

/**
 * Notion "people" (also created_by / last_edited_by). Notion users are not
 * AFFiNE workspace members, so each entry keeps the Notion identity as data.
 */
export const PersonSchema = zod.object({
  id: zod.string(),
  name: zod.string(),
  email: zod.string().optional(),
  avatarUrl: zod.string().optional(),
  kind: zod.enum(['person', 'bot']).default('person'),
});
export type Person = zod.infer<typeof PersonSchema>;

export const personColumnType = propertyType('person');
export const personPropertyModelConfig = personColumnType.modelConfig({
  name: 'Person',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  jsonValue: {
    schema: zod.array(zod.string()),
    isEmpty: ({ value }) => value.length === 0,
    type: () => t.array.instance(t.string.instance()),
  },
  rawValue: {
    schema: zod.array(PersonSchema),
    default: () => [],
    toString: ({ value }) => value.map(p => p.name).join(', '),
    fromString: ({ value: text }) => ({
      value: text
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .map(name => ({ id: name, name, kind: 'person' as const })),
    }),
    toJson: ({ value }) => value.map(p => p.name),
    fromJson: ({ value }) =>
      value.map(name => ({ id: name, name, kind: 'person' as const })),
  },
});
