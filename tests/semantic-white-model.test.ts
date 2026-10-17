import { expect, it } from 'vitest';
import * as THREE from 'three';
import { draftToProject, parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { calibratePlan2WorldDraft } from '$lib/plan2world/review';
import { readProject } from '$lib/utils/projectValidation';
import { createPlacedFurnitureModel } from '$lib/utils/furnitureModelLoader';
import { disposeModel } from '$lib/utils/furnitureModelResources';
import { furnitureItemName } from '$lib/i18n/furnitureNames';
import { buildReconstructionInstructions } from '$lib/plan2world/reconstructionInstructions';

function draft() {
  return {
    schemaVersion: 'plan2world-draft-v1', presentation: 'semantic-white-model',
    name: 'White model', units: 'cm', scale: { mode: 'estimated', confidence: 0.5, basis: 'Door assumption' },
    floors: [{ id: 'f0', name: 'Ground', level: 0, walls: [{ id: 'w1', start: { x: 0, y: 0 }, end: { x: 500, y: 0 }, height: 300 }],
      windows: [{ id: 'win1', wallId: 'w1', position: 0.5, width: 200 }],
      furniture: [{ id: 'sofa-block', catalogId: 'imported_object', sourceCategory: '沙发',
        position: { x: 200, y: 150 }, width: 220, depth: 95, height: 85, rotation: 90 }],
    }],
  };
}

it('normalizes white-model glazing against its host wall and preserves explicit choices', () => {
  expect(draftToProject(draft()).floors[0].windows[0]).toMatchObject({ height: 300, sillHeight: 0, type: 'fixed' });
  const source = draft();
  Object.assign(source.floors[0].windows[0], { height: 135, sillHeight: 80, type: 'casement' });
  expect(draftToProject(source).floors[0].windows[0]).toMatchObject({ height: 135, sillHeight: 80, type: 'casement' });
  delete (source as any).presentation;
  delete (source.floors[0].windows[0] as any).height;
  delete (source.floors[0].windows[0] as any).sillHeight;
  delete (source.floors[0].windows[0] as any).type;
  expect(draftToProject(source).floors[0].windows[0]).toMatchObject({ height: 120, sillHeight: 90, type: 'standard' });
});

it.each(['catalogId', 'sourceCategory', 'width', 'depth', 'height'])('requires the semantic block contract: %s', key => {
  const source = draft();
  delete (source.floors[0].furniture[0] as any)[key];
  expect(() => parsePlan2WorldDraft(source)).toThrow();
});

it.each([0, -1, Infinity, NaN])('rejects invalid block dimensions: %s', width => {
  const source = draft(); source.floors[0].furniture[0].width = width;
  expect(() => parsePlan2WorldDraft(source)).toThrow();
});

it('calibrates furniture footprints with architecture and retains vertical estimates and labels through save/load', () => {
  const source = draft(), before = structuredClone(source);
  const project = readProject(JSON.parse(JSON.stringify(draftToProject(calibratePlan2WorldDraft(source, 500, 1000)))));
  expect(project.floors[0].furniture[0]).toMatchObject({
    id: 'sofa-block', sourceCategory: '沙发', position: { x: 400, y: 300 },
    width: 440, depth: 190, height: 85, rotation: 90,
  });
  expect(furnitureItemName(project.floors[0].furniture[0], 'en')).toBe('沙发');
  expect(source).toEqual(before);
});

it('renders the native footprint as a full block with the saved rotation and mirror scale', () => {
  const item = draftToProject(draft()).floors[0].furniture[0];
  item.scale = { x: -1.5, y: 0.75, z: 2 };
  const before = structuredClone(item), model = createPlacedFurnitureModel(item)!;
  expect(model.getObjectByName('semantic-block')).toBeDefined();
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(95 * 0.75); expect(size.z).toBeCloseTo(220 * 1.5); expect(size.y).toBeCloseTo(85 * 2);
  expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(200);
  expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(150);
  expect(item).toEqual(before); disposeModel(model);
});

it('keeps the portable instruction example valid under the same application parser', () => {
  const instructions = buildReconstructionInstructions();
  const example = instructions.slice(instructions.indexOf('{\n  "schemaVersion"'), instructions.lastIndexOf('\n}') + 2);
  expect(parsePlan2WorldDraft(JSON.parse(example)).presentation).toBe('semantic-white-model');
});
