import { afterEach, beforeEach, expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { Floor } from '$lib/models/types';
import { activeFloor, beginUndoGroup, currentProject, endUndoGroup, loadProject, moveWallsDuringDrag,
  redo, resizeWallLength, undo, undoHistoryStore, type WallDragChange } from '$lib/stores/project';
import { resolveRooms } from '$lib/utils/roomDetection';
import { roomProject } from './fixtures/project';

const stops: Array<() => void> = [];
afterEach(() => stops.splice(0).forEach(stop => stop()));
beforeEach(() => {
  const project = roomProject(), floor = project.floors[0];
  floor.rooms = resolveRooms(floor).map(room => ({ ...room, id: 'kitchen', name: 'Kitchen', floorTexture: 'tile' }));
  floor.doors = [{ id: 'door', wallId: 'a-0', position: 0.4, width: 90, height: 210, type: 'single', swingDirection: 'left', flipSide: false }];
  floor.windows = [{ id: 'window', wallId: 'a-1', position: 0.6, width: 100, height: 120, sillHeight: 90, type: 'standard' }];
  project.floors.push({ ...structuredClone(floor), id: 'upstairs', level: 1 });
  loadProject(project);
});

function observe() {
  const seen: Floor[] = [];
  // Snapshot immediately: retaining mutable floor references could hide a torn update.
  stops.push(activeFloor.subscribe(floor => { if (floor) seen.push(structuredClone(floor)); }));
  seen.length = 0;
  return seen;
}
const floor = () => get(activeFloor)!;
function expectClosed(floor: Floor) {
  floor.walls.forEach((wall, i) => expect(wall.end).toEqual(floor.walls[(i + 1) % floor.walls.length].start));
  expect(resolveRooms(floor)).toHaveLength(1);
  expect(resolveRooms(floor)[0]).toMatchObject({ id: 'kitchen', name: 'Kitchen', floorTexture: 'tile' });
}

it('publishes joined endpoint drags without a torn corner, with one Undo for the whole gesture', () => {
  const before = structuredClone(get(currentProject)!), seen = observe();
  beginUndoGroup();
  for (const x of [450, 500]) {
    expect(moveWallsDuringDrag([
      { wallId: 'a-0', end: { x, y: 0 } },
      { wallId: 'a-1', start: { x, y: 0 } },
    ])).toBe(true);
  }
  endUndoGroup('Moved plan geometry');
  expect(seen).toHaveLength(2);
  seen.forEach((value, i) => {
    expectClosed(value);
    expect(value.walls[0].end.x).toBe([450, 500][i]);
    expect(resolveRooms(value)[0].area).toBeCloseTo((400 + [450, 500][i]) / 2 * 300 / 10000);
    expect(value.doors).toEqual(before.floors[0].doors);
    expect(value.windows).toEqual(before.floors[0].windows);
  });
  expect(get(currentProject)!.floors[1]).toEqual(before.floors[1]);
  expect(get(undoHistoryStore).entries).toHaveLength(1);
  const after = structuredClone(floor());
  undo(); expect(floor()).toEqual(before.floors[0]);
  redo(); expect(floor()).toEqual(after);
});

it('merges repeated wall targets and publishes a closed curved room translation once', () => {
  floor().walls[0].curvePoint = { x: 150, y: -80 };
  const before = structuredClone(floor()), area = resolveRooms(before)[0].area, seen = observe();
  const changes: WallDragChange[] = before.walls.flatMap(wall => [
    { wallId: wall.id, start: { x: wall.start.x + 40, y: wall.start.y + 30 } },
    { wallId: wall.id, end: { x: wall.end.x + 40, y: wall.end.y + 30 } },
    ...(wall.curvePoint ? [{ wallId: wall.id, curvePoint: { x: wall.curvePoint.x + 40, y: wall.curvePoint.y + 30 } }] : []),
  ]);
  expect(moveWallsDuringDrag(changes)).toBe(true);
  expect(seen).toHaveLength(1);
  expectClosed(seen[0]);
  expect(resolveRooms(seen[0])[0].area).toBeCloseTo(area);
  expect(seen[0].walls[0]).toEqual({ ...before.walls[0], start: { x: 40, y: 30 }, end: { x: 440, y: 30 }, curvePoint: { x: 190, y: -50 } });
  changes[0].start!.x = 999;
  expect(floor().walls[0].start.x).toBe(40);
});

it.each<WallDragChange>([
  { wallId: 'missing', start: { x: 10, y: 0 } },
  { wallId: 'a-1', start: { x: NaN, y: 0 } },
  { wallId: 'a-1', end: { x: 400, y: Infinity } },
  { wallId: 'a-1', curvePoint: { x: 400, y: -Infinity } },
  { wallId: 'a-1', start: undefined },
])('rejects an invalid member of a batch before publishing any geometry: %j', invalid => {
  const before = JSON.stringify(get(currentProject)), seen = observe();
  beginUndoGroup();
  expect(moveWallsDuringDrag([{ wallId: 'a-0', end: { x: 500, y: 0 } }, invalid])).toBe(false);
  endUndoGroup();
  expect(JSON.stringify(get(currentProject))).toBe(before);
  expect(seen).toEqual([]);
  expect(get(undoHistoryStore).entries).toHaveLength(0);
});

it('does not publish unchanged snapped frames or create history that clears Redo', () => {
  resizeWallLength('a-0', 500);
  const moved = structuredClone(floor());
  undo();
  const before = JSON.stringify(get(currentProject)), seen = observe();
  beginUndoGroup();
  expect(moveWallsDuringDrag([])).toBe(false);
  expect(moveWallsDuringDrag([{ wallId: 'a-0', start: { ...floor().walls[0].start }, end: { ...floor().walls[0].end } }])).toBe(false);
  endUndoGroup();
  expect(JSON.stringify(get(currentProject))).toBe(before);
  expect(seen).toEqual([]);
  redo(); expect(floor()).toEqual(moved);
});

it('keeps numeric joined-wall corrections atomic through the existing resize command', () => {
  const seen = observe();
  expect(resizeWallLength('a-0', 500)).toBeNull();
  expect(seen).toHaveLength(1);
  expectClosed(seen[0]);
});
