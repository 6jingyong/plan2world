import { expect, it } from 'vitest';
import baseline from './fixtures/real-floorplans/wikimedia-two-bedroom.json';
import { draftToProject, parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { inspectPlan2WorldDraftGeometry } from '$lib/plan2world/geometryHealth';

it('converts the first real floor-plan baseline into a usable native project', () => {
  const draft = parsePlan2WorldDraft(baseline);
  const floor = draft.floors[0];

  expect(floor.walls).toHaveLength(18);
  expect(floor.doors).toHaveLength(10);
  expect(floor.windows).toHaveLength(7);
  expect(floor.furniture).toHaveLength(0);
  expect(draft.sourceRegistration?.anchors).toHaveLength(4);
  expect(inspectPlan2WorldDraftGeometry(draft)).toEqual([]);

  const xs = floor.walls.flatMap(wall => [wall.start.x, wall.end.x]);
  const ys = floor.walls.flatMap(wall => [wall.start.y, wall.end.y]);
  expect(Math.max(...xs) - Math.min(...xs)).toBe(690);
  expect(Math.max(...ys) - Math.min(...ys)).toBe(1200);

  const project = draftToProject(draft, new Date('2026-10-15T00:00:00Z'));
  const nativeFloor = project.floors[0];
  expect(nativeFloor.walls).toHaveLength(18);
  expect(nativeFloor.doors).toHaveLength(10);
  expect(nativeFloor.windows).toHaveLength(7);
  expect(nativeFloor.rooms).toHaveLength(11);

  const roomAreas = nativeFloor.rooms.map(room => room.area).sort((a, b) => b - a);
  expect(roomAreas.slice(0, 3)).toEqual([15.75, 13.6, 13.6]);
  expect(roomAreas.reduce((sum, area) => sum + area, 0)).toBeCloseTo(77.8, 2);
});
