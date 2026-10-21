import { wallPathProfile, wallPointAt, wallTangentAt } from './wallPath';
import { openingPathInterval } from './openingPath';
export { wallPathProfile, wallPathSpans } from './wallPath';
import { getWallStartHeight, getWallEndHeight, type Wall, type Door, type Window, type Point } from '$lib/models/types';

export interface WallOpening { left: number; right: number; bottom: number; top: number }
export interface WallSegment { width: number; bottomY: number; topYLeft: number; topYRight: number; offsetX: number }
const at = (length: number, start: number, end: number, x: number) => start + (end - start) * Math.max(0, Math.min(1, x / length));

/** Rectangular openings must fit under BOTH ends of their span, not just their
 * centre. Rendering is clipped; the stored opening dimensions are never changed.
 */
export function openingOnWall(length: number, start: number, end: number, position: number, width: number, bottom: number, height: number): WallOpening | null {
  if (![length, start, end, position, width, bottom, height].every(Number.isFinite) || length <= 0 || width <= 0 || height <= 0) return null;
  const left = Math.max(0, position * length - width / 2);
  const right = Math.min(length, position * length + width / 2);
  const top = Math.min(bottom + height, at(length, start, end, left), at(length, start, end, right));
  bottom = Math.max(0, bottom);
  return right > left && top > bottom ? { left, right, bottom, top } : null;
}

/** Subtract the union of all openings from a trapezoidal wall face. Splitting
 * at each opening edge handles overlaps and clipped end openings consistently.
 */
export function buildWallSegments(length: number, start: number, end: number, doors: Door[], windows: Window[]): WallSegment[] {
  if (![length, start, end].every(Number.isFinite) || length <= 0) return [];
  const openings = [
    ...doors.map(d => openingOnWall(length, start, end, d.position, d.width, 0, d.height ?? 210)),
    ...windows.map(w => openingOnWall(length, start, end, w.position, w.width, w.sillHeight ?? 90, w.height)),
  ].filter((o): o is WallOpening => o !== null);
  return segmentsAroundOpenings(length, start, end, openings);
}

function segmentsAroundOpenings(length: number, start: number, end: number, openings: WallOpening[]): WallSegment[] {
  const edges = [...new Set([0, length, ...openings.flatMap(o => [o.left, o.right])])].sort((a, b) => a - b);
  const result: WallSegment[] = [];
  for (let i = 1; i < edges.length; i++) {
    const left = edges[i - 1], right = edges[i];
    const hLeft = at(length, start, end, left), hRight = at(length, start, end, right);
    const holes = openings.filter(o => o.left < right && o.right > left).sort((a, b) => a.bottom - b.bottom);
    let bottom = 0;
    const append = (topLeft: number, topRight: number) => {
      if (Math.max(topLeft, topRight) > bottom) result.push({ width: right - left, offsetX: (left + right) / 2, bottomY: bottom, topYLeft: topLeft, topYRight: topRight });
    };
    for (const hole of holes) {
      if (hole.bottom > bottom) append(hole.bottom, hole.bottom);
      bottom = Math.max(bottom, hole.top);
    }
    append(hLeft, hRight);
  }
  return result;
}

export function pathOpening(path: ReturnType<typeof wallPathProfile>, center: number, width: number, bottom: number, height: number): WallOpening | null {
  if (![path.length, center, width, bottom, height].every(Number.isFinite) || path.length <= 0 || width <= 0 || height <= 0) return null;
  const interval = openingPathInterval(path.length, center, width); if (!interval) return null;
  const { left, right } = interval;
  const top = Math.min(bottom + height, path.sample(left).height, path.sample(right).height);
  bottom = Math.max(0, bottom);
  return right > left && top > bottom ? { left, right, bottom, top } : null;
}

/** Cut the union of the full openings before distributing them across curve
 * spans. A shared head height keeps a sloped aperture level across facet joins.
 */
export function wallProfileSpans(wall: Wall, doors: Door[], windows: Window[]) {
  const path = wallPathProfile(wall);
  const holes = [
    ...doors.map(d => pathOpening(path, path.distanceAt(d.position), d.width, 0, d.height ?? 210)),
    ...windows.map(w => pathOpening(path, path.distanceAt(w.position), w.width, w.sillHeight ?? 90, w.height)),
  ].filter((hole): hole is WallOpening => hole !== null);
  return path.spans.filter(span => span.length > 0).map(span => {
    const local: WallOpening[] = holes.flatMap(hole => {
      // Preserve exact span endpoints: converting through position/width can
      // round a full-span hole inward and leave a zero-width blocking face.
      const left = hole.left <= span.from ? 0 : hole.left - span.from;
      const right = hole.right >= span.to ? span.length : hole.right - span.from;
      const top = Math.min(hole.top, at(span.length, span.startHeight, span.endHeight, left), at(span.length, span.startHeight, span.endHeight, right));
      return right > left && top > hole.bottom ? [{ ...hole, left, right, top }] : [];
    });
    return { ...span, segments: segmentsAroundOpenings(span.length, span.startHeight, span.endHeight, local) };
  });
}

export function roomCeilingHeight(wallIds: string[], walls: Wall[]): number | undefined {
  const boundary = wallIds.map(id => walls.find(w => w.id === id));
  if (!boundary.length || boundary.some(w => !w)) return undefined;
  const height = getWallStartHeight(boundary[0]!);
  return height > 0 && boundary.every(w => Math.abs(getWallStartHeight(w!) - height) < 0.01 && Math.abs(getWallEndHeight(w!) - height) < 0.01) ? height : undefined;
}

function wallPointAndTangent(wall: Wall, position: number): { point: Point; tangent: Point } {
  const t = Math.max(0, Math.min(1, Number.isFinite(position) ? position : 0));
  return { point: wallPointAt(wall, t), tangent: wallTangentAt(wall, t) };
}

/** Pose for the slightly open 3D door leaf, in world X/Z coordinates. Curved
 * walls use the quadratic point and local tangent rather than the end-point chord.
 */
export function doorPanelPose(wall: Wall, door: Door): { x: number; z: number; yaw: number } {
  const { point, tangent } = wallPointAndTangent(wall, door.position);
  const angle = Math.atan2(tangent.y, tangent.x);
  const hingeSide = door.swingDirection === 'left' ? 1 : -1;
  const face = door.flipSide ? -1 : 1;
  const hinge = hingeSide * door.width / 2;
  return {
    x: point.x + hinge * Math.cos(angle) - Math.sin(angle) * face * 2,
    z: point.y + hinge * Math.sin(angle) + Math.cos(angle) * face * 2,
    yaw: angle + (hingeSide === 1 ? Math.PI : 0) - hingeSide * face * 0.26,
  };
}
