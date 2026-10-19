import { describe, expect, it } from 'vitest';
import corpus from './fixtures/real-floorplans/reconstruction-corpus/manifest.json';
import evaluation from './evaluation/plan2world/source-references/manifest.json';
import beikeReference from './evaluation/plan2world/source-references/large-irregular-beike.json';
import { parseSourceFloorPlanReference } from '$lib/plan2world/sourceReference';

const sampleIds = [
  'decorated-yj215',
  'one-hyde-park',
  'curved-lianjia',
  'black-hidden-doors',
  'large-irregular-beike',
] as const;

describe('fresh reconstruction corpus isolation', () => {
  it('keeps generation metadata blind to evaluation truth and old outputs', () => {
    expect(corpus.schemaVersion).toBe('plan2world-reconstruction-corpus-v1');
    expect(corpus.samples.map(sample => sample.id)).toEqual(sampleIds);

    for (const sample of corpus.samples) {
      expect(Object.keys(sample).sort()).toEqual(['failureMode', 'id', 'rasterRedistributed', 'source']);
      expect(JSON.stringify(sample)).not.toMatch(/reference|draft|candidate|annotation|result|wallTrace/i);
      expect(sample.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('keeps post-hoc references outside the reconstruction fixture tree', () => {
    expect(evaluation.schemaVersion).toBe('plan2world-evaluation-references-v1');
    expect(evaluation.references.map(item => item.id)).toEqual(sampleIds);
    for (const item of evaluation.references) {
      expect(item.status).not.toBe('pending');
      expect(item.file).toBe(`${item.id}.json`);
    }
  });

  it('parses the large irregular Beike reference without guessing ambiguous semantics', () => {
    const parsed = parseSourceFloorPlanReference(beikeReference);
    expect(parsed.source).toEqual({
      width: 1536,
      height: 1146,
      sha256: '062e4267681fa9549d69688d7e5319d3f0d8627d58f84db35bfc0130342cc0be',
    });
    expect(parsed.walls.coverage).toBe('partial');
    expect(parsed.walls.items).toHaveLength(32);
    expect(parsed.doors).toEqual({ coverage: 'none', items: [] });
    expect(parsed.windows).toEqual({ coverage: 'none', items: [] });
    expect(parsed.roomCount).toBeUndefined();
  });
});
