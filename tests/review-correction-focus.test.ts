import { beforeEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { get } from 'svelte/store';
import { editorFocusRequest, focusReviewTarget } from '$lib/stores/editorFocus';
import { resolveReviewFocus } from '$lib/plan2world/reviewFocus';
import { currentProject, loadProject, selectedElementId, selectedElementIds, selectedRoomId, selectedTool, selectElements, viewMode, updateDoor, undo, redo } from '$lib/stores/project';

beforeEach(() => {
  loadProject(JSON.parse(readFileSync('tests/fixtures/connected-dimensions.openplan.json', 'utf8')));
  editorFocusRequest.set(null);
});

it.each(['qa-door', 'qa-window'])('opens %s for single-object correction while retaining the host as framing context', subject => {
  const project = get(currentProject)!, floor = project.floors[0];
  const host = subject === 'qa-door' ? 'qa-wall-0' : 'qa-wall-1';
  const before = structuredClone(project);
  selectElements(['qa-wall-2', 'qa-wall-3'], 'qa-wall-2');
  selectedTool.set('wall'); selectedRoomId.set(floor.rooms[0].id); viewMode.set('3d');
  const target = resolveReviewFocus(project, floor.id, [subject, host])!;
  expect(focusReviewTarget(target)).toBe(true);
  expect(get(selectedElementId)).toBe(subject);
  expect([...get(selectedElementIds)]).toEqual([]);
  expect(get(selectedRoomId)).toBeNull();
  expect(get(selectedTool)).toBe('select'); expect(get(viewMode)).toBe('2d');
  expect(get(editorFocusRequest)).toEqual(target);
  expect(get(currentProject)).toEqual(before);
  target.elementIds.length = 0;
  expect(get(editorFocusRequest)!.elementIds).toEqual([subject, host]);
});

it('activates the requested floor and scopes identical IDs to that floor', () => {
  const project = get(currentProject)!, upper = structuredClone(project.floors[0]);
  upper.id = 'upper'; upper.name = 'Upper'; upper.level = 1; upper.doors[0].width = 70;
  project.floors.push(upper); loadProject(project);
  const target = resolveReviewFocus(project, upper.id, ['qa-door', 'qa-wall-0'])!;
  expect(focusReviewTarget(target)).toBe(true);
  expect(get(currentProject)!.activeFloorId).toBe(upper.id);
  expect(get(selectedElementId)).toBe('qa-door');
  expect(get(selectedElementIds).size).toBe(0);
  expect(get(currentProject)!.floors[0].doors[0].width).toBe(90.5);
});

it('focusing a finding preserves geometry Undo/Redo', () => {
  const project = get(currentProject)!;
  updateDoor('qa-door', { width: 100 }); undo();
  const target = resolveReviewFocus(project, project.floors[0].id, ['qa-door', 'qa-wall-0'])!;
  expect(focusReviewTarget(target)).toBe(true);
  redo(); expect(get(currentProject)!.floors[0].doors[0].width).toBe(100);
  undo(); expect(get(currentProject)!.floors[0].doors[0].width).toBe(90.5);
});

it('ignores a deleted subject instead of selecting its remaining host wall', () => {
  const project = get(currentProject)!, floor = project.floors[0];
  const target = resolveReviewFocus(project, floor.id, ['qa-door', 'qa-wall-0'])!;
  floor.doors = []; loadProject(project);
  selectElements(['qa-wall-2', 'qa-wall-3'], 'qa-wall-2');
  viewMode.set('3d');
  expect(focusReviewTarget(target)).toBe(false);
  expect(get(editorFocusRequest)).toBeNull();
  expect(get(selectedElementId)).toBe('qa-wall-2');
  expect([...get(selectedElementIds)]).toEqual(['qa-wall-2', 'qa-wall-3']);
  expect(get(viewMode)).toBe('3d');
});
