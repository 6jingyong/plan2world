import { describe, expect, it } from 'vitest';
import { compileArchitecturePresentation } from '$lib/runtime/architecturePresentation';
import { compileStaticArchitectureEntities } from '$lib/runtime/staticArchitectureMesher';
import type { Plan2WorldRuntimeSceneV1 } from '$lib/runtime/types';

function scene(): Plan2WorldRuntimeSceneV1 {
  return {
    schema: 'plan2world-runtime-v1',
    version: 1,
    units: 'metres',
    coordinates: { handedness: 'right', up: '+Y', planX: '+X', planY: '+Z', yaw: 'clockwise-from-+X' },
    source: { projectId: 'static-presentation', projectName: 'Static presentation test' },
    playerProfile: { eyeHeight: 1.6, radius: 0.28, speeds: { slow: 0.6, walk: 1.2, fast: 2.4 } },
    floors: [{ id: 'floor-0', name: 'Ground', level: 0, elevation: 0, walkthroughStart: null, rooms: [] }],
    entities: [
      {
        id: 'window-1', floorId: 'floor-0', kind: 'window', hostWallId: 'wall-1', pathPosition: 0.5,
        width: 1.6, height: 1.2, sillHeight: 0.8, windowType: 'fixed', center: [2.5, 1.4, 0], yawClockwiseRadians: 0,
      },
      {
        id: 'column-square', floorId: 'floor-0', kind: 'column', shape: 'square', position: [1, 1.4, 1],
        yawClockwiseRadians: Math.PI / 4, diameter: 0.4, height: 2.8,
      },
      {
        id: 'column-round', floorId: 'floor-0', kind: 'column', shape: 'round', position: [3, 1.4, 1],
        yawClockwiseRadians: 0, diameter: 0.5, height: 2.8,
      },
      {
        id: 'stair-up', floorId: 'floor-0', kind: 'stair', position: [2.5, 0, 3], yawClockwiseRadians: 0,
        width: 1, depth: 3, riserCount: 12, direction: 'up', stairType: 'straight',
        traversal: { kind: 'ramp', targetFloorId: 'floor-1', startElevation: 0, endElevation: 3 },
      },
      {
        id: 'stair-unsupported', floorId: 'floor-0', kind: 'stair', position: [4, 0, 3], yawClockwiseRadians: 0,
        width: 1, depth: 3, riserCount: 12, direction: 'up', stairType: 'l-shaped',
        traversal: { kind: 'unsupported', reason: 'non-straight' },
      },
      {
        id: 'furniture-1', floorId: 'floor-0', kind: 'furniture', catalogId: 'sofa', assetRef: 'catalog:sofa',
        position: [2, 0.4, 2], yawClockwiseRadians: 0, size: [2, 0.8, 0.9],
      },
    ],
    colliders: [],
  };
}

function bounds(positions: [number, number, number][]) {
  return {
    min: [0, 1, 2].map(axis => Math.min(...positions.map(position => position[axis]))),
    max: [0, 1, 2].map(axis => Math.max(...positions.map(position => position[axis]))),
  };
}

describe('static architecture presentation', () => {
  it('moves windows, columns and traversable straight stairs into shared presentation geometry', () => {
    const primitives = compileStaticArchitectureEntities(scene());
    expect(primitives.map(primitive => [primitive.kind, primitive.id, primitive.material])).toEqual([
      ['window', 'architecture:window:window-1', 'glass'],
      ['column', 'architecture:column:column-square', 'column'],
      ['column', 'architecture:column:column-round', 'column'],
      ['stair', 'architecture:stair:stair-up', 'stair'],
    ]);
    expect(primitives.some(primitive => primitive.ownerId === 'stair-unsupported')).toBe(false);
    expect(primitives.some(primitive => primitive.ownerId === 'furniture-1')).toBe(false);

    const window = primitives[0];
    const windowBounds = bounds(window.positions);
    expect(windowBounds.min[0]).toBeCloseTo(1.7);
    expect(windowBounds.max[0]).toBeCloseTo(3.3);
    expect(windowBounds.min[1]).toBeCloseTo(0.8);
    expect(windowBounds.max[1]).toBeCloseTo(2.0);
    expect(windowBounds.max[2] - windowBounds.min[2]).toBeCloseTo(0.025);

    const stair = primitives.find(primitive => primitive.kind === 'stair')!;
    expect(stair.positions).toHaveLength(12 * 24);
    expect(stair.indices).toHaveLength(12 * 36);
    const stairBounds = bounds(stair.positions);
    expect(stairBounds.min[1]).toBeCloseTo(-0.04);
    expect(stairBounds.max[1]).toBeCloseTo(3);
  });

  it('keeps round-column face normals outward with closed top and bottom caps', () => {
    const column = compileStaticArchitectureEntities(scene()).find(primitive => primitive.ownerId === 'column-round')!;
    expect(column.positions).toHaveLength(24 * 10);
    expect(column.indices).toHaveLength(24 * 12);
    const radial = [column.positions[0][0] - 3, column.positions[0][2] - 1];
    const normal = column.normals[0];
    expect(radial[0] * normal[0] + radial[1] * normal[2]).toBeGreaterThan(0);
    expect(column.normals.some(candidate => candidate[1] === 1)).toBe(true);
    expect(column.normals.some(candidate => candidate[1] === -1)).toBe(true);
  });

  it('composes static entities after the existing wall/room presentation compiler', () => {
    const presentation = compileArchitecturePresentation(scene());
    expect(presentation.diagnostics).toEqual([]);
    expect(presentation.primitives.map(primitive => primitive.id)).toEqual([
      'architecture:window:window-1',
      'architecture:column:column-square',
      'architecture:column:column-round',
      'architecture:stair:stair-up',
    ]);
  });
});
