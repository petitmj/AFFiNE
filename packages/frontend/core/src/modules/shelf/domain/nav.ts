/**
 * Places the Shelf menu opens. The Shelf fills the whole window, so this menu
 * is how the rest of the app is reached; each entry is a workbench route that
 * already exists and a label that already exists in the translations.
 */
export interface ShelfNavEntry {
  id: 'all' | 'journals' | 'collections' | 'tags' | 'trash';
  path: `/${string}`;
  labelKey:
    | 'com.affine.workspaceSubPath.all'
    | 'com.affine.journal.app-sidebar-title'
    | 'com.affine.collections.header'
    | 'com.affine.rootAppSidebar.tags'
    | 'com.affine.workspaceSubPath.trash';
}

export const SHELF_NAV: readonly ShelfNavEntry[] = [
  { id: 'all', path: '/all', labelKey: 'com.affine.workspaceSubPath.all' },
  {
    id: 'journals',
    path: '/journals',
    labelKey: 'com.affine.journal.app-sidebar-title',
  },
  {
    id: 'collections',
    path: '/collection',
    labelKey: 'com.affine.collections.header',
  },
  { id: 'tags', path: '/tag', labelKey: 'com.affine.rootAppSidebar.tags' },
  {
    id: 'trash',
    path: '/trash',
    labelKey: 'com.affine.workspaceSubPath.trash',
  },
];
