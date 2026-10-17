import { expect, it } from 'vitest';
import * as THREE from 'three';
import { get } from 'svelte/store';
import { furnitureStyleIds, furnitureStylePatch } from '$lib/utils/furnitureStyling';
import { createPlacedFurnitureModel } from '$lib/utils/furnitureModelLoader';
import { disposeModel } from '$lib/utils/furnitureModelResources';
import { getFurnitureSize } from '$lib/utils/furnitureCatalog';
import { createWalkthroughCollisionWorld } from '$lib/utils/walkthroughCollision';
import { sceneElementAt } from '$lib/utils/sceneSelection';
import { currentProject, loadProject, updateFurniture, undo, redo, selectSingleElement, selectedElementId, selectedElementIds } from '$lib/stores/project';
import { readProject } from '$lib/utils/projectValidation';
import { roomProject } from './fixtures/project';

const block = () => ({ renderStyle: 'block' as const, id: 'block', catalogId: 'imported_object', sourceCategory: 'sofa',
  position: { x: 180, y: 140 }, rotation: 90, width: 210.25, depth: 92.5, height: 84.75,
  scale: { x: -1.5, y: 0.75, z: 2 }, color: '#aaaaaa' });

it('replaces a semantic block in one native undo step without changing placement, footprint, other geometry or selection', () => {
  const project = roomProject(); project.floors[0].furniture = [block()]; loadProject(project);
  selectSingleElement('block');
  const original = structuredClone(get(currentProject)!.floors[0]);
  const patch = furnitureStylePatch(original.furniture[0], 'bed_queen')!;
  updateFurniture('block', patch);
  const styled = structuredClone(get(currentProject)!.floors[0]);
  expect(styled.furniture[0]).toEqual({ ...original.furniture[0], catalogId: 'bed_queen', renderStyle: 'model' });
  expect(styled.walls).toEqual(original.walls); expect(styled.rooms).toEqual(original.rooms);
  expect(createWalkthroughCollisionWorld(styled)).toEqual(createWalkthroughCollisionWorld(original));
  expect(get(selectedElementId)).toBe('block'); expect(get(selectedElementIds)).toEqual(new Set());
  const saved = readProject(JSON.parse(JSON.stringify(get(currentProject))));
  expect(saved.floors[0].furniture[0]).toEqual(styled.furniture[0]);
  undo(); expect(get(currentProject)!.floors[0]).toEqual(original);
  redo(); expect(get(currentProject)!.floors[0]).toEqual(styled);
  const restored = { ...styled.furniture[0], ...furnitureStylePatch(styled.furniture[0], 'imported_object') };
  expect(getFurnitureSize(restored)).toEqual(getFurnitureSize(original.furniture[0]));
});

it.each(furnitureStyleIds)('fits %s to the saved occupancy without moving or double-scaling it', catalogId => {
  const source = block(), styled = { ...source, ...furnitureStylePatch(source, catalogId) };
  const model = createPlacedFurnitureModel(styled)!;
  expect(model.name).toBe('styled-furniture');
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const expected = getFurnitureSize(styled);
  expect(size.x).toBeCloseTo(expected.depth, 3); expect(size.z).toBeCloseTo(expected.width, 3); expect(size.y).toBeCloseTo(expected.height, 3);
  expect(center.x).toBeCloseTo(source.position.x); expect(center.z).toBeCloseTo(source.position.y); expect(bounds.min.y).toBeCloseTo(1.5);
  disposeModel(model);
});

it('captures old catalog dimensions before replacement and refuses unsupported/custom replacements', () => {
  const source = { ...block(), catalogId: 'chair', width: undefined, depth: undefined, height: undefined };
  const styled = { ...source, ...furnitureStylePatch(source, 'sofa') };
  expect(getFurnitureSize(styled)).toEqual(getFurnitureSize(source));
  expect(furnitureStylePatch(source, 'sym_switch')).toBeNull();
  expect(furnitureStylePatch({ ...source, customModelId: 'local' }, 'sofa')).toBeNull();
});

it('raycasts native IDs through nested models, preserving nearest surface and legacy walls', () => {
  const root = new THREE.Group(), nested = new THREE.Group(); nested.userData.elementId = 'furniture';
  const block = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  nested.add(block); root.add(nested);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 2), new THREE.MeshBasicMaterial());
  wall.position.z = -20; wall.userData.wallId = 'wall'; root.add(wall); root.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 50), new THREE.Vector3(0, 0, -1));
  expect(sceneElementAt(ray, root)).toBe('furniture');
  nested.position.x = 50; root.updateMatrixWorld(true); expect(sceneElementAt(ray, root)).toBe('wall');
  wall.userData = { elementId: 'window' }; expect(sceneElementAt(ray, root)).toBe('window');
  wall.position.x = 50; root.updateMatrixWorld(true); expect(sceneElementAt(ray, root)).toBeNull();
  disposeModel(root);
});
