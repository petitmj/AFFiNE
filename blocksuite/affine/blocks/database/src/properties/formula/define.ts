import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

/**
 * Notion "formula". The expression text is kept in the column data, and each
 * cell keeps the value Notion had computed. AFFiNE does not evaluate Notion's
 * formula language, so the value is static until a formula engine exists; the
 * import ledger records this as `formula_static_value`.
 */
export const FormulaPropertySchema = zod.object({
  expression: zod.string().default(''),
});
export type FormulaPropertyData = zod.infer<typeof FormulaPropertySchema>;

export const FormulaValueSchema = zod.object({
  type: zod.enum(['string', 'number', 'boolean', 'date']),
  value: zod.union([zod.string(), zod.number(), zod.boolean()]).nullable(),
  display: zod.string(),
});
export type FormulaValue = zod.infer<typeof FormulaValueSchema>;

export const formulaColumnType = propertyType('formula');
export const formulaPropertyModelConfig = formulaColumnType.modelConfig({
  name: 'Formula',
  propertyData: {
    schema: FormulaPropertySchema,
    default: () => ({ expression: '' }),
  },
  jsonValue: {
    schema: zod.string(),
    isEmpty: ({ value }) => !value,
    type: () => t.string.instance(),
  },
  rawValue: {
    schema: FormulaValueSchema.nullable(),
    default: () => null,
    toString: ({ value }) => value?.display ?? '',
    fromString: () => ({ value: null }),
    toJson: ({ value }) => value?.display ?? '',
    fromJson: ({ value }) =>
      value ? { type: 'string' as const, value, display: value } : null,
  },
});
