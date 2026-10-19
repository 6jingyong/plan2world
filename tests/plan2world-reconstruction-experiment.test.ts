import { describe, expect, it } from 'vitest';
import {
  PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
  parseReconstructionExperimentMetadata,
} from '../src/lib/plan2world/reconstructionExperiment';
import { PLAN2WORLD_VISION_PROMPT_VERSION } from '../src/lib/plan2world/vision';
import { PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION } from '../src/lib/plan2world/reconstructionInstructions';
import { PLAN2WORLD_COMPONENT_VOCABULARY } from '../src/lib/plan2world/componentVocabulary';

const sha = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';

describe('reconstruction experiment identity', () => {
  it('versions the semantic white-model reconstruction instructions', () => {
    expect(PLAN2WORLD_VISION_PROMPT_VERSION).toBe(`${PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION}+${PLAN2WORLD_COMPONENT_VOCABULARY}`);
  });

  it('records provider separately from model so the contract is not vendor-bound', () => {
    expect(parseReconstructionExperimentMetadata({
      schemaVersion: PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
      sampleId: ' curved-lianjia ',
      sourceSha256: sha,
      provider: ' deepseek ',
      model: ' vision-model ',
      promptVersion: ` ${PLAN2WORLD_VISION_PROMPT_VERSION} `,
      createdAt: '2026-10-16T03:40:00.000Z',
      notes: [' one-shot baseline '],
    })).toEqual({
      schemaVersion: PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
      sampleId: 'curved-lianjia',
      sourceSha256: sha.toLowerCase(),
      provider: 'deepseek',
      model: 'vision-model',
      promptVersion: PLAN2WORLD_VISION_PROMPT_VERSION,
      createdAt: '2026-10-16T03:40:00.000Z',
      notes: ['one-shot baseline'],
    });
  });

  it.each([
    ['source SHA', { sourceSha256: 'abc' }, 'SHA-256'],
    ['sample id', { sampleId: '   ' }, 'sampleId'],
    ['provider', { provider: '' }, 'provider'],
    ['model', { model: '' }, 'model'],
    ['prompt version', { promptVersion: '' }, 'promptVersion'],
    ['timestamp', { createdAt: 'yesterday' }, 'ISO-8601'],
    ['notes', { notes: [''] }, 'notes[0]'],
  ])('rejects invalid %s metadata', (_label, replacement, message) => {
    const valid = {
      schemaVersion: PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
      sampleId: 'curved-lianjia',
      sourceSha256: sha,
      provider: 'any-provider',
      model: 'any-vision-model',
      promptVersion: PLAN2WORLD_VISION_PROMPT_VERSION,
    };
    expect(() => parseReconstructionExperimentMetadata({ ...valid, ...replacement })).toThrow(message);
  });
});
