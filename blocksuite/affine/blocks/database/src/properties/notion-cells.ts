import { RefNodeSlotsProvider } from '@blocksuite/affine-inline-reference';
import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
} from '@blocksuite/data-view';
import { SelectCell } from '@blocksuite/data-view/property-presets';
import { css } from '@emotion/css';
import { html, nothing } from 'lit';

import { EditorHostKey } from '../context/host-context.js';
import { type FileEntry, filesPropertyModelConfig } from './files/define.js';
import {
  formulaPropertyModelConfig,
  type FormulaValue,
} from './formula/define.js';
import { type Person, personPropertyModelConfig } from './person/define.js';
import {
  type RelationEntry,
  relationPropertyModelConfig,
} from './relation/define.js';
import {
  rollupPropertyModelConfig,
  type RollupValue,
} from './rollup/define.js';
import { statusPropertyModelConfig } from './status/define.js';

const cellStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '4px',
  width: '100%',
  minHeight: '100%',
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
  color: 'var(--affine-text-primary-color)',
});
const chipStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  maxWidth: '100%',
  padding: '0 8px',
  borderRadius: '4px',
  background: 'var(--affine-hover-color)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
const linkChipStyle = css({
  cursor: 'pointer',
  textDecoration: 'underline',
});
const mutedStyle = css({
  color: 'var(--affine-text-secondary-color)',
});

/** Cells whose value comes from an import and is not edited in the grid yet. */
abstract class ReadonlyImportedCell<Raw, Json> extends BaseCellRenderer<
  Raw,
  Json
> {
  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(cellStyle);
  }

  override beforeEnterEditMode() {
    return false;
  }
}

/** A select whose options also carry Notion's status groups. */
export class StatusCell extends SelectCell {}

export class PersonCell extends ReadonlyImportedCell<Person[], string[]> {
  override render() {
    const people = this.value ?? [];
    return html`${people.map(
      p =>
        html`<span class="${chipStyle}" title="${p.email ?? p.name}"
          >${p.name}</span
        >`
    )}`;
  }
}

export class FilesCell extends ReadonlyImportedCell<FileEntry[], string[]> {
  override render() {
    const files = this.value ?? [];
    return html`${files.map(
      f =>
        html`<span
          class="${chipStyle} ${f.unavailable ? mutedStyle : ''}"
          title="${f.unavailable ? `${f.name} (not available)` : f.name}"
          >${f.name}</span
        >`
    )}`;
  }
}

export class RelationCell extends ReadonlyImportedCell<
  RelationEntry[],
  string[]
> {
  private readonly _open = (e: Event, entry: RelationEntry) => {
    e.stopPropagation();
    if (!entry.docId) return;
    const host = this.view.serviceGet(EditorHostKey);
    host?.std
      .getOptional(RefNodeSlotsProvider)
      ?.docLinkClicked.next({ pageId: entry.docId, host: host.std.host });
  };

  override render() {
    const entries = this.value ?? [];
    return html`${entries.map(entry => {
      const label = entry.title || entry.notionId;
      return entry.docId
        ? html`<span
            class="${chipStyle} ${linkChipStyle}"
            @click="${(e: Event) => this._open(e, entry)}"
            >${label}</span
          >`
        : html`<span class="${chipStyle} ${mutedStyle}" title="Not imported"
            >${label}</span
          >`;
    })}`;
  }
}

export class RollupCell extends ReadonlyImportedCell<
  RollupValue | null,
  string
> {
  override render() {
    const value = this.value;
    if (!value) return nothing;
    return html`<span>${value.display}</span>${value.incomplete
        ? html`<span
            class="${mutedStyle}"
            title="Notion reported this rollup as incomplete"
            >+</span
          >`
        : nothing}`;
  }
}

export class FormulaCell extends ReadonlyImportedCell<
  FormulaValue | null,
  string
> {
  override render() {
    return html`<span>${this.value?.display ?? ''}</span>`;
  }
}

export const statusColumnConfig = statusPropertyModelConfig.createPropertyMeta({
  icon: createIcon('ProgressIcon'),
  cellRenderer: { view: createFromBaseCellRenderer(StatusCell) },
});
export const personColumnConfig = personPropertyModelConfig.createPropertyMeta({
  icon: createIcon('MultiSelectIcon'),
  cellRenderer: { view: createFromBaseCellRenderer(PersonCell) },
});
export const filesColumnConfig = filesPropertyModelConfig.createPropertyMeta({
  icon: createIcon('AttachmentIcon' as never),
  cellRenderer: { view: createFromBaseCellRenderer(FilesCell) },
});
export const relationColumnConfig =
  relationPropertyModelConfig.createPropertyMeta({
    icon: createIcon('LinkedPageIcon' as never),
    cellRenderer: { view: createFromBaseCellRenderer(RelationCell) },
  });
export const rollupColumnConfig = rollupPropertyModelConfig.createPropertyMeta({
  icon: createIcon('NumberIcon'),
  cellRenderer: { view: createFromBaseCellRenderer(RollupCell) },
});
export const formulaColumnConfig =
  formulaPropertyModelConfig.createPropertyMeta({
    icon: createIcon('TextIcon'),
    cellRenderer: { view: createFromBaseCellRenderer(FormulaCell) },
  });
