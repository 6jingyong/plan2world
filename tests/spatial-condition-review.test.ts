import { describe, expect, it } from 'vitest';
import { prepareArchitectureStage, assembleFrozenArchitecture } from '$lib/plan2world/architecture';
import { reviewSpatialConditions, reviewBoundaryCoverage, groupNearMisses } from '$lib/plan2world/spatialConditionReview';
import { wallPathSpans } from '$lib/utils/wallPath';
import catalog from '../docs/floorplan-understanding/source-profiles.json';

const p = (x: number, y: number) => ({ x, y });
const wall = (label: string, start: number[], end: number[]) => ({ label, start: p(start[0], start[1]), end: p(end[0], end[1]),
  decision: 'accept', evidence: 'Synthetic observed boundary.', decisionBasis: 'Visible line.' });
const opening = (kind: 'door' | 'window', label: string, x: number) => ({ kind, label, endpoints: [p(x, 70), p(x, 90)],
  decision: 'accept', evidence: 'Synthetic aperture with observed jambs.', decisionBasis: 'Visible jambs.',
  ...(kind === 'door' ? { doorType: 'single', typeEvidence: 'Visible single leaf.' } : {}) });
function scene(options: { floating?: boolean; window?: boolean; outside?: boolean; noEntry?: boolean; leafless?: boolean } = {}) {
  const architecture = { schemaVersion: 'source-architecture-v1', scaleEvidence: { kind: 'estimated_reference', realLengthCm: 100,
    endpoints: [p(20, 20), p(30, 20)], evidence: 'Provisional length only.' },
    walls: [wall('n', [20, 20], [180, 20]), wall('e', [180, 20], [180, 180]), wall('s', [180, 180], [20, 180]), wall('w', [20, 180], [20, 20]),
      wall('partition', [100, options.floating ? 55 : 20], [100, options.floating ? 145 : 180])],
    openings: [opening('door', 'entry', 20), ...(options.noEntry ? [] : [{ ...opening(options.window ? 'window' : 'door', 'interior', 100),
      ...(options.leafless ? { doorType: 'opening', typeEvidence: 'Observed leafless passage.' } : {}) }])], doorGaps: [] };
  const furnishing = { schemaVersion: 'source-furnishing-v1', furniture: [
    { sourceCategory: 'bed', position: p(55, 110) }, { sourceCategory: 'bed', position: p(145, 110) },
    ...(options.outside ? [{ sourceCategory: 'chair', position: p(10, 10) }] : []),
  ] };
  const stage = prepareArchitectureStage(architecture, { sourceWidthPx: 200, sourceHeightPx: 200 }, furnishing);
  return { stage, draft: assembleFrozenArchitecture(stage, furnishing).draft };
}
const rule = (review: ReturnType<typeof reviewSpatialConditions>, id: string) => review.rules.find(r => r.id === id)!;

describe('read-only spatial priors remain distinct from geometric acceptance', () => {
  it('detects a lost separation even when every furniture anchor is enclosed', () => {
    const { stage, draft } = scene({ floating: true });
    const before = JSON.stringify({ stage, draft });
    const review = reviewSpatialConditions(stage, draft);
    expect(rule(review, 'P01').status).toBe('consistent');
    expect(rule(review, 'P03').status).toBe('review');
    expect(review.apertureRelations.find(a => a.id === 'd2')?.sameRegionIds).toHaveLength(1);
    expect(review.invariantConflictCount).toBe(0);
    expect(reviewSpatialConditions(stage, draft)).toEqual(review);
    expect(JSON.stringify({ stage, draft })).toBe(before);
    expect(review.geometryChanged).toBe(false);
    expect(review.llmCalls).toBe(0);
    expect(review.sourceAcceptance).toBe('pending-independent-review');
  });
  it('uses the native split faces when a partition actually separates two regions', () => {
    const { stage, draft } = scene();
    const review = reviewSpatialConditions(stage, draft);
    expect(review.nativeRegionCount).toBe(2);
    expect(rule(review, 'P03').status).toBe('consistent');
    expect(rule(review, 'P02').status).toBe('consistent');
    expect(review.invariantConflictCount).toBe(0);
  });
  it('keeps a same-face leafless passage as context without demanding a new room', () => {
    const { stage, draft } = scene({ floating: true, leafless: true });
    const review = reviewSpatialConditions(stage, draft);
    expect(rule(review, 'P03').status).toBe('consistent');
    expect(rule(review, 'P03').details).toMatchObject({ leaflessPassageCount: 1, statefulDoorCount: 0 });
  });
  it('does not treat a full-height window as a door or entrance', () => {
    const { stage, draft } = scene({ window: true });
    const review = reviewSpatialConditions(stage, draft);
    expect(draft.floors[0].windows![0].sillHeight).toBe(0);
    expect(rule(review, 'P02').status).toBe('review');
    expect(review.apertureRelations.find(a => a.kind === 'window')?.traversalPolicy).toBe('blocked-even-when-full-height');
  });
  it('reports an outdoor or misplaced anchor without inventing enclosing walls', () => {
    const { stage, draft } = scene({ outside: true });
    const before = JSON.stringify(stage.bareHouse);
    const review = reviewSpatialConditions(stage, draft);
    expect(rule(review, 'P01').status).toBe('review');
    expect(JSON.stringify(stage.bareHouse)).toBe(before);
    expect(review.invariantConflictCount).toBe(0);
  });
  it('catches anisotropic draft changes while keeping provisional scale separate', () => {
    const { stage, draft } = scene();
    const review = reviewSpatialConditions(stage, draft);
    expect(rule(review, 'H04').status).toBe('consistent');
    expect(rule(review, 'E02').status).toBe('review');
    for (const w of draft.floors[0].walls) { w.start.y *= 1.1; w.end.y *= 1.1; }
    expect(rule(reviewSpatialConditions(stage, draft), 'H04').status).toBe('conflict');
  });
  it('does not convert missing independent references into a pass', () => {
    const { stage, draft } = scene();
    const review = reviewSpatialConditions(stage, draft);
    for (const id of ['U01', 'U02', 'U03']) expect(rule(review, id).status).toBe('not-evaluable');
  });
  it('checks frozen furniture positions separately from containment', () => {
    const { stage, draft } = scene();
    draft.floors[0].furniture![0].position.x += 10;
    expect(rule(reviewSpatialConditions(stage, draft), 'H05').status).toBe('conflict');
  });
});

describe('native face evidence coverage', () => {
  it('rejects an implicit closing edge unsupported by a wall', () => {
    const polygon = [p(0, 0), p(100, 0), p(100, 100), p(0, 100)];
    const walls = [0, 1, 2].map(i => ({ start: polygon[i], end: polygon[i + 1] }));
    expect(reviewBoundaryCoverage(polygon, walls)).toMatchObject([{ edge: 3 }]);
  });
  it('detects a narrow unsupported gap that sparse samples could skip', () => {
    const polygon = [p(0, 0), p(1000, 0), p(0, 1000)];
    const walls = [{ start: p(0, 0), end: p(495, 0) }, { start: p(505, 0), end: p(1000, 0) },
      { start: polygon[1], end: polygon[2] }, { start: polygon[2], end: polygon[0] }];
    expect(reviewBoundaryCoverage(polygon, walls)).toMatchObject([{ edge: 0 }]);
  });
  it('accepts a split edge covered by multiple walls and the native curve facets', () => {
    const curve = { start: p(0, 0), end: p(1000, 0), curvePoint: p(500, -500) };
    const polygon = [...wallPathSpans(curve).map(span => span.start), p(1000, 0), p(1000, 1000), p(0, 1000)];
    const walls = [curve, { start: p(1000, 0), end: p(1000, 1000) }, { start: p(1000, 1000), end: p(500, 1000) },
      { start: p(500, 1000), end: p(0, 1000) }, { start: p(0, 1000), end: p(0, 0) }];
    expect(reviewBoundaryCoverage(polygon, walls)).toEqual([]);
  });
  it('deduplicates reverse endpoint records without widening their source gap', () => {
    const base = { code: 'source-endpoint-near-miss' as const, wallId: 'w1', endpoint: 'end' as const, targetWallId: 'w2',
      distancePx: 8, sourcePoint: p(10, 20), projection: p(18, 20), incidentWallIds: ['w1'], candidateWallIds: ['w2'], supportingJunctions: [] };
    expect(groupNearMisses([base, { ...base, sourcePoint: base.projection, projection: base.sourcePoint }])).toMatchObject([
      { distancePx: 8, records: [base, expect.anything()] },
    ]);
  });
});

it('keeps the five-source catalog inspectable without supplying reference geometry', () => {
  const ids = new Set(catalog.conditions.map(item => item.id));
  expect(catalog.cases).toHaveLength(5);
  expect(catalog.algorithmUse).toContain('not a solver input');
  for (const item of catalog.cases) {
    expect(item.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(item.geometryGroundTruth).toBe('not-established');
    expect(item.conditionIds.every(id => ids.has(id))).toBe(true);
    for (const evidence of item.evidence) {
      const [x0, y0, x1, y1] = evidence.box;
      expect(x0 >= 0 && y0 >= 0 && x1 > x0 && y1 > y0 && x1 <= item.source.width && y1 <= item.source.height).toBe(true);
      expect(evidence.conditions.every(id => item.conditionIds.includes(id))).toBe(true);
    }
  }
});
