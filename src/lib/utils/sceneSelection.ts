import * as THREE from 'three';

/** Resolve rendered descendants to the editor's existing native element ID. */
export function sceneElementAt(raycaster: THREE.Raycaster, root: THREE.Object3D): string | null {
  for (const hit of raycaster.intersectObjects(root.children, true)) {
    let object: THREE.Object3D | null = hit.object;
    while (object && object !== root) {
      const id = object.userData.elementId ?? object.userData.wallId;
      if (typeof id === 'string') return id;
      object = object.parent;
    }
  }
  return null;
}
