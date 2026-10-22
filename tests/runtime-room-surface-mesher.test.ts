import { describe, expect, it } from 'vitest';
import { compileArchitectureMesh, type ArchitectureMeshPrimitive } from '$lib/runtime/architectureMesher';
import type { Plan2WorldRuntimeSceneV1, RuntimeRoomSurface } from '$lib/runtime/types';

function room(overrides: Partial<RuntimeRoomSurface> = {}): RuntimeRoomSurface {
  return {
    id: 'room-1',
    name: 'Room 1',
    roomType: 'indoor',
    polygon: [[0, 0], [4, 0], [4, 3], [0, 3]],
    holes: [],
    slabThickness: 0.15,
    ceilingHeight: 2.7,
    ...overrides,
  };
}

function scene(rooms: RuntimeRoomSurface[], elevation = 0.2): Plan2WorldRuntimeSceneV1 {
  return {
    schema: 'plan2world-runtime-v1',
    version: 1,
    units: 'metres',
    coordinates: { handedness: 'right', up: '+Y', planX: '+X', planY: '+Z', yaw: 'clockwise-from-+X' },
    source: { projectId: 'project-1', projectName: 'Room surface fixture' },
    playerProfile: { eyeHeight: 1.7, radius: 0.3, speeds: { slow: 1, walk: 2, fast: 4 } },
    floors: [{ id: 'floor-1', name: 'Ground', level: 0, elevation, walkthroughStart: null, rooms }],
    entities: [],
    colliders: [],
  };
}

function rounded(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

function bounds(primitive: ArchitectureMeshPrimitive) {
  const xs = primitive.positions.map(position => position[0]);
  const ys = primitive.positions.map(position => position[1]);
  const zs = primitive.positions.map(position => position[2]);
  return {
    min: [rounded(Math.min(...xs)), rounded(Math.min(...ys)), rounded(Math.min(...zs))],
    max: [rounded(Math.max(...xs)), rounded(Math.max(...ys)), rounded(Math.max(...zs))],
  };
}

function projectedAreaForNormal(primitive: ArchitectureMeshPrimitive, normal: [number, number, number]) {
  let area = 0;
  for (let index = 0; index < primitive.indices.length; index += 3) {
    const ia = primitive.indices[index], ib = primitive.indices[index + 1], ic = primitive.indices[index + 2];
    const n = primitive.normals[ia];
    if (!n.every((value, axis) => Math.abs(value - normal[axis]) < 1e-9)) continue;
    const a = primitive.positions[ia], b = primitive.positions[ib], c = primitive.positions[ic];
    area += Math.abs(
      (b[0] - a[0]) * (c[2] - a[2]) -
      (b[2] - a[2]) * (c[0] - a[0])
    ) / 2;
  }
  return rounded(area);
}

function centroidsForNormal(primitive: ArchitectureMeshPrimitive, normal: [number, number, number]) {
  const centroids: [number, number][] = [];
  for (let index = 0; index < primitive.indices.length; index += 3) {
    const ia = primitive.indices[index], ib = primitive.indices[index + 1], ic = primitive.indices[index + 2];
    const n = primitive.normals[ia];
    if (!n.every((value, axis) => Math.abs(value - normal[axis]) < 1e-9)) continue;
    const a = primitive.positions[ia], b = primitive.positions[ib], c = primitive.positions[ic];
    centroids.push([(a[0] + b[0] + c[0]) / 3, (a[2] + b[2] + c[2]) / 3]);
  }
  return centroids;
}

describe('architecture room surfaces', () => {
  it('meshes a rectangular floor slab and downward-facing ceiling at runtime elevations', () => {
    const mesh = compileArchitectureMesh(scene([room()]));
    expect(mesh.diagnostics).toEqual([]);
    expect(mesh.primitives.map(primitive => [primitive.kind, primitive.id])).toEqual([
      ['floor', 'architecture:floor:room-1'],
      ['ceiling', 'architecture:ceiling:room-1'],
    ]);

    const floor = mesh.primitives[0];
    const ceiling = mesh.primitives[1];
    expect(floor.positions).toHaveLength(24);
    expect(floor.indices).toHaveLength(36);
    expect(bounds(floor)).toEqual({ min: [0, 0.05, 0], max: [4, 0.2, 3] });
    expect(projectedAreaForNormal(floor, [0, 1, 0])).toBe(12);

    expect(ceiling.positions).toHaveLength(4);
    expect(ceiling.indices).toHaveLength(6);
    expect(bounds(ceiling)).toEqual({ min: [0, 2.9, 0], max: [4, 2.9, 3] });
    expect(projectedAreaForNormal(ceiling, [0, -1, 0])).toBe(12);
  });

  it('preserves room holes in floor slabs and ceilings instead of filling them', () => {
    const mesh = compileArchitectureMesh(scene([room({
      polygon: [[0, 0], [6, 0], [6, 4], [0, 4]],
      holes: [[[2, 1], [4, 1], [4, 3], [2, 3]]],
    })]));
    expect(mesh.diagnostics).toEqual([]);

    const floor = mesh.primitives.find(primitive => primitive.kind === 'floor')!;
    const ceiling = mesh.primitives.find(primitive => primitive.kind === 'ceiling')!;
    expect(floor.positions).toHaveLength(52);
    expect(floor.indices).toHaveLength(96);
    expect(ceiling.positions).toHaveLength(10);
    expect(ceiling.indices).toHaveLength(24);
    expect(projectedAreaForNormal(floor, [0, 1, 0])).toBe(20);
    expect(projectedAreaForNormal(ceiling, [0, -1, 0])).toBe(20);

    const insideHole = ([x, z]: [number, number]) => x > 2 && x < 4 && z > 1 && z < 3;
    expect(centroidsForNormal(floor, [0, 1, 0]).some(insideHole)).toBe(false);
    expect(centroidsForNormal(ceiling, [0, -1, 0]).some(insideHole)).toBe(false);
  });

  it('treats ceilingHeight=null as an explicit no-ceiling surface', () => {
    const mesh = compileArchitectureMesh(scene([room({ ceilingHeight: null })]));
    expect(mesh.diagnostics).toEqual([]);
    expect(mesh.primitives.map(primitive => primitive.id)).toEqual(['architecture:floor:room-1']);
  });

  it('keeps stable floor and ceiling ownership across multiple rooms', () => {
    const mesh = compileArchitectureMesh(scene([
      room({ id: 'room-a', polygon: [[0, 0], [2, 0], [2, 2], [0, 2]] }),
      room({ id: 'room-b', polygon: [[3, 0], [5, 0], [5, 2], [3, 2]], ceilingHeight: null }),
    ]));
    expect(mesh.diagnostics).toEqual([]);
    expect(mesh.primitives.map(primitive => primitive.id)).toEqual([
      'architecture:floor:room-a',
      'architecture:ceiling:room-a',
      'architecture:floor:room-b',
    ]);
    expect(mesh.primitives.map(primitive => primitive.ownerId)).toEqual(['room-a', 'room-a', 'room-b']);
  });

  it('rejects an invalid hole instead of repairing room topology in presentation code', () => {
    const mesh = compileArchitectureMesh(scene([room({ holes: [[[5, 1], [6, 1], [6, 2], [5, 2]]] })]));
    expect(mesh.primitives).toEqual([]);
    expect(mesh.diagnostics).toEqual([
      expect.objectContaining({ code: 'invalid-room-surface', entityId: 'room-1' }),
    ]);
  });
});
