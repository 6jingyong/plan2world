import type { DraftDoor, DraftPoint, DraftWall, DraftWindow } from './draft';
import { projectOntoWall } from '$lib/utils/wallProjection';
import { wallPathProfile, wallPointAt } from '$lib/utils/wallPath';

const doorTypes = ['single', 'double', 'sliding', 'opening'] as const;
type SourceDoorType = typeof doorTypes[number];
type SurfaceKind = 'solid' | 'door' | 'window';

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
  /** Working bare-room topology, not authored draft rooms. */
  enclosures?: {
    id: string;
    boundary: { wallId: string; reverse?: boolean }[];
  }[];
  /** Complete source-facing partition of each wall used by an enclosure. */
  wallSurfaces?: {
    wallId: string;
    segments: {
      kind: SurfaceKind;
      endpoints: [DraftPoint, DraftPoint];
      evidence: string;
      openingId?: string;
    }[];
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
function pointDistance(a: DraftPoint, b: DraftPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

function validateRoomEnvelope(
  trace: Record<string, any>,
  walls: Map<string, DraftWall>,
  sourceIntervals: any[],
  tolerance: number,
) {
  const hasEnclosures = trace.enclosures !== undefined;
  const hasSurfaces = trace.wallSurfaces !== undefined;
  if (!hasEnclosures && !hasSurfaces) {
    return { enclosureCount: 0, coveredWallCount: 0, enclosureIds: [] as string[] };
  }
  if (!Array.isArray(trace.enclosures) || !Array.isArray(trace.wallSurfaces)) {
    throw new Error('enclosures and wallSurfaces must be supplied together as arrays');
  }

  const openingById = new Map(sourceIntervals.map(interval => [interval.id, interval]));
  const surfacesByWall = new Map<string, { start: number; end: number; kind: SurfaceKind; openingId?: string }[]>();

  for (const rawSurface of trace.wallSurfaces) {
    const surface = record(rawSurface), wallId = text(surface.wallId);
    if (surfacesByWall.has(wallId)) throw new Error(`${wallId}: duplicate wallSurfaces entry`);
    const wall = walls.get(wallId);
    if (!wall) throw new Error(`${wallId}: wallSurfaces references unknown wall`);
    if (!Array.isArray(surface.segments) || surface.segments.length === 0) {
      throw new Error(`${wallId}: wallSurfaces requires at least one segment`);
    }
    const path = wallPathProfile(wall);
    const segments = surface.segments.map((rawSegment: unknown, index: number) => {
      const segment = record(rawSegment);
      if (segment.kind !== 'solid' && segment.kind !== 'door' && segment.kind !== 'window') {
        throw new Error(`${wallId}: segment ${index} has unsupported surface kind`);
      }
      text(segment.evidence);
      if (!Array.isArray(segment.endpoints) || segment.endpoints.length !== 2) {
        throw new Error(`${wallId}: segment ${index} requires two source endpoints`);
      }
      const endpoints = segment.endpoints.map(point);
      const projected = endpoints.map(p => projectOntoWall(p, wall));
      if (projected.some(result => !result || result.distance > tolerance)) {
        throw new Error(`${wallId}: segment ${index} endpoint is too far from its wall`);
      }
      const distances = projected.map(result => path.distanceAt(result!.position)).sort((a, b) => a - b);
      if (distances[1] - distances[0] <= 1e-6) throw new Error(`${wallId}: segment ${index} has zero length`);

      const openingId = segment.openingId === undefined ? undefined : text(segment.openingId);
      if (segment.kind === 'solid') {
        if (openingId !== undefined) throw new Error(`${wallId}: solid segment cannot reference an opening`);
      } else {
        if (!openingId) throw new Error(`${wallId}: ${segment.kind} segment must reference openingId`);
        const opening = openingById.get(openingId);
        if (!opening) throw new Error(`${wallId}: unknown opening ${openingId} in wall surface partition`);
        if (opening.wallId !== wallId || opening.kind !== segment.kind) {
          throw new Error(`${wallId}: ${openingId} does not match the wall surface kind/host`);
        }
        const openingDistances = opening.endpointParameters
          .map((position: number) => path.distanceAt(position))
          .sort((a: number, b: number) => a - b);
        if (Math.abs(openingDistances[0] - distances[0]) > tolerance
          || Math.abs(openingDistances[1] - distances[1]) > tolerance) {
          throw new Error(`${wallId}: ${openingId} surface endpoints do not match its opening trace`);
        }
      }
      return { start: distances[0], end: distances[1], kind: segment.kind as SurfaceKind, openingId };
    }).sort((a, b) => a.start - b.start);

    let cursor = 0;
    for (const segment of segments) {
      if (segment.start > cursor + tolerance) {
        throw new Error(`${wallId}: unclassified boundary gap from ${cursor.toFixed(2)} to ${segment.start.toFixed(2)} px`);
      }
      if (segment.start < cursor - tolerance) {
        throw new Error(`${wallId}: overlapping boundary surface segments near ${segment.start.toFixed(2)} px`);
      }
      cursor = Math.max(cursor, segment.end);
    }
    if (cursor < path.length - tolerance) {
      throw new Error(`${wallId}: unclassified boundary tail from ${cursor.toFixed(2)} to ${path.length.toFixed(2)} px`);
    }
    if (cursor > path.length + tolerance) throw new Error(`${wallId}: wall surface partition exceeds host length`);

    const representedOpenings = new Set(segments.flatMap(segment => segment.openingId ? [segment.openingId] : []));
    const hostedOpenings = sourceIntervals.filter(interval => interval.wallId === wallId).map(interval => interval.id);
    for (const openingId of hostedOpenings) {
      if (!representedOpenings.has(openingId)) {
        throw new Error(`${wallId}: opening ${openingId} is missing from the complete wall surface partition`);
      }
    }
    surfacesByWall.set(wallId, segments);
  }

  const enclosureIds = new Set<string>();
  for (const rawEnclosure of trace.enclosures) {
    const enclosure = record(rawEnclosure), id = text(enclosure.id);
    if (enclosureIds.has(id)) throw new Error(`Duplicate enclosure ID: ${id}`);
    enclosureIds.add(id);
    if (!Array.isArray(enclosure.boundary) || enclosure.boundary.length < 3) {
      throw new Error(`${id}: enclosure boundary requires at least three wall refs`);
    }
    const seenWalls = new Set<string>();
    const oriented = enclosure.boundary.map((rawPart: unknown) => {
      const part = record(rawPart), wallId = text(part.wallId), wall = walls.get(wallId);
      if (!wall) throw new Error(`${id}: unknown boundary wall ${wallId}`);
      if (seenWalls.has(wallId)) throw new Error(`${id}: boundary wall ${wallId} is repeated`);
      seenWalls.add(wallId);
      if (part.reverse !== undefined && typeof part.reverse !== 'boolean') throw new Error(`${id}: reverse must be boolean`);
      if (!surfacesByWall.has(wallId)) throw new Error(`${id}: boundary wall ${wallId} lacks a complete wallSurfaces partition`);
      const reverse = part.reverse === true;
      return { wallId, entry: reverse ? wall.end : wall.start, exit: reverse ? wall.start : wall.end };
    });
    for (let index = 0; index < oriented.length; index += 1) {
      const current = oriented[index], next = oriented[(index + 1) % oriented.length];
      if (pointDistance(current.exit, next.entry) > tolerance) {
        throw new Error(`${id}: enclosure is not closed between ${current.wallId} and ${next.wallId}`);
      }
    }
  }

  return {
    enclosureCount: enclosureIds.size,
    coveredWallCount: surfacesByWall.size,
    enclosureIds: [...enclosureIds],
  };
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
  const roomEnvelope = validateRoomEnvelope(trace, walls, sourceIntervals, tolerance);
  return { doors, windows, sourceIntervals, unresolvedDoorTypes, maxProjectionDistancePx: tolerance, roomEnvelope,
    limitation: 'Evidence strings, closed envelope traces and valid projections do not prove that the source classification is correct; compare the frozen overlay to the original image.' };
}
