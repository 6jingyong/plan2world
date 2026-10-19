import type { DraftDoor, DraftPoint, DraftWall, DraftWindow } from './draft';
import { BARE_HOUSE_VERSION, type BareHouseV1 } from './bareHouse';
import { projectOntoWall } from '$lib/utils/wallProjection';
import { wallPathProfile, wallPointAt } from '$lib/utils/wallPath';

const doorTypes = ['single', 'double', 'sliding', 'opening'] as const;
type SourceDoorType = typeof doorTypes[number];

export interface SourceOpeningReview {
  cmPerPixel: number;
  maxProjectionDistancePx?: number;
  bareHouse: BareHouseV1;
  openings: {
    id: string;
    kind: 'door' | 'window';
    /** Optional deterministic/manual hint. Image-model annotations should omit it. */
    wallId?: string;
    endpoints: [DraftPoint, DraftPoint];
    evidence: string;
    doorType?: SourceDoorType;
    typeEvidence?: string;
    confidence?: number;
  }[];
}

export interface OpeningReviewWarning {
  id: string;
  message: string;
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

function readBareHouse(value: unknown): BareHouseV1 {
  const bareHouse = record(value);
  if (bareHouse.schemaVersion !== BARE_HOUSE_VERSION) {
    throw new Error(`opening review requires bareHouse.schemaVersion="${BARE_HOUSE_VERSION}"`);
  }
  if (!Array.isArray(bareHouse.walls)) throw new Error('bareHouse.walls must be an array');
  return bareHouse as unknown as BareHouseV1;
}

function resolveOpeningHost(
  endpoints: DraftPoint[],
  walls: Map<string, DraftWall>,
  tolerance: number,
  preferredWallId?: string,
) {
  const candidates = [...walls.entries()].flatMap(([id, wall]) => {
    const projected = endpoints.map(source => projectOntoWall(source, wall));
    if (projected.some(result => !result || result.distance > tolerance)) return [];
    const distances = projected.map(result => result!.distance);
    return [{
      id,
      wall,
      projected: projected as NonNullable<ReturnType<typeof projectOntoWall>>[],
      maxResidual: Math.max(...distances),
      totalResidual: distances.reduce((sum, value) => sum + value, 0),
      preferred: id === preferredWallId,
    }];
  });
  candidates.sort((a, b) =>
    Number(b.preferred) - Number(a.preferred)
    || a.maxResidual - b.maxResidual
    || a.totalResidual - b.totalResidual
    || a.id.localeCompare(b.id));
  return candidates[0];
}

function nearestWallForPoint(source: DraftPoint, walls: Map<string, DraftWall>, tolerance: number) {
  return [...walls.entries()]
    .flatMap(([id, wall]) => {
      const projected = projectOntoWall(source, wall);
      return projected && projected.distance <= tolerance ? [{ id, distance: projected.distance }] : [];
    })
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))[0];
}

/**
 * Attach source-observed openings to an already accepted bare house.
 * Host association and all interval math are deterministic. Individual opening
 * mistakes are review warnings, not geometry failures.
 */
export function deriveSourceOpenings(input: unknown) {
  const trace = record(input);
  const bareHouse = readBareHouse(trace.bareHouse);
  const scale = number(trace.cmPerPixel);
  const tolerance = trace.maxProjectionDistancePx === undefined ? 3 : number(trace.maxProjectionDistancePx);
  if (scale <= 0 || tolerance < 0) throw new Error('Scale must be positive and projection tolerance nonnegative');
  if (!Array.isArray(trace.openings)) throw new Error('openings must be an array');

  const walls = new Map<string, DraftWall>();
  for (const value of bareHouse.walls) {
    if (walls.has(value.id)) throw new Error(`Duplicate bare-house wall ID: ${value.id}`);
    walls.set(value.id, value);
  }

  const doors: DraftDoor[] = [];
  const windows: DraftWindow[] = [];
  const sourceIntervals: any[] = [];
  const unresolvedDoorTypes: string[] = [];
  const warnings: OpeningReviewWarning[] = [];
  const openingIds = new Set<string>();

  for (let index = 0; index < trace.openings.length; index += 1) {
    const raw = trace.openings[index];
    let warningId = `opening-${index + 1}`;
    try {
      const item = record(raw);
      const id = text(item.id);
      warningId = id;
      if (openingIds.has(id)) throw new Error('duplicate opening ID');
      openingIds.add(id);
      if (item.kind !== 'door' && item.kind !== 'window') throw new Error('expected door/window kind');
      text(item.evidence);
      if (['thickness', 'width', 'position'].some(key => item[key] !== undefined)) {
        throw new Error('use source endpoints, not independent thickness/width/position');
      }
      if (!Array.isArray(item.endpoints) || item.endpoints.length !== 2) throw new Error('two observed endpoints required');

      const endpoints = item.endpoints.map(point);
      const preferredWallId = item.wallId === undefined ? undefined : text(item.wallId);
      if (preferredWallId && !walls.has(preferredWallId)) throw new Error(`unknown bare-house host wall ${preferredWallId}`);
      const host = resolveOpeningHost(endpoints, walls, tolerance, preferredWallId);
      if (!host) {
        const nearest = endpoints.map(source => nearestWallForPoint(source, walls, tolerance)?.id);
        if (nearest.every((candidate): candidate is string => candidate !== undefined)
          && new Set(nearest).size > 1) {
          throw new Error(`source endpoints fall on different normalized wall segments (${nearest.join(', ')})`);
        }
        throw new Error('opening endpoints do not resolve to one bare-house host');
      }

      const projected = host.projected.map((result, endpointIndex) => ({ ...result, source: endpoints[endpointIndex] }))
        .sort((a, b) => a.position - b.position);
      const path = wallPathProfile(host.wall);
      const distances = projected.map(p => path.distanceAt(p.position));
      const widthPx = distances[1] - distances[0];
      if (widthPx <= 1e-6) throw new Error('opening endpoints must span a positive interval');
      const position = path.positionAt((distances[0] + distances[1]) / 2);
      const opening: Pick<DraftDoor, 'id' | 'wallId' | 'position' | 'width' | 'confidence'> = {
        id,
        wallId: host.id,
        position,
        width: widthPx * scale,
      };
      if (item.confidence !== undefined) {
        opening.confidence = number(item.confidence);
        if (opening.confidence < 0 || opening.confidence > 1) throw new Error('confidence must be in 0..1');
      }

      if (item.kind === 'door') {
        const door: DraftDoor = { ...opening };
        if (item.doorType === undefined) {
          unresolvedDoorTypes.push(id);
          warnings.push({ id, message: 'door operation is unresolved' });
        } else if (!(doorTypes as readonly unknown[]).includes(item.doorType)) {
          unresolvedDoorTypes.push(id);
          warnings.push({ id, message: 'unsupported door operation; aperture kept without a type' });
        } else if (typeof item.typeEvidence !== 'string' || !item.typeEvidence.trim()) {
          unresolvedDoorTypes.push(id);
          warnings.push({ id, message: 'door operation lacks source evidence; aperture kept without a type' });
        } else {
          door.type = item.doorType;
        }
        doors.push(door);
      } else {
        if (item.doorType !== undefined || item.typeEvidence !== undefined) {
          warnings.push({ id, message: 'window carried door-operation fields; fields ignored' });
        }
        windows.push(opening);
      }

      sourceIntervals.push({
        id,
        kind: item.kind,
        wallId: host.id,
        evidence: item.evidence,
        endpoints: projected.map(p => p.source),
        projectedEndpoints: projected.map(p => wallPointAt(host.wall, p.position)),
        endpointParameters: projected.map(p => p.position),
        projectionDistancesPx: projected.map(p => p.distance),
        widthPx,
        typeEvidence: item.typeEvidence,
      });
    } catch (error) {
      warnings.push({ id: warningId, message: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    doors,
    windows,
    sourceIntervals,
    unresolvedDoorTypes,
    warnings,
    reviewStatus: warnings.length === 0 ? 'pass' : 'warning',
    maxProjectionDistancePx: tolerance,
    limitation: 'Opening review annotates an accepted bare house. Missing or inaccurate openings remain review warnings unless later evidence proves the bare-house wall geometry itself is wrong.',
  };
}
