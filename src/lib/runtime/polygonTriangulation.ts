import type { RuntimeVec2 } from './types';

const EPSILON = 1e-9;

export interface TriangulatedPolygon {
  vertices: RuntimeVec2[];
  triangles: [number, number, number][];
}

function near(a: number, b: number) {
  return Math.abs(a - b) <= EPSILON;
}

function samePoint(a: RuntimeVec2, b: RuntimeVec2) {
  return near(a[0], b[0]) && near(a[1], b[1]);
}

function cross(a: RuntimeVec2, b: RuntimeVec2, c: RuntimeVec2) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function signedArea(points: RuntimeVec2[]) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index], b = points[(index + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

function sanitizeRing(points: RuntimeVec2[]) {
  const result: RuntimeVec2[] = [];
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
    if (result.length === 0 || !samePoint(result[result.length - 1], point)) result.push([point[0], point[1]]);
  }
  if (result.length > 1 && samePoint(result[0], result[result.length - 1])) result.pop();
  if (result.length < 3) return null;

  let changed = true;
  while (changed && result.length > 3) {
    changed = false;
    for (let index = 0; index < result.length; index += 1) {
      const previous = result[(index - 1 + result.length) % result.length];
      const current = result[index];
      const next = result[(index + 1) % result.length];
      if (Math.abs(cross(previous, current, next)) > EPSILON) continue;
      result.splice(index, 1);
      changed = true;
      break;
    }
  }

  return result.length >= 3 && Math.abs(signedArea(result)) > EPSILON ? result : null;
}

function normalizedRing(points: RuntimeVec2[], counterClockwise: boolean) {
  const ring = sanitizeRing(points);
  if (!ring) return null;
  if ((signedArea(ring) > 0) !== counterClockwise) ring.reverse();
  return ring;
}

function onSegment(a: RuntimeVec2, b: RuntimeVec2, point: RuntimeVec2) {
  return Math.abs(cross(a, b, point)) <= EPSILON &&
    point[0] >= Math.min(a[0], b[0]) - EPSILON && point[0] <= Math.max(a[0], b[0]) + EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - EPSILON && point[1] <= Math.max(a[1], b[1]) + EPSILON;
}

function orientation(a: RuntimeVec2, b: RuntimeVec2, c: RuntimeVec2) {
  const value = cross(a, b, c);
  return Math.abs(value) <= EPSILON ? 0 : value > 0 ? 1 : -1;
}

function segmentsIntersect(a: RuntimeVec2, b: RuntimeVec2, c: RuntimeVec2, d: RuntimeVec2) {
  const abC = orientation(a, b, c), abD = orientation(a, b, d);
  const cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (abC * abD < 0 && cdA * cdB < 0) return true;
  return (abC === 0 && onSegment(a, b, c)) || (abD === 0 && onSegment(a, b, d)) ||
    (cdA === 0 && onSegment(c, d, a)) || (cdB === 0 && onSegment(c, d, b));
}

function pointInPolygon(point: RuntimeVec2, polygon: RuntimeVec2[]) {
  let inside = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    if (onSegment(a, b, point)) return true;
    if ((a[1] > point[1]) === (b[1] > point[1])) continue;
    const crossingX = a[0] + (point[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
    if (point[0] < crossingX) inside = !inside;
  }
  return inside;
}

function bridgeVisible(
  holePoint: RuntimeVec2,
  polygonPoint: RuntimeVec2,
  polygon: RuntimeVec2[],
  holes: RuntimeVec2[][],
) {
  if (samePoint(holePoint, polygonPoint)) return false;
  const midpoint: RuntimeVec2 = [(holePoint[0] + polygonPoint[0]) / 2, (holePoint[1] + polygonPoint[1]) / 2];
  if (!pointInPolygon(midpoint, polygon) || holes.some(hole => pointInPolygon(midpoint, hole))) return false;

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index], b = polygon[(index + 1) % polygon.length];
    if (samePoint(a, polygonPoint) || samePoint(b, polygonPoint)) continue;
    if (segmentsIntersect(holePoint, polygonPoint, a, b)) return false;
  }

  for (const hole of holes) {
    for (let index = 0; index < hole.length; index += 1) {
      const a = hole[index], b = hole[(index + 1) % hole.length];
      if (samePoint(a, holePoint) || samePoint(b, holePoint)) continue;
      if (segmentsIntersect(holePoint, polygonPoint, a, b)) return false;
    }
  }
  return true;
}

function rightmostVertexIndex(ring: RuntimeVec2[]) {
  let best = 0;
  for (let index = 1; index < ring.length; index += 1) {
    if (ring[index][0] > ring[best][0] + EPSILON ||
      (near(ring[index][0], ring[best][0]) && ring[index][1] < ring[best][1] - EPSILON)) best = index;
  }
  return best;
}

function bridgeHole(polygon: RuntimeVec2[], hole: RuntimeVec2[], remainingHoles: RuntimeVec2[][]) {
  const holeIndex = rightmostVertexIndex(hole);
  const holePoint = hole[holeIndex];
  const candidates = polygon
    .map((point, index) => ({
      index,
      point,
      distanceSquared: (point[0] - holePoint[0]) ** 2 + (point[1] - holePoint[1]) ** 2,
    }))
    .filter(candidate => bridgeVisible(holePoint, candidate.point, polygon, [hole, ...remainingHoles]))
    .sort((a, b) => a.distanceSquared - b.distanceSquared || a.point[0] - b.point[0] || a.point[1] - b.point[1] || a.index - b.index);
  if (candidates.length === 0) return null;

  const polygonIndex = candidates[0].index;
  const bridgePoint = polygon[polygonIndex];
  return [
    ...polygon.slice(0, polygonIndex + 1),
    ...hole.slice(holeIndex),
    ...hole.slice(0, holeIndex + 1),
    bridgePoint,
    ...polygon.slice(polygonIndex + 1),
  ];
}

function pointInTriangle(point: RuntimeVec2, a: RuntimeVec2, b: RuntimeVec2, c: RuntimeVec2) {
  return cross(a, b, point) >= -EPSILON && cross(b, c, point) >= -EPSILON && cross(c, a, point) >= -EPSILON;
}

function earClip(polygon: RuntimeVec2[]) {
  const remaining = polygon.map((_, index) => index);
  const triangles: [number, number, number][] = [];
  const maxIterations = polygon.length * polygon.length;
  let iterations = 0;

  while (remaining.length > 3 && iterations < maxIterations) {
    let clipped = false;
    for (let offset = 0; offset < remaining.length; offset += 1) {
      const previousIndex = remaining[(offset - 1 + remaining.length) % remaining.length];
      const currentIndex = remaining[offset];
      const nextIndex = remaining[(offset + 1) % remaining.length];
      const a = polygon[previousIndex], b = polygon[currentIndex], c = polygon[nextIndex];
      if (cross(a, b, c) <= EPSILON) continue;

      let containsVertex = false;
      for (const candidateIndex of remaining) {
        if (candidateIndex === previousIndex || candidateIndex === currentIndex || candidateIndex === nextIndex) continue;
        const point = polygon[candidateIndex];
        if (samePoint(point, a) || samePoint(point, b) || samePoint(point, c)) continue;
        if (pointInTriangle(point, a, b, c)) {
          containsVertex = true;
          break;
        }
      }
      if (containsVertex) continue;

      triangles.push([previousIndex, currentIndex, nextIndex]);
      remaining.splice(offset, 1);
      clipped = true;
      break;
    }
    if (!clipped) return null;
    iterations += 1;
  }

  if (remaining.length !== 3) return null;
  const [aIndex, bIndex, cIndex] = remaining;
  if (cross(polygon[aIndex], polygon[bIndex], polygon[cIndex]) <= EPSILON) return null;
  triangles.push([aIndex, bIndex, cIndex]);
  return triangles;
}

/**
 * Deterministic, engine-neutral triangulation for room surfaces.
 * The outer ring is normalized counter-clockwise and holes clockwise, then
 * connected by visible zero-width bridges before ordinary ear clipping.
 */
export function triangulatePolygonWithHoles(outer: RuntimeVec2[], holes: RuntimeVec2[][]): TriangulatedPolygon | null {
  const polygon = normalizedRing(outer, true);
  if (!polygon) return null;
  const normalizedHoles = holes.map(hole => normalizedRing(hole, false));
  if (normalizedHoles.some(hole => hole === null)) return null;

  const orderedHoles = (normalizedHoles as RuntimeVec2[][])
    .map((hole, index) => ({ hole, index, rightmost: hole[rightmostVertexIndex(hole)] }))
    .sort((a, b) => b.rightmost[0] - a.rightmost[0] || a.rightmost[1] - b.rightmost[1] || a.index - b.index)
    .map(item => item.hole);

  let bridged = polygon;
  for (let index = 0; index < orderedHoles.length; index += 1) {
    const hole = orderedHoles[index];
    if (!pointInPolygon(hole[0], polygon)) return null;
    const next = bridgeHole(bridged, hole, orderedHoles.slice(index + 1));
    if (!next) return null;
    bridged = next;
  }

  const triangles = earClip(bridged);
  return triangles ? { vertices: bridged, triangles } : null;
}
