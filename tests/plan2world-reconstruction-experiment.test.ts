import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OPENAI_MODEL,
  OPENAI_MODEL_SUGGESTIONS,
} from '../src/lib/utils/openaiClient';
import {
  PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
  parseReconstructionExperimentMetadata,
} from '../src/lib/plan2world/reconstructionExperiment';
import { PLAN2WORLD_VISION_PROMPT_VERSION } from '../src/lib/plan2world/vision';

const sha = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';

describe('reconstruction experiment identity', () => {
  it('uses a current explicit model default and keeps it in the suggested choices', () => {
    expect(DEFAULT_OPENAI_MODEL).toBe('gpt-6.1-sol');
    expect(OPENAI_MODEL_SUGGESTIONS).toEqual(['gpt-6.1-sol', 'gpt-6-astra', 'gpt-6-luna']);
    expect(OPENAI_MODEL_SUGGESTIONS).toContain(DEFAULT_OPENAI_MODEL);
  });

  it('gives the unchanged one-shot vision prompt a stable version', () => {
    expect(PLAN2WORLD_VISION_PROMPT_VERSION).toBe('plan2world-vision-prompt-v1');
  });

  it('parses enough metadata to reproduce the identity of a saved reconstruction candidate', () => {
    expect(parseReconstructionExperimentMetadata({
      schemaVersion: PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
      sampleId: ' curved-lianjia ',
      sourceSha256: sha,
      model: ' gpt-6.1-sol ',
      promptVersion: ` ${PLAN2WORLD_VISION_PROMPT_VERSION} `,
      createdAt: '2026-10-16T03:40:00.000Z',
      notes: [' one-shot baseline '],
    })).toEqual({
      schemaVersion: PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
      sampleId: 'curved-lianjia',
      sourceSha256: sha.toLowerCase(),
      model: 'gpt-6.1-sol',
      promptVersion: PLAN2WORLD_VISION_PROMPT_VERSION,
      createdAt: '2026-10-16T03:40:00.000Z',
      notes: ['one-shot baseline'],
    });
  });

  it.each([
    ['source SHA', { sourceSha256: 'abc' }, 'SHA-256'],
    ['sample id', { sampleId: '   ' }, 'sampleId'],
    ['model', { model: '' }, 'model'],
    ['prompt version', { promptVersion: '' }, 'promptVersion'],
    ['timestamp', { createdAt: 'yesterday' }, 'ISO-8601'],
    ['notes', { notes: [''] }, 'notes[0]'],
  ])('rejects invalid %s metadata', (_label, replacement, message) => {
    const valid = {
      schemaVersion: PLAN2WORLD_RECONSTRUCTION_EXPERIMENT_VERSION,
      sampleId: 'curved-lianjia',
      sourceSha256: sha,
      model: 'gpt-6.1-sol',
      promptVersion: PLAN2WORLD_VISION_PROMPT_VERSION,
    };
    expect(() => parseReconstructionExperimentMetadata({ ...valid, ...replacement })).toThrow(message);
  });
});
