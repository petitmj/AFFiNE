import { defineModuleConfig } from '../../base';

declare global {
  interface AppConfigSchema {
    notionImport: {
      enabled: boolean;
      apiVersion: string;
      retentionDays: number;
      maxFileBytes: number;
      maxTaskAttempts: number;
    };
  }
}

defineModuleConfig('notionImport', {
  enabled: {
    desc: 'Allow workspace members to import from Notion through the Notion API.',
    default: true,
  },
  apiVersion: {
    desc: 'Notion-Version header sent to the Notion API. 2025-09-03 or later is required for data sources.',
    default: '2025-09-03',
  },
  retentionDays: {
    desc: 'Days to keep staged Notion data before it is deleted. The import report is kept.',
    default: 7,
  },
  maxFileBytes: {
    desc: 'Largest single Notion file that is copied into workspace storage, in bytes.',
    default: 200 * 1024 * 1024,
  },
  maxTaskAttempts: {
    desc: 'How many times a failing Notion read is retried before it is reported as lost.',
    default: 5,
  },
});
