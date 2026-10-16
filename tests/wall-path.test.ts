import { expect, it } from 'vitest';
import type { Wall } from '$lib/models/types';
import { wallLength, wallPathProfile, wallPointAt, wallTangentAt } from '$lib/utils/wallPath';
import { wallLength as editingLength, planWallResize } from '$lib/utils/wallEditing';
import { wallLength as canvasLength } from '$lib/utils/canvasRenderer';

const curve: Wall = { id: 'curve', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 },
  curvePoint: { x: 0, y: 1000 }, thickness: 20, height: 300, startHeight: 200, endHeight: 400, color: '#fff' };

it('uses physical distance and the same length in editing, canvas and the rendered path', () => {
  // Independently measure the 16 chords already used to construct viewer meshes.
  const points = Array.from({ length: 17 }, (_, i) => {
    const t = i / 16;
    return { x: 1000 * t * t, y: 2000 * t * (1 - t) };
  });
  const distances = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const length = distances.reduce((sum, value) => sum + value, 0), path = wallPathProfile(curve);
  expect(path.length).toBeCloseTo(length, 10);
  for (const measure of [wallLength, editingLength, canvasLength]) expect(measure(curve)).toBeCloseTo(length, 10);
  const halfParameter = distances.slice(0, 8).reduce((sum, value) => sum + value, 0);
  expect(path.distanceAt(0.5)).toBeCloseTo(halfParameter, 10);
  expect(Math.abs(halfParameter - length / 2)).toBeGreaterThan(100);
  expect(path.positionAt(halfParameter)).toBeCloseTo(0.5, 12);
  expect(path.sample(halfParameter)).toEqual({ point: { x: 250, y: 500 }, height: 300 });
});

it.each([0, 0.03, 0.1, 0.27, 0.5, 0.79, 0.97, 1])('round trips parameter %s through distance and reversal', position => {
  const path = wallPathProfile(curve);
  const reversed = wallPathProfile({ ...curve, start: curve.end, end: curve.start, startHeight: 400, endHeight: 200 });
  const distance = path.distanceAt(position);
  expect(path.positionAt(distance)).toBeCloseTo(position, 12);
  expect(reversed.distanceAt(1 - position)).toBeCloseTo(path.length - distance, 10);
  expect(reversed.positionAt(path.length - distance)).toBeCloseTo(1 - position, 12);
});

it('retains exact straight-wall distance semantics and normalized tangent', () => {
  const wall = { ...curve, curvePoint: undefined, start: { x: 10, y: -20 }, end: { x: 310, y: 380 } };
  const path = wallPathProfile(wall);
  expect(path.length).toBe(500);
  expect(path.distanceAt(0.3)).toBe(150);
  expect(path.positionAt(150)).toBe(0.3);
  expect(wallPointAt(wall, 0.3)).toEqual({ x: 100, y: 100 });
  expect(wallTangentAt(wall, 0.3)).toEqual({ x: 0.6, y: 0.8 });
});

it('handles clamped, non-finite and degenerate distances without dividing by zero', () => {
  const path = wallPathProfile(curve);
  expect(path.positionAt(-10)).toBe(0); expect(path.positionAt(path.length + 10)).toBe(1);
  for (const bad of [NaN, Infinity, -Infinity]) expect(path.positionAt(bad)).toBeNaN();
  const zero = wallPathProfile({ ...curve, end: curve.start, curvePoint: curve.start });
  expect(zero.length).toBe(0);
  expect(zero.positionAt(0)).toBe(0); expect(zero.distanceAt(0.5)).toBe(0);
  // A folded collinear quadratic has a zero-length facet at its turning point.
  const folded = wallPathProfile({ ...curve, end: { x: -2, y: 0 }, curvePoint: { x: 15, y: 0 } });
  expect(folded.spans.some(span => span.length === 0)).toBe(true);
  for (const fraction of [0, 0.1, 0.5, 0.9, 1]) {
    const distance = folded.length * fraction;
    expect(folded.distanceAt(folded.positionAt(distance))).toBeCloseTo(distance, 12);
  }
});

it('resizes curved walls to the same physical length consumed by 3D', () => {
  const changes = planWallResize([curve], curve.id, 2000, 'start');
  const resized = { ...curve, ...changes.get(curve.id) };
  expect(wallPathProfile(resized).length).toBeCloseTo(2000, 9);
  expect(resized.start).toEqual(curve.start);
});
