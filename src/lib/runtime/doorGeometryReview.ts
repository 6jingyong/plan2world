import { uprightBoxesOverlap, type BoxPose } from './doorClearance';
import type { Plan2WorldRuntimeSceneV1, RuntimeBoxCollider, RuntimeDoorEntity } from './types';

export interface DoorGeometryFinding {
  id: string;
  floorId: string;
  openingId: string;
  code: 'door-closed-overlap' | 'door-motion-overlap';
  position: { x: number; y: number };
  blockerIds: string[];
  message: string;
}

const scope = 'Current compiled wall/other-closed-door boxes only. Closed poses and sampled prescribed motion; not source verification or a full engine motion/route test.';
const angleStep = Math.PI / 180;
const travelStep = .01;
const pairBudget = 250_000;

/** Authoring-only findings from compiler primitives. Never repair geometry,
 * choose a swing side, reserve a sweep, or persist this as source evidence. */
export function reviewDoorGeometry(scene: Plan2WorldRuntimeSceneV1) {
  const architecturalOwners = new Set(scene.entities.filter(e => e.kind === 'wall' || e.kind === 'door').map(e => e.id));
  const boxes = scene.colliders.filter((c): c is RuntimeBoxCollider => c.kind === 'box' && c.purpose !== 'perimeter' && architecturalOwners.has(c.ownerId));
  const findings: DoorGeometryFinding[] = [], uncheckedDoorIds: string[] = [];
  let pairTests = 0;
  for (const door of scene.entities.filter((e): e is RuntimeDoorEntity => e.kind === 'door')) {
    const interaction = door.interaction;
    if (interaction.kind === 'none') continue;
    const ignoreHost = interaction.kind === 'swing' || (interaction.kind === 'slide' && interaction.allowHostOverlap !== false);
    const obstacles = boxes.filter(c => c.floorId === door.floorId && c.ownerId !== door.id && !(ignoreHost && c.ownerId === door.hostWallId));
    const closed = new Set<string>(), moving = new Set<string>();
    let incomplete = interaction.kind === 'unsupported';
    const inspect = (pose: BoxPose, hits: Set<string>) => {
      for (const obstacle of obstacles) {
        if (++pairTests > pairBudget) { incomplete = true; return false; }
        if (uprightBoxesOverlap(pose, obstacle)) hits.add(obstacle.ownerId);
      }
      return true;
    };
    for (const leaf of interaction.leaves) {
      const pose: BoxPose = { ...leaf.closedPose, size: leaf.size };
      if (!inspect(pose, closed)) break;
      if (interaction.kind === 'swing' && 'pivot' in leaf) {
        const steps = Math.ceil(Math.abs(leaf.openAngleRadians) / angleStep);
        const dx = pose.center[0] - leaf.pivot[0], dz = pose.center[2] - leaf.pivot[2];
        for (let i = 1; i <= steps; i++) {
          // Godot's positive rotation about +Y is negative plan/XZ yaw.
          const angle = -leaf.openAngleRadians * i / steps, c = Math.cos(angle), s = Math.sin(angle);
          if (!inspect({ size: pose.size, center: [leaf.pivot[0] + c*dx - s*dz, pose.center[1], leaf.pivot[2] + s*dx + c*dz], yawClockwiseRadians: pose.yawClockwiseRadians + angle }, moving)) break;
        }
      } else if (interaction.kind === 'slide' && 'travel' in leaf && !leaf.fixed) {
        const steps = Math.ceil(leaf.travel / travelStep);
        for (let i = 1; i <= steps; i++) {
          const distance = leaf.travel * i / steps;
          if (!inspect({ ...pose, center: [pose.center[0] + leaf.axis[0]*distance, pose.center[1] + leaf.axis[1]*distance, pose.center[2] + leaf.axis[2]*distance] }, moving)) break;
        }
      }
      if (pairTests > pairBudget) break;
    }
    for (const [phase, hits] of [['closed', closed], ['motion', moving]] as const) {
      // A closed-pose collision already explains the affected owner; retain
      // other sweep-only blockers without repeating the same note twice.
      const blockerIds = [...hits].filter(id => phase === 'closed' || !closed.has(id)).sort();
      if (!blockerIds.length) continue;
      findings.push({ id: `current-door:${encodeURIComponent(door.id)}:${phase}`, floorId: door.floorId, openingId: door.id,
        code: phase === 'closed' ? 'door-closed-overlap' : 'door-motion-overlap',
        position: { x: door.closedPose.center[0]*100, y: door.closedPose.center[2]*100 }, blockerIds,
        message: `Door ${door.id}: ${phase === 'closed' ? 'closed leaf overlaps' : 'prescribed motion meets'} ${blockerIds.join(', ')}. Review its opening, hinge and adjoining walls; no geometry has been changed.` });
    }
    if (incomplete) uncheckedDoorIds.push(door.id);
  }
  return { status: uncheckedDoorIds.length ? 'partial' as const : 'checked' as const, scope, findings, uncheckedDoorIds, pairTests: Math.min(pairTests,pairBudget), angleStepRadians: angleStep, travelStepMetres: travelStep };
}

export function unavailableDoorGeometryReview() {
  return { status: 'unavailable' as const, scope, findings: [] as DoorGeometryFinding[], uncheckedDoorIds: [] as string[],
    message: 'Current door checks are unavailable until the native geometry can compile. Source notes remain available.' };
}
