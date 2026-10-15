import {
  parsePlan2WorldDraft,
  type DraftFloor,
  type DraftPoint,
  type DraftWall,
  type Plan2WorldDraft,
} from './draft';

export type DraftGeometryIssueSeverity = 'warning' | 'error';
export type DraftGeometryIssueCode =
  | 'short-wall'
  | 'near-miss'
  | 'duplicate-wall'
  | 'disconnected-component'
  | 'opening-outside-wall';

export interface DraftGeometryIssue {
  code: DraftGeometryIssueCode;
  severity: DraftGeometryIssueSeverity;
  floorId: string;
  message: string;
  elementIds: string[];
}

const CONNECT_TOLERANCE_CM = 1.5;
const NEAR_MISS_MAX_CM = 10;
const SHORT_WALL_CM = 25;
const CURVE_FACETS = 16;

interface DraftFacet {
  start: DraftPoint;
  end: DraftPoint;
  from: number;
  to: number;
  length: number;
}

function distance(a: DraftPoint, b: DraftPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function wallPointAt(wall: DraftWall, t: number): DraftPoint {
  if (!wall.curvePoint) {
    return {
      x: wall.start.x + (wall.end.x - wall.start.x) * t,
      y: wall.start.y + (wall.end.y - wall.start.y) * t,
    };
  }
  const u = 1 - t;
  return {
    x: u * u * wall.start.x + 2 * u * t * wall.curvePoint.x + t * t * wall.end.x,
    y: u * u * wall.start.y + 2 * u * t * wall.curvePoint.y + t * t * wall.end.y,
  };
}

/** Match the editor/runtime's 16-facet quadratic approximation closely enough for diagnostics. */
function wallFacets(wall: DraftWall): DraftFacet[] {
  const count = wall.curvePoint ? CURVE_FACETS : 1;
  let walked = 0;
  return Array.from({ length: count }, (_, index) => {
    const start = wallPointAt(wall, index / count);
    const end = wallPointAt(wall, (index + 1) / count);
    const length = distance(start, end);
    const facet = { start, end, from: walked, to: walked + length, length };
    walked += length;
    return facet;
  });
}

function wallLength(wall: DraftWall): number {
  return wallFacets(wall).reduce((sum, facet) => sum + facet.length, 0);
}

function wallDistanceAt(wall: DraftWall, position: number): number {
  const facets = wallFacets(wall);
  if (!facets.length) return 0;
  const scaled = Math.max(0, Math.min(1, position)) * facets.length;
  const index = Math.min(facets.length - 1, Math.floor(scaled));
  return facets[index].from + (scaled - index) * facets[index].length;
}

function pointLineSegmentDistance(point: DraftPoint, start: DraftPoint, end: DraftPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 1e-12) return distance(point, start);
  const t = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq,
  ));
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.y - (start.y + dy * t),
  );
}

function pointWallDistance(point: DraftPoint, wall: DraftWall): number {
  return Math.min(...wallFacets(wall).map(facet => pointLineSegmentDistance(point, facet.start, facet.end)));
}

function orientation(a: DraftPoint, b: DraftPoint, c: DraftPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function lineSegmentsIntersect(a: DraftFacet, b: DraftFacet): boolean {
  const o1 = orientation(a.start, a.end, b.start);
  const o2 = orientation(a.start, a.end, b.end);
  const o3 = orientation(b.start, b.end, a.start);
  const o4 = orientation(b.start, b.end, a.end);
  const epsilon = 1e-6;
  if (Math.abs(o1) < epsilon && pointLineSegmentDistance(b.start, a.start, a.end) <= CONNECT_TOLERANCE_CM) return true;
  if (Math.abs(o2) < epsilon && pointLineSegmentDistance(b.end, a.start, a.end) <= CONNECT_TOLERANCE_CM) return true;
  if (Math.abs(o3) < epsilon && pointLineSegmentDistance(a.start, b.start, b.end) <= CONNECT_TOLERANCE_CM) return true;
  if (Math.abs(o4) < epsilon && pointLineSegmentDistance(a.end, b.start, b.end) <= CONNECT_TOLERANCE_CM) return true;
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function wallsIntersect(a: DraftWall, b: DraftWall): boolean {
  const aFacets = wallFacets(a);
  const bFacets = wallFacets(b);
  return aFacets.some(aFacet => bFacets.some(bFacet => lineSegmentsIntersect(aFacet, bFacet)));
}

function wallsConnected(a: DraftWall, b: DraftWall): boolean {
  return wallsIntersect(a, b)
    || pointWallDistance(a.start, b) <= CONNECT_TOLERANCE_CM
    || pointWallDistance(a.end, b) <= CONNECT_TOLERANCE_CM
    || pointWallDistance(b.start, a) <= CONNECT_TOLERANCE_CM
    || pointWallDistance(b.end, a) <= CONNECT_TOLERANCE_CM;
}

function matchingCurveShape(a: DraftWall, b: DraftWall): boolean {
  if (!a.curvePoint && !b.curvePoint) return true;
  if (!a.curvePoint || !b.curvePoint) return false;
  return distance(a.curvePoint, b.curvePoint) <= CONNECT_TOLERANCE_CM;
}

function sameWall(a: DraftWall, b: DraftWall): boolean {
  if (!matchingCurveShape(a, b)) return false;
  const direct = distance(a.start, b.start) <= CONNECT_TOLERANCE_CM
    && distance(a.end, b.end) <= CONNECT_TOLERANCE_CM;
  const reversed = distance(a.start, b.end) <= CONNECT_TOLERANCE_CM
    && distance(a.end, b.start) <= CONNECT_TOLERANCE_CM;
  return direct || reversed;
}

function connectedComponents(walls: DraftWall[]): number[][] {
  const visited = new Set<number>();
  const result: number[][] = [];
  for (let start = 0; start < walls.length; start++) {
    if (visited.has(start)) continue;
    const component: number[] = [];
    const queue = [start];
    visited.add(start);
    while (queue.length) {
      const current = queue.shift()!;
      component.push(current);
      for (let candidate = 0; candidate < walls.length; candidate++) {
        if (visited.has(candidate) || candidate === current) continue;
        if (!wallsConnected(walls[current], walls[candidate])) continue;
        visited.add(candidate);
        queue.push(candidate);
      }
    }
    result.push(component);
  }
  return result;
}

function endpointNearMisses(floor: DraftFloor): DraftGeometryIssue[] {
  const issues: DraftGeometryIssue[] = [];
  const seen = new Set<string>();
  for (const wall of floor.walls) {
    for (const [endpointName, endpoint] of [['start', wall.start], ['end', wall.end]] as const) {
      let best: { wall: DraftWall; distance: number } | undefined;
      for (const other of floor.walls) {
        if (other.id === wall.id) continue;
        const d = pointWallDistance(endpoint, other);
        if (d <= CONNECT_TOLERANCE_CM || d > NEAR_MISS_MAX_CM) continue;
        if (!best || d < best.distance) best = { wall: other, distance: d };
      }
      if (!best) continue;
      const pair = [wall.id, best.wall.id].sort().join('|');
      const key = `${pair}:${endpointName}:${endpoint.x.toFixed(2)}:${endpoint.y.toFixed(2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        code: 'near-miss',
        severity: 'warning',
        floorId: floor.id,
        elementIds: [wall.id, best.wall.id],
        message: `${wall.id} ${endpointName} stops ${best.distance.toFixed(1)} cm short of ${best.wall.id}.`,
      });
    }
  }
  return issues;
}

function openingIssues(floor: DraftFloor): DraftGeometryIssue[] {
  const wallById = new Map(floor.walls.map(wall => [wall.id, wall]));
  return [...(floor.doors ?? []), ...(floor.windows ?? [])].flatMap(opening => {
    const wall = wallById.get(opening.wallId);
    if (!wall) return [];
    const length = wallLength(wall);
    if (length <= 0) return [];
    const center = wallDistanceAt(wall, opening.position);
    const left = center - opening.width / 2;
    const right = center + opening.width / 2;
    if (left >= -CONNECT_TOLERANCE_CM && right <= length + CONNECT_TOLERANCE_CM) return [];
    return [{
      code: 'opening-outside-wall' as const,
      severity: 'error' as const,
      floorId: floor.id,
      elementIds: [opening.id, wall.id],
      message: `${opening.id} extends beyond its host wall ${wall.id}.`,
    }];
  });
}

function floorIssues(floor: DraftFloor): DraftGeometryIssue[] {
  const issues: DraftGeometryIssue[] = [];

  for (const wall of floor.walls) {
    const length = wallLength(wall);
    if (length < SHORT_WALL_CM) {
      issues.push({
        code: 'short-wall', severity: 'warning', floorId: floor.id, elementIds: [wall.id],
        message: `${wall.id} is only ${length.toFixed(1)} cm long.`,
      });
    }
  }

  for (let i = 0; i < floor.walls.length; i++) {
    for (let j = i + 1; j < floor.walls.length; j++) {
      if (!sameWall(floor.walls[i], floor.walls[j])) continue;
      issues.push({
        code: 'duplicate-wall', severity: 'error', floorId: floor.id,
        elementIds: [floor.walls[i].id, floor.walls[j].id],
        message: `${floor.walls[i].id} and ${floor.walls[j].id} describe the same wall segment.`,
      });
    }
  }

  const components = connectedComponents(floor.walls);
  if (components.length > 1) {
    const primaryIndex = components.reduce(
      (best, component, index) => component.length > components[best].length ? index : best,
      0,
    );
    components.forEach((component, index) => {
      if (index === primaryIndex) return;
      const ids = component.map(wallIndex => floor.walls[wallIndex].id);
      issues.push({
        code: 'disconnected-component', severity: 'warning', floorId: floor.id, elementIds: ids,
        message: `A disconnected wall group (${ids.join(', ')}) is separate from the main plan.`,
      });
    });
  }

  issues.push(...endpointNearMisses(floor), ...openingIssues(floor));
  return issues;
}

/** Deterministic, conservative checks intended to surface likely AI reconstruction mistakes. Curves use the same 16-facet approximation as the editor runtime. */
export function inspectPlan2WorldDraftGeometry(input: unknown): DraftGeometryIssue[] {
  const draft: Plan2WorldDraft = parsePlan2WorldDraft(input);
  return draft.floors.flatMap(floorIssues);
}
