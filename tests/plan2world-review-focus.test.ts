import { describe, expect, it } from 'vitest';
import { draftToProject } from '../src/lib/plan2world/draft';
import { resolveReviewFocus } from '../src/lib/plan2world/reviewFocus';

const project = draftToProject({
  schemaVersion: 'plan2world-draft-v1',
  name: 'Review focus fixture',
  units: 'cm',
  scale: { mode: 'measured', confidence: 1 },
  floors: [{
    id: 'ground',
    name: 'Ground',
    level: 0,
    walls: [{ id: 'wall-a', start: { x: 0, y: 0 }, end: { x: 400, y: 0 } }],
    doors: [{ id: 'door-a', wallId: 'wall-a', position: 0.5, width: 90 }],
    windows: [{ id: 'window-a', wallId: 'wall-a', position: 0.8, width: 100 }],
  }],
}, new Date(0));

describe('Review editor focus', () => {
  it('preserves deterministic geometry ids, order, and uniqueness', () => {
    expect(resolveReviewFocus(project, 'ground', ['door-a', 'wall-a', 'door-a', 'missing'])).toEqual({
      floorId: 'ground',
      elementIds: ['door-a', 'wall-a'],
      primaryId: 'door-a',
    });
  });

  it('rejects unknown floors and findings with no selectable geometry', () => {
    expect(resolveReviewFocus(project, 'missing-floor', ['wall-a'])).toBeNull();
    expect(resolveReviewFocus(project, 'ground', ['missing'])).toBeNull();
    expect(resolveReviewFocus(project, null, ['wall-a'])).toBeNull();
  });
});
