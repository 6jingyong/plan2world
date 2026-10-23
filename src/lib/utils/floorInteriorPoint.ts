import type { Point } from '$lib/models/types';
import type { FloorAnalysis } from './floorAnalysis';
import { roomInteriorPoint } from './roomNesting';
import { buildFloorClearance, resolveClearancePoint, type FloorClearance } from './floorClearance';

/** Floor-local automatic entry, derived from the same live rooms as 2D and 3D. */
export function floorInteriorPoint(
  analysis: FloorAnalysis,
  collisionWorld: FloorClearance = buildFloorClearance(analysis.floor),
): Point {
  let largest: FloorAnalysis['rooms'][number] | undefined;
  for (const room of analysis.rooms) {
    if (room.floorOpening || !analysis.polygons.get(room.id)?.length) continue;
    if (!largest || (largest.roomType === 'outdoor' && room.roomType !== 'outdoor') ||
        ((largest.roomType === 'outdoor') === (room.roomType === 'outdoor') && room.area > largest.area)) largest = room;
  }
  let point: Point = { x: 0, y: 0 };
  if (largest) {
    point = roomInteriorPoint(analysis.polygons.get(largest.id)!, analysis.holes.get(largest.id));
  } else {
    const endpoints = analysis.floor.walls.flatMap(wall => [wall.start, wall.end]);
    if (endpoints.length) point = {
      x: (Math.min(...endpoints.map(p => p.x)) + Math.max(...endpoints.map(p => p.x))) / 2,
      y: (Math.min(...endpoints.map(p => p.y)) + Math.max(...endpoints.map(p => p.y))) / 2,
    };
  }
  return resolveClearancePoint(point, collisionWorld);
}
