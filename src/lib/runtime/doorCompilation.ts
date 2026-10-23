import type { Door } from '../models/types';
import { compileRuntimeWallPathProfile } from './wallPathGeometry';
import type { RuntimeBoxCollider, RuntimeDoorEntity, RuntimeDoorInteraction, RuntimeDoorLeaf, RuntimeVec3, RuntimeWallEntity } from './types';

const LEAF_THICKNESS = 0.04;

/** Native double/french doors have equal leaves hinged at the two jambs.
 * Their native left/right direction and flipSide jointly select opening side,
 * matching the two-leaf plan symbols. A single leaf uses left/right for its hinge.
 * Curved hosts use the actual opening endpoint chord, not the midpoint tangent.
 */
export function compileRuntimeDoor(floorId: string, elevation: number, door: Door, wall: RuntimeWallEntity): {
  entity: RuntimeDoorEntity; colliders: RuntimeBoxCollider[];
} {
  const path = compileRuntimeWallPathProfile(wall);
  const distance = path.distanceAt(door.position);
  const width = door.width * 0.01, height = door.height * 0.01;
  const a = path.sampleDistance(distance - width / 2).point;
  const b = path.sampleDistance(distance + width / 2).point;
  const chordWidth = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const yaw = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const tangent = [Math.cos(yaw), Math.sin(yaw)];
  const center: RuntimeVec3 = [(a[0] + b[0]) / 2, elevation + height / 2, (a[1] + b[1]) / 2];
  const paired = door.type === 'double' || door.type === 'french';
  const count = paired ? 2 : 1;
  const leaves: RuntimeDoorLeaf[] = Array.from({ length: count }, (_, index) => {
    const offset = paired ? (index === 0 ? -1 : 1) * chordWidth / 4 : 0;
    const id = `door:${encodeURIComponent(door.id)}:leaf:${index}`;
    return {
      id, colliderId: id, assetRef: 'builtin:door-leaf-v1',
      size: [chordWidth / count, height, LEAF_THICKNESS],
      closedPose: { center: [center[0] + tangent[0] * offset, center[1], center[2] + tangent[1] * offset], yawClockwiseRadians: yaw },
    };
  });
  let interaction: RuntimeDoorInteraction;
  switch (door.type) {
    case 'opening': interaction = { kind: 'none' }; break;
    case 'bifold': interaction = { kind: 'unsupported', sourceMotion: 'fold', leaves }; break;
    case 'garage': interaction = { kind: 'unsupported', sourceMotion: 'overhead', leaves }; break;
    case 'sliding':
    case 'pocket': {
      const sign = door.swingDirection === 'left' ? 1 : -1;
      interaction = { kind: 'slide', leaves: leaves.map(leaf => ({ ...leaf, axis: [tangent[0] * sign, 0, tangent[1] * sign], travel: chordWidth })) };
      break;
    }
    case 'single':
    case 'double':
    case 'french':
      interaction = { kind: 'swing', leaves: leaves.map((leaf, index) => {
        const hingeSign = paired ? (index === 0 ? -1 : 1) : door.swingDirection === 'left' ? 1 : -1;
        return {
          ...leaf,
          pivot: [center[0] + tangent[0] * hingeSign * chordWidth / 2, elevation, center[2] + tangent[1] * hingeSign * chordWidth / 2],
          axis: [0, 1, 0],
          openAngleRadians: hingeSign * (paired && door.swingDirection === 'right' ? -1 : 1) * (door.flipSide ? -1 : 1) * Math.PI / 2,
        };
      }) };
      break;
    default: {
      const unsupportedType: never = door.type;
      throw new Error(`Unsupported native door type: ${unsupportedType}`);
    }
  }
  return {
    entity: {
      id: door.id, floorId, kind: 'door', hostWallId: wall.id, pathPosition: door.position,
      width, height, doorType: door.type, swingDirection: door.swingDirection, flipSide: door.flipSide,
      closedPose: { center, yawClockwiseRadians: yaw }, interaction,
    },
    colliders: interaction.kind === 'none' ? [] : leaves.map(leaf => ({
      id: leaf.colliderId, ownerId: door.id, floorId, dynamic: true, kind: 'box',
      center: leaf.closedPose.center, size: leaf.size, yawClockwiseRadians: yaw,
    })),
  };
}
