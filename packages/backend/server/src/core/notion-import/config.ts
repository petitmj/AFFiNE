import { defineModuleConfig } from '../../base/config';

export interface NotionImportModuleConfig {
  /** Whether the Notion import feature is enabled */
  enabled: boolean;
  /** Notion API version to use (must be >= 2025-09-03 for data sources) */
  apiVersion: string;
  /** Number of days to retain import run data before cleanup */
  retentionDays: number;
  /** Maximum file size in bytes to download from Notion */
  maxFileBytes: number;
  /** Maximum number of attempts for a task before giving up */
  maxTaskAttempts: number;
  /** Maximum number of concurrent import runs per workspace */
  maxConcurrentRuns: number;
}

export const NotionImportConfigSchema = {
  'notionImport.enabled': {
    desc: 'Enable or disable the Notion zero-loss import feature',
    default: true,
  },
  'notionImport.apiVersion': {
    desc: 'Notion API version (must be >= 2025-09-03 for data sources)',
    default: '2025-09-03',
  },
  'notionImport.retentionDays': {
    desc: 'Days to retain import run data before cleanup',
    default: 30,
  },
  'notionImport.maxFileBytes': {
    desc: 'Maximum file size in bytes to download from Notion',
    default: 100 * 1024 * 1024, // 100 MB
  },
  'notionImport.maxTaskAttempts': {
    desc: 'Maximum number of attempts for a task before giving up',
    default: 5,
  },
  'notionImport.maxConcurrentRuns': {
    desc: 'Maximum number of concurrent import runs per workspace',
    default: 1,
  },
} as const;

export function defineNotionImportModuleConfig() {
  return defineModuleConfig('notionImport', NotionImportConfigSchema);
}

export function getNotionImportConfig(): NotionImportModuleConfig {
  return {
    enabled: process.env.NOTION_IMPORT_ENABLED !== 'false',
    apiVersion: process.env.NOTION_API_VERSION || '2025-09-03',
    retentionDays: parseInt(process.env.NOTION_IMPORT_RETENTION_DAYS || '30', 10),
    maxFileBytes: parseInt(process.env.NOTION_IMPORT_MAX_FILE_BYTES || '104857600', 10),
    maxTaskAttempts: parseInt(process.env.NOTION_IMPORT_MAX_TASK_ATTEMPTS || '5', 10),
    maxConcurrentRuns: parseInt(process.env.NOTION_IMPORT_MAX_CONCURRENT_RUNS || '1', 10),
  };
}
