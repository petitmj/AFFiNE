import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

/**
 * Notion "relation". Each entry points at a row of another database.
 * `docId` is set when the target row was imported; otherwise only the Notion
 * id (and title when known) is kept so nothing is lost and a later import of
 * the target can resolve it.
 */
export const RelationEntrySchema = zod.object({
  notionId: zod.string(),
  docId: zod.string().optional(),
  title: zod.string().default(''),
});
export type RelationEntry = zod.infer<typeof RelationEntrySchema>;

export const RelationPropertySchema = zod.object({
  /** AFFiNE id of the database doc the relation points at, if imported */
  targetDocId: zod.string().optional(),
  /** Notion id of the target database / data source */
  targetNotionId: zod.string().optional(),
  /** Notion's own property id, needed by rollups to find this column */
  notionPropertyId: zod.string().optional(),
  /** column in the target that mirrors this relation (dual property) */
  syncedPropertyName: zod.string().optional(),
  limit: zod.enum(['single', 'many']).default('many'),
});
export type RelationPropertyData = zod.infer<typeof RelationPropertySchema>;

export const relationColumnType = propertyType('relation');
export const relationPropertyModelConfig = relationColumnType.modelConfig({
  name: 'Relation',
  propertyData: {
    schema: RelationPropertySchema,
    default: () => ({ limit: 'many' as const }),
  },
  jsonValue: {
    schema: zod.array(zod.string()),
    isEmpty: ({ value }) => value.length === 0,
    type: () => t.array.instance(t.string.instance()),
  },
  rawValue: {
    schema: zod.array(RelationEntrySchema),
    default: () => [],
    toString: ({ value }) => value.map(r => r.title || r.notionId).join(', '),
    fromString: () => ({ value: [] }),
    toJson: ({ value }) => value.map(r => r.title || r.notionId),
    fromJson: () => [],
  },
});
