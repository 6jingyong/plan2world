import { getWallStartHeight, getWallEndHeight, type Wall, type Point } from '$lib/models/types';

// Draft review needs the same path metric before physical wall heights exist.
type WallPathInput = Pick<Wall, 'start' | 'end' | 'curvePoint'> & Partial<Pick<Wall, 'height' | 'startHeight' | 'endHeight'>>;

/** Exact subpath of the observed quadratic, including reverse traversal. */
export function wallSubpath(wall: WallPathInput, from: number, to: number): Pick<Wall, 'start' | 'end' | 'curvePoint'> {
  const start = wallPointAt(wall, from), end = wallPointAt(wall, to);
  if (!wall.curvePoint) return { start, end };
  if (from === 0 && to === 1 || from === 1 && to === 0) return { start, end, curvePoint: { ...wall.curvePoint } };
  const dx = (1 - from) * (wall.curvePoint.x - wall.start.x) + from * (wall.end.x - wall.curvePoint.x);
  const dy = (1 - from) * (wall.curvePoint.y - wall.start.y) + from * (wall.end.y - wall.curvePoint.y);
  return { start, end, curvePoint: { x: start.x + (to - from) * dx, y: start.y + (to - from) * dy } };
}

export function wallPointAt(w: WallPathInput, t: number): Point {
  if (w.curvePoint) {
    const mt = 1 - t;
    return {
      x: mt * mt * w.start.x + 2 * mt * t * w.curvePoint.x + t * t * w.end.x,
      y: mt * mt * w.start.y + 2 * mt * t * w.curvePoint.y + t * t * w.end.y,
    };
  }
  return {
    x: w.start.x + (w.end.x - w.start.x) * t,
    y: w.start.y + (w.end.y - w.start.y) * t,
  };
}

export function wallTangentAt(w: WallPathInput, t: number): Point {
  if (w.curvePoint) {
    const mt = 1 - t;
    const dx = 2 * mt * (w.curvePoint.x - w.start.x) + 2 * t * (w.end.x - w.curvePoint.x);
    const dy = 2 * mt * (w.curvePoint.y - w.start.y) + 2 * t * (w.end.y - w.curvePoint.y);
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }
  const dx = w.end.x - w.start.x;
  const dy = w.end.y - w.start.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

export function wallLength(wall: WallPathInput): number {
  return wall.curvePoint ? wallPathProfile(wall).length : Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

/** Same quadratic parameterization for active and inactive curved walls. */
export function wallPathSpans(wall: WallPathInput): { start: Point; end: Point; startHeight: number; endHeight: number }[] {
  const count = wall.curvePoint ? 16 : 1;
  const startH = getWallStartHeight(wall), endH = getWallEndHeight(wall);
  return Array.from({ length: count }, (_, i) => ({ start: wallPointAt(wall, i / count), end: wallPointAt(wall, (i + 1) / count), startHeight: startH + (endH - startH) * i / count, endHeight: startH + (endH - startH) * (i + 1) / count }));
}

/** Distances on the same faceted curve used by the viewer. Saved positions are
 * quadratic parameters, so they must be converted before applying physical widths.
 */
export function wallPathProfile(wall: WallPathInput) {
  let length = 0;
  const spans = wallPathSpans(wall).map(span => {
    const from = length, size = Math.hypot(span.end.x - span.start.x, span.end.y - span.start.y);
    length += size;
    return { ...span, from, to: length, length: size };
  });
  const sample = (distance: number) => {
    const d = Math.max(0, Math.min(length, distance));
    const span = spans.find(s => s.length > 0 && d <= s.to) ?? spans[spans.length - 1];
    const t = span.length > 0 ? Math.max(0, Math.min(1, (d - span.from) / span.length)) : 0;
    return { point: { x: span.start.x + (span.end.x - span.start.x) * t,
      y: span.start.y + (span.end.y - span.start.y) * t }, height: span.startHeight + (span.endHeight - span.startHeight) * t };
  };
  return { length, spans, sample, positionAt(distance: number) {
    if (!Number.isFinite(distance) || !Number.isFinite(length)) return NaN;
    if (length <= 0 || distance <= 0) return 0;
    if (distance >= length) return 1;
    const index = spans.findIndex(span => span.length > 0 && distance <= span.to);
    const span = spans[index];
    return (index + (distance - span.from) / span.length) / spans.length;
  }, distanceAt(position: number) {
    if (!Number.isFinite(position)) return NaN;
    const scaled = Math.max(0, Math.min(1, position)) * spans.length;
    const index = Math.min(spans.length - 1, Math.floor(scaled));
    return spans[index].from + (scaled - index) * spans[index].length;
  } };
}
