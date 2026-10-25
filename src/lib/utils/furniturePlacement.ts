import type { Floor, FurnitureItem, Point } from '../models/types';
import { getFurnitureSize } from './furnitureCatalog';
import { getWallStartHeight, getWallEndHeight } from '../models/types';

export const needsWallMount = (catalogId: string) => ['wall_art', 'mirror', 'clock', 'wall_sconce_outdoor'].includes(catalogId);

/** Native positions remain canonical. The binding constrains that position;
 * no second stored mesh/pose or inferred model attachment is introduced. */
export function furnitureWallFrame(floor: Floor, item: FurnitureItem) {
  const mount = item.wallMount;
  if (!mount) throw new Error('Choose a wall for this furniture.');
  const wall = floor.walls.find(w => w.id === mount.wallId);
  if (!wall || wall.boundaryType === 'air' || wall.boundaryType === 'railing') throw new Error('Wall furniture requires an existing solid wall.');
  if (wall.curvePoint) throw new Error('Curved-wall furniture attachment is not supported yet. Use an authored straight wall.');
  const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y, length = Math.hypot(dx, dy);
  if (length < 1e-6) throw new Error('Wall furniture requires a nonzero wall.');
  const tangent = { x: dx / length, y: dy / length }, side = mount.side === 'left' ? 1 : -1;
  const size = getFurnitureSize(item);
  const offset = wall.thickness / 2 + size.depth / 2 + 0.1;
  const origin = { x: wall.start.x - tangent.y * side * offset, y: wall.start.y + tangent.x * side * offset };
  const along = [size.width / 2, length - size.width / 2] as const;
  const bottom = [0, Math.min(getWallStartHeight(wall), getWallEndHeight(wall)) - size.height] as const;
  if (along[1] < along[0] || bottom[1] < 0) throw new Error('This furniture does not fit the authored wall.');
  const blocked = [
    ...floor.doors.filter(d => d.wallId === wall.id).map(d => ({ along: [d.position * length - d.width/2, d.position * length + d.width/2], bottom: [0, d.height] })),
    ...floor.windows.filter(w => w.wallId === wall.id).map(w => ({ along: [w.position * length - w.width/2, w.position * length + w.width/2], bottom: [w.sillHeight, w.sillHeight+w.height] })),
  ];
  return { wall, tangent, origin, along, bottom, blocked, rotation: Math.atan2(dy, dx) * 180 / Math.PI + (side < 0 ? 180 : 0), size, length };
}

export function placeOnWall(floor: Floor, item: FurnitureItem, requested: Point, elevation: number) {
  const frame = furnitureWallFrame(floor, item);
  if (!Number.isFinite(elevation)) throw new Error('Installation height must be finite native centimetres.');
  const along = Math.max(frame.along[0], Math.min(frame.along[1], (requested.x - frame.origin.x) * frame.tangent.x + (requested.y - frame.origin.y) * frame.tangent.y));
  const bottom = Math.max(frame.bottom[0], Math.min(frame.bottom[1], elevation));
  for (const opening of frame.blocked) {
    if (along + frame.size.width/2 > opening.along[0] + 1e-5 && along - frame.size.width/2 < opening.along[1] - 1e-5 && bottom + frame.size.height > opening.bottom[0] + 1e-5 && bottom < opening.bottom[1] - 1e-5) throw new Error('Wall-mounted furniture overlaps a door or window opening.');
  }
  return { position: { x: frame.origin.x + along * frame.tangent.x, y: frame.origin.y + along * frame.tangent.y }, elevation: bottom, rotation: frame.rotation };
}

export function validateWallPlacement(floor: Floor, item: FurnitureItem) {
  const placed = placeOnWall(floor, item, item.position, item.wallMount!.elevation);
  if (Math.hypot(placed.position.x - item.position.x, placed.position.y - item.position.y) > 0.01 || Math.abs(placed.elevation - item.wallMount!.elevation) > 0.01 || Math.abs(Math.sin((placed.rotation - item.rotation) * Math.PI / 360)) > 1e-6) {
    throw new Error(`Wall-mounted furniture "${item.id}" no longer matches its authored wall. Reattach it in the native Project.`);
  }
  return furnitureWallFrame(floor, item);
}
