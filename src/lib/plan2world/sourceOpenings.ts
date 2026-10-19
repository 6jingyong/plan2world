import type { DraftDoor, DraftPoint, DraftWall, DraftWindow } from './draft';
import { projectOntoWall } from '$lib/utils/wallProjection';
import { wallPathProfile, wallPointAt } from '$lib/utils/wallPath';

const doorTypes = ['single', 'double', 'sliding', 'opening'] as const;
type SourceDoorType = typeof doorTypes[number];

/** Working source evidence only; this does not extend the draft contract. */
export interface SourceOpeningTrace {
  cmPerPixel: number;
  maxProjectionDistancePx?: number;
  walls: DraftWall[];
  openings: {
    id: string;
    kind: 'door' | 'window';
    wallId: string;
    endpoints: [DraftPoint, DraftPoint];
    evidence: string;
    doorType?: SourceDoorType;
    typeEvidence?: string;
    confidence?: number;
  }[];
}

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, any>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Expected nonempty ID/evidence');
  return value;
}
function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Expected a finite number');
  return value;
}
function point(value: unknown): DraftPoint {
  const p = record(value);
  return { x: number(p.x), y: number(p.y) };
}

function nearestWallWithinTolerance(
  source: DraftPoint,
  walls: Map<string, DraftWall>,
  preferredWallId: string,
  tolerance: number,
): string | undefined {
  const preferred = walls.get(preferredWallId);
  if (preferred) {
    const projected = projectOntoWall(source, preferred);
    if (projected && projected.distance <= tolerance) return preferredWallId;
  }
  let nearest: { id: string; distance: number } | undefined;
  for (const [id, wall] of walls) {
    if (id === preferredWallId) continue;
    const projected = projectOntoWall(source, wall);
    if (!projected || projected.distance > tolerance) continue;
    if (!nearest || projected.distance < nearest.distance) nearest = { id, distance: projected.distance };
  }
  return nearest?.id;
}

/** Derive existing draft opening fields from observed source-pixel jambs.
 * Reuses the same projection and distance metric as editing/rendering. No source
 * image recognition, wall repair, width heuristics or input mutation occurs here.
 */
export function deriveSourceOpenings(input: unknown) {
  const trace = record(input), scale = number(trace.cmPerPixel);
  const tolerance = trace.maxProjectionDistancePx === undefined ? 3 : number(trace.maxProjectionDistancePx);
  if (scale <= 0 || tolerance < 0) throw new Error('Scale must be positive and projection tolerance nonnegative');
  if (!Array.isArray(trace.walls) || !Array.isArray(trace.openings)) throw new Error('walls/openings must be arrays');
  const walls = new Map<string, DraftWall>(), ids = new Set<string>();
  const claimId = (value: unknown) => {
    const id = text(value);
    if (ids.has(id)) throw new Error(`Duplicate ID: ${id}`);
    ids.add(id); return id;
  };
  for (const value of trace.walls) {
    const item = record(value), id = claimId(item.id);
    const wall: DraftWall = { id, start: point(item.start), end: point(item.end) };
    if (item.curvePoint !== undefined) wall.curvePoint = point(item.curvePoint);
    if (wallPathProfile(wall).length <= 0) throw new Error(`${id}: degenerate host wall`);
    walls.set(id, wall);
  }
  const doors: DraftDoor[] = [], windows: DraftWindow[] = [], unresolvedDoorTypes: string[] = [];
  const sourceIntervals = trace.openings.map((value: unknown) => {
    const item = record(value), id = claimId(item.id), wallId = text(item.wallId);
    const wall = walls.get(wallId);
    if (!wall) throw new Error(`${id}: unknown host wall ${wallId}`);
    if (item.kind !== 'door' && item.kind !== 'window') throw new Error(`${id}: expected door/window kind`);
    text(item.evidence);
    if (['thickness', 'width', 'position'].some(key => item[key] !== undefined)) {
      throw new Error(`${id}: use source endpoints, not independent thickness/width/position`);
    }
    if (!Array.isArray(item.endpoints) || item.endpoints.length !== 2) throw new Error(`${id}: two observed endpoints required`);
    const endpoints = item.endpoints.map(point);
    const hostProjection = endpoints.map(p => projectOntoWall(p, wall));
    if (hostProjection.some(result => !result || result.distance > tolerance)) {
      const endpointWallIds = endpoints.map(p => nearestWallWithinTolerance(p, walls, wallId, tolerance));
      if (endpointWallIds.every((candidate): candidate is string => candidate !== undefined)
        && new Set(endpointWallIds).size > 1) {
        throw new Error(`${id}: source endpoints fall on different wall segments (${endpointWallIds.join(', ')}); both endpoints must lie on one continuous host wall`);
      }
      throw new Error(`${id}: endpoint is too far from its host; recheck source association`);
    }
    const projected = hostProjection.map((result, index) => ({ ...result!, source: endpoints[index] }))
      .sort((a, b) => a.position - b.position);
    const path = wallPathProfile(wall);
    const distances = projected.map(p => path.distanceAt(p.position));
    const widthPx = distances[1] - distances[0];
    if (widthPx <= 1e-6) throw new Error(`${id}: opening endpoints must span a positive interval`);
    const position = path.positionAt((distances[0] + distances[1]) / 2);
    const opening: Pick<DraftDoor, 'id' | 'wallId' | 'position' | 'width' | 'confidence'> = { id, wallId, position, width: widthPx * scale };
    if (item.confidence !== undefined) {
      opening.confidence = number(item.confidence);
      if (opening.confidence < 0 || opening.confidence > 1) throw new Error(`${id}: confidence must be in 0..1`);
    }
    if (item.kind === 'door') {
      const door: DraftDoor = { ...opening };
      if (item.doorType !== undefined) {
        if (!(doorTypes as readonly unknown[]).includes(item.doorType)) throw new Error(`${id}: unsupported source door type`);
        text(item.typeEvidence);
        door.type = item.doorType;
      } else unresolvedDoorTypes.push(id);
      doors.push(door);
    } else {
      if (item.doorType !== undefined || item.typeEvidence !== undefined) throw new Error(`${id}: window cannot carry door leaf evidence`);
      windows.push(opening);
    }
    return { id, kind: item.kind, wallId, evidence: item.evidence,
      endpoints: projected.map(p => p.source), projectedEndpoints: projected.map(p => wallPointAt(wall, p.position)),
      endpointParameters: projected.map(p => p.position), projectionDistancesPx: projected.map(p => p.distance),
      widthPx, typeEvidence: item.typeEvidence };
  });
  return { doors, windows, sourceIntervals, unresolvedDoorTypes, maxProjectionDistancePx: tolerance,
    limitation: 'Evidence strings and valid projections do not prove that an opening exists or that its type/endpoints match the source image.' };
}
