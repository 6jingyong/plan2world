import { describe, expect, it } from 'vitest';
import type { Floor, Project } from '$lib/models/types';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';

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
  });

  it('keeps architecture semantic while compiling interaction and primitive collision', () => {
    const scene = compileRuntimeScene(projectFixture());
    const wall = scene.entities.find(entity => entity.id === 'w1');
    expect(wall?.kind).toBe('wall');
    if (wall?.kind === 'wall') expect(wall.path).toEqual({ start: [0, 0], end: [4, 0] });

    const door = scene.entities.find(entity => entity.id === 'd1');
    expect(door?.kind).toBe('door');
    if (door?.kind === 'door') {
      expect(door.interaction).toMatchObject({ enabled: true, motion: 'swing', opensTowardWallNormal: 1 });
      expect(door.closedPose.center).toEqual([2, 1.25, 0]);
      expect(door.interaction.hingePosition).toEqual([2.5, 1.25, 0]);
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
    expect(door?.kind === 'door' && door.interaction).toMatchObject({ enabled: false, motion: 'none' });
    expect(scene.colliders.some(collider => collider.ownerId === 'd1')).toBe(false);
  });
});
