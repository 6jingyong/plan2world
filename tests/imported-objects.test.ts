import { expect, it } from 'vitest';
import * as THREE from 'three';
import { draftToProject, parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { calibratePlan2WorldDraft } from '$lib/plan2world/review';
import { readProject } from '$lib/utils/projectValidation';
import { createPlacedFurnitureModel } from '$lib/utils/furnitureModelLoader';
import { disposeModel } from '$lib/utils/furnitureModelResources';
import { furnitureItemName } from '$lib/i18n/furnitureNames';
import { buildReconstructionInstructions } from '$lib/plan2world/reconstructionInstructions';
import { getFurnitureSize } from '$lib/utils/furnitureCatalog';

function draft() {
  return {
    schemaVersion: 'plan2world-draft-v1', furnitureVocabulary: 'plan2world-furniture-v1',
    name: 'Imported objects', units: 'cm', scale: { mode: 'estimated', confidence: 0.5, basis: 'Door assumption' },
    floors: [{ id: 'f0', name: 'Ground', level: 0, walls: [{ id: 'w1', start: { x: 0, y: 0 }, end: { x: 500, y: 0 }, height: 300 }],
      windows: [{ id: 'win1', wallId: 'w1', position: 0.5, width: 200 }],
      furniture: [{ id: 'sofa-block', catalogId: 'imported_object', sourceCategory: 'sofa', position: { x: 200, y: 150 }, width: 220, depth: 95, height: 85, rotation: 90 }],
    }],
  };
}

it('uses ordinary window defaults unless the draft explicitly provides different values', () => {
  expect(draftToProject(draft()).floors[0].windows[0]).toMatchObject({ height: 120, sillHeight: 90, type: 'standard' });
  const source = draft();
  Object.assign(source.floors[0].windows[0], { height: 300, sillHeight: 0, type: 'fixed' });
  expect(draftToProject(source).floors[0].windows[0]).toMatchObject({ height: 300, sillHeight: 0, type: 'fixed' });
});

it.each(['id', 'catalogId', 'sourceCategory', 'position'])('requires imported-object identity and position: %s', key => {
  const source = draft(); delete (source.floors[0].furniture[0] as any)[key];
  expect(() => parsePlan2WorldDraft(source)).toThrow();
});

it.each(['width', 'depth', 'height'])('rejects invalid optional %s rather than replacing it with a default', key => {
  for (const value of [0, -1, Infinity, NaN]) {
    const source = draft(); (source.floors[0].furniture[0] as any)[key] = value;
    expect(() => parsePlan2WorldDraft(source)).toThrow();
  }
});

it('imports semantic type and position alone using the imported-object block through save/load and 3D', () => {
  const source = draft();
  source.floors[0].furniture = [{ id: 'semantic-only', catalogId: 'imported_object', sourceCategory: 'chair', position: { x: 200, y: 150 } } as any];
  const before = structuredClone(source);
  const parsed = parsePlan2WorldDraft(source).floors[0].furniture![0];
  expect(parsed).toMatchObject({ sourceCategory: 'chair', position: { x: 200, y: 150 } });
  expect(parsed.width).toBeUndefined(); expect(parsed.depth).toBeUndefined(); expect(parsed.height).toBeUndefined();
  const calibrated = calibratePlan2WorldDraft(source, 500, 1000);
  const item = readProject(JSON.parse(JSON.stringify(draftToProject(calibrated)))).floors[0].furniture[0];
  expect(item).toMatchObject({ id: 'semantic-only', sourceCategory: 'chair', position: { x: 400, y: 300 }, rotation: 0, renderStyle: 'block' });
  expect(getFurnitureSize(item)).toEqual({ width: 50, depth: 50, height: 50 });
  const model = createPlacedFurnitureModel(item)!;
  try {
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    expect([size.x, size.y, size.z]).toEqual([50, 50, 50]);
    expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(400);
    expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(300);
  } finally { disposeModel(model); }
  expect(source).toEqual(before);
});

it('calibrates explicit imported-object footprints with architecture and retains vertical estimates and source labels', () => {
  const source = draft(), before = structuredClone(source);
  const project = readProject(JSON.parse(JSON.stringify(draftToProject(calibratePlan2WorldDraft(source, 500, 1000)))));
  expect(project.floors[0].furniture[0]).toMatchObject({ id: 'sofa-block', sourceCategory: 'sofa', position: { x: 400, y: 300 }, width: 440, depth: 190, height: 85, rotation: 90 });
  expect(furnitureItemName(project.floors[0].furniture[0], 'en')).toBe('sofa');
  expect(source).toEqual(before);
});

it('renders the imported-object footprint as a full block with saved rotation and mirror scale', () => {
  const item = draftToProject(draft()).floors[0].furniture[0];
  item.scale = { x: -1.5, y: 0.75, z: 2 };
  const before = structuredClone(item), model = createPlacedFurnitureModel(item)!;
  expect(model.getObjectByName('semantic-block')).toBeDefined();
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(95 * 0.75); expect(size.z).toBeCloseTo(220 * 1.5); expect(size.y).toBeCloseTo(85 * 2);
  expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(200); expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(150);
  expect(item).toEqual(before); disposeModel(model);
});

it('keeps second-pass instructions evidence-only instead of embedding an application draft', () => {
  const instructions = buildReconstructionInstructions();
  expect(instructions).toContain('"schemaVersion":"source-annotation-v1"');
  expect(instructions).toContain('Do NOT emit IDs or numeric confidence values');
  expect(instructions).toContain('Do NOT choose or emit a wallId');
  expect(instructions).not.toContain('presentation');
  expect(instructions).not.toContain('"furnitureVocabulary"');
  expect(instructions).not.toContain('"floors"');
});