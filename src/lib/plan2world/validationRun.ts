import type { ReconstructionExperimentMetadata } from './reconstructionExperiment';

export const PLAN2WORLD_VALIDATION_RUN_VERSION = 'plan2world-validation-run-v1' as const;

/** Ordered failure-isolation boundaries used by reconstruction validation. */
export const PLAN2WORLD_VALIDATION_STAGES = [
  'source-to-draft',
  'draft-contract',
  'draft-to-native',
  'native-geometry',
  'walkthrough-world',
  'interaction-persistence',
  'runtime-assets',
] as const;

export type Plan2WorldValidationStage = typeof PLAN2WORLD_VALIDATION_STAGES[number];
export type Plan2WorldValidationStatus = 'not-run' | 'pass' | 'fail';

export interface Plan2WorldValidationStageResult {
  status: Plan2WorldValidationStatus;
  /** Hash of the frozen artifact produced or inspected at this boundary, when one exists. */
  artifactSha256?: string;
  notes?: string[];
}

export interface Plan2WorldValidationRun {
  schemaVersion: typeof PLAN2WORLD_VALIDATION_RUN_VERSION;
  runId: string;
  /** Repository commit under validation. */
  repoCommit: string;
  /** Distinguishes regenerated drafts without overwriting an earlier failed candidate. */
  draftCandidateId: string;
  experiment: ReconstructionExperimentMetadata;
  stages: Record<Plan2WorldValidationStage, Plan2WorldValidationStageResult>;
}

function nonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} must be a non-empty string`);
  return trimmed;
}

function sha256(value: string, field: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error(`${field} must be a 64-character SHA-256`);
  return normalized;
}

export function createPlan2WorldValidationRun(input: {
  runId: string;
  repoCommit: string;
  draftCandidateId: string;
  experiment: ReconstructionExperimentMetadata;
}): Plan2WorldValidationRun {
  const stages = Object.fromEntries(PLAN2WORLD_VALIDATION_STAGES.map(stage => [stage, { status: 'not-run' as const }]))
    as Record<Plan2WorldValidationStage, Plan2WorldValidationStageResult>;
  return {
    schemaVersion: PLAN2WORLD_VALIDATION_RUN_VERSION,
    runId: nonEmpty(input.runId, 'runId'),
    repoCommit: nonEmpty(input.repoCommit, 'repoCommit'),
    draftCandidateId: nonEmpty(input.draftCandidateId, 'draftCandidateId'),
    experiment: structuredClone(input.experiment),
    stages,
  };
}

/**
 * Record exactly one boundary result. A later boundary cannot run until every earlier one passed.
 * This encodes the round-two rule: stop at the first wrong artifact instead of repairing downstream output.
 */
export function recordPlan2WorldValidationStage(
  run: Plan2WorldValidationRun,
  stage: Plan2WorldValidationStage,
  result: Omit<Plan2WorldValidationStageResult, 'status'> & { status: 'pass' | 'fail' },
): Plan2WorldValidationRun {
  const index = PLAN2WORLD_VALIDATION_STAGES.indexOf(stage);
  if (index < 0) throw new Error(`Unknown validation stage: ${stage}`);
  if (run.stages[stage].status !== 'not-run') throw new Error(`Validation stage ${stage} has already been recorded`);
  for (const previous of PLAN2WORLD_VALIDATION_STAGES.slice(0, index)) {
    if (run.stages[previous].status !== 'pass') {
      throw new Error(`Validation stage ${stage} is blocked until ${previous} passes`);
    }
  }
  const artifactSha256 = result.artifactSha256 === undefined
    ? undefined
    : sha256(result.artifactSha256, `${stage}.artifactSha256`);
  const notes = result.notes?.map((note, noteIndex) => nonEmpty(note, `${stage}.notes[${noteIndex}]`));
  return {
    ...run,
    stages: {
      ...run.stages,
      [stage]: {
        status: result.status,
        ...(artifactSha256 ? { artifactSha256 } : {}),
        ...(notes?.length ? { notes } : {}),
      },
    },
  };
}

export function firstFailedPlan2WorldStage(run: Plan2WorldValidationRun): Plan2WorldValidationStage | undefined {
  return PLAN2WORLD_VALIDATION_STAGES.find(stage => run.stages[stage].status === 'fail');
}
