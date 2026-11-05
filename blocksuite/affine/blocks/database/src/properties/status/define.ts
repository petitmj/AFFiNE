import { propertyType, SelectTagSchema, t } from '@blocksuite/data-view';
import zod from 'zod';

/**
 * Notion "status": one option out of a set, and every option belongs to a
 * group (To-do, In progress, Complete). The group assignment is what Notion
 * boards and filters are built on, so it is kept in the column data instead
 * of being dropped when the column is flattened to a plain select.
 */
export const StatusGroupSchema = zod.object({
  id: zod.string(),
  name: zod.string(),
  color: zod.string().optional(),
  optionIds: zod.array(zod.string()),
});
export type StatusGroup = zod.infer<typeof StatusGroupSchema>;

export const StatusPropertySchema = zod.object({
  options: zod.array(SelectTagSchema),
  groups: zod.array(StatusGroupSchema).default([]),
});
export type StatusPropertyData = zod.infer<typeof StatusPropertySchema>;

export const statusColumnType = propertyType('status');
export const statusPropertyModelConfig = statusColumnType.modelConfig({
  name: 'Status',
  propertyData: {
    schema: StatusPropertySchema,
    default: () => ({ options: [], groups: [] }),
  },
  jsonValue: {
    schema: zod.string().nullable(),
    isEmpty: ({ value }) => value == null,
    type: ({ data }) => t.tag.instance(data.options),
  },
  rawValue: {
    schema: zod.string().nullable(),
    default: () => null,
    toString: ({ value, data }) =>
      data.options.find(v => v.id === value)?.value ?? '',
    fromString: ({ value: text, data }) => {
      const name = text.trim();
      const option = data.options.find(v => v.value === name);
      return { value: option ? option.id : null, data };
    },
    toJson: ({ value }) => value,
    fromJson: ({ value }) => value,
  },
});
