import { describe, expect, it } from 'vitest';
import type { Floor, Project, Room, Stair } from '$lib/models/types';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';

function emptyFloor(id: string, level: number, elevation: number): Floor {
  return {
    id,
    name: id,
    level,
    elevation,
    walls: [],
    rooms: [],
    doors: [],
    windows: [],
    furniture: [],
    stairs: [],
    columns: [],
    guides: [],
    measurements: [],
    annotations: [],
    textAnnotations: [],
    groups: [],
  };
}

function stair(overrides: Partial<Stair> = {}): Stair {
  return {
    id: 'stair-1',
    position: { x: 0, y: 0 },
    rotation: 0,
    width: 100,
    depth: 300,
    riserCount: 15,
    direction: 'up',
    stairType: 'straight',
    ...overrides,
  };
}

function project(floors: Floor[]): Project {
  return {
    id: 'project-stairs',
    name: 'Stair runtime',
    floors,
    activeFloorId: floors[0].id,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function stairEntity(scene: ReturnType<typeof compileRuntimeScene>, id = 'stair-1') {
  const entity = scene.entities.find(candidate => candidate.id === id);
  expect(entity?.kind).toBe('stair');
  if (!entity || entity.kind !== 'stair') throw new Error('missing stair entity');
  return entity;
}

function expectUpwardTriangles(collider: Extract<ReturnType<typeof compileRuntimeScene>['colliders'][number], { kind: 'triangle-mesh' }>) {
  for (let index = 0; index < collider.indices.length; index += 3) {
    const a = collider.vertices[collider.indices[index]];
    const b = collider.vertices[collider.indices[index + 1]];
    const c = collider.vertices[collider.indices[index + 2]];
    const abX = b[0] - a[0], abZ = b[2] - a[2];
    const acX = c[0] - a[0], acZ = c[2] - a[2];
    expect(abZ * acX - abX * acZ).toBeGreaterThan(0);
  }
}

describe('runtime stair traversal', () => {
  it('connects an UP straight stair to the next authored floor with a walkable ramp', () => {
    const ground = emptyFloor('ground', 0, 0);
    ground.stairs.push(stair());
    const upper = emptyFloor('upper', 1, 300);
    const scene = compileRuntimeScene(project([ground, upper]));

    const entity = stairEntity(scene);
    expect(entity.traversal).toEqual({
      kind: 'ramp',
      targetFloorId: 'upper',
      startElevation: 0,
      endElevation: 3,
    });
    const collider = scene.colliders.find(candidate => candidate.id === 'stair:stair-1:ramp');
    expect(collider?.kind).toBe('triangle-mesh');
    if (!collider || collider.kind !== 'triangle-mesh') return;
    expect(collider.ownerId).toBe('stair-1');
    expect(collider.floorId).toBe('ground');
    expect(collider.vertices).toEqual([
      [-0.5, 0, 1.5],
      [0.5, 0, 1.5],
      [0.5, 3, -1.5],
      [-0.5, 3, -1.5],
    ]);
    expectUpwardTriangles(collider);
  });

  it('connects a DN straight stair from the current floor to the floor below', () => {
    const ground = emptyFloor('ground', 0, 0);
    const upper = emptyFloor('upper', 1, 300);
    upper.stairs.push(stair({ direction: 'down', rotation: 90 }));
    const scene = compileRuntimeScene(project([upper, ground]));

    const entity = stairEntity(scene);
    expect(entity.floorId).toBe('upper');
    expect(entity.traversal).toEqual({
      kind: 'ramp',
      targetFloorId: 'ground',
      startElevation: 3,
      endElevation: 0,
    });
    const collider = scene.colliders.find(candidate => candidate.id === 'stair:stair-1:ramp');
    expect(collider?.kind).toBe('triangle-mesh');
    if (!collider || collider.kind !== 'triangle-mesh') return;
    expectUpwardTriangles(collider);
    expect(Math.min(...collider.vertices.map(vertex => vertex[1]))).toBe(0);
    expect(Math.max(...collider.vertices.map(vertex => vertex[1]))).toBe(3);
  });

  it.each(['l-shaped', 'u-shaped', 'spiral'] as const)('keeps %s and unconnected stairs explicit instead of inventing traversal', stairType => {
    const ground = emptyFloor('ground', 0, 0);
    ground.stairs.push(
      stair({ id: 'turning', stairType }),
      stair({ id: 'orphan', position: { x: 400, y: 0 }, direction: 'down' }),
    );
    const upper = emptyFloor('upper', 1, 300);
    const scene = compileRuntimeScene(project([ground, upper]));
    const turning = stairEntity(scene, 'turning');
    const orphan = stairEntity(scene, 'orphan');

    expect(turning.traversal).toEqual({ kind: 'unsupported', reason: 'non-straight' });
    expect(orphan.traversal).toEqual({ kind: 'unsupported', reason: 'missing-target-floor' });
    expect(scene.colliders.some(collider => collider.ownerId === 'turning')).toBe(false);
    expect(scene.colliders.some(collider => collider.ownerId === 'orphan')).toBe(false);
  });

  it('rejects level ordering whose authored elevation contradicts the stair direction', () => {
    const ground = emptyFloor('ground', 0, 300);
    ground.stairs.push(stair({ direction: 'up' }));
    const upper = emptyFloor('upper', 1, 100);
    const scene = compileRuntimeScene(project([ground, upper]));
    expect(stairEntity(scene).traversal).toEqual({ kind: 'unsupported', reason: 'invalid-target-elevation' });
    expect(scene.colliders.some(collider => collider.ownerId === 'stair-1')).toBe(false);
  });
});

describe('runtime floor openings', () => {
  it('uses explicit floor-opening rooms as holes without re-emitting a surface that fills them', () => {
    const floor = emptyFloor('ground', 0, 20);
    floor.walls = [
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, thickness: 20, height: 280, color: '#fff' },
      { id: 'w2', start: { x: 600, y: 0 }, end: { x: 600, y: 600 }, thickness: 20, height: 280, color: '#fff' },
      { id: 'w3', start: { x: 600, y: 600 }, end: { x: 0, y: 600 }, thickness: 20, height: 280, color: '#fff' },
      { id: 'w4', start: { x: 0, y: 600 }, end: { x: 0, y: 0 }, thickness: 20, height: 280, color: '#fff' },
    ];
    const opening: Room = {
      id: 'shaft',
      name: 'Stair opening',
      walls: [],
      boundary: [
        { point: { x: 200, y: 200 } },
        { point: { x: 400, y: 200 } },
        { point: { x: 400, y: 400 } },
        { point: { x: 200, y: 400 } },
      ],
      floorOpening: true,
      floorTexture: 'hardwood',
      area: 0,
    };
    floor.rooms = [opening];
    const scene = compileRuntimeScene(project([floor]));

    expect(scene.floors[0].rooms.some(room => room.id === 'shaft')).toBe(false);
    expect(scene.floors[0].rooms).toHaveLength(1);
    const room = scene.floors[0].rooms[0];
    expect(room.holes).toEqual([[[2, 2], [4, 2], [4, 4], [2, 4]]]);

    const collider = scene.colliders.find(candidate => candidate.id === `floor:${room.id}`);
    expect(collider?.kind).toBe('triangle-mesh');
    if (!collider || collider.kind !== 'triangle-mesh') return;
    for (let index = 0; index < collider.indices.length; index += 3) {
      const points = collider.indices.slice(index, index + 3).map(vertexIndex => collider.vertices[vertexIndex]);
      const x = points.reduce((sum, point) => sum + point[0], 0) / 3;
      const z = points.reduce((sum, point) => sum + point[2], 0) / 3;
      expect(x > 2 && x < 4 && z > 2 && z < 4).toBe(false);
    }
  });
});
