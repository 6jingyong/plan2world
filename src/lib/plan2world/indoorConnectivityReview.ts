import type { Floor, Point } from '$lib/models/types';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { pointInPolygon } from '$lib/utils/hitTesting';
import { automaticWalkthroughStart } from '$lib/utils/walkthroughEntry';
import { createWalkthroughCollisionWorld, DEFAULT_WALKTHROUGH_PLAYER_RADIUS, resolveWalkthroughMove, resolveWalkthroughStart } from '$lib/utils/walkthroughCollision';
import { wallPointAt } from '$lib/utils/wallPath';

/** Native geometry/collision only; no furniture or route through exterior ground. */
export function reviewIndoorConnectivity(floor: Floor, options: { stepCm?: number; maxGridCells?: number } = {}) {
  const step = options.stepCm ?? 20, maxGridCells = options.maxGridCells ?? 100_000;
  if (!Number.isFinite(step) || step < 5 || !Number.isInteger(maxGridCells) || maxGridCells < 1) throw new Error('Invalid indoor diagnostic sampling options.');
  const analysis = analyzeFloor(floor);
  const regions = analysis.rooms.filter(room => !room.floorOpening && room.roomType !== 'outdoor');
  const contains = (room: typeof regions[number], point: Point) =>
    pointInPolygon(point, analysis.polygons.get(room.id) ?? [])
    && !(analysis.holes.get(room.id) ?? []).some(hole => pointInPolygon(point, hole));
  const inside = (point: Point) => regions.some(room => contains(room, point));
  // Copy the floor view; never remove furniture from the native project itself.
  const world = createWalkthroughCollisionWorld({ ...floor, furniture: [] });
  const start = automaticWalkthroughStart(analysis, world);
  const doorLinks = floor.doors.map(door => {
    const host = floor.walls.find(wall => wall.id === door.wallId);
    const roomIds = regions.filter(room => room.walls.includes(door.wallId)).map(room => room.id);
    return { doorId: door.id, wallId: door.wallId, center: host ? wallPointAt(host, door.position) : null, roomIds,
      status: roomIds.length === 2 ? 'two-native-regions' : roomIds.length === 1 ? 'one-native-region' : 'unassigned-or-ambiguous' };
  });
  const metadata = { floorId: floor.id, stepCm: step, playerRadiusCm: DEFAULT_WALKTHROUGH_PLAYER_RADIUS,
    furnitureIncluded: false as const, exteriorTraversalAllowed: false as const, geometryChanged: false as const,
    start, doorLinks, limitation: 'Approximate four-neighbour sampling using native collision inside native indoor region polygons. Unreached or unsampled regions need source review; they are not proof of a missing door. Door links describe native boundaries, not source-image correctness.' };
  const points = regions.flatMap(room => analysis.polygons.get(room.id) ?? []);
  if (!points.length) return { ...metadata, status: 'no-indoor-regions' as const, gridSeedFound: false, rooms: [] };
  const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y));
  const cols = Math.ceil((Math.max(...points.map(p => p.x)) - minX) / step) + 1;
  const rows = Math.ceil((Math.max(...points.map(p => p.y)) - minY) / step) + 1;
  if (cols * rows > maxGridCells) return { ...metadata, status: 'sampling-budget-exceeded' as const, gridSeedFound: false, rooms: [] };
  const grid = Array.from({ length: cols * rows }, (_, id) => ({ x: minX + id % cols * step, y: minY + Math.floor(id / cols) * step }));
  const free = grid.map(point => inside(point) && Math.hypot(...difference(resolveWalkthroughStart(point, world), point)) < 1e-4);
  const traversable = (a: Point, b: Point) => {
    const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 5));
    for (let i = 0; i <= count; i++) if (!inside({ x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count })) return false;
    return Math.hypot(...difference(resolveWalkthroughMove(a, { x: b.x - a.x, y: b.y - a.y }, world), b)) < 1e-4;
  };
  const seeds = grid.map((point, id) => ({ id, distance: Math.hypot(point.x - start.x, point.y - start.y) }))
    .filter(item => free[item.id] && item.distance <= step * 2).sort((a, b) => a.distance - b.distance || a.id - b.id);
  const seed = seeds.find(item => traversable(start, grid[item.id]));
  const visited = new Set<number>(), queue: number[] = [];
  if (seed) { visited.add(seed.id); queue.push(seed.id); }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i], x = id % cols, y = Math.floor(id / cols);
    for (const next of [x > 0 ? id - 1 : -1, x + 1 < cols ? id + 1 : -1, y > 0 ? id - cols : -1, y + 1 < rows ? id + cols : -1]) {
      if (next < 0 || visited.has(next) || !free[next] || !traversable(grid[id], grid[next])) continue;
      visited.add(next); queue.push(next);
    }
  }
  const rooms = regions.map(room => {
    let availableGridNodes = 0, reachableGridNodes = 0;
    for (let id = 0; id < grid.length; id++) if (free[id] && contains(room, grid[id])) {
      availableGridNodes++;
      if (visited.has(id)) reachableGridNodes++;
    }
    const doorIds = doorLinks.filter(link => link.roomIds.includes(room.id)).map(link => link.doorId);
    return { roomId: room.id, areaM2: room.area, doorIds, availableGridNodes, reachableGridNodes,
      polygon: analysis.polygons.get(room.id) ?? [],
      findings: [...(!doorIds.length ? ['no-door-on-boundary'] : []),
        ...(!availableGridNodes ? ['no-walkable-grid-samples'] : seed && !reachableGridNodes ? ['not-reached-from-start'] : [])] };
  });
  return { ...metadata, status: seed ? 'sampled' as const : 'no-grid-seed' as const,
    gridSeedFound: !!seed, gridCells: grid.length, reachableGridNodes: visited.size, rooms };
}

function difference(a: Point, b: Point): [number, number] { return [a.x - b.x, a.y - b.y]; }
