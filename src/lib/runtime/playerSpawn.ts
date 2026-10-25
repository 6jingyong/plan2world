import type { Floor } from '../models/types';
import type { Plan2WorldRuntimeSceneV1, RuntimeCollider, RuntimeDoorEntity, RuntimeVec3 } from './types';

/** Authored main-door identity + inward side produce one fixed interior pose.
 * Furniture never shifts this anchor; a blocked anchor must be corrected. */
export function entranceSpawn(floor: Floor, entities: Plan2WorldRuntimeSceneV1['entities'], elevation: number, radius = 0.28) {
  if (!floor.entrance) return null;
  const door = entities.find(e => e.id === floor.entrance!.doorId && e.kind === 'door') as RuntimeDoorEntity | undefined;
  const host = floor.walls.find(w => w.id === floor.doors.find(d => d.id === floor.entrance!.doorId)?.wallId);
  if (!door || !host || door.width < radius * 2 + 0.05) throw new Error(`Main entrance on floor "${floor.id}" cannot fit the runtime player.`);
  const side = floor.entrance.side === 'left' ? 1 : -1, yaw = door.closedPose.yawClockwiseRadians;
  const inward = [-Math.sin(yaw) * side, Math.cos(yaw) * side];
  const distance = host.thickness * 0.005 + radius + 0.12;
  return { entranceDoorId: door.id, walkthroughStart: [door.closedPose.center[0] + inward[0] * distance, elevation, door.closedPose.center[2] + inward[1] * distance] as RuntimeVec3,
    walkthroughYawClockwiseRadians: Math.atan2(inward[1], inward[0]) };
}

function onTriangle(x: number, z: number, a: RuntimeVec3, b: RuntimeVec3, c: RuntimeVec3) {
  const cross = (p: RuntimeVec3, q: RuntimeVec3) => (q[0] - p[0]) * (z - p[2]) - (q[2] - p[2]) * (x - p[0]);
  const values = [cross(a,b), cross(b,c), cross(c,a)];
  return !values.some(v => v < -1e-8) || !values.some(v => v > 1e-8);
}
function supported(point: RuntimeVec3, surfaces: RuntimeCollider[]) {
  return surfaces.some(c => c.kind === 'triangle-mesh' && c.indices.some((_, i) => i % 3 === 0 && onTriangle(point[0], point[2], c.vertices[c.indices[i]], c.vertices[c.indices[i+1]], c.vertices[c.indices[i+2]])));
}

/** Validate spawn against compiler-owned surfaces and closed-pose primitives.
 * No relocation, room detection, repair or engine-dependent mesh inspection. */
export function validateRuntimeSpawns(scene: Plan2WorldRuntimeSceneV1) {
  const radius = scene.playerProfile.radius, height = Math.max(1.2, scene.playerProfile.eyeHeight);
  for (const floor of scene.floors) {
    const point = floor.walkthroughStart;
    if (!point) continue;
    const surfaces = scene.colliders.filter(c => c.floorId === floor.id && floor.rooms.some(r => r.id === c.ownerId));
    for (let i = 0; i <= 8; i++) {
      const probe: RuntimeVec3 = i === 8 ? point : [point[0] + Math.cos(i * Math.PI / 4) * radius, point[1], point[2] + Math.sin(i * Math.PI / 4) * radius];
      if (!supported(probe, surfaces)) throw new Error(`Player start on floor "${floor.id}" has no supported floor clearance. Correct the authored entrance/start; floor holes remain apertures.`);
    }
    for (const collider of scene.colliders) {
      if (collider.kind === 'triangle-mesh') continue;
      const sizeY = collider.kind === 'box' ? collider.size[1] : collider.height;
      if (point[1] + height <= collider.center[1] - sizeY / 2 + 1e-6 || point[1] >= collider.center[1] + sizeY / 2 - 1e-6) continue;
      const dx = point[0] - collider.center[0], dz = point[2] - collider.center[2];
      let blocked: boolean;
      if (collider.kind === 'cylinder') blocked = Math.hypot(dx,dz) < radius + collider.radius - 1e-6;
      else {
        const angle = collider.yawClockwiseRadians, x = Math.cos(angle) * dx + Math.sin(angle) * dz, z = -Math.sin(angle) * dx + Math.cos(angle) * dz;
        blocked = Math.hypot(x - Math.max(-collider.size[0]/2, Math.min(collider.size[0]/2,x)), z - Math.max(-collider.size[2]/2, Math.min(collider.size[2]/2,z))) < radius - 1e-6;
      }
      if (blocked) throw new Error(`Player start on floor "${floor.id}" is blocked by "${collider.ownerId}". Keep the authored entrance/start clear.`);
    }
  }
}
