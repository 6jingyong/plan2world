import { compileRuntimeAssets, type ReadCatalogAsset } from './runtimeAssets';
import { readProject } from '../utils/projectValidation';
import { serializeArchitectureGlb } from './architectureGlb';
import { compileArchitecturePresentation } from './architecturePresentation';
import { compileRuntimeScene } from './compileRuntimeScene';

/**
 * Compile the engine-neutral runtime artifacts from one serialized native
 * Project. This is the single non-UI boundary used by CLI/runtime adapters.
 */
export async function compileRuntimeArtifacts(serializedProject: unknown, readCatalogAsset: ReadCatalogAsset) {
  const project = readProject(serializedProject);
  const runtime = compileRuntimeScene(project);
  const architecture = compileArchitecturePresentation(runtime);
  const architectureGlb = serializeArchitectureGlb(architecture);
  const assets = await compileRuntimeAssets(project, runtime, readCatalogAsset);
  return { runtime, architecture, architectureGlb, assets };
}
