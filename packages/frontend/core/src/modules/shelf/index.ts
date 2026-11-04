import type { Framework } from '@toeverything/infra';

import { WorkspaceScope } from '../workspace';
import { ShelfService } from './services/shelf';

export { ShelfService } from './services/shelf';

export function configureShelfModule(framework: Framework) {
  framework.scope(WorkspaceScope).service(ShelfService);
}
