import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

/**
 * Notion "rollup". `function` is Notion's aggregation name (count, sum,
 * show_original, earliest_date, ...). The value is the result Notion had
 * computed at import time (`display` for the cell, `raw` untouched), so the
 * imported database shows the same numbers before any recomputation.
 */
export const RollupPropertySchema = zod.object({
  relationPropertyName: zod.string().default(''),
  rollupPropertyName: zod.string().default(''),
  function: zod.string().default('show_original'),
});
export type RollupPropertyData = zod.infer<typeof RollupPropertySchema>;

export const RollupValueSchema = zod.object({
  display: zod.string(),
  raw: zod.unknown(),
  /** true when Notion reported the result as incomplete (over 25 refs) */
  incomplete: zod.boolean().default(false),
});
export type RollupValue = zod.infer<typeof RollupValueSchema>;

export const rollupColumnType = propertyType('rollup');
export const rollupPropertyModelConfig = rollupColumnType.modelConfig({
  name: 'Rollup',
  propertyData: {
    schema: RollupPropertySchema,
    default: () => ({
      relationPropertyName: '',
      rollupPropertyName: '',
      function: 'show_original',
    }),
  },
  jsonValue: {
    schema: zod.string(),
    isEmpty: ({ value }) => !value,
    type: () => t.string.instance(),
  },
  rawValue: {
    schema: RollupValueSchema.nullable(),
    default: () => null,
    toString: ({ value }) => value?.display ?? '',
    fromString: () => ({ value: null }),
    toJson: ({ value }) => value?.display ?? '',
    fromJson: ({ value }) =>
      value ? { display: value, raw: value, incomplete: false } : null,
  },
});
