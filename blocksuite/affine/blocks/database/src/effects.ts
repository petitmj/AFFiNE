import { CenterPeek } from './components/layout';
import { DatabaseTitle } from './components/title';
import { DatabaseBlockComponent } from './database-block';
import { DatabaseDndPreviewBlockComponent } from './database-dnd-preview-block';
import { BlockRenderer } from './detail-panel/block-renderer';
import { NoteRenderer } from './detail-panel/note-renderer';
import { CreatedTimeCell } from './properties/created-time/cell-renderer';
import { LinkCell } from './properties/link/cell-renderer';
import {
  FilesCell,
  FormulaCell,
  PersonCell,
  RelationCell,
  RollupCell,
  StatusCell,
} from './properties/notion-cells';
import { RichTextCell } from './properties/rich-text/cell-renderer';
import { IconCell } from './properties/title/icon';
import { HeaderAreaTextCell } from './properties/title/text';

export function effects() {
  customElements.define('affine-database-title', DatabaseTitle);
  customElements.define('data-view-header-area-icon', IconCell);
  customElements.define('affine-database-link-cell', LinkCell);
  customElements.define('data-view-header-area-text', HeaderAreaTextCell);
  customElements.define('affine-database-rich-text-cell', RichTextCell);
  customElements.define('affine-database-created-time-cell', CreatedTimeCell);
  customElements.define('affine-database-status-cell', StatusCell);
  customElements.define('affine-database-person-cell', PersonCell);
  customElements.define('affine-database-files-cell', FilesCell);
  customElements.define('affine-database-relation-cell', RelationCell);
  customElements.define('affine-database-rollup-cell', RollupCell);
  customElements.define('affine-database-formula-cell', FormulaCell);
  customElements.define('center-peek', CenterPeek);
  customElements.define('database-datasource-note-renderer', NoteRenderer);
  customElements.define('database-datasource-block-renderer', BlockRenderer);
  customElements.define('affine-database', DatabaseBlockComponent);

  customElements.define(
    'affine-dnd-preview-database',
    DatabaseDndPreviewBlockComponent
  );
}
