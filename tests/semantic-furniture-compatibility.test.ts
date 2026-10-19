import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { furnitureItemName } from '$lib/i18n/furnitureNames';
import { draftToProject } from '$lib/plan2world/draft';
import { readProject } from '$lib/utils/projectValidation';
import { createPlacedFurnitureModel } from '$lib/utils/furnitureModelLoader';
import { disposeModel } from '$lib/utils/furnitureModelResources';
import { furnitureStylePatch } from '$lib/utils/furnitureStyling';

function importedObjectDraft() {
  return {
    schemaVersion: 'plan2world-draft-v1',
    furnitureVocabulary: 'plan2world-furniture-v1',
    name: 'Imported object styling',
    units: 'cm',
    scale: { mode: 'provided', confidence: 1, basis: 'Synthetic fixture dimensions' },
    floors: [{
      id: 'f0', name: 'Floor', level: 0,
      walls: [{ id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } }],
      furniture: [{
        id: 'sofa-block', catalogId: 'imported_object', sourceCategory: 'sofa',
        position: { x: 200, y: 150 }, width: 220, depth: 95, height: 85,
      }],
    }],
  };
}

it('keeps legacy unknown-category previews and names without promoting them to semantic blocks', () => {
  const raw = JSON.parse(readFileSync('tests/fixtures/legacy-furniture-previews.openplan.json', 'utf8'));
  const before = JSON.stringify(raw), project = readProject(raw);
  const item = project.floors[0].furniture.find(item => item.catalogId === 'imported_object')!;
  expect(item.sourceCategory).toBe('future-appliance');
  expect(item.renderStyle).toBeUndefined();
  expect(furnitureItemName(item, 'en', project)).toBe('Unrecognized item');
  expect(furnitureItemName(item, 'pt', project)).toBe('Item não reconhecido');
  const model = createPlacedFurnitureModel(item)!;
  expect(model.getObjectByName('semantic-block')).toBeUndefined();
  expect(furnitureStylePatch(item, 'sofa')).toBeNull();
  disposeModel(model);
  expect(JSON.stringify(raw)).toBe(before);
});

it('persists imported-object block rendering and restores it after choosing a style', () => {
  const project = readProject(JSON.parse(JSON.stringify(draftToProject(importedObjectDraft()))));
  const item = project.floors[0].furniture[0];
  expect(item.renderStyle).toBe('block');
  expect(furnitureItemName(item, 'en')).toBe('sofa');
  const styled = { ...item, ...furnitureStylePatch(item, 'bed_queen') };
  expect(styled.renderStyle).toBe('model');
  const restored = { ...styled, ...furnitureStylePatch(styled, 'imported_object') };
  expect(restored).toEqual(item);
  const model = createPlacedFurnitureModel(restored)!;
  expect(model.getObjectByName('semantic-block')).toBeDefined();
  disposeModel(model);
});