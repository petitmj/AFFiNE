import type { Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud/services/workspace-server';
import { ImportService } from '../import';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { NotionImportService } from './services/notion-import';

export type { Phase, RunState } from './services/run-controller';
export { NotionImportService, type StartInput } from './services/notion-import';
export type { NotionRun, RunStatus } from './services/notion-api';

export function configureNotionImportModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(NotionImportService, [
      WorkspaceService,
      WorkspaceServerService,
      ImportService,
    ]);
}
