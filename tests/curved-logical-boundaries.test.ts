import { expect, it } from 'vitest';
import { prepareArchitectureStage, assembleFrozenArchitecture } from '$lib/plan2world/architecture';
import { draftToProject } from '$lib/plan2world/draft';
import { wallPathCoverage } from '$lib/utils/wallPathCoverage';
import { wallSubpath } from '$lib/utils/wallPath';
import { buildFloorClearance } from '$lib/utils/floorClearance';

const p = (x: number, y: number) => ({ x, y });
const curve = { start: p(20, 40), end: p(180, 40), curvePoint: p(100, 160) };
it('subtracts reversed partial overlaps while retaining the exact remaining quadratic', () => {
  const prefix = { start: p(20, 40), curvePoint: p(44, 76), end: p(68, 90.4) };
  const suffix = { start: p(180, 40), curvePoint: p(156, 76), end: p(132, 90.4) };
  const coverage = wallPathCoverage(curve, [prefix, suffix]);
  expect(coverage.gaps).toHaveLength(1);
  const gap = coverage.gaps[0];
  expect(gap.low).toBeCloseTo(.3, 10); expect(gap.high).toBeCloseTo(.7, 10);
  expect(gap.start.x).toBeCloseTo(68, 10); expect(gap.start.y).toBeCloseTo(90.4, 10);
  expect(gap.end.x).toBeCloseTo(132, 10); expect(gap.curvePoint!.x).toBeCloseTo(100, 10); expect(gap.curvePoint!.y).toBeCloseTo(109.6, 10);
  const rebuilt = wallPathCoverage(curve, [prefix, suffix, gap]);
  expect(rebuilt.gaps).toHaveLength(0);
});

it('does not merge a chord, different bow or parallel perimeter just because its endpoints are nearby', () => {
  for (const other of [
    { start: curve.start, end: curve.end },
    { ...curve, curvePoint: p(100, 80) },
    { start: p(20, 42), end: p(180, 42), curvePoint: p(100, 162) },
  ]) expect(wallPathCoverage(curve, [other]).gaps).toHaveLength(1);
  expect(wallPathCoverage(curve, [{ ...curve, start: curve.end, end: curve.start }]).gaps).toHaveLength(0);
});

const evidence = { decision: 'accept', evidence: 'Synthetic source observation.', decisionBasis: 'Visible supported source edge.' };
const wall = (a: number[], b: number[], c?: number[]) => ({ ...evidence, label: 'observed baseline', start: p(a[0], a[1]), end: p(b[0], b[1]), ...(c ? { curvePoint: p(c[0], c[1]) } : {}) });
const edge = (x: number, y: number, kind = 'wall', c?: number[]) => ({ point: p(x, y), kind, evidence: 'Source-supported edge.', ...(c ? { curvePoint: p(c[0], c[1]) } : {}) });
const zone = (label: string, position: number[], boundary: ReturnType<typeof edge>[], environment = 'indoor') => ({ ...evidence, label, category: label, environment, position: p(position[0], position[1]), boundary });
const empty = { schemaVersion: 'source-furnishing-v1', furniture: [] };
const context = { sourceWidthPx: 200, sourceHeightPx: 200 };
const input = () => ({ schemaVersion: 'source-architecture-v1', scaleEvidence: { kind: 'estimated_reference', realLengthCm: 100, endpoints: [p(20, 20), p(30, 20)], evidence: 'Provisional reference.' },
  walls: [wall([20, 20], [180, 20]), wall([180, 20], [180, 120]), wall([180, 120], [20, 120]), wall([20, 120], [20, 20]),
    wall([55, 55], [55, 90], [90, 72])],
  openings: [{ ...evidence, label: 'balcony door', kind: 'door', doorType: 'sliding', typeEvidence: 'Track.', endpoints: [p(80, 120), p(120, 120)] }],
  functionalZones: [zone('living', [100, 90], [edge(20, 20), edge(180, 20), edge(180, 120), edge(20, 120)]),
    zone('balcony', [100, 142], [edge(20, 120), edge(180, 120, 'air', [140, 160]), edge(100, 160, 'air', [60, 160])], 'balcony')] });

it.each(['air', 'railing'])('closes an unfurnished curved balcony with %s while keeping the freestanding screen and source observations unchanged', kind => {
  const a = input(); a.functionalZones[1].boundary.filter(e => e.curvePoint).forEach(e => e.kind = kind);
  const original = JSON.stringify(a), stage = prepareArchitectureStage(a, context, empty), draft = assembleFrozenArchitecture(stage, empty).draft;
  expect(stage.functionalZoneReview!.finalMetrics.resolvedZoneCount).toBe(2);
  expect(stage.functionalZoneReview!.llmCalls).toBe(0);
  const boundaries = draft.floors[0].walls.filter(w => w.boundaryType === kind);
  expect(boundaries).toHaveLength(2); expect(boundaries.every(w => w.curvePoint)).toBe(true);
  const { start, end, curvePoint } = a.walls[4];
  expect(stage.bareHouse.walls.find(w => w.id === 'w5')).toEqual({ id: 'w5', start, end, curvePoint });
  if (kind === 'railing') expect(boundaries.every(w => w.height === 110)).toBe(true);
  const floor = draftToProject(draft).floors[0];
  expect(floor.rooms.find(r => r.name === 'balcony')?.roomType).toBe('outdoor');
  expect(buildFloorClearance(floor).obstacles.some(o => o.id.startsWith(`wall:${boundaries[0].id}:`))).toBe(true);
  expect(JSON.stringify(a)).toBe(original);
});

it('deduplicates a curved shared leafless passage and preserves its traversable full-height interval', () => {
  const a = input(); a.walls = [wall([20, 20], [180, 20]), wall([180, 20], [180, 180]), wall([180, 180], [20, 180]), wall([20, 180], [20, 20]), wall([100, 20], [100, 180], [140, 100])];
  a.openings = [];
  a.functionalZones = [zone('left', [60, 100], [edge(20, 20), edge(100, 20, 'passage', [140, 100]), edge(100, 180), edge(20, 180)]),
    zone('right', [160, 100], [edge(100, 20), edge(180, 20), edge(180, 180), edge(100, 180, 'passage', [140, 100])])];
  const stage = prepareArchitectureStage(a, context, empty), draft = assembleFrozenArchitecture(stage, empty).draft;
  expect(stage.functionalZoneReview!.finalMetrics.resolvedZoneCount).toBe(2);
  expect(draft.floors[0].doors).toHaveLength(1); expect(draft.floors[0].doors![0].type).toBe('opening');
  const floor = draftToProject(draft).floors[0];
  expect(buildFloorClearance(floor).obstacles.some(o => o.id.startsWith('wall:w5:'))).toBe(false);
  // Two T junctions split the outer top/bottom runs; the shared curve stays one.
  expect(stage.bareHouse.walls).toHaveLength(7);
  expect(stage.bareHouse.walls.filter(w => w.curvePoint)).toHaveLength(1);
});

it('keeps nearby but noncoincident air curves unresolved rather than copying or relabelling an existing facade', () => {
  const a = input(); a.walls.push(wall([180, 120], [100, 160], [140, 161]));
  const stage = prepareArchitectureStage(a, context, empty);
  expect(stage.functionalZoneReview!.boundaryChanges.some(c => c.status === 'nearby-noncoincident-curve-needs-review')).toBe(true);
  expect(stage.bareHouse.walls.find(w => w.id === 'w6')?.boundaryType).toBeUndefined();
});

it('does not permit a curved passage to overwrite a window that extends beyond its observed threshold', () => {
  const a: any = input(), parent = { start: p(100, 20), end: p(100, 180), curvePoint: p(140, 100) }, threshold = wallSubpath(parent, .4, .6);
  a.walls.push({ ...evidence, label: 'glass facade', ...parent });
  a.openings.push({ ...evidence, label: 'window', kind: 'window', endpoints: [p(112.8, 52), p(112.8, 148)] });
  a.functionalZones = [zone('threshold candidate', [60, 100], [edge(20, 20), edge(100, 20),
    { point: threshold.start, kind: 'passage', curvePoint: threshold.curvePoint, evidence: 'Conflicting threshold.' }, { point: threshold.end, kind: 'wall', evidence: 'Lower boundary.' }, edge(100, 180), edge(20, 180)])];
  const stage = prepareArchitectureStage(a, context, empty);
  expect(stage.functionalZoneReview!.boundaryChanges.some(c => c.status === 'passage-conflicts-with-observed-window')).toBe(true);
  expect(stage.architectureDraft.floors[0].windows).toHaveLength(1);
});
