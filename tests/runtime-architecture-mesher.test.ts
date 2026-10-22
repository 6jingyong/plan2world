import { describe, expect, it } from 'vitest';
import { compileArchitectureMesh, type ArchitectureMeshPrimitive } from '$lib/runtime/architectureMesher';
import type {
  Plan2WorldRuntimeSceneV1,
  RuntimeDoorEntity,
  RuntimeEntity,
  RuntimeWallEntity,
  RuntimeWindowEntity,
} from '$lib/runtime/types';

function wall(overrides: Partial<RuntimeWallEntity> = {}): RuntimeWallEntity {
  return {
    id: 'wall-1',
    floorId: 'floor-1',
    kind: 'wall',
    path: { start: [0, 0], end: [4, 0] },
    thickness: 0.2,
    startHeight: 2.8,
    endHeight: 2.8,
    boundaryType: 'solid',
    visible: true,
    ...overrides,
  };
}

function door(overrides: Partial<RuntimeDoorEntity> = {}): RuntimeDoorEntity {
  return {
    id: 'door-1',
    floorId: 'floor-1',
    kind: 'door',
    hostWallId: 'wall-1',
    pathPosition: 0.5,
    width: 1,
    height: 2.1,
    doorType: 'single',
    swingDirection: 'left',
    flipSide: false,
    closedPose: { center: [2, 1.25, 0], yawClockwiseRadians: 0 },
    interaction: { kind: 'none' },
    ...overrides,
  };
}

function windowEntity(overrides: Partial<RuntimeWindowEntity> = {}): RuntimeWindowEntity {
  return {
    id: 'window-1',
    floorId: 'floor-1',
    kind: 'window',
    hostWallId: 'wall-1',
    pathPosition: 0.5,
    width: 1,
    height: 1.2,
    sillHeight: 0.9,
    windowType: 'fixed',
    center: [2, 1.7, 0],
    yawClockwiseRadians: 0,
    ...overrides,
  };
}

function scene(entities: RuntimeEntity[], elevation = 0.2): Plan2WorldRuntimeSceneV1 {
  return {
    schema: 'plan2world-runtime-v1',
    version: 1,
    units: 'metres',
    coordinates: { handedness: 'right', up: '+Y', planX: '+X', planY: '+Z', yaw: 'clockwise-from-+X' },
    source: { projectId: 'project-1', projectName: 'Architecture mesh fixture' },
    playerProfile: { eyeHeight: 1.7, radius: 0.3, speeds: { slow: 1, walk: 2, fast: 4 } },
    floors: [{ id: 'floor-1', name: 'Ground', level: 0, elevation, walkthroughStart: null, rooms: [] }],
    entities,
    colliders: [],
  };
}

function rounded(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

function signature(primitive: ArchitectureMeshPrimitive) {
  const xs = primitive.positions.map(position => position[0]);
  const ys = primitive.positions.map(position => position[1]);
  const zs = primitive.positions.map(position => position[2]);
  return {
    id: primitive.id,
    ownerId: primitive.ownerId,
    vertices: primitive.positions.length,
    indices: primitive.indices.length,
    min: [rounded(Math.min(...xs)), rounded(Math.min(...ys)), rounded(Math.min(...zs))],
    max: [rounded(Math.max(...xs)), rounded(Math.max(...ys)), rounded(Math.max(...zs))],
  };
}

function triangleCentroidsWithNormal(primitive: ArchitectureMeshPrimitive, normal: [number, number, number]) {
  const result: [number, number, number][] = [];
  for (let index = 0; index < primitive.indices.length; index += 3) {
    const ia = primitive.indices[index], ib = primitive.indices[index + 1], ic = primitive.indices[index + 2];
    const n = primitive.normals[ia];
    if (!n.every((value, axis) => Math.abs(value - normal[axis]) < 1e-9)) continue;
    const a = primitive.positions[ia], b = primitive.positions[ib], c = primitive.positions[ic];
    result.push([
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3,
    ]);
  }
  return result;
}

describe('architecture mesher v0', () => {
  it('extrudes a straight wall with thickness, height, floor elevation, normals and UVs', () => {
    const mesh = compileArchitectureMesh(scene([wall()]));
    expect(mesh.diagnostics).toEqual([]);
    expect(mesh.primitives).toHaveLength(1);
    expect(signature(mesh.primitives[0])).toEqual({
      id: 'architecture:wall:wall-1',
      ownerId: 'wall-1',
      vertices: 24,
      indices: 36,
      min: [0, 0.2, -0.1],
      max: [4, 3, 0.1],
    });
    expect(mesh.primitives[0].normals).toHaveLength(mesh.primitives[0].positions.length);
    expect(mesh.primitives[0].uvs).toHaveLength(mesh.primitives[0].positions.length);
  });

  it('cuts a rectangular door opening and emits jamb/lintel presentation surfaces', () => {
    const mesh = compileArchitectureMesh(scene([wall(), door()]));
    expect(mesh.diagnostics).toEqual([]);
    const primitive = mesh.primitives[0];
    expect(signature(primitive)).toMatchObject({ vertices: 64, indices: 96 });

    const frontTriangles = triangleCentroidsWithNormal(primitive, [0, 0, 1]);
    expect(frontTriangles.some(([x, y]) => x > 1.5 && x < 2.5 && y > 0.2 && y < 2.3)).toBe(false);
  });

  it('cuts a rectangular window opening while retaining wall below the sill', () => {
    const mesh = compileArchitectureMesh(scene([wall(), windowEntity()]));
    expect(mesh.diagnostics).toEqual([]);
    const primitive = mesh.primitives[0];
    expect(signature(primitive)).toMatchObject({ vertices: 80, indices: 120 });

    const frontTriangles = triangleCentroidsWithNormal(primitive, [0, 0, 1]);
    expect(frontTriangles.some(([x, y]) => x > 1.5 && x < 2.5 && y > 1.1 && y < 2.3)).toBe(false);
    expect(frontTriangles.some(([x, y]) => x > 1.5 && x < 2.5 && y > 0.2 && y < 1.1)).toBe(true);
  });

  it('keeps separate door and window openings deterministic on the same wall', () => {
    const mesh = compileArchitectureMesh(scene([
      wall(),
      door({ pathPosition: 0.25, width: 0.8 }),
      windowEntity({ pathPosition: 0.75, width: 0.8 }),
    ]));
    expect(mesh.diagnostics).toEqual([]);
    expect(signature(mesh.primitives[0])).toMatchObject({ vertices: 120, indices: 180 });
  });

  it('keeps stable wall ownership for a four-wall rectangular fixture', () => {
    const mesh = compileArchitectureMesh(scene([
      wall({ id: 'north', path: { start: [0, 0], end: [4, 0] } }),
      wall({ id: 'east', path: { start: [4, 0], end: [4, 3] } }),
      wall({ id: 'south', path: { start: [4, 3], end: [0, 3] } }),
      wall({ id: 'west', path: { start: [0, 3], end: [0, 0] } }),
    ]));
    expect(mesh.diagnostics).toEqual([]);
    expect(mesh.primitives.map(primitive => primitive.id)).toEqual([
      'architecture:wall:north',
      'architecture:wall:east',
      'architecture:wall:south',
      'architecture:wall:west',
    ]);
    expect(mesh.primitives.every(primitive => primitive.positions.length === 24 && primitive.indices.length === 36)).toBe(true);
  });

  it('supports different straight-wall end heights without delegating slope reconstruction to an engine', () => {
    const mesh = compileArchitectureMesh(scene([wall({ startHeight: 2.4, endHeight: 3.2 })]));
    expect(mesh.diagnostics).toEqual([]);
    expect(signature(mesh.primitives[0])).toEqual({
      id: 'architecture:wall:wall-1',
      ownerId: 'wall-1',
      vertices: 24,
      indices: 36,
      min: [0, 0.2, -0.1],
      max: [4, 3.4, 0.1],
    });
  });

  it('reports unsupported curves instead of silently faceting them in the adapter', () => {
    const mesh = compileArchitectureMesh(scene([wall({ path: { start: [0, 0], end: [4, 0], control: [2, 1] } })]));
    expect(mesh.primitives).toEqual([]);
    expect(mesh.diagnostics).toEqual([expect.objectContaining({ code: 'unsupported-curved-wall', entityId: 'wall-1' })]);
  });

  it('rejects an invalid opening instead of repairing upstream geometry in the mesher', () => {
    const mesh = compileArchitectureMesh(scene([wall(), door({ pathPosition: 0.95, width: 1 })]));
    expect(mesh.primitives).toEqual([]);
    expect(mesh.diagnostics).toEqual([expect.objectContaining({ code: 'invalid-opening', entityId: 'door-1' })]);
  });
});
