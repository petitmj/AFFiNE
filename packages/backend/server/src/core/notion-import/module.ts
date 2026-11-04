// ============================================================================
// Notion Import Module
// ============================================================================

import { Global, Module } from '@nestjs/common';
import { NotionImportModel } from '../../models/notion-import';
import { BlobModel } from '../../models/blob';
import { NotionImportService } from './service';
import { NotionImportResolver } from './resolver';
import { NotionImportJob } from './job';
import { NotionHttpAdapter } from './adapters/notion-http';
import { BlobFileMirror } from './adapters/blob-file-mirror';
import { NotionImportRepositories } from './adapters/repositories';
import { defineNotionImportModuleConfig } from './config';

// Import domain layer for side effects (type registration)
import './domain/types';
import './domain/errors';
import './domain/ports';
import './domain/rate-limiter';
import './domain/cursor';
import './domain/canonical';
import './domain/files';
import './domain/properties';
import './domain/preserve';
import './domain/lifecycle';
import './domain/notion-client';
import './domain/executor';
import './domain/processor';

@Global()
@Module({
  imports: [],
  providers: [
    // Config
    defineNotionImportModuleConfig(),

    // Models
    NotionImportModel,
    BlobModel,

    // Adapters
    NotionHttpAdapter,
    BlobFileMirror,
    NotionImportRepositories,

    // Service
    NotionImportService,

    // Resolver
    NotionImportResolver,

    // Job
    NotionImportJob,
  ],
  exports: [
    NotionImportService,
    NotionImportResolver,
    NotionImportJob,
    defineNotionImportModuleConfig,
  ],
})
export class NotionImportModule {}
