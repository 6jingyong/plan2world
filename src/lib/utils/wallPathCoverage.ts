import type { Point, Wall } from '$lib/models/types';
import { projectOntoWall } from './wallProjection';
import { wallPointAt, wallSubpath, wallTangentAt } from './wallPath';

type Path = Pick<Wall, 'start' | 'end' | 'curvePoint'>;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Coverage on an observed path. Both directions must agree in position and
 * tangent; matching endpoints alone cannot equate different bows or chords.
 * Parameters always belong to `path`, even for reversed/partial native hosts. */
export function wallPathCoverage(path: Path, walls: Path[], tolerance = 1e-5) {
  const segments = walls.flatMap((wall, wallIndex) => {
    const hits = [0, 1].flatMap(t => {
      const ontoPath = projectOntoWall(t ? wall.end : wall.start, path);
      const ontoWall = projectOntoWall(t ? path.end : path.start, wall);
      return [...(ontoPath && ontoPath.distance <= tolerance ? [ontoPath.position] : []),
        ...(ontoWall && ontoWall.distance <= tolerance ? [t] : [])];
    });
    if (hits.length < 2) return [];
    const low = Math.min(...hits), high = Math.max(...hits);
    if (high - low <= 1e-9) return [];
    const ends = [low, high].map(t => projectOntoWall(wallPointAt(path, t), wall));
    if (ends.some(p => !p || p.distance > tolerance)) return [];
    const wa = ends[0]!.position, wb = ends[1]!.position;
    // Probe the whole overlap in both directions, not only at its jambs.
    for (let i = 0; i <= 16; i++) {
      const u = i / 16, t = low + (high - low) * u, s = wa + (wb - wa) * u;
      const a = projectOntoWall(wallPointAt(path, t), wall, Math.min(wa, wb), Math.max(wa, wb));
      const b = projectOntoWall(wallPointAt(wall, s), path, low, high);
      if (!a || !b || a.distance > tolerance || b.distance > tolerance) return [];
      const at = wallTangentAt(path, t), bt = wallTangentAt(wall, a.position);
      if (Math.abs(at.x * bt.x + at.y * bt.y) < Math.cos(Math.PI / 18)) return [];
    }
    return [{ low, high, wallIndex }];
  }).sort((a, b) => a.low - b.low || a.high - b.high);
  const gaps: { low: number; high: number; start: Point; end: Point; curvePoint?: Point }[] = [];
  let covered = 0;
  for (const span of segments) {
    if (span.low > covered + 1e-9) gaps.push({ low: covered, high: span.low, ...wallSubpath(path, covered, span.low) });
    covered = Math.max(covered, span.high);
  }
  if (covered < 1 - 1e-9) gaps.push({ low: covered, high: 1, ...wallSubpath(path, covered, 1) });
  return { segments, gaps };
}
