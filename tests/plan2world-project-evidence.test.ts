import { expect, it } from 'vitest';
import { get } from 'svelte/store';
import type { Plan2WorldDraft } from '$lib/plan2world/draft';
import { draftToProject } from '$lib/plan2world/draft';
import { draftToProjectWithSourceBackground } from '$lib/plan2world/sourceBackground';
import { calibratePlan2WorldDraft, summarizeProjectReconstruction } from '$lib/plan2world/review';
import { buildProjectReconstructionTrace } from '$lib/plan2world/reconstructionTrace';
import { readProject } from '$lib/utils/projectValidation';
import { projectPackageBytes, readProjectPackage } from '$lib/services/projectPackage';
import { jsonBytes, packageJSON, readPackageZip, writePackageZip } from '$lib/utils/projectPackageZip';
import { activeFloorAnalysis, currentProject, loadProject, removeElement, setBackgroundImage, undo, updateBackgroundImage, updateDoor } from '$lib/stores/project';
import { rectangleWalls } from './fixtures/project';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';

const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=';
const source = { dataUrl: `data:image/png;base64,${pixel}`, width: 1, height: 1, name: 'synthetic.png' };
function draft(): Plan2WorldDraft {
  return {
    schemaVersion: 'plan2world-draft-v1', name: 'Evidence home', units: 'cm',
    scale: { mode: 'estimated', confidence: 0.45, basis: 'Door width assumption' },
    assumptions: ['Check the scale against a known dimension.'],
    sourceRegistration: { floorId: 'ground', confidence: 0.8, anchors: [
      { wallId: 'a-0', endpoint: 'start', image: { x: 0, y: 0 } },
      { wallId: 'a-0', endpoint: 'end', image: { x: 1, y: 0 } },
    ] },
    floors: [{ id: 'ground', name: 'Ground', level: 0,
      walls: rectangleWalls().map(wall => ({ ...wall, confidence: 0.4, kind: 'exterior' })),
      doors: [{ id: 'door', wallId: 'a-0', position: 0.5, width: 500, confidence: 0.3 }], windows: [],
    }],
  };
}
const candidate = () => draftToProjectWithSourceBackground(draft(), source);

it('retains historical zone findings through native JSON and packages without changing runtime geometry', () => {
  const project = candidate(); project.floors[0].doors[0].width = 90;
  const runtime = compileRuntimeScene(project);
  const observationReview = { version: 1 as const, acceptedZoneCount: 2, supportedZoneCount: 0,
    zoneFindings: ['Bathroom', 'Study'].map(label => ({ label, message: 'Shares a reconstructed region with another observed zone.' })) };
  project.reconstruction!.observationReview = observationReview;
  expect(compileRuntimeScene(project)).toEqual(runtime);
  expect(readProject(JSON.parse(JSON.stringify(project))).reconstruction?.observationReview).toEqual(observationReview);
  expect(readProjectPackage(projectPackageBytes(project)).project.reconstruction?.observationReview).toEqual(observationReview);
  project.floors[0].walls[0].end.x += 20;
  expect(project.reconstruction?.observationReview).toEqual(observationReview);
});

it.each([
  { version: 2, acceptedZoneCount: 0, supportedZoneCount: 0, zoneFindings: [] },
  { version: 1, acceptedZoneCount: 2, supportedZoneCount: 3, zoneFindings: [] },
  { version: 1, acceptedZoneCount: 2, supportedZoneCount: 0, zoneFindings: [] },
  { version: 1, acceptedZoneCount: 1, supportedZoneCount: 0, zoneFindings: [{ label: 'Study', message: 3 }] },
])('rejects malformed historical zone review: %j', observationReview => {
  const project = candidate(); (project.reconstruction as any).observationReview = observationReview;
  expect(() => readProject(project)).toThrow(/reconstruction evidence/);
});

it('keeps calibrated provider-neutral evidence through native JSON without storing a second geometry or raster', () => {
  const calibrated = calibratePlan2WorldDraft(draft(), 400, 800);
  const project = draftToProjectWithSourceBackground(calibrated, source);
  const restored = readProject(JSON.parse(JSON.stringify(project)));
  expect(restored.reconstruction).toEqual(project.reconstruction);
  expect(restored.reconstruction).toMatchObject({ version: 1, scale: { mode: 'provided', confidence: 1 },
    assumptions: draft().assumptions, floors: [{ floorId: 'ground', walls: [{ id: 'a-0', kind: 'exterior', confidence: 0.4 },
      { id: 'a-1', kind: 'exterior', confidence: 0.4 }, { id: 'a-2', kind: 'exterior', confidence: 0.4 }, { id: 'a-3', kind: 'exterior', confidence: 0.4 }] }] });
  expect(restored.floors[0].backgroundImage?.reconstructionSource).toEqual({ width: 1, height: 1, name: 'synthetic.png', registration: 'anchors', confidence: 0.8 });
  expect(JSON.stringify(restored.reconstruction)).not.toMatch(/start|end|position|dataUrl|apiKey|provider/);
  expect(JSON.stringify(restored).split(source.dataUrl)).toHaveLength(2);
  expect(draftToProject(draft()).reconstruction?.scale.mode).toBe('estimated');
});

it('uses the saved image transform after a wall edit, including legal native zero/sloped heights', () => {
  const project = candidate(), floor = project.floors[0];
  const original = buildProjectReconstructionTrace(project, floor.id)!;
  const alignment = structuredClone(floor.backgroundImage);
  floor.walls[0].end.x = 800;
  floor.walls[0].height = 0; floor.walls[0].startHeight = 0; floor.walls[0].endHeight = 200;
  const edited = buildProjectReconstructionTrace(project, floor.id)!;
  expect(edited.walls[0].start).toEqual(original.walls[0].start);
  expect(edited.walls[0].end.x - original.walls[0].end.x).toBeCloseTo(1);
  expect(edited.walls[0]).toMatchObject({ confidence: 0.4, kind: 'exterior' });
  expect(floor.backgroundImage).toEqual(alignment);
  expect(summarizeProjectReconstruction(project)?.primaryExtent?.width).toBe(800);
});

it('refreshes findings and opening trace after corrections and Undo using shared floor analysis', () => {
  loadProject(candidate());
  const summary = () => summarizeProjectReconstruction(get(currentProject)!, [get(activeFloorAnalysis)!])!;
  expect(summary().geometryIssues.some(issue => issue.code === 'opening-outside-wall')).toBe(true);
  const evidence = structuredClone(get(currentProject)!.reconstruction);
  updateDoor('door', { width: 90, position: 0.25 });
  expect(summary().geometryIssues.some(issue => issue.code === 'opening-outside-wall')).toBe(false);
  const trace = buildProjectReconstructionTrace(get(currentProject)!, 'ground', summary().geometryIssues)!;
  expect(trace.openings[0]).toMatchObject({ confidence: 0.3, point: { x: 0.25, y: 0 } });
  expect(get(currentProject)!.reconstruction).toEqual(evidence);
  undo(); expect(summary().geometryIssues.some(issue => issue.code === 'opening-outside-wall')).toBe(true);
  removeElement('a-0');
  expect(summary().wallCount).toBe(3);
  expect(buildProjectReconstructionTrace(get(currentProject)!, 'ground')!.walls.some(wall => wall.id === 'a-0')).toBe(false);
  expect(() => readProject(get(currentProject))).not.toThrow(); // Historical references may outlive geometry.
});

it('retains confidence and source metadata through web/native package return', () => {
  const project = candidate(), before = project.reconstruction;
  const files = readPackageZip(projectPackageBytes(project));
  const plan = packageJSON(files['plan.json']);
  plan.openings[0].width = 0.9;
  files['plan.json'] = jsonBytes(plan);
  const restored = readProjectPackage(writePackageZip(files)).project;
  expect(restored.reconstruction).toEqual(before);
  expect(restored.floors[0].backgroundImage?.reconstructionSource).toEqual(project.floors[0].backgroundImage?.reconstructionSource);
  expect(restored.floors[0].doors[0].width).toBe(90);
  expect(summarizeProjectReconstruction(restored)!.geometryErrorCount).toBe(0);
});

it('keeps registration metadata when a native return moves the underlay, but invalidates a replaced raster', () => {
  const files = readPackageZip(projectPackageBytes(candidate()));
  const plan = packageJSON(files['plan.json']);
  plan.underlay.center.x += 1;
  files['plan.json'] = jsonBytes(plan);
  const moved = readProjectPackage(writePackageZip(files)).project;
  expect(moved.floors[0].backgroundImage?.reconstructionSource?.registration).toBe('anchors');
  const oldPixel = files[`assets/${plan.underlay.imageFilename}`];
  plan.underlay.imageFilename = 'replacement.png'; files['assets/replacement.png'] = oldPixel;
  files['plan.json'] = jsonBytes(plan);
  const replaced = readProjectPackage(writePackageZip(files)).project;
  expect(replaced.floors[0].backgroundImage?.reconstructionSource).toBeUndefined();
  expect(buildProjectReconstructionTrace(replaced, 'ground')).toBeUndefined();
  expect(replaced.reconstruction).toBeDefined();
});

it('removes the source marker on replacement/removal and restores it through Undo', () => {
  loadProject(candidate());
  updateBackgroundImage({ dataUrl: source.dataUrl + 'new-raster' });
  expect(buildProjectReconstructionTrace(get(currentProject)!, 'ground')).toBeUndefined();
  undo(); expect(buildProjectReconstructionTrace(get(currentProject)!, 'ground')).toBeDefined();
  setBackgroundImage(undefined);
  expect(buildProjectReconstructionTrace(get(currentProject)!, 'ground')).toBeUndefined();
  expect(summarizeProjectReconstruction(get(currentProject)!)?.assumptions).toEqual(draft().assumptions);
  undo(); expect(buildProjectReconstructionTrace(get(currentProject)!, 'ground')).toBeDefined();
});

it.each([
  (p: any) => { p.reconstruction.version = 2; },
  (p: any) => { p.reconstruction.scale.confidence = Infinity; },
  (p: any) => { p.reconstruction.assumptions = ['ok', 1]; },
  (p: any) => { p.reconstruction.floors[0].doors[0].confidence = -0.1; },
  (p: any) => { p.reconstruction.floors[0].walls.push(p.reconstruction.floors[0].walls[0]); },
  (p: any) => { p.floors[0].backgroundImage.reconstructionSource.width = 0; },
])('rejects malformed or future-version evidence without modifying the input', change => {
  const project = candidate(); change(project);
  const before = structuredClone(project);
  expect(() => readProject(project)).toThrow(/reconstruction|width/);
  expect(project).toEqual(before);
});

it('opens legacy projects without inferring missing evidence from free text', () => {
  const project = candidate(); delete project.reconstruction; delete project.floors[0].backgroundImage!.reconstructionSource;
  const restored = readProject(project);
  expect(restored.reconstruction).toBeUndefined();
  expect(summarizeProjectReconstruction(restored)).toBeNull();
  expect(buildProjectReconstructionTrace(restored, 'ground')).toBeUndefined();
});

it('scopes issue severity and confidence by floor when native element IDs are reused', () => {
  const project = candidate(), other = structuredClone(project.floors[0]);
  other.id = 'upper'; other.level = 1; other.doors[0].width = 90;
  project.floors.push(other);
  project.reconstruction!.floors.push({ ...structuredClone(project.reconstruction!.floors[0]), floorId: other.id,
    walls: other.walls.map(wall => ({ id: wall.id, confidence: 0.9 })) });
  const upper = buildProjectReconstructionTrace(project, other.id)!;
  expect(upper.walls[0].confidence).toBe(0.9);
  expect(upper.openings[0].severity).toBeUndefined();
  expect(buildProjectReconstructionTrace(project, 'ground')!.openings[0].severity).toBe('error');
});
