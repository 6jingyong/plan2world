import type { Camera, Vector3Like } from 'three';
import { resolvedActiveWalkthroughStart } from '$lib/stores/walkthroughStart';

const WALKTHROUGH_ENTRY_LOOKAHEAD_CM = 100;

/**
 * ThreeViewer identifies its first-person entry pose by looking straight along
 * local -Z for 100 cm. Interior photo cameras use their own 500 cm look vector,
 * so this keeps the persisted walkthrough start scoped to first-person entry.
 */
function isWalkthroughEntryPose(position: Vector3Like, target: Vector3Like): boolean {
  const epsilon = 1e-7;
  return Math.abs(target.x - position.x) <= epsilon
    && Math.abs(target.y - position.y) <= epsilon
    && Math.abs((position.z - target.z) - WALKTHROUGH_ENTRY_LOOKAHEAD_CM) <= epsilon;
}

/** Camera coordinates are local to a floor, just like its walls and furniture. */
export function setFloorCameraPose(camera: Camera, elevation: number, position: Vector3Like, target: Vector3Like) {
  const walkthroughStart = isWalkthroughEntryPose(position, target) ? resolvedActiveWalkthroughStart() : undefined;
  if (walkthroughStart) {
    const offsetX = walkthroughStart.x - position.x;
    const offsetZ = walkthroughStart.y - position.z;
    camera.position.set(walkthroughStart.x, position.y + elevation, walkthroughStart.y);
    camera.lookAt(target.x + offsetX, target.y + elevation, target.z + offsetZ);
    return;
  }
  camera.position.set(position.x, position.y + elevation, position.z);
  camera.lookAt(target.x, target.y + elevation, target.z);
}
