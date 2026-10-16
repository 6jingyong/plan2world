import type { Floor, Point, Room } from '$lib/models/types';
import { resolveRoomGeometry } from './roomDetection';
import { roomHoles } from './roomNesting';

/** Ephemeral geometry derived from a native floor; never persisted as another model. */
export interface FloorAnalysis {
  floor: Floor;
  geometry: ReturnType<typeof resolveRoomGeometry>;
  rooms: Room[];
  polygons: Map<string, Point[]>;
  holes: Map<string, Point[][]>;
}

export function analyzeFloor(floor: Floor, previousRooms: Room[] = []): FloorAnalysis {
  const geometry = resolveRoomGeometry(floor, previousRooms);
  const holes = roomHoles(geometry.map(entry => entry.polygon));
  return {
    floor, geometry,
    rooms: geometry.map(entry => entry.room),
    polygons: new Map(geometry.map(entry => [entry.room.id, entry.polygon])),
    holes: new Map(geometry.map((entry, i) => [entry.room.id, holes[i]])),
  };
}
