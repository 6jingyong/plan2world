import { readProject } from '../utils/projectValidation';
import { serializeArchitectureGlb } from './architectureGlb';
import { compileArchitecturePresentation } from './architecturePresentation';
import { compileRuntimeScene } from './compileRuntimeScene';

/**
 * Compile the two engine-neutral runtime artifacts from one serialized native
 * Project. This is the single non-UI boundary used by CLI/runtime adapters.
 */
export function compileRuntimeArtifacts(serializedProject: unknown) {
  const project = readProject(serializedProject);
  const runtime = compileRuntimeScene(project);
  const architecture = compileArchitecturePresentation(runtime);
  const architectureGlb = serializeArchitectureGlb(architecture);
  return { runtime, architecture, architectureGlb };
}
