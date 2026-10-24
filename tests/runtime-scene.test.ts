import { describe, expect, it } from 'vitest';
import type { Floor, Project } from '$lib/models/types';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { compileArchitectureMesh } from '$lib/runtime/architectureMesher';
import type { Plan2WorldRuntimeSceneV1 } from '$lib/runtime/types';

function floorFixture(): Floor {
  return {
    id: 'floor-1', name: 'Ground', level: 0, elevation: 20, slabThickness: 8, walkthroughStart: { x: 100, y: 100 },
    walls: [
      { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 20, height: 280, color: '#fff' },
      { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, thickness: 20, height: 280, color: '#fff' },
      { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, thickness: 20, height: 280, color: '#fff' },
      { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, thickness: 20, height: 280, color: '#fff' },
    ],
    rooms: [],
    doors: [{ id: 'd1', wallId: 'w1', position: 0.5, width: 100, height: 210, type: 'single', swingDirection: 'left', flipSide: false }],
    windows: [{ id: 'win1', wallId: 'w3', position: 0.5, width: 120, height: 140, sillHeight: 0, type: 'fixed' }],
    furniture: [{ id: 'f1', catalogId: 'sofa', sourceCategory: 'sofa', position: { x: 100, y: 200 }, rotation: 90, scale: { x: 1, y: 1, z: 1 } }],
    stairs: [], columns: [{ id: 'c1', position: { x: 350, y: 250 }, rotation: 0, shape: 'round', diameter: 30, height: 280, color: '#aaa' }],
    guides: [], measurements: [], annotations: [], textAnnotations: [], groups: [],
  };
}

function projectFixture(floor = floorFixture()): Project {
  return { id: 'project-1', name: 'Runtime test', floors: [floor], activeFloorId: floor.id, createdAt: new Date(0), updatedAt: new Date(0) };
}

function expectStableReferences(scene: Plan2WorldRuntimeSceneV1) {
  const floorIds = new Set(scene.floors.map(floor => floor.id));
  expect(floorIds.size).toBe(scene.floors.length);

  const entities = new Map(scene.entities.map(entity => [entity.id, entity]));
  const roomFloorIds = new Map(scene.floors.flatMap(floor => floor.rooms.map(room => [room.id, floor.id] as const)));
  expect(entities.size).toBe(scene.entities.length);
  for (const entity of scene.entities) {
    expect(floorIds.has(entity.floorId)).toBe(true);
    if (entity.kind === 'door') {
      const host = entities.get(entity.hostWallId);
      expect(host?.kind).toBe('wall');
      expect(host?.floorId).toBe(entity.floorId);
    }
  }

  const colliderIds = new Set(scene.colliders.map(collider => collider.id));
  expect(colliderIds.size).toBe(scene.colliders.length);
  for (const collider of scene.colliders) {
    expect(floorIds.has(collider.floorId)).toBe(true);
    const ownerFloorId = entities.get(collider.ownerId)?.floorId ?? roomFloorIds.get(collider.ownerId);
    expect(ownerFloorId).toBe(collider.floorId);
  }
}

describe('plan2world runtime compiler', () => {
  it('compiles native centimetres and room analysis into engine-neutral metres', () => {
    const scene = compileRuntimeScene(projectFixture());
    expect(scene.schema).toBe('plan2world-runtime-v1');
    expect(scene.units).toBe('metres');
    expect(scene.coordinates).toEqual({ handedness: 'right', up: '+Y', planX: '+X', planY: '+Z', yaw: 'clockwise-from-+X' });
    expect(scene.floors[0].elevation).toBeCloseTo(0.2);
    expect(scene.floors[0].walkthroughStart).toEqual([1, 0.2, 1]);
    expect(scene.floors[0].rooms).toHaveLength(1);
    expect(scene.floors[0].rooms[0].polygon.length).toBeGreaterThanOrEqual(4);
    expect(scene.floors[0].rooms[0].slabThickness).toBeCloseTo(0.08);
    expect(scene.floors[0].rooms[0].ceilingHeight).toBeCloseTo(2.8);
    expectStableReferences(scene);
  });

  it('compiles an automatic interior spawn when the native Project has no explicit start', () => {
    const floor=floorFixture(); delete floor.walkthroughStart;
    floor.furniture=[];
    const project=projectFixture(floor), before=structuredClone(project);
    const scene=compileRuntimeScene(project);
    const start=scene.floors[0].walkthroughStart!;
    expect(start[0]).toBeGreaterThan(0); expect(start[0]).toBeLessThan(4);
    expect(start[2]).toBeGreaterThan(0); expect(start[2]).toBeLessThan(3);
    expect(start[1]).toBe(0.2);
    expect(project).toEqual(before);
    expect(compileRuntimeScene(project).floors[0].walkthroughStart).toEqual(start);
  });

  it.each(['outdoor', 'explicit-boundary'] as const)('preserves native %s ground without inventing a ceiling from wall heights', kind => {
    const floor = floorFixture();
    floor.rooms = [{ id: 'source-area', name: 'Authored ground', walls: floor.walls.map(wall => wall.id),
      area: 12, floorTexture: 'concrete', roomType: kind === 'outdoor' ? 'outdoor' : 'indoor' }];
    if (kind === 'explicit-boundary') {
      // Only one edge is a real wall. Free boundary points close the authored
      // ground; retaining that wall reference does not establish a ceiling.
      floor.walls = [floor.walls[0]];
      floor.rooms[0].walls = ['w1'];
      floor.rooms[0].boundary = [{ wallId: 'w1' }, { point: { x: 400, y: 300 } }, { point: { x: 0, y: 300 } }];
      floor.windows = [];
    }
    const project = projectFixture(floor), before = structuredClone(project);
    const scene = compileRuntimeScene(project);
    const surface = scene.floors[0].rooms.find(room => room.id === 'source-area')!;
    expect(surface.ceilingHeight).toBeNull();
    expect(surface.polygon).toHaveLength(4);
    expect(scene.colliders.some(collider => collider.ownerId === surface.id && collider.kind === 'triangle-mesh')).toBe(true);
    expect(scene.colliders.some(collider => collider.ownerId === 'w1' && collider.kind === 'box')).toBe(true);
    const architecture = compileArchitectureMesh(scene);
    expect(architecture.primitives.some(primitive => primitive.ownerId === surface.id && primitive.kind === 'floor')).toBe(true);
    expect(architecture.primitives.some(primitive => primitive.ownerId === surface.id && primitive.kind === 'ceiling')).toBe(false);
    expect(compileRuntimeScene(project)).toEqual(scene);
    expect(project).toEqual(before);
  });

  it('emits room floor triangle collision with canonical upward winding', () => {
    const scene = compileRuntimeScene(projectFixture());
    const room = scene.floors[0].rooms[0];
    const collider = scene.colliders.find(candidate => candidate.ownerId === room.id && candidate.kind === 'triangle-mesh');
    expect(collider?.kind).toBe('triangle-mesh');
    if (collider?.kind !== 'triangle-mesh') return;

    expect(collider.dynamic).toBe(false);
    expect(collider.vertices.length).toBeGreaterThanOrEqual(3);
    expect(collider.vertices.every(vertex => Math.abs(vertex[1] - 0.2) < 1e-9)).toBe(true);
    expect(collider.indices.length % 3).toBe(0);
    expect(collider.indices.every(index => index >= 0 && index < collider.vertices.length)).toBe(true);

    for (let index = 0; index < collider.indices.length; index += 3) {
      const a = collider.vertices[collider.indices[index]];
      const b = collider.vertices[collider.indices[index + 1]];
      const c = collider.vertices[collider.indices[index + 2]];
      const ab = [b[0] - a[0], b[2] - a[2]];
      const ac = [c[0] - a[0], c[2] - a[2]];
      const normalY = ab[1] * ac[0] - ab[0] * ac[1];
      expect(normalY).toBeGreaterThan(0);
    }
  });

  it('keeps architecture semantic while compiling interaction and primitive collision', () => {
    const scene = compileRuntimeScene(projectFixture());
    const wall = scene.entities.find(entity => entity.id === 'w1');
    expect(wall?.kind).toBe('wall');
    if (wall?.kind === 'wall') expect(wall.path).toEqual({ start: [0, 0], end: [4, 0] });

    const door = scene.entities.find(entity => entity.id === 'd1');
    expect(door?.kind).toBe('door');
    if (door?.kind === 'door') {
      expect(door.closedPose.center).toEqual([2, 1.25, 0]);
      expect(door.interaction.kind).toBe('swing');
      if (door.interaction.kind === 'swing') {
        expect(door.interaction.leaves[0].pivot).toEqual([2.5, 0.2, 0]);
        expect(door.interaction.leaves[0].axis).toEqual([0, 1, 0]);
        expect(door.interaction.leaves[0].openAngleRadians).toBeCloseTo(Math.PI / 2);
      }
    }
    expect(scene.colliders.find(collider => collider.ownerId === 'd1')).toMatchObject({ kind: 'box', dynamic: true });

    // A full-height window is visually open in the wall mesh but must not become
    // a walk-through gap. Its host wall still owns static collision.
    expect(scene.colliders.some(collider => collider.ownerId === 'w3')).toBe(true);
    expect(scene.colliders.filter(collider => collider.ownerId === 'w1')).toHaveLength(2);

    const sofa = scene.entities.find(entity => entity.id === 'f1');
    expect(sofa?.kind).toBe('furniture');
    if (sofa?.kind === 'furniture') {
      expect(sofa.assetRef).toBe('catalog:sofa');
      expect(sofa.position).toEqual([1, 0.6, 2]);
      expect(sofa.size).toEqual([2, 0.8, 0.9]);
      expect(sofa.yawClockwiseRadians).toBeCloseTo(Math.PI / 2);
    }
    expect(scene.colliders.find(collider => collider.ownerId === 'c1')).toMatchObject({ kind: 'cylinder', dynamic: false });
  });

  it('uses type-specific door motion data instead of fake hinge fields', () => {
    const floor = floorFixture();
    floor.doors = [
      { id: 'slide', wallId: 'w1', position: 0.25, width: 80, height: 210, type: 'sliding', swingDirection: 'left', flipSide: false },
      { id: 'fold', wallId: 'w2', position: 0.5, width: 80, height: 210, type: 'bifold', swingDirection: 'right', flipSide: false },
      { id: 'garage', wallId: 'w3', position: 0.5, width: 160, height: 220, type: 'garage', swingDirection: 'left', flipSide: false },
      { id: 'opening', wallId: 'w4', position: 0.5, width: 90, height: 210, type: 'opening', swingDirection: 'left', flipSide: false },
    ];
    const scene = compileRuntimeScene(projectFixture(floor));
    const doors = new Map(scene.entities.filter(entity => entity.kind === 'door').map(entity => [entity.id, entity]));

    const slide = doors.get('slide');
    expect(slide?.kind).toBe('door');
    if (slide?.kind === 'door') {
      expect(slide.interaction).toMatchObject({ kind: 'slide', leaves: [{ axis: [1, 0, 0], travel: expect.closeTo(0.8, 12) }] });
      expect(scene.colliders.find(collider => collider.ownerId === 'slide')).toMatchObject({ kind: 'box', dynamic: true });
    }

    const fold = doors.get('fold');
    expect(fold?.kind).toBe('door');
    if (fold?.kind === 'door') expect(fold.interaction).toMatchObject({ kind: 'unsupported', sourceMotion: 'fold', leaves: [expect.any(Object)] });

    const garage = doors.get('garage');
    expect(garage?.kind).toBe('door');
    if (garage?.kind === 'door') expect(garage.interaction).toMatchObject({ kind: 'unsupported', sourceMotion: 'overhead', leaves: [expect.any(Object)] });

    const opening = doors.get('opening');
    expect(opening?.kind).toBe('door');
    if (opening?.kind === 'door') expect(opening.interaction).toEqual({ kind: 'none' });
    expect(scene.colliders.some(collider => collider.ownerId === 'opening')).toBe(false);
  });

  it('preserves exact quadratic wall evidence while faceting only runtime collision', () => {
    const floor = floorFixture();
    floor.rooms = [];
    floor.walls = [{
      id: 'curve', start: { x: 0, y: 0 }, curvePoint: { x: 200, y: 150 }, end: { x: 400, y: 0 },
      thickness: 15, height: 260, color: '#fff',
    }];
    floor.doors = []; floor.windows = []; floor.furniture = []; floor.columns = [];
    const scene = compileRuntimeScene(projectFixture(floor));
    const curve = scene.entities.find(entity => entity.id === 'curve');
    expect(curve?.kind).toBe('wall');
    if (curve?.kind === 'wall') expect(curve.path.control).toEqual([2, 1.5]);
    expect(scene.colliders.filter(collider => collider.ownerId === 'curve').length).toBeGreaterThan(1);
  });

  it('keeps logical air boundaries invisible but collidable and leafless openings noninteractive', () => {
    const floor = floorFixture();
    floor.walls[0].boundaryType = 'air';
    floor.doors[0].type = 'opening';
    const scene = compileRuntimeScene(projectFixture(floor));
    const wall = scene.entities.find(entity => entity.id === 'w1');
    expect(wall?.kind === 'wall' && wall.visible).toBe(false);
    const door = scene.entities.find(entity => entity.id === 'd1');
    expect(door?.kind === 'door' && door.interaction).toEqual({ kind: 'none' });
    expect(scene.colliders.some(collider => collider.ownerId === 'd1')).toBe(false);
  });
});
