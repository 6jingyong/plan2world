import type { Camera, Vector3Like } from 'three';

/** Review/photo camera coordinates are floor-local, like native walls/furniture. */
export function setFloorCameraPose(camera: Camera, elevation: number, position: Vector3Like, target: Vector3Like) {
  camera.position.set(position.x, position.y + elevation, position.z);
  camera.lookAt(target.x, target.y + elevation, target.z);
}
