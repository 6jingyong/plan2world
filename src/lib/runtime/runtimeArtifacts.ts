import { readProject } from '../utils/projectValidation';
import { serializeArchitectureGlb } from './architectureGlb';
import { compileArchitectureMesh } from './architectureMesher';
import { compileRuntimeScene } from './compileRuntimeScene';

/**
 * Compile the two engine-neutral runtime artifacts from one serialized native
 * Project. This is the single non-UI boundary used by CLI/runtime adapters.
 */
export function compileRuntimeArtifacts(serializedProject: unknown) {
  const project = readProject(serializedProject);
  const runtime = compileRuntimeScene(project);
  const architecture = compileArchitectureMesh(runtime);
  const architectureGlb = serializeArchitectureGlb(architecture);
  return { runtime, architecture, architectureGlb };
}
