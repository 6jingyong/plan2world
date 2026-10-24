import { expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { FloorBoundaryPart } from '$lib/models/types';
import { floorBoundaryPolygon, floorBoundaryProblem, readFloorBoundary } from '$lib/utils/floorBoundary';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { readProject } from '$lib/utils/projectValidation';
import { projectPackageBytes, readProjectPackage } from '$lib/services/projectPackage';
import { draftToProject, parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { calibratePlan2WorldDraft } from '$lib/plan2world/review';
import { inspectProjectGeometry } from '$lib/plan2world/geometryHealth';
import { planContentBounds, hasPlanContent } from '$lib/utils/planContentBounds';
import { selectionContentBounds } from '$lib/utils/selectionContentBounds';
import { floorInteriorPoint } from '$lib/utils/floorInteriorPoint';
import { buildFloorClearance } from '$lib/utils/floorClearance';
import { focusReviewTarget } from '$lib/stores/editorFocus';
import { activeFloorAnalysis, currentProject, loadProject, updateRoom, updateWall, reverseWall, splitWall, removeRoom, removeElement, undo, redo, selectedElementId, selectedRoomId } from '$lib/stores/project';
import { roomProject } from './fixtures/project';

function balconyProject() {
  const project = roomProject();
  project.floors[0].rooms = [{ id: 'balcony', name: 'Balcony', walls: [], floorTexture: 'concrete', area: 999, roomType: 'outdoor',
    boundary: [{ wallId: 'a-2' }, { point: { x: 0, y: 500 } }, { point: { x: 400, y: 500 } }] }];
  return project;
}

it('adds ground beside a room without adding partitions or collision barriers', () => {
  const project = balconyProject(), floor = project.floors[0], before = structuredClone(project);
  const analysis = analyzeFloor(floor), area = analysis.rooms.find(room => room.id === 'balcony')!;
  expect(area.area).toBe(8); expect(analysis.rooms).toHaveLength(2);
  expect(analysis.rooms.reduce((sum, room) => sum + room.area, 0)).toBe(20);
  expect(analysis.polygons.get(area.id)).toEqual([{ x: 400, y: 300 }, { x: 0, y: 300 }, { x: 0, y: 500 }, { x: 400, y: 500 }]);
  expect(buildFloorClearance(floor)).toEqual(buildFloorClearance({ ...floor, rooms: [] }));
  expect(floorInteriorPoint(analysis).y).toBeLessThan(300);
  expect(project).toEqual(before);
});

it('shares curved wall geometry and refreshes the floor in place through history', () => {
  loadProject(balconyProject());
  updateWall('a-2', { curvePoint: { x: 200, y: 400 } });
  const curved = get(activeFloorAnalysis)!, balcony = curved.rooms.find(room => room.id === 'balcony')!;
  expect(curved.polygons.get('balcony')).toHaveLength(19);
  expect(balcony.area).toBeLessThan(8);
  expect(curved.rooms.reduce((sum, room) => sum + room.area, 0)).toBeCloseTo(20, 2);
  undo(); expect(get(activeFloorAnalysis)!.rooms.find(room => room.id === 'balcony')!.area).toBe(8);
  redo(); expect(get(activeFloorAnalysis)!.rooms.find(room => room.id === 'balcony')!.area).toBe(balcony.area);
});

it('keeps directed references consistent when a shared wall is reversed or split', () => {
  loadProject(balconyProject());
  const before = get(activeFloorAnalysis)!.polygons.get('balcony');
  reverseWall('a-2'); expect(get(activeFloorAnalysis)!.polygons.get('balcony')).toEqual(before);
  const newId = splitWall('a-2', 0.5)!;
  const floor = get(currentProject)!.floors[0];
  expect(floor.rooms.find(room => room.id === 'balcony')!.boundary!.slice(0, 2)).toEqual([
    { wallId: newId, reverse: true }, { wallId: 'a-2', reverse: true },
  ]);
  expect(get(activeFloorAnalysis)!.rooms.find(room => room.id === 'balcony')!.area).toBe(8);
  undo(); undo(); expect(get(activeFloorAnalysis)!.polygons.get('balcony')).toEqual(before);
});

it('edits and deletes an open surface without deleting its source wall, and survives native/package saves', () => {
  loadProject(balconyProject());
  const boundary: FloorBoundaryPart[] = [{ wallId: 'a-2' }, { point: { x: 0, y: 600 } }, { point: { x: 400, y: 600 } }];
  updateRoom('balcony', { boundary });
  expect(get(activeFloorAnalysis)!.rooms.find(room => room.id === 'balcony')!.area).toBe(12);
  const project = get(currentProject)!;
  for (const saved of [readProject(JSON.parse(JSON.stringify(project))), readProjectPackage(projectPackageBytes(project)).project]) {
    expect(saved.floors[0].rooms.find(room => room.id === 'balcony')!.boundary).toEqual(boundary);
    expect(analyzeFloor(saved.floors[0]).rooms.find(room => room.id === 'balcony')!.area).toBe(12);
  }
  removeRoom('balcony'); expect(get(currentProject)!.floors[0].walls).toHaveLength(4);
  expect(get(activeFloorAnalysis)!.rooms.some(room => room.id === 'balcony')).toBe(false);
  undo(); expect(get(activeFloorAnalysis)!.rooms.find(room => room.id === 'balcony')!.area).toBe(12);
});

it('keeps a broken reference recoverable and focuses its existing native room for repair', () => {
  loadProject(balconyProject()); removeElement('a-2');
  const project = get(currentProject)!, analysis = get(activeFloorAnalysis)!;
  expect(analysis.polygons.get('balcony')).toEqual([]);
  expect(analysis.rooms.find(room => room.id === 'balcony')!.area).toBe(0);
  const issue = inspectProjectGeometry(project).find(issue => issue.code === 'floor-boundary')!;
  expect(issue.elementIds[0]).toBe('balcony');
  expect(() => readProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
  expect(focusReviewTarget({ floorId: project.activeFloorId, elementIds: issue.elementIds, primaryId: 'balcony' })).toBe(true);
  expect(get(selectedElementId)).toBeNull(); expect(get(selectedRoomId)).toBe('balcony');
  undo(); expect(get(activeFloorAnalysis)!.rooms.find(room => room.id === 'balcony')!.area).toBe(8);
});

it('supports free curved edges without physical walls', () => {
  const boundary: FloorBoundaryPart[] = [{ point: { x: 0, y: 0 }, curvePoint: { x: 100, y: -100 } },
    { point: { x: 200, y: 0 } }, { point: { x: 200, y: 200 } }, { point: { x: 0, y: 200 } }];
  expect(floorBoundaryProblem(boundary, [])).toBeNull();
  expect(floorBoundaryPolygon(boundary, [])).toHaveLength(19);
});

it.each([
  [{ point: { x: NaN, y: 0 } }], [{ wallId: 'a-2', reverse: 'yes' }], [{ wallId: 'a-2', point: { x: 0, y: 0 } }], [],
].map(boundary => ({ boundary })))('rejects malformed boundary parts: $boundary', ({ boundary }) => expect(() => readFloorBoundary(boundary)).toThrow());

it('rejects crossing and zero-area rings instead of inventing a rectangular floor', () => {
  const parts = (points: [number, number][]) => points.map(([x, y]) => ({ point: { x, y } }));
  expect(floorBoundaryProblem(parts([[0, 0], [300, 200], [0, 200], [200, 0]]), [])).toBe('crossing-edges');
  expect(floorBoundaryProblem(parts([[0, 0], [100, 0], [200, 0]]), [])).toBe('empty-area');
});

it('imports only explicit source floor areas and calibrates free points without copying referenced wall paths', () => {
  const native = balconyProject().floors[0];
  const draft = { schemaVersion: 'plan2world-draft-v1', units: 'cm', name: 'Balcony source', scale: { mode: 'provided', confidence: 1 },
    floors: [{ id: 'f0', name: 'Ground', level: 0, walls: native.walls, floorAreas: [{ id: 'balcony', name: 'Balcony', boundary: native.rooms[0].boundary }] }] };
  const calibrated = calibratePlan2WorldDraft(draft, 400, 800), project = draftToProject(calibrated);
  expect(calibrated.floors[0].floorAreas![0].boundary[0]).toEqual({ wallId: 'a-2' });
  expect(project.floors[0].rooms.find(room => room.id === 'balcony')!.area).toBe(32);
  const invalid = structuredClone(draft); invalid.floors[0].floorAreas[0].boundary![0] = { wallId: 'missing' };
  expect(() => parsePlan2WorldDraft(invalid)).toThrow(/missing-wall/);
});


it('preserves shared quadratic boundary coverage through a reversed wall split', () => {
  loadProject(balconyProject());
  updateWall('a-2', { curvePoint: { x: 200, y: 400 } });
  reverseWall('a-2');
  splitWall('a-2', 0.5);
  const analysis = get(activeFloorAnalysis)!, polygon = analysis.polygons.get('balcony')!;
  expect(polygon).toContainEqual({ x: 200, y: 350 });
  // Splitting changes facet density, but both surfaces share every sample.
  expect(analysis.rooms.reduce((sum, room) => sum + room.area, 0)).toBeCloseTo(20, 2);
  expect(inspectProjectGeometry(get(currentProject)!).filter(issue => issue.code === 'floor-boundary')).toEqual([]);
});


it('fits a free ground outline without walls and keeps unrelated selections local', () => {
  const floor = balconyProject().floors[0];
  floor.walls = [];
  floor.rooms[0].boundary = [{ point: { x: 1000, y: 1000 } }, { point: { x: 1500, y: 1000 } }, { point: { x: 1000, y: 1500 } }];
  const options = { context: { save() {}, restore() {} } as CanvasRenderingContext2D, entourageAspect: () => 1 };
  expect(hasPlanContent(floor)).toBe(true);
  const expected = { minX: 1000, minY: 1000, maxX: 1500, maxY: 1500 };
  expect(planContentBounds(floor, options)).toEqual(expected);
  expect(selectionContentBounds(floor, new Set(['balcony']), options)).toEqual(expected);
  expect(selectionContentBounds(floor, new Set(['missing']), options)).toBeNull();
  expect(floorInteriorPoint(analyzeFloor(floor)).x).toBeGreaterThan(1000);
});

it('starts indoors when the open terrace is larger than the enclosed home', () => {
  const project = balconyProject(), floor = project.floors[0];
  floor.rooms[0].boundary = [{ wallId: 'a-2' }, { point: { x: 0, y: 1500 } }, { point: { x: 400, y: 1500 } }];
  expect(analyzeFloor(floor).rooms.find(room => room.id === 'balcony')!.area).toBe(48);
  expect(floorInteriorPoint(analyzeFloor(floor)).y).toBeLessThan(300);
});

it('retains walls referenced by an outdoor area when its adjoining enclosed room is deleted', () => {
  loadProject(balconyProject());
  const interior = get(activeFloorAnalysis)!.rooms.find(room => !room.boundary)!;
  removeRoom(interior.id);
  expect(get(currentProject)!.floors[0].walls.map(wall => wall.id)).toEqual(['a-2']);
  expect(get(activeFloorAnalysis)!.rooms.find(room => room.id === 'balcony')!.area).toBe(8);
  undo(); expect(get(currentProject)!.floors[0].walls).toHaveLength(4);
});
