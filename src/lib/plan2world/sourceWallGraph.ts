import type { DraftPoint, DraftWall } from './draft';
import { projectOntoWall } from '$lib/utils/wallProjection';
import { wallPathProfile, wallPointAt } from '$lib/utils/wallPath';

export interface SourceWallGraphTrace {
  maxJunctionDistancePx?: number;
  walls: DraftWall[];
  doorGaps?: { id: string; from: DraftPoint; to: DraftPoint }[];
  enclosures?: {
    id: string;
    boundary: { wallId: string; reverse?: boolean }[];
  }[];
}

type Junction = {
  aId: string;
  bId: string;
  point: DraftPoint;
  aPosition: number;
  bPosition: number;
  residualPx: number;
};

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object');
  return value as Record<string, any>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Expected nonempty ID');
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
function cross(a: DraftPoint, b: DraftPoint) {
  return a.x * b.y - a.y * b.x;
}
function subtract(a: DraftPoint, b: DraftPoint): DraftPoint {
  return { x: a.x - b.x, y: a.y - b.y };
}
function lerp(a: DraftPoint, b: DraftPoint, t: number): DraftPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function straightIntersection(a: DraftWall, b: DraftWall): Junction | undefined {
  if (a.curvePoint || b.curvePoint) return undefined;
  const p = a.start;
  const q = b.start;
  const r = subtract(a.end, a.start);
  const s = subtract(b.end, b.start);
  const denominator = cross(r, s);
  if (Math.abs(denominator) < 1e-9) return undefined;
  const qp = subtract(q, p);
  const t = cross(qp, s) / denominator;
  const u = cross(qp, r) / denominator;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return undefined;
  return {
    aId: a.id,
    bId: b.id,
    point: { x: p.x + r.x * t, y: p.y + r.y * t },
    aPosition: clamp01(t),
    bPosition: clamp01(u),
    residualPx: 0,
  };
}

function wallJunction(a: DraftWall, b: DraftWall, tolerance: number): Junction | undefined {
  const exact = straightIntersection(a, b);
  const candidates: Junction[] = exact ? [exact] : [];
  const aEndpoints: [DraftPoint, number][] = [[a.start, 0], [a.end, 1]];
  const bEndpoints: [DraftPoint, number][] = [[b.start, 0], [b.end, 1]];

  for (const [source, aPosition] of aEndpoints) {
    const projected = projectOntoWall(source, b);
    if (projected && projected.distance <= tolerance) {
      candidates.push({
        aId: a.id,
        bId: b.id,
        point: wallPointAt(b, projected.position),
        aPosition,
        bPosition: projected.position,
        residualPx: projected.distance,
      });
    }
  }
  for (const [source, bPosition] of bEndpoints) {
    const projected = projectOntoWall(source, a);
    if (projected && projected.distance <= tolerance) {
      candidates.push({
        aId: a.id,
        bId: b.id,
        point: wallPointAt(a, projected.position),
        aPosition: projected.position,
        bPosition,
        residualPx: projected.distance,
      });
    }
  }

  candidates.sort((left, right) => left.residualPx - right.residualPx);
  return candidates[0];
}

function quadraticSubsegment(wall: DraftWall, startT: number, endT: number): Pick<DraftWall, 'start' | 'end' | 'curvePoint'> {
  const p0 = wall.start;
  const p1 = wall.curvePoint!;
  const p2 = wall.end;

  function split(a: DraftPoint, b: DraftPoint, c: DraftPoint, t: number) {
    const ab = lerp(a, b, t);
    const bc = lerp(b, c, t);
    const mid = lerp(ab, bc, t);
    return { left: [a, ab, mid] as const, right: [mid, bc, c] as const };
  }

  if (startT <= 0 && endT >= 1) return { start: p0, curvePoint: p1, end: p2 };
  const first = split(p0, p1, p2, endT);
  if (startT <= 0) return { start: first.left[0], curvePoint: first.left[1], end: first.left[2] };
  const relative = startT / endT;
  const second = split(first.left[0], first.left[1], first.left[2], relative);
  return { start: second.right[0], curvePoint: second.right[1], end: second.right[2] };
}

function subWall(wall: DraftWall, startT: number, endT: number, start: DraftPoint, end: DraftPoint, id: string): DraftWall {
  const rest = { ...wall } as any;
  delete rest.id;
  delete rest.start;
  delete rest.end;
  delete rest.curvePoint;
  if (!wall.curvePoint) return { id, ...rest, start, end };
  const segment = quadraticSubsegment(wall, startT, endT);
  return { id, ...rest, start, curvePoint: segment.curvePoint, end };
}

function addSplit(
  list: { position: number; point: DraftPoint }[],
  position: number,
  junctionPoint: DraftPoint,
  wall: DraftWall,
  tolerance: number,
) {
  const path = wallPathProfile(wall);
  const distance = path.distanceAt(position);
  const existing = list.find(item => Math.abs(path.distanceAt(item.position) - distance) <= tolerance);
  if (existing) {
    if (position <= 1e-9 || position >= 1 - 1e-9) existing.point = junctionPoint;
    return;
  }
  list.push({ position, point: junctionPoint });
}

function endpointCandidates(source: DraftPoint, walls: Map<string, DraftWall>, tolerance: number) {
  return [...walls.values()].flatMap(wall => {
    const startDistance = Math.hypot(source.x - wall.start.x, source.y - wall.start.y);
    const endDistance = Math.hypot(source.x - wall.end.x, source.y - wall.end.y);
    const distance = Math.min(startDistance, endDistance);
    return distance <= tolerance ? [{ wall, distance }] : [];
  }).sort((a, b) => a.distance - b.distance || a.wall.id.localeCompare(b.wall.id));
}

function resolveDoorGapHosts(
  from: DraftPoint,
  to: DraftPoint,
  walls: Map<string, DraftWall>,
  tolerance: number,
) {
  const fromCandidates = endpointCandidates(from, walls, tolerance);
  const toCandidates = endpointCandidates(to, walls, tolerance);
  const pairs = fromCandidates.flatMap(left => toCandidates
    .filter(right => right.wall.id !== left.wall.id)
    .map(right => ({
      fromWall: left.wall,
      toWall: right.wall,
      maxResidual: Math.max(left.distance, right.distance),
      totalResidual: left.distance + right.distance,
    })));
  pairs.sort((a, b) =>
    a.maxResidual - b.maxResidual
    || a.totalResidual - b.totalResidual
    || a.fromWall.id.localeCompare(b.fromWall.id)
    || a.toWall.id.localeCompare(b.toWall.id));
  return pairs[0];
}

export function normalizeSourceWallGraph(input: unknown) {
  const trace = record(input);
  const tolerance = trace.maxJunctionDistancePx === undefined ? 3 : number(trace.maxJunctionDistancePx);
  if (tolerance < 0) throw new Error('maxJunctionDistancePx must be nonnegative');
  if (!Array.isArray(trace.walls)) throw new Error('walls must be an array');

  const walls = new Map<string, DraftWall>();
  for (const raw of trace.walls) {
    const item = record(raw);
    const id = text(item.id);
    if (walls.has(id)) throw new Error(`Duplicate wall ID: ${id}`);
    const wall: DraftWall = { ...item, id, start: point(item.start), end: point(item.end) };
    if (item.curvePoint !== undefined) wall.curvePoint = point(item.curvePoint);
    if (wallPathProfile(wall).length <= 1e-6) throw new Error(`${id}: degenerate wall`);
    walls.set(id, wall);
  }

  // Door symbols may interrupt visible wall strokes. The model supplies only the
  // evidenced gap endpoints; the program associates those points with two observed
  // wall endpoints. Proximity alone never creates a bridge without a doorGap item.
  const sourceWalls = new Map(walls);
  const doorGaps = trace.doorGaps === undefined ? [] : trace.doorGaps;
  if (!Array.isArray(doorGaps)) throw new Error('doorGaps must be an array');
  const gapIds = new Set<string>();
  for (const raw of doorGaps) {
    const gap = record(raw);
    const id = text(gap.id);
    if (walls.has(id) || gapIds.has(id)) throw new Error(`Duplicate door gap ID: ${id}`);
    if (gap.fromWallId !== undefined || gap.toWallId !== undefined) {
      throw new Error(`${id}: door gap host IDs are program-owned`);
    }
    gapIds.add(id);
    const from = point(gap.from);
    const to = point(gap.to);
    if (Math.hypot(from.x - to.x, from.y - to.y) <= tolerance) throw new Error(`${id}: collapsed door gap`);
    const hosts = resolveDoorGapHosts(from, to, sourceWalls, tolerance);
    if (!hosts) throw new Error(`${id}: door gap endpoints do not resolve to two observed wall endpoints`);
    walls.set(id, { id, start: from, end: to });
  }

  const splits = new Map<string, { position: number; point: DraftPoint }[]>();
  for (const wall of walls.values()) {
    splits.set(wall.id, [
      { position: 0, point: wall.start },
      { position: 1, point: wall.end },
    ]);
  }

  const junctions: Junction[] = [];
  const wallList = [...walls.values()];
  for (let i = 0; i < wallList.length; i += 1) {
    for (let j = i + 1; j < wallList.length; j += 1) {
      const junction = wallJunction(wallList[i], wallList[j], tolerance);
      if (!junction) continue;
      junctions.push(junction);
      addSplit(splits.get(junction.aId)!, junction.aPosition, junction.point, wallList[i], tolerance);
      addSplit(splits.get(junction.bId)!, junction.bPosition, junction.point, wallList[j], tolerance);
    }
  }

  const normalizedWalls: DraftWall[] = [];
  const sourceWallMap: Record<string, string[]> = {};
  const segmentRanges = new Map<string, { id: string; start: number; end: number }[]>();
  let virtualSplitCount = 0;
  let snappedEndpointCount = 0;

  for (const wall of wallList) {
    const path = wallPathProfile(wall);
    const points = splits.get(wall.id)!.sort((a, b) => a.position - b.position);
    const deduped: { position: number; point: DraftPoint }[] = [];
    for (const item of points) {
      const last = deduped[deduped.length - 1];
      if (last && Math.abs(path.distanceAt(last.position) - path.distanceAt(item.position)) <= tolerance) {
        if (item.position <= 1e-9 || item.position >= 1 - 1e-9) last.point = item.point;
        continue;
      }
      deduped.push(item);
    }

    virtualSplitCount += deduped.filter(item => item.position > 1e-9 && item.position < 1 - 1e-9).length;
    if (Math.hypot(deduped[0].point.x - wall.start.x, deduped[0].point.y - wall.start.y) > 1e-6) snappedEndpointCount += 1;
    const lastPoint = deduped[deduped.length - 1].point;
    if (Math.hypot(lastPoint.x - wall.end.x, lastPoint.y - wall.end.y) > 1e-6) snappedEndpointCount += 1;

    const ranges: { id: string; start: number; end: number }[] = [];
    const split = deduped.length > 2;
    for (let index = 0; index < deduped.length - 1; index += 1) {
      const first = deduped[index];
      const second = deduped[index + 1];
      if (path.distanceAt(second.position) - path.distanceAt(first.position) <= 1e-6) continue;
      const id = split ? `${wall.id}~${index + 1}` : wall.id;
      normalizedWalls.push(subWall(wall, first.position, second.position, first.point, second.point, id));
      ranges.push({ id, start: first.position, end: second.position });
    }
    sourceWallMap[wall.id] = ranges.map(item => item.id);
    segmentRanges.set(wall.id, ranges);
  }

  const normalizedEnclosures: { id: string; boundary: { wallId: string; reverse?: boolean }[] }[] = [];
  if (trace.enclosures !== undefined) {
    if (!Array.isArray(trace.enclosures)) throw new Error('enclosures must be an array');
    const enclosureIds = new Set<string>();

    for (const raw of trace.enclosures) {
      const enclosure = record(raw);
      const id = text(enclosure.id);
      if (enclosureIds.has(id)) throw new Error(`Duplicate enclosure ID: ${id}`);
      enclosureIds.add(id);
      if (!Array.isArray(enclosure.boundary) || enclosure.boundary.length < 3) {
        throw new Error(`${id}: enclosure boundary requires at least three wall refs`);
      }

      const refs = enclosure.boundary.map((rawPart: unknown) => {
        const part = record(rawPart);
        const wallId = text(part.wallId);
        const wall = walls.get(wallId);
        if (!wall) throw new Error(`${id}: unknown boundary wall ${wallId}`);
        if (part.reverse !== undefined && typeof part.reverse !== 'boolean') throw new Error(`${id}: reverse must be boolean`);
        return wall;
      });

      const pairJunctions = refs.map((wall, index) => {
        const next = refs[(index + 1) % refs.length];
        const junction = wallJunction(wall, next, tolerance);
        if (!junction) throw new Error(`${id}: wall topology is open between ${wall.id} and ${next.id}`);
        return junction;
      });

      const boundary: { wallId: string; reverse?: boolean }[] = [];
      for (let index = 0; index < refs.length; index += 1) {
        const wall = refs[index];
        const previousJunction = pairJunctions[(index - 1 + refs.length) % refs.length];
        const nextJunction = pairJunctions[index];
        const incoming = previousJunction.aId === wall.id ? previousJunction.aPosition : previousJunction.bPosition;
        const outgoing = nextJunction.aId === wall.id ? nextJunction.aPosition : nextJunction.bPosition;
        const path = wallPathProfile(wall);
        if (Math.abs(path.distanceAt(outgoing) - path.distanceAt(incoming)) <= tolerance) {
          throw new Error(`${id}: boundary collapses on ${wall.id}`);
        }
        const low = Math.min(incoming, outgoing);
        const high = Math.max(incoming, outgoing);
        const ranges = segmentRanges.get(wall.id)!.filter(range => range.end > low + 1e-9 && range.start < high - 1e-9);
        if (ranges.length === 0) throw new Error(`${id}: no normalized segment remains on ${wall.id}`);
        const forward = outgoing > incoming;
        const ordered = forward ? ranges : [...ranges].reverse();
        for (const range of ordered) boundary.push(forward ? { wallId: range.id } : { wallId: range.id, reverse: true });
      }
      normalizedEnclosures.push({ id, boundary });
    }
  }

  return {
    walls: normalizedWalls,
    enclosures: normalizedEnclosures,
    sourceWallMap,
    junctions: junctions.map(junction => ({
      walls: [junction.aId, junction.bId],
      point: junction.point,
      residualPx: junction.residualPx,
    })),
    virtualSplitCount,
    snappedEndpointCount,
    maxJunctionDistancePx: tolerance,
    limitation: 'Topology normalization only splits/snaps traced walls and bridges explicitly evidenced door gaps; it never creates a wall across an unsupported gap.',
  };
}
