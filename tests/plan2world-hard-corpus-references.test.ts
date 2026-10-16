import { describe, expect, it } from 'vitest';
import manifest from './fixtures/real-floorplans/hard-corpus/manifest.json';
import beikeReference from './fixtures/real-floorplans/hard-corpus/large-irregular-beike-reference.json';
import { parseSourceFloorPlanReference } from '$lib/plan2world/sourceReference';

const v1SampleIds = [
  'decorated-yj215',
  'one-hyde-park',
  'curved-lianjia',
  'black-hidden-doors',
  'large-irregular-beike',
] as const;

describe('hard floor-plan corpus source references', () => {
  it('keeps every v1 hard sample backed by a source-space reference', () => {
    for (const id of v1SampleIds) {
      const sample = manifest.samples.find(item => item.id === id);
      expect(sample, `missing hard-corpus sample ${id}`).toBeDefined();
      expect(sample?.referenceStatus, `${id} reference status`).not.toBe('pending');
      expect(sample?.reference, `${id} reference path`).toMatch(/-reference\.json$/);
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
