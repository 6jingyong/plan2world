import { compileRuntimeAssets, type ReadCatalogAsset } from './runtimeAssets';
import { readProject } from '../utils/projectValidation';
import { serializeArchitectureGlb } from './architectureGlb';
import { compileArchitecturePresentation } from './architecturePresentation';
import { validateRuntimeSpawns } from './playerSpawn';
import { validateFurnitureDoorClearance } from './doorClearance';
import { compileRuntimeScene } from './compileRuntimeScene';
import { validateFurnitureSupport } from './placementSupport';
import { RuntimeProjectError } from './runtimeProjectError';

/**
 * Compile the engine-neutral runtime artifacts from one serialized native
 * Project. Browser export and the CLI use this same non-UI boundary.
 */
export async function compileRuntimeArtifacts(serializedProject: unknown, readCatalogAsset: ReadCatalogAsset) {
  const project = readProject(serializedProject);
  const { runtime, architecture } = (() => {
    try {
      const runtime = compileRuntimeScene(project);
      validateRuntimeSpawns(runtime);
      validateFurnitureDoorClearance(runtime);
      validateFurnitureSupport(runtime);
      const architecture = compileArchitecturePresentation(runtime);
      const invalidOpening = architecture.diagnostics.find(d => d.code === 'invalid-opening' || d.code === 'overlapping-openings');
      if (invalidOpening) throw new Error(`Cannot compile runtime opening "${invalidOpening.entityId}": ${invalidOpening.message}`);
      return { runtime, architecture };
    } catch (error) { throw new RuntimeProjectError(error); }
  })();
  const architectureGlb = serializeArchitectureGlb(architecture);
  runtime.source.architectureSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(architectureGlb).buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
  const assets = await compileRuntimeAssets(project, runtime, readCatalogAsset);
  return { runtime, architecture, architectureGlb, assets };
}
