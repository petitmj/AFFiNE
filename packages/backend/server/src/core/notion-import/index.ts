import { Module } from '@nestjs/common';

import { PermissionModule } from '../permission';
import { StorageModule } from '../storage';
import { NotionHttpAdapter } from './adapters/notion-http';
import { NotionImportJob } from './job';
import { NotionImportResolver } from './resolver';
import { NotionImportService } from './service';

import './config';

@Module({
  imports: [PermissionModule, StorageModule],
  providers: [
    NotionHttpAdapter,
    NotionImportService,
    NotionImportJob,
    NotionImportResolver,
  ],
  exports: [NotionImportService],
})
export class NotionImportModule {}

export { NotionImportService };
