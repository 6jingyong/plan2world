import { expect, it } from 'vitest';
import {
  PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
  parseReconstructionExperimentMetadata,
} from '$lib/plan2world/reconstructionExperiment';
import {
  createPlan2WorldValidationRun,
  firstFailedPlan2WorldStage,
  recordPlan2WorldValidationStage,
} from '$lib/plan2world/validationRun';

const sourceSha256 = 'a'.repeat(64);
const artifactSha256 = 'B'.repeat(64);
const experiment = parseReconstructionExperimentMetadata({
  schemaVersion: PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
  sampleId: 'round2-case-01',
  sourceSha256,
  provider: 'skill',
  model: 'current',
  promptVersion: 'reconstruct-plan2world-current',
});

function run() {
  return createPlan2WorldValidationRun({
    runId: 'round2-case-01-a',
    repoCommit: 'abc123',
    draftCandidateId: 'candidate-a',
    experiment,
  });
}

it('starts with every isolation boundary explicitly not run', () => {
  const value = run();
  expect(Object.values(value.stages).every(stage => stage.status === 'not-run')).toBe(true);
  expect(value.experiment.sourceSha256).toBe(sourceSha256);
});

it('records immutable frozen-artifact evidence one boundary at a time', () => {
  const before = run();
  const after = recordPlan2WorldValidationStage(before, 'source-to-draft', {
    status: 'pass',
    artifactSha256,
    notes: ['candidate frozen before downstream validation'],
  });
  expect(before.stages['source-to-draft'].status).toBe('not-run');
  expect(after.stages['source-to-draft']).toEqual({
    status: 'pass',
    artifactSha256: artifactSha256.toLowerCase(),
    notes: ['candidate frozen before downstream validation'],
  });
});

it('blocks downstream work after the earliest failed boundary', () => {
  let value = recordPlan2WorldValidationStage(run(), 'source-to-draft', { status: 'pass' });
  value = recordPlan2WorldValidationStage(value, 'draft-contract', { status: 'fail', notes: ['invalid host reference'] });
  expect(firstFailedPlan2WorldStage(value)).toBe('draft-contract');
  expect(() => recordPlan2WorldValidationStage(value, 'draft-to-native', { status: 'pass' }))
    .toThrow('blocked until draft-contract passes');
});

it('does not allow a recorded boundary to be overwritten', () => {
  const value = recordPlan2WorldValidationStage(run(), 'source-to-draft', { status: 'fail' });
  expect(() => recordPlan2WorldValidationStage(value, 'source-to-draft', { status: 'pass' }))
    .toThrow('already been recorded');
});
