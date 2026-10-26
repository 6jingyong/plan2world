import { compileArchitectureMesh, type ArchitectureMesh, type ArchitectureMeshPrimitive } from './architectureMesher';
import { compileStaticArchitectureEntities, type StaticArchitecturePrimitive } from './staticArchitectureMesher';
import type { Plan2WorldRuntimeSceneV1 } from './types';
import { compilePlanOpenings } from './planOpeningMesher';

export type ArchitecturePresentationPrimitive = ArchitectureMeshPrimitive | StaticArchitecturePrimitive | ReturnType<typeof compilePlanOpenings>[number];

export interface ArchitecturePresentationMesh extends Omit<ArchitectureMesh, 'primitives'> {
  primitives: ArchitecturePresentationPrimitive[];
}

/**
 * Compose the architectural shell mesh with static runtime-owned presentation
 * entities. This keeps wall/room meshing isolated while making architecture.glb
 * the shared static presentation artifact consumed by every engine backend.
 */
export function compileArchitecturePresentation(scene: Plan2WorldRuntimeSceneV1): ArchitecturePresentationMesh {
  const shell = compileArchitectureMesh(scene);
  return {
    ...shell,
    primitives: [
      ...shell.primitives,
      ...compileStaticArchitectureEntities(scene),
      ...compilePlanOpenings(scene),
    ],
  };
}
