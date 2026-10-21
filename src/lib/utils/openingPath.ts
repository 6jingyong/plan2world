import type { Wall, Point } from '$lib/models/types';
import { wallPathProfile, wallTangentAt } from './wallPath';

export function openingPathInterval(length: number, center: number, width: number) {
  if (![length, center, width].every(Number.isFinite) || length <= 0 || width <= 0) return null;
  // Unit conversion and reversed curves can differ by a few ulps. A nominally
  // full-span opening must not leave a zero-width but full-thickness collider.
  const epsilon = Math.max(1e-9, length * Number.EPSILON * 16);
  const from = center - width / 2, to = center + width / 2;
  const left = from <= epsilon ? 0 : from, right = to >= length - epsilon ? length : to;
  return right > left ? { left, right } : null;
}

/** Horizontal interval on the SAME faceted path used by native 3D/collision.
 * Saved position is a quadratic parameter; width is physical path distance. */
export function openingPath(wall: Wall, opening: { position: number; width: number }) {
  const profile = wallPathProfile(wall), center = profile.distanceAt(opening.position);
  const interval = openingPathInterval(profile.length, center, opening.width); if (!interval) return null;
  const { left, right } = interval;
  const knots = [left, ...profile.spans.map(s => s.to).filter(d => d > left && d < right), right];
  const point = (distance: number, offset = 0): Point => {
    const d = Math.max(0, Math.min(profile.length, distance)), p = profile.sample(d).point;
    const tangent = wallTangentAt(wall, profile.positionAt(d)), extra = distance - d;
    return { x: p.x + tangent.x * extra - tangent.y * offset, y: p.y + tangent.y * extra + tangent.x * offset };
  };
  const a = point(left), b = point(right), chord = Math.hypot(b.x - a.x, b.y - a.y);
  return { profile, left, right, center: (left + right) / 2, width: right - left, knots, point,
    chord: { start: a, end: b, width: chord, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      tangent: chord > 0 ? { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord } : wallTangentAt(wall, opening.position) } };
}
