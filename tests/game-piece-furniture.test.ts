import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createGamePieceFurnitureModel } from '$lib/utils/gamePieceFurniture3d';
import { createPlacedFurnitureModel } from '$lib/utils/furnitureModelLoader';
import type { FurnitureDef } from '$lib/utils/furnitureCatalog';
import type { FurnitureItem } from '$lib/models/types';

const sofa: FurnitureDef = {
  id: 'test-sofa',
  name: 'Test Sofa',
  category: 'Living Room',
  icon: '🛋️',
  color: '#a78bfa',
  width: 200,
  depth: 90,
  height: 80,
};

describe('game-piece furniture', () => {
  it('preserves the exact plan footprint while capping visual height', () => {
    const model = createGamePieceFurnitureModel(sofa);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    expect(size.x).toBeCloseTo(sofa.width, 5);
    expect(size.z).toBeCloseTo(sofa.depth, 5);
    expect(size.y).toBeGreaterThan(0);
    expect(size.y).toBeLessThanOrEqual(60);
    expect(model.userData.gamePiece).toBe(true);
    expect(model.userData.footprint).toEqual({ width: 200, depth: 90 });
  });

  it('keeps a front marker so rotation stays readable for square pieces', () => {
    const square = createGamePieceFurnitureModel({ ...sofa, id: 'square', width: 80, depth: 80 });
    expect(square.getObjectByName('piece-front')).toBeTruthy();
  });

  it('uses the lightweight path for saved built-in furniture without changing placement', () => {
    const item: FurnitureItem = {
      id: 'f1',
      catalogId: 'sofa',
      position: { x: 125, y: 240 },
      rotation: 90,
      width: 200,
      depth: 90,
      height: 80,
      color: '#a78bfa',
    };
    const model = createPlacedFurnitureModel(item);
    expect(model).not.toBeNull();
    expect(model!.position.x).toBe(125);
    expect(model!.position.z).toBe(240);
    expect(model!.rotation.y).toBeCloseTo(-Math.PI / 2, 6);
    expect(model!.getObjectByProperty('type', 'Group')).toBeTruthy();

    let foundGamePiece = false;
    model!.traverse(object => { if (object.userData.gamePiece) foundGamePiece = true; });
    expect(foundGamePiece).toBe(true);
  });
});
