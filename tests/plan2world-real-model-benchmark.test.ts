import { expect, it } from 'vitest';
import baselineJson from './fixtures/real-floorplans/wikimedia-two-bedroom.json';
import modelJson from './fixtures/real-floorplans/wikimedia-two-bedroom-gpt56-sol.json';
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

it('scores the first real-model reconstruction against the real floor-plan baseline', () => {
  const baseline = parsePlan2WorldDraft(baselineJson);
  const model = parsePlan2WorldDraft(modelJson);
  const baselineFloor = baseline.floors[0];
  const modelFloor = model.floors[0];
  const baselineDoors = baselineFloor.doors ?? [];
  const baselineWindows = baselineFloor.windows ?? [];
  const modelDoors = modelFloor.doors ?? [];
  const modelWindows = modelFloor.windows ?? [];
  const modelFurniture = modelFloor.furniture ?? [];

  expect(inspectPlan2WorldDraftGeometry(model)).toEqual([]);
  expect(model.scale.mode).toBe('measured');
  expect(model.sourceRegistration?.anchors.length).toBeGreaterThanOrEqual(4);

  const baselineExtent = extent(baseline);
  const modelExtent = extent(model);
  expect(modelExtent.width).toBeCloseTo(baselineExtent.width, 6);
  expect(modelExtent.depth).toBeCloseTo(baselineExtent.depth, 6);

  expect(modelFloor.walls.length).toBe(baselineFloor.walls.length);
  expect(modelDoors.length).toBe(9);
  expect(modelWindows.length).toBe(6);
  expect(modelFurniture).toHaveLength(0);

  const modelProject = draftToProject(model, new Date('2026-10-15T00:00:00Z'));
  const modelNativeFloor = modelProject.floors[0];
  expect(modelNativeFloor.rooms.length).toBe(11);

  const result = {
    baseline: {
      walls: baselineFloor.walls.length,
      doors: baselineDoors.length,
      windows: baselineWindows.length,
      rooms: draftToProject(baseline, new Date('2026-10-15T00:00:00Z')).floors[0].rooms.length,
      extent: baselineExtent,
    },
    model: {
      walls: modelFloor.walls.length,
      doors: modelDoors.length,
      windows: modelWindows.length,
      rooms: modelNativeFloor.rooms.length,
      extent: modelExtent,
    },
  };
  console.info('Plan2World real-model B benchmark', JSON.stringify(result));
});
