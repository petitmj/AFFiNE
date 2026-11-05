import type { PropertyModel } from '@blocksuite/data-view';
import { propertyModelPresets } from '@blocksuite/data-view/property-pure-presets';

import { filesPropertyModelConfig } from './files/define';
import { formulaPropertyModelConfig } from './formula/define';
import { linkPropertyModelConfig } from './link/define';
import { personPropertyModelConfig } from './person/define';
import { relationPropertyModelConfig } from './relation/define';
import { rollupPropertyModelConfig } from './rollup/define';
import { statusPropertyModelConfig } from './status/define';
import { richTextPropertyModelConfig } from './rich-text/define';
import { titlePropertyModelConfig } from './title/define';

export const databaseBlockModels = Object.fromEntries(
  [
    propertyModelPresets.checkboxPropertyModelConfig,
    propertyModelPresets.datePropertyModelConfig,
    propertyModelPresets.numberPropertyModelConfig,
    propertyModelPresets.progressPropertyModelConfig,
    propertyModelPresets.selectPropertyModelConfig,
    propertyModelPresets.multiSelectPropertyModelConfig,
    linkPropertyModelConfig,
    richTextPropertyModelConfig,
    titlePropertyModelConfig,
    statusPropertyModelConfig,
    personPropertyModelConfig,
    filesPropertyModelConfig,
    relationPropertyModelConfig,
    rollupPropertyModelConfig,
    formulaPropertyModelConfig,
  ].map(v => [v.type, v as PropertyModel])
);
