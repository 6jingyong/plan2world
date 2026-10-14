import { beforeEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { existsSync } from 'node:fs';
import { furnitureCatalog, getCatalogItem } from '$lib/utils/furnitureCatalog';
import { getModelFile } from '$lib/utils/furnitureModelFiles';

beforeEach(() => vi.resetModules());
function template() {
  const group = new THREE.Group();
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ color: '#dddddd', map: texture, roughness: 0.8 });
  const geometry = new THREE.BoxGeometry(2, 3, 4);
  const first = new THREE.Mesh(geometry, [material, material]); first.position.set(5, 8, -4);
  const second = new THREE.Mesh(geometry, material); second.position.set(-2, 4, 3);
  group.add(first, second);
  return { group, texture, material, geometry };
}
const firstMesh = (root: THREE.Object3D) => { let result: THREE.Mesh | undefined; root.traverse(child => { if (!result && child instanceof THREE.Mesh) result = child; }); return result!; };
const firstMaterial = (root: THREE.Object3D) => { const mat = firstMesh(root).material; return (Array.isArray(mat) ? mat[0] : mat) as THREE.MeshStandardMaterial; };

it('keeps the optional GLB resource cache isolated for custom or future visual skins', async () => {
  const source = template();
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue({ scene: source.group } as any);
  const { loadCatalogModel, disposeModel } = await import('$lib/utils/furnitureModelResources');
  expect(load).not.toHaveBeenCalled();
  const [thumbnail, placed] = await Promise.all([loadCatalogModel('loungeChair'), loadCatalogModel('loungeChair')]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(firstMesh(thumbnail!).geometry).not.toBe(firstMesh(placed!).geometry);
  expect(firstMaterial(thumbnail!)).not.toBe(firstMaterial(placed!));
  expect(firstMaterial(thumbnail!).map).not.toBe(firstMaterial(placed!).map);
  firstMaterial(thumbnail!).color.set('#ff0000');
  expect(firstMaterial(placed!).color.getHexString()).toBe('dddddd');
  const sharedMaterial = firstMaterial(thumbnail!), sharedGeometry = firstMesh(thumbnail!).geometry;
  const materialDisposed = vi.spyOn(sharedMaterial, 'dispose'), geometryDisposed = vi.spyOn(sharedGeometry, 'dispose');
  const textureDisposed = vi.spyOn(sharedMaterial.map!, 'dispose'), sourceDisposed = vi.spyOn(source.geometry, 'dispose');
  disposeModel(thumbnail!); disposeModel(thumbnail!);
  expect(materialDisposed).toHaveBeenCalledTimes(1); expect(geometryDisposed).toHaveBeenCalledTimes(1); expect(textureDisposed).toHaveBeenCalledTimes(1);
  expect(sourceDisposed).not.toHaveBeenCalled();
  const later = await loadCatalogModel('loungeChair');
  expect(firstMaterial(later!).color.getHexString()).toBe('dddddd');
  expect(load).toHaveBeenCalledTimes(1);
  disposeModel(placed!); disposeModel(later!);
});

it('still fits optional custom/detail models to exact requested dimensions', async () => {
  const { fitFurnitureModel } = await import('$lib/utils/furnitureModelLoader');
  const { cloneModel } = await import('$lib/utils/furnitureModelResources');
  const source = template().group, model = cloneModel(source);
  const before = new THREE.Box3().setFromObject(source);
  const def = { ...getCatalogItem('chair')!, width: 87.125, depth: 123.75, height: 95.5 };
  fitFurnitureModel(model, def);
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  expect(size.x).toBeCloseTo(def.width); expect(size.y).toBeCloseTo(def.height); expect(size.z).toBeCloseTo(def.depth);
  expect(center.x).toBeCloseTo(0); expect(center.z).toBeCloseTo(0); expect(bounds.min.y).toBeCloseTo(0);
  expect(new THREE.Box3().setFromObject(source)).toEqual(before);
});

it('renders built-in catalog furniture as a tinted game piece without requesting its GLB', async () => {
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync');
  const { createFurnitureModelWithGLB } = await import('$lib/utils/furnitureModelLoader');
  const def = getCatalogItem('chair')!;
  const model = createFurnitureModelWithGLB('chair', def, undefined, { color: '#00ff00', material: 'Metal' });
  expect(load).not.toHaveBeenCalled();
  expect(firstMaterial(model).color.getHexString()).toBe('00ff00');
  expect(firstMaterial(model).metalness).toBe(0.85);
  expect(firstMaterial(model).roughness).toBe(0.25);
  let foundGamePiece = false;
  model.traverse(object => { if (object.userData.gamePiece) foundGamePiece = true; });
  expect(foundGamePiece).toBe(true);
});

it('keeps game-piece placement ghosts translucent without requesting a GLB', async () => {
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync');
  const { createFurnitureModelWithGLB } = await import('$lib/utils/furnitureModelLoader');
  const ghost = createFurnitureModelWithGLB('chair', getCatalogItem('chair')!, undefined, { ghost: true, material: 'Glass' });
  expect(load).not.toHaveBeenCalled();
  expect(firstMaterial(ghost).opacity).toBeCloseTo(0.175);
  expect(firstMaterial(ghost).depthWrite).toBe(false);
  expect(firstMaterial(ghost).emissive.getHexString()).toBe('4488ff');
  const normal = createFurnitureModelWithGLB('chair', getCatalogItem('chair')!);
  expect(firstMaterial(normal).opacity).toBe(1);
  expect(firstMaterial(normal).transparent).toBe(false);
});

it('does not make catalog GLB requests when built-in furniture is recreated during scene edits', async () => {
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync');
  const { createFurnitureModelWithGLB } = await import('$lib/utils/furnitureModelLoader');
  for (let i = 0; i < 5; i++) {
    const model = createFurnitureModelWithGLB('chair', getCatalogItem('chair')!);
    expect(model.children).toHaveLength(1);
  }
  expect(load).not.toHaveBeenCalled();
});

it('keeps legacy catalog model mappings valid while making them optional skins', async () => {
  for (const item of furnitureCatalog) {
    const file = getModelFile(item.id);
    if (file) expect(existsSync(`static/models/${file}.glb`), item.id).toBe(true);
  }
  expect(getModelFile('toString')).toBeNull();
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync');
  const { createFurnitureModelWithGLB } = await import('$lib/utils/furnitureModelLoader');
  const chair = createFurnitureModelWithGLB('chair', getCatalogItem('chair')!);
  const fireplace = createFurnitureModelWithGLB('fireplace', getCatalogItem('fireplace')!);
  expect(load).not.toHaveBeenCalled();
  expect(chair.children).toHaveLength(1);
  expect(fireplace.children).toHaveLength(1);
});

it.each([false, true])('preserves unknown saved furniture footprint and placement while using capped visual height (overrides=%s)', async overrides => {
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync');
  const { createPlacedFurnitureModel } = await import('$lib/utils/furnitureModelLoader');
  const item = { id: 'missing', catalogId: 'unavailable-model', position: { x: 100, y: -200 },
    rotation: 30, scale: { x: -2, y: 0.5, z: 1.5 }, color: '#ff00ff',
    ...(overrides ? { width: 160, depth: 80, height: 90 } : {}) };
  const before = structuredClone(item), model = createPlacedFurnitureModel(item)!;
  const width = overrides ? 320 : 100, depth = overrides ? 40 : 25;
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  expect(size.x).toBeCloseTo(width*Math.cos(Math.PI/6) + depth*0.5);
  expect(size.z).toBeCloseTo(width*0.5 + depth*Math.cos(Math.PI/6));
  expect(size.y).toBeGreaterThan(0);
  expect(size.y).toBeLessThanOrEqual(90); // 60 cm visual cap × saved vertical scale 1.5
  expect(bounds.min.y).toBeCloseTo(1.5);
  expect(bounds.getCenter(new THREE.Vector3()).x).toBeCloseTo(100);
  expect(bounds.getCenter(new THREE.Vector3()).z).toBeCloseTo(-200);
  expect(firstMaterial(model).color.getHexString()).toBe('ff00ff');
  expect(firstMesh(model).castShadow).toBe(true);
  expect(load).not.toHaveBeenCalled();
  expect(item).toEqual(before);
});

it('continues omitting explicitly 2D-only catalog symbols from placed 3D furniture', async () => {
  const { createPlacedFurnitureModel } = await import('$lib/utils/furnitureModelLoader');
  const symbol = furnitureCatalog.find(item => item.symbol)!;
  expect(createPlacedFurnitureModel({ id: 'symbol', catalogId: symbol.id, position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1, z: 1 } })).toBeNull();
});
