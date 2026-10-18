import type { FloorBoundaryPart, Point, Wall } from '$lib/models/types';
import { wallPathSpans } from './wallPath';

/** Structural validation shared by draft and native readers. References are
 * checked separately: a native project must remain recoverable after wall deletion.
 */
export function readFloorBoundary(value: unknown, path = 'boundary'): FloorBoundaryPart[] {
  const fail = (): never => { throw new Error(`${path} must contain 1–256 finite points or wall references`); };
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) fail();
  const point = (p: any): Point => {
    if (!p || typeof p !== 'object' || !Number.isFinite(p.x) || !Number.isFinite(p.y)) fail();
    return { x: p.x, y: p.y };
  };
  return (value as any[]).map(part => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) return fail();
    if ('wallId' in part) {
      if (typeof part.wallId !== 'string' || !part.wallId.trim() || 'point' in part || 'curvePoint' in part ||
          (part.reverse !== undefined && typeof part.reverse !== 'boolean')) return fail();
      return { wallId: part.wallId, ...(part.reverse !== undefined ? { reverse: part.reverse } : {}) };
    }
    if ('reverse' in part) return fail();
    return { point: point(part.point), ...(part.curvePoint !== undefined ? { curvePoint: point(part.curvePoint) } : {}) };
  });
}

const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-7;
export function polygonAreaCm2(polygon: Point[]): number {
  return Math.abs(polygon.reduce((area, p, i) => {
    const q = polygon[(i + 1) % polygon.length]; return area + p.x * q.y - q.x * p.y;
  }, 0)) / 2;
}

/** Uses the viewer's native 16-span wall path; stores no copied wall vertices. */
export function floorBoundaryPolygon(boundary: FloorBoundaryPart[], walls: Pick<Wall, 'id' | 'start' | 'end' | 'curvePoint'>[]): Point[] {
  const wallById = new Map(walls.map(wall => [wall.id, wall]));
  const parts = boundary.map(part => {
    if ('point' in part) return [part.point];
    const wall = wallById.get(part.wallId); if (!wall) return [];
    const spans = wallPathSpans(wall), points = [spans[0].start, ...spans.map(span => span.end)];
    return part.reverse ? points.reverse() : points;
  });
  if (parts.some(points => !points.length)) return [];
  const result: Point[] = [];
  const append = (p: Point) => { if (!result.length || !same(result[result.length - 1], p)) result.push({ ...p }); };
  boundary.forEach((part, i) => {
    for (const p of parts[i]) append(p);
    if ('point' in part && part.curvePoint) {
      const a = part.point, c = part.curvePoint, b = parts[(i + 1) % parts.length][0];
      for (let step = 1; step < 16; step++) {
        const t = step / 16, u = 1 - t;
        append({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
          y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
      }
    }
  });
  if (result.length > 1 && same(result[0], result[result.length - 1])) result.pop();
  return result;
}

export function floorBoundaryProblem(boundary: FloorBoundaryPart[], walls: Wall[]): string | null {
  if (boundary.some(part => 'wallId' in part && !walls.some(wall => wall.id === part.wallId))) return 'missing-wall';
  const polygon = floorBoundaryPolygon(boundary, walls);
  if (polygon.length < 3 || polygonAreaCm2(polygon) < 1e-6) return 'empty-area';
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const on = (a: Point, b: Point, p: Point) => Math.abs(cross(a, b, p)) < 1e-7 &&
    p.x >= Math.min(a.x, b.x) - 1e-7 && p.x <= Math.max(a.x, b.x) + 1e-7 &&
    p.y >= Math.min(a.y, b.y) - 1e-7 && p.y <= Math.max(a.y, b.y) + 1e-7;
  for (let i = 0; i < polygon.length; i++) for (let j = i + 1; j < polygon.length; j++) {
    if (j === i + 1 || (i === 0 && j === polygon.length - 1)) continue;
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], c = polygon[j], d = polygon[(j + 1) % polygon.length];
    if (on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b) ||
        (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)) return 'crossing-edges';
  }
  return null;
}
