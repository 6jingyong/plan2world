import type { DraftDoor, DraftPoint, DraftWall, DraftWindow } from './draft';
import { BARE_HOUSE_VERSION, type BareHouseV1 } from './bareHouse';
import { projectOntoWall } from '$lib/utils/wallProjection';
import { wallPathProfile, wallPointAt } from '$lib/utils/wallPath';

const doorTypes = ['single', 'double', 'sliding', 'opening'] as const;
type SourceDoorType = typeof doorTypes[number];

export interface SourceOpeningReview {
  /** Program-owned functional-zone path; source observations never set this. */
  allowWindowHostChains?: boolean;
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

export function resolveOpeningHost(
  endpoints: DraftPoint[],
  walls: Map<string, DraftWall>,
  tolerance: number,
  preferredWallId?: string,
  kind?: 'door' | 'window',
) {
  // Source points and wall strokes are independently located on a pixel grid.
  // Two half-pixel diagonal rounding errors contribute at most sqrt(2) px.
  // This allowance is NOT wall snapping, an extension or permission to choose
  // between nearby parallel hosts. Only straight, direction-consistent windows
  // can use it, and explicit caller tolerances remain authoritative.
  const allowance = kind === 'window' ? Math.SQRT2 : 0;
  const candidates = [...walls.entries()].flatMap(([id, wall]) => {
    const projected = endpoints.map(source => projectOntoWall(source, wall));
    if (projected.some(result => !result || result.distance > tolerance + allowance)) return [];
    const distances = projected.map(result => result!.distance);
    const relaxed = Math.max(...distances) > tolerance;
    if (relaxed) {
      const dx = wall.end.x - wall.start.x, dy = wall.end.y - wall.start.y;
      const ex = endpoints[1].x - endpoints[0].x, ey = endpoints[1].y - endpoints[0].y;
      if (wall.curvePoint || Math.abs(dx * ex + dy * ey) / Math.hypot(dx, dy) / Math.hypot(ex, ey) < Math.cos(Math.PI / 18)
        || projected.some(p => !p || p.position <= 0 || p.position >= 1)) return [];
    }
    return [{
      id,
      wall,
      projected: projected as NonNullable<ReturnType<typeof projectOntoWall>>[],
      maxResidual: Math.max(...distances),
      totalResidual: distances.reduce((sum, value) => sum + value, 0),
      preferred: id === preferredWallId,
      resolution: relaxed ? 'bounded-pixel-projection' : 'within-projection-tolerance',
    }];
  });
  candidates.sort((a, b) =>
    Number(b.preferred) - Number(a.preferred)
    || a.maxResidual - b.maxResidual
    || a.totalResidual - b.totalResidual
    || a.id.localeCompare(b.id));
  const best = candidates[0];
  if (kind === 'window' && best && !best.preferred && candidates.some(other => other !== best
    && Math.abs(other.maxResidual - best.maxResidual) <= Math.SQRT2)) {
    throw new Error('ambiguous window host: multiple nearby wall segments; no automatic association');
  }
  return best;
}

function nearestWallForPoint(source: DraftPoint, walls: Map<string, DraftWall>, tolerance: number) {
  return [...walls.entries()]
    .flatMap(([id, wall]) => {
      const projected = projectOntoWall(source, wall);
      return projected && projected.distance <= tolerance ? [{ id, distance: projected.distance }] : [];
    })
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))[0];
}

/** A window can span a junction introduced by functional subdivision. Retain
 * its entire observed interval across ONE uniquely identified original host.
 * This does not join unrelated walls, bridge gaps, relocate jambs or split doors. */
function continuousWindowChain(endpoints: DraftPoint[], house: BareHouseV1, tolerance: number) {
  const byId = new Map(house.walls.map(w => [w.id, w]));
  const candidates = Object.entries(house.sourceWallMap).flatMap(([sourceWallId, ids]) => {
    if (ids.length < 2) return [];
    const walls = ids.map(id => byId.get(id)!);
    if (walls.some(w => !w || w.curvePoint)) return [];
    if (walls.some((w, i) => i > 0 && Math.hypot(w.start.x - walls[i - 1].end.x, w.start.y - walls[i - 1].end.y) > 1e-6)) return [];
    const line = { start: walls[0].start, end: walls.at(-1)!.end };
    const length = Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y);
    const dx = (line.end.x - line.start.x) / length, dy = (line.end.y - line.start.y) / length;
    const along = (p: DraftPoint) => (p.x - line.start.x) * dx + (p.y - line.start.y) * dy;
    const across = (p: DraftPoint) => Math.abs((p.x - line.start.x) * dy - (p.y - line.start.y) * dx);
    const ex = endpoints[1].x - endpoints[0].x, ey = endpoints[1].y - endpoints[0].y;
    if (Math.abs(ex * dx + ey * dy) / Math.hypot(ex, ey) < Math.cos(Math.PI / 18)) return [];
    if (endpoints.some(p => across(p) > tolerance + Math.SQRT2 || along(p) < 0 || along(p) > length)) return [];
    if (walls.some(w => [w.start, w.end].some(p => across(p) > tolerance))) return [];
    const [low, high] = endpoints.map(along).sort((a, b) => a - b);
    const parts = walls.flatMap(wall => {
      const a = along(wall.start), b = along(wall.end), from = Math.max(low, a), to = Math.min(high, b);
      if (b <= a || to - from <= 1e-6) return [];
      return [{ wallId: wall.id, endpoints: [wallPointAt(wall, (from - a) / (b - a)), wallPointAt(wall, (to - a) / (b - a))] as [DraftPoint, DraftPoint] }];
    });
    return parts.length > 1 ? [{ sourceWallId, parts }] : [];
  });
  if (candidates.length > 1) throw new Error('ambiguous continuous window host chain');
  return candidates[0];
}

/**
 * Attach source-observed openings to an already accepted bare house.
 * Host association and all interval math are deterministic. Individual opening
 * mistakes are review warnings, not geometry failures.
 */
export function deriveSourceOpenings(input: unknown): {
  doors: DraftDoor[]; windows: DraftWindow[]; sourceIntervals: any[]; unresolvedDoorTypes: string[];
  warnings: OpeningReviewWarning[]; reviewStatus: string; maxProjectionDistancePx: number; limitation: string;
} {
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
      const host = resolveOpeningHost(endpoints, walls, tolerance, preferredWallId,
        trace.maxProjectionDistancePx === undefined ? item.kind : undefined);
      if (!host) {
        const chain = item.kind === 'window' && trace.allowWindowHostChains === true && !preferredWallId
          ? continuousWindowChain(endpoints, bareHouse, tolerance) : undefined;
        if (chain) {
          const fragments = deriveSourceOpenings({ cmPerPixel: scale, maxProjectionDistancePx: tolerance, bareHouse,
            openings: chain.parts.map((part, i) => ({ ...item, ...part, id: i === 0 ? id : `${id}~${i + 1}` })) });
          if (fragments.windows.length !== chain.parts.length) throw new Error('continuous window chain failed native fragment association');
          windows.push(...fragments.windows);
          const intervals = fragments.sourceIntervals;
          const projectedEndpoints = [intervals[0].projectedEndpoints[0], intervals.at(-1)!.projectedEndpoints[1]];
          const orderedEndpoints = Math.hypot(endpoints[0].x - projectedEndpoints[0].x, endpoints[0].y - projectedEndpoints[0].y)
            <= Math.hypot(endpoints[1].x - projectedEndpoints[0].x, endpoints[1].y - projectedEndpoints[0].y) ? endpoints : [...endpoints].reverse();
          sourceIntervals.push({ id, kind: 'window', wallId: intervals[0].wallId, sourceWallId: chain.sourceWallId,
            outputIds: fragments.windows.map(w => w.id), wallIds: intervals.map(p => p.wallId), evidence: item.evidence, endpoints: orderedEndpoints,
            projectedEndpoints,
            projectionDistancesPx: orderedEndpoints.map((p, i) => Math.hypot(p.x - projectedEndpoints[i].x, p.y - projectedEndpoints[i].y)),
            hostResolution: 'continuous-source-baseline-chain', widthPx: intervals.reduce((s, p) => s + p.widthPx, 0), segments: intervals });
          continue;
        }
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
        hostResolution: host.resolution,
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
