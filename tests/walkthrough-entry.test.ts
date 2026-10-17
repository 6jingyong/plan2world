import { expect, it } from 'vitest';
import { roomProject } from './fixtures/project';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { automaticWalkthroughStart } from '$lib/utils/walkthroughEntry';
import { createWalkthroughCollisionWorld, resolveWalkthroughStart } from '$lib/utils/walkthroughCollision';
import { pointInPolygon } from '$lib/utils/hitTesting';

function floorWithRings(rings: number[][][]) {
  const floor = roomProject().floors[0]; floor.rooms = [];
  floor.walls = rings.flatMap((ring, r) => ring.map(([x, y], i) => ({ id: `${r}-${i}`, start: { x, y },
    end: { x: ring[(i + 1) % ring.length][0], y: ring[(i + 1) % ring.length][1] }, thickness: 20, height: 280, color: '#444444' })));
  return floor;
}

it('enters the interior of a concave room instead of its exterior centroid', () => {
  const floor = floorWithRings([[[0, 0], [600, 0], [600, 600], [400, 600], [400, 200], [200, 200], [200, 600], [0, 600]]]);
  const before = structuredClone(floor), analysis = analyzeFloor(floor), start = automaticWalkthroughStart(analysis);
  expect(analysis.rooms).toHaveLength(1);
  expect(pointInPolygon(start, analysis.geometry[0].polygon)).toBe(true);
  expect(start.y).toBeLessThan(200);
  expect(floor).toEqual(before); expect(floor.walkthroughStart).toBeUndefined();
});

it('keeps entry out of nested room holes and floor openings', () => {
  const floor = floorWithRings([[[0, 0], [600, 0], [600, 600], [0, 600]], [[200, 200], [400, 200], [400, 400], [200, 400]]]);
  const first = analyzeFloor(floor), inner = first.rooms.find(room => room.area === 4)!;
  floor.rooms = [{ ...inner, floorOpening: true }];
  const analysis = analyzeFloor(floor), largest = analysis.rooms.find(room => !room.floorOpening)!;
  const start = automaticWalkthroughStart(analysis);
  expect(pointInPolygon(start, analysis.polygons.get(largest.id)!)).toBe(true);
  expect(analysis.holes.get(largest.id)).toHaveLength(1);
  expect(pointInPolygon(start, analysis.holes.get(largest.id)![0])).toBe(false);
});

it('resolves blocking furniture with the existing player collision rule', () => {
  const floor = floorWithRings([[[0, 0], [600, 0], [600, 400], [0, 400]]]);
  floor.furniture = [{ id: 'sofa', catalogId: 'sofa', position: { x: 300, y: 200 }, rotation: 0, scale: { x: 1, y: 1, z: 1 } }];
  const world = createWalkthroughCollisionWorld(floor), start = automaticWalkthroughStart(analyzeFloor(floor), world);
  expect(start).not.toEqual({ x: 300, y: 200 });
  expect(resolveWalkthroughStart(start, world)).toEqual(start);
  expect(pointInPolygon(start, floor.walls.map(wall => wall.start))).toBe(true);
});

it('keeps the established fallback for an open or empty wall graph', () => {
  const floor = floorWithRings([[[100, 200], [500, 200]]]);
  floor.walls.pop();
  const start = automaticWalkthroughStart(analyzeFloor(floor));
  expect(start.x).toBeCloseTo(300); expect(Math.abs(start.y - 200)).toBeGreaterThanOrEqual(30 - 1e-4);
  floor.walls = [];
  expect(automaticWalkthroughStart(analyzeFloor(floor))).toEqual({ x: 0, y: 0 });
});
