import type { Door } from '../models/types';
import { compileRuntimeWallPathProfile } from './wallPathGeometry';
import { validateDoorLeaves } from '../utils/doorLeaves';
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
  validateDoorLeaves(door);
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
  const config = door.leafConfiguration;
  const ratio = config?.kind === 'paired' ? config.firstLeafRatio : .5;
  const panels = config?.kind === 'sliding' ? config.leaves : undefined;
  const leaves: RuntimeDoorLeaf[] = Array.from({ length: panels?.length ?? count }, (_, index) => {
    const fraction = paired ? (index === 0 ? ratio : 1-ratio) : 1;
    const leafWidth = panels ? panels[index].width * chordWidth / door.width : chordWidth * fraction;
    const offset = panels ? panels[index].center * chordWidth / door.width : paired ? (index === 0 ? -chordWidth/2+leafWidth/2 : chordWidth/2-leafWidth/2) : 0;
    const track = panels ? panels[index].track * .01 : 0;
    const id = `door:${encodeURIComponent(door.id)}:leaf:${panels ? encodeURIComponent(panels[index].id) : index}`;
    return {
      id, colliderId: id, assetRef: door.material === 'glass' ? 'builtin:door-glass-leaf-v1' : door.material === 'steel' ? 'builtin:door-steel-leaf-v1' : 'builtin:door-leaf-v1',
      size: [leafWidth, height, LEAF_THICKNESS],
      closedPose: { center: [center[0] + tangent[0] * offset-tangent[1]*track, center[1], center[2] + tangent[1] * offset+tangent[0]*track], yawClockwiseRadians: yaw },
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
      interaction = { kind: 'slide', ...(panels ? { allowHostOverlap: door.type === 'pocket' } : {}), leaves: leaves.map((leaf,index) => {
        const panel = panels?.[index], direction = panel ? Math.sign(panel.travel) : sign;
        return { ...leaf, axis: [tangent[0]*direction,0,tangent[1]*direction], travel: panel ? Math.abs(panel.travel)*.01 : chordWidth,
          ...(panel?.motion === 'fixed' ? { fixed: true as const } : {}) };
      }) };
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
