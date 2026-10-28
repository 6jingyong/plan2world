import type { Plan2WorldRuntimeSceneV1, RuntimeBoxCollider, RuntimeVec2 } from './types';

type BoxPose = Pick<RuntimeBoxCollider, 'center' | 'size' | 'yawClockwiseRadians'>;

/** Positive-volume overlap of the compiler's upright boxes. Touching faces are
 * allowed. This checks default poses only; engines own live door obstruction. */
function overlaps(a: BoxPose, b: BoxPose): boolean {
  const epsilon = 1e-6;
  if (a.size.some(v => v <= 0) || b.size.some(v => v <= 0)) return false;
  if (Math.abs(a.center[1] - b.center[1]) >= (a.size[1] + b.size[1]) / 2 - epsilon) return false;
  const axes = (yaw: number): RuntimeVec2[] => [[Math.cos(yaw), Math.sin(yaw)], [-Math.sin(yaw), Math.cos(yaw)]];
  const aa = axes(a.yawClockwiseRadians), bb = axes(b.yawClockwiseRadians);
  const dot = (p: RuntimeVec2, q: RuntimeVec2) => p[0] * q[0] + p[1] * q[1];
  const delta: RuntimeVec2 = [b.center[0] - a.center[0], b.center[2] - a.center[2]];
  return [...aa, ...bb].every(axis => {
    const radius = a.size[0] / 2 * Math.abs(dot(aa[0], axis)) + a.size[2] / 2 * Math.abs(dot(aa[1], axis))
      + b.size[0] / 2 * Math.abs(dot(bb[0], axis)) + b.size[2] / 2 * Math.abs(dot(bb[1], axis));
    return Math.abs(dot(delta, axis)) < radius - epsilon;
  });
}

/** Saving furniture must not depend on an engine's transient open-door state.
 * Reuse explicit closed-pose colliders; do not reserve an inferred swing envelope,
 * change furniture positions, or derive physical clearance from model meshes. */
export function validateFurnitureDoorClearance(scene: Plan2WorldRuntimeSceneV1): void {
  const doors = new Set(scene.entities.filter(e => e.kind === 'door').map(e => e.id));
  const closedLeaves = scene.colliders.filter((c): c is RuntimeBoxCollider => c.kind === 'box' && doors.has(c.ownerId));
  for (const item of scene.entities) {
    if (item.kind !== 'furniture' || item.representation === 'source-marker') continue;
    for (const leaf of closedLeaves) {
      if (overlaps({ center: item.position, size: item.size, yawClockwiseRadians: item.yawClockwiseRadians }, leaf)) {
        throw new Error(`Furniture "${item.id}" overlaps the closed pose of door "${leaf.ownerId}" (leaf "${leaf.id}"). Correct the native furniture placement before runtime export.`);
      }
    }
  }
}
