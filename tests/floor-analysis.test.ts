import { expect, it } from 'vitest';
import { get, writable } from 'svelte/store';
import type { Project } from '$lib/models/types';
import { createProjectFloorAnalysis } from '$lib/stores/floorAnalysis';
import { activeFloorAnalysis, beginUndoGroup, endUndoGroup, currentProject, detectedRoomsStore, loadProject, moveWallsDuringDrag, redo, setActiveFloor, undo, updateRoom } from '$lib/stores/project';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { roomProject, rectangleWalls } from './fixtures/project';

it('detects rooms, polygons and nested holes without mounting or writing from Canvas', () => {
  const project = roomProject(), floor = project.floors[0];
  floor.walls.push(...rectangleWalls('inner').map(wall => ({ ...wall,
    start: { x: 100 + wall.start.x / 2, y: 75 + wall.start.y / 2 },
    end: { x: 100 + wall.end.x / 2, y: 75 + wall.end.y / 2 },
  })));
  const before = structuredClone(project);
  loadProject(project);
  const analysis = get(activeFloorAnalysis)!;
  expect(get(detectedRoomsStore)).toBe(analysis.rooms);
  expect(analysis.rooms.map(room => room.area)).toEqual([9, 3]);
  expect(analysis.polygons.get(analysis.rooms[0].id)).toHaveLength(4);
  expect(analysis.holes.get(analysis.rooms[0].id)).toHaveLength(1);
  expect(analysis.holes.get(analysis.rooms[1].id)).toEqual([]);
  expect(get(currentProject)).toEqual(before);
  expect('set' in detectedRoomsStore).toBe(false);
});

it('publishes a joined wall step as one fresh analysis and restores areas through Undo/Redo', () => {
  const project = roomProject(); loadProject(project);
  const room = get(detectedRoomsStore)[0];
  updateRoom(room.id, { name: 'Kitchen', floorTexture: 'tile' });
  const seen: number[] = [];
  const stop = activeFloorAnalysis.subscribe(analysis => seen.push(analysis!.rooms[0].area));
  // Drag helpers use the existing gesture Undo boundary.
  const before = structuredClone(get(currentProject));
  beginUndoGroup();
  moveWallsDuringDrag([
    { wallId: 'a-0', end: { x: 500, y: 0 } },
    { wallId: 'a-1', start: { x: 500, y: 0 }, end: { x: 500, y: 300 } },
    { wallId: 'a-2', start: { x: 500, y: 300 } },
  ]);
  endUndoGroup('Move joined corner');
  stop();
  expect(seen).toEqual([12, 15]);
  expect(get(detectedRoomsStore)[0]).toMatchObject({ id: room.id, name: 'Kitchen', floorTexture: 'tile', area: 15 });
  expect(before!.floors[0].walls[0].end.x).toBe(400);
  undo(); expect(get(detectedRoomsStore)[0]).toMatchObject({ id: room.id, name: 'Kitchen', area: 12 });
  redo(); expect(get(detectedRoomsStore)[0].area).toBe(15);
  // Metadata changes invalidate area without changing the boundary.
  updateRoom(room.id, { floorOpening: true });
  expect(get(detectedRoomsStore)[0].area).toBe(0);
  undo(); expect(get(detectedRoomsStore)[0].area).toBe(15);
  redo(); expect(get(detectedRoomsStore)[0].area).toBe(0);
});

it('keeps transient identity through subscriber gaps and floor switches without saving inferred rooms', () => {
  const project = roomProject();
  const other = { ...structuredClone(project.floors[0]), id: 'upper', name: 'Upper', level: 1, walls: rectangleWalls('b', 2000) };
  project.floors.push(other); loadProject(project);
  const first = get(detectedRoomsStore)[0];
  setActiveFloor(other.id);
  const upper = get(detectedRoomsStore)[0];
  expect(upper.walls).toEqual(['b-0', 'b-1', 'b-2', 'b-3']);
  setActiveFloor(project.floors[0].id);
  expect(get(detectedRoomsStore)[0]).toEqual(first);
  expect(get(currentProject)!.floors.every(floor => floor.rooms.length === 0)).toBe(true);
  setActiveFloor(other.id);
  updateRoom(upper.id, { name: 'Upper room' });
  setActiveFloor(project.floors[0].id);
  undo(); expect(get(detectedRoomsStore)[0]).toMatchObject({ id: upper.id, name: 'Room 1' });
  redo(); expect(get(detectedRoomsStore)[0].id).toBe(first.id);
});

it('invalidates in-place curves and metadata, reuses unaffected floors and clears empty topology', () => {
  const project = roomProject();
  project.floors.push({ ...structuredClone(project.floors[0]), id: 'other', walls: rectangleWalls('b') });
  const source = writable<Project | null>(project), analysis = createProjectFloorAnalysis(source);
  const first = get(analysis), floor = project.floors[0];
  floor.walls[0].curvePoint = { x: 200, y: -200 };
  source.set(project);
  const curved = get(analysis);
  expect(curved.active!.rooms[0].area).toBeGreaterThan(12);
  expect(curved.active!.rooms[0].id).toBe(first.active!.rooms[0].id);
  expect(curved.floors.get('other')!.geometry).toBe(first.floors.get('other')!.geometry);
  floor.rooms = [{ ...curved.active!.rooms[0], name: 'Curved office', labelOffset: { x: 4, y: 5 } }];
  source.set(project);
  expect(get(analysis).active!.rooms[0]).toMatchObject({ name: 'Curved office', labelOffset: { x: 4, y: 5 } });
  floor.rooms = []; source.set(project);
  expect(get(analysis).active!.rooms[0]).toMatchObject({ name: 'Room 1' });
  expect(get(analysis).active!.rooms[0].labelOffset).toBeUndefined();
  floor.walls.pop(); source.set(project);
  expect(get(analysis).active!.rooms).toEqual([]);
  expect(get(analysis).active!.polygons.size).toBe(0);
  expect(get(analysis).active!.holes.size).toBe(0);
  source.set(null);
  expect(get(analysis).active).toBeNull();
  expect(get(analysis).floors.size).toBe(0);
});

it('isolates project caches when floor and wall IDs are reused', () => {
  const first = roomProject(), second = structuredClone(first);
  first.floors[0].rooms = analyzeFloor(first.floors[0]).rooms.map(room => ({ ...room, id: 'first-home', name: 'First home' }));
  second.id = 'another-project'; second.floors[0].rooms = analyzeFloor(second.floors[0]).rooms.map(room => ({ ...room, id: 'saved', name: 'Other home' }));
  const source = writable<Project | null>(first), analysis = createProjectFloorAnalysis(source);
  const independent = createProjectFloorAnalysis(writable<Project | null>(second));
  expect(get(independent).active!.rooms[0].name).toBe('Other home');
  expect(get(analysis).active!.rooms[0]).toMatchObject({ id: 'first-home', name: 'First home' });
  source.set(second);
  expect(get(analysis).active!.rooms[0]).toMatchObject({ id: 'saved', name: 'Other home', area: 12 });
  second.floors[0].rooms = [];
  source.set({ ...second, id: 'third-project' });
  expect(get(analysis).active!.rooms[0].id).not.toBe('saved');
  expect(get(analysis).active!.rooms[0].name).toBe('Room 1');
});
