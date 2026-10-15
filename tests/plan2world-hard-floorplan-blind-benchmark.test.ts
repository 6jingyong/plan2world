import { describe, expect, it } from 'vitest';
import decoratedJson from './fixtures/blind-floorplans/decorated-yj215-gpt56-sol.json';
import hydeJson from './fixtures/blind-floorplans/one-hyde-park-gpt56-sol.json';
import curvedJson from './fixtures/blind-floorplans/curved-lianjia-gpt56-sol.json';
import blackJson from './fixtures/blind-floorplans/black-hidden-doors-gpt56-sol.json';
import { draftToProject, parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { inspectPlan2WorldDraftGeometry } from '$lib/plan2world/geometryHealth';

function extent(draft: ReturnType<typeof parsePlan2WorldDraft>) {
  const floor = draft.floors[0];
  const xs = floor.walls.flatMap(wall => [wall.start.x, wall.end.x]);
  const ys = floor.walls.flatMap(wall => [wall.start.y, wall.end.y]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...ys) - Math.min(...ys),
  };
}

const samples = [
  {
    id: 'decorated-yj215',
    input: decoratedJson,
    scaleMode: 'measured',
    expectedExtent: { width: 2210, depth: 1340 },
    expectedErrorCodes: ['opening-outside-wall'],
  },
  {
    id: 'one-hyde-park',
    input: hydeJson,
    scaleMode: 'estimated',
    expectedExtent: { width: 2000, depth: 4300 },
    expectedErrorCodes: [],
  },
  {
    id: 'curved-lianjia',
    input: curvedJson,
    scaleMode: 'measured',
    expectedExtent: { width: 1640, depth: 1530 },
    expectedErrorCodes: [],
  },
  {
    id: 'black-hidden-doors',
    input: blackJson,
    scaleMode: 'estimated',
    expectedExtent: { width: 700, depth: 900 },
    expectedErrorCodes: [],
  },
] as const;

describe('hard floor-plan blind reconstructions', () => {
  for (const sample of samples) {
    it(`${sample.id} remains a usable deterministic draft while preserving model-quality findings`, () => {
      const draft = parsePlan2WorldDraft(sample.input);
      const floor = draft.floors[0];
      const issues = inspectPlan2WorldDraftGeometry(draft);
      const errors = issues.filter(issue => issue.severity === 'error');
      const project = draftToProject(draft, new Date('2026-10-15T00:00:00Z'));
      const nativeFloor = project.floors[0];
      const measuredExtent = extent(draft);

      expect(draft.scale.mode).toBe(sample.scaleMode);
      expect(measuredExtent).toEqual(sample.expectedExtent);
      expect(floor.furniture ?? []).toHaveLength(0);
      expect(draft.sourceRegistration?.anchors.length).toBeGreaterThanOrEqual(4);
      expect(nativeFloor.rooms.length).toBeGreaterThan(0);
      expect(errors.map(issue => issue.code).sort()).toEqual([...sample.expectedErrorCodes].sort());

      console.info('Plan2World blind benchmark', JSON.stringify({
        sample: sample.id,
        scale: draft.scale,
        extent: measuredExtent,
        walls: floor.walls.length,
        doors: (floor.doors ?? []).length,
        windows: (floor.windows ?? []).length,
        rooms: nativeFloor.rooms.length,
        geometryIssues: issues.map(issue => ({
          code: issue.code,
          severity: issue.severity,
          elementIds: issue.elementIds,
        })),
      }));
    });
  }
});
