import * as THREE from 'three';

export const ARCHITECTURAL_CUT_HEIGHT_CM = 120;

/**
 * Build the horizontal clipping plane used by the architectural plan view.
 * Plan2World's 3D scene uses centimetres, so the conventional 1.20 m cut is 120 cm.
 * Three.js clips the positive-distance side of a renderer clipping plane, so
 * points above the cut are positive while geometry below the cut is retained.
 */
export function createArchitecturalCutPlane(
  floorElevation = 0,
  cutHeight = ARCHITECTURAL_CUT_HEIGHT_CM,
): THREE.Plane {
  return new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -(floorElevation + cutHeight),
  );
}

export function architecturalCutPlanes(
  enabled: boolean,
  floorElevation = 0,
  cutHeight = ARCHITECTURAL_CUT_HEIGHT_CM,
): THREE.Plane[] {
  return enabled ? [createArchitecturalCutPlane(floorElevation, cutHeight)] : [];
}
