import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  ARCHITECTURAL_CUT_HEIGHT_CM,
  architecturalCutPlanes,
  createArchitecturalCutPlane,
} from '../src/lib/utils/architecturalCut';

describe('architectural cut plane', () => {
  it('keeps geometry below 1.20 m and marks geometry above it for clipping', () => {
    const plane = createArchitecturalCutPlane();

    expect(ARCHITECTURAL_CUT_HEIGHT_CM).toBe(120);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 119, 0))).toBeLessThan(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 120, 0))).toBeCloseTo(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 121, 0))).toBeGreaterThan(0);
  });

  it('offsets the cut from a stacked floor elevation', () => {
    const plane = createArchitecturalCutPlane(300);

    expect(plane.distanceToPoint(new THREE.Vector3(0, 419, 0))).toBeLessThan(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 420, 0))).toBeCloseTo(0);
    expect(plane.distanceToPoint(new THREE.Vector3(0, 421, 0))).toBeGreaterThan(0);
  });

  it('returns no renderer clipping planes when disabled', () => {
    expect(architecturalCutPlanes(false)).toEqual([]);
    expect(architecturalCutPlanes(true)).toHaveLength(1);
  });
});
