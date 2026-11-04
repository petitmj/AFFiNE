import type { Framework } from '@toeverything/infra';

import { CloudServices } from '../cloud';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { NotionImportService } from './services/notion-import';

export { NotionImportService } from './services/notion-import';

export function configureNotionImportModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(NotionImportService, [WorkspaceService, ...CloudServices]);
}
