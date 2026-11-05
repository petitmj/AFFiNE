import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

/**
 * Notion "files & media" property. `blobId` points into the workspace blob
 * store (files mirrored at import time, because Notion file URLs expire in
 * about an hour). `url` is only set for external links, or as the last
 * resort when a file could not be mirrored; `unavailable` records that.
 */
export const FileEntrySchema = zod.object({
  name: zod.string(),
  blobId: zod.string().optional(),
  url: zod.string().optional(),
  mime: zod.string().optional(),
  size: zod.number().optional(),
  external: zod.boolean().default(false),
  unavailable: zod.boolean().default(false),
});
export type FileEntry = zod.infer<typeof FileEntrySchema>;

export const filesColumnType = propertyType('files');
export const filesPropertyModelConfig = filesColumnType.modelConfig({
  name: 'Files',
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
    schema: zod.array(FileEntrySchema),
    default: () => [],
    toString: ({ value }) => value.map(f => f.name).join(', '),
    fromString: () => ({ value: [] }),
    toJson: ({ value }) => value.map(f => f.name),
    fromJson: () => [],
  },
});
