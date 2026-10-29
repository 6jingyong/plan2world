import { describe, expect, it } from 'vitest';
import { abstractCloseParallelWalls } from '$lib/plan2world/logicalWallAbstraction';
import { buildBareHouse, type SourceWallTraceV1 } from '$lib/plan2world/bareHouse';
import type { SourceAnnotationV1 } from '$lib/plan2world/reconstructionAssembly';
import { prepareArchitectureStage, assembleFrozenArchitecture } from '$lib/plan2world/architecture';
import { draftToProject } from '$lib/plan2world/draft';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { buildFloorClearance, hasClearanceAlongSegment } from '$lib/utils/floorClearance';

const p = (x: number, y: number) => ({ x, y });
const wall = (x: number, y: number, a: number, b: number) => ({ start: p(x, y), end: p(a, b) });
const context = { sourceWidthPx: 500, sourceHeightPx: 400 };
function fixture() {
  const trace: SourceWallTraceV1 = { schemaVersion: 'source-wall-trace-v1', walls: [
    wall(20, 20, 420, 20), wall(20, 30, 420, 30), wall(420, 20, 420, 320), wall(420, 320, 20, 320), wall(20, 320, 20, 20),
  ] };
  const annotation: SourceAnnotationV1 = { schemaVersion: 'source-annotation-v1', scaleEvidence: {
    kind: 'provided_length', realLengthCm: 200, endpoints: [p(20, 20), p(120, 20)], evidence: 'Synthetic uniform scale.' },
    openings: [{ kind: 'window', endpoints: [p(100, 25), p(150, 25)], evidence: 'Opening inside either two walls or one thick wall.' },
      { kind: 'door', endpoints: [p(20, 120), p(20, 165)], evidence: 'Existing entry.', doorType: 'opening', typeEvidence: 'Leafless passage.' }],
    furniture: [{ sourceCategory: 'desk', position: p(150, 180) }] };
  return { trace, annotation };
}

describe('logical thick-wall abstraction without construction-fact classification', () => {
  it('merges two close runs, retains their outer envelope and projects the contained opening', () => {
    const { trace, annotation } = fixture(), before = JSON.stringify({ trace, annotation });
    const result = abstractCloseParallelWalls(trace, annotation, context);
    expect(result.review.accepted).toHaveLength(1);
    expect(result.normalizationInput.walls).toHaveLength(4);
    expect(result.normalizationInput.walls[0]).toEqual({ start: p(20, 25), end: p(420, 25), thicknessPx: 16 });
    expect(result.review.finalMetrics!.openings).toHaveLength(2);
    expect(result.review.initialMetrics!.openings).toHaveLength(1);
    expect(result.review.finalMetrics!.closed).toEqual([true]);
    expect(result.review.sourceFactsConfirmed).toBe(false);
    expect(result.review.llmCalls).toBe(0);
    expect(JSON.stringify({ trace, annotation })).toBe(before);
    expect(abstractCloseParallelWalls(trace, annotation, context)).toEqual(result);
    expect(result.sourceWallOrigins[0]).toEqual([0, 1]);
  });

  it('accepts logical simplification without a door/window pixel symbol or an opening-count gain', () => {
    const { trace, annotation } = fixture(); annotation.openings!.shift();
    const result = abstractCloseParallelWalls(trace, annotation, context);
    expect(result.review.accepted).toHaveLength(1);
    expect(result.review.finalMetrics!.openings.map(o => o.id)).toEqual(result.review.initialMetrics!.openings.map(o => o.id));
    result.review.finalMetrics!.openings.forEach((o, i) => expect(o.widthPx).toBeCloseTo(result.review.initialMetrics!.openings[i].widthPx, 8));
  });

  it('handles bounded unequal run ends and corner-adjacent pairs as one connected envelope', () => {
    const { trace, annotation } = fixture(); trace.walls[1] = wall(38, 30, 405, 30);
    const result = abstractCloseParallelWalls(trace, annotation, context);
    expect(result.review.accepted).toHaveLength(1);
    expect(result.normalizationInput.walls[0]).toMatchObject({ start: p(20, 25), end: p(420, 25) });
    expect(result.review.finalMetrics!.closed).toEqual([true]);
  });

  it('projects a window from either face without resizing its interval', () => {
    const { trace, annotation } = fixture(); annotation.openings![0].endpoints = [p(100, 20), p(150, 20)];
    const result = abstractCloseParallelWalls(trace, annotation, context);
    expect(result.annotation.openings![0].endpoints).toEqual([p(100, 25), p(150, 25)]);
    expect(result.review.accepted[0].projectedOpenings[0].before).toEqual([p(100, 20), p(150, 20)]);
    result.review.finalMetrics!.openings.forEach((o, i) => expect(o).toMatchObject({ id: result.review.initialMetrics!.openings[i].id, widthPx: expect.closeTo(result.review.initialMetrics!.openings[i].widthPx, 8) }));
  });

  it('does not fill an occupied sliver even when its width cannot fit the walking player', () => {
    const { trace, annotation } = fixture(); annotation.furniture!.push({ sourceCategory: 'chair', position: p(200, 25) });
    const result = abstractCloseParallelWalls(trace, annotation, context);
    expect(result.review.accepted).toHaveLength(0);
    expect(result.review.trials[0].status).toBe('logical-regression');
    expect(result.normalizationInput).toEqual(trace);
  });

  it('protects an accepted functional seed and an explicit unoccupied passage', () => {
    const { trace, annotation } = fixture();
    const zone = { label: 'service', category: 'service', environment: 'indoor' as const, position: p(200, 25),
      decision: 'accept' as const, evidence: 'Functional observation.', decisionBasis: 'Accepted functional constraint.',
      boundary: [p(20, 20), p(420, 20), p(420, 30), p(20, 30)].map(point => ({ point, kind: 'wall' as const, evidence: 'Boundary constraint.' })) };
    expect(abstractCloseParallelWalls(trace, annotation, context, [zone]).review.accepted).toHaveLength(0);
    const passage = { ...zone, position: p(200, 180), boundary: [
      { point: p(20, 20), kind: 'passage' as const, evidence: 'Explicit passage.' }, ...zone.boundary.slice(1),
    ] };
    expect(abstractCloseParallelWalls(trace, annotation, context, [passage]).review.trials[0].status).toBe('functional-passage-in-envelope');
  });

  it('keeps a wider corridor and refuses transitive chaining beyond the total width budget', () => {
    const { trace, annotation } = fixture(); trace.walls[1] = wall(20, 60, 420, 60);
    expect(abstractCloseParallelWalls(trace, annotation, context).review.accepted).toHaveLength(0);
    trace.walls.splice(1, 1, wall(20, 45, 420, 45), wall(20, 70, 420, 70));
    const result = abstractCloseParallelWalls(trace, annotation, context);
    expect(result.review.accepted).toHaveLength(0);
    expect(result.review.trials[0].status).toBe('total-envelope-exceeds-bound');
  });

  it('protects a functional threshold crossing the band even when both ends lie outside it', () => {
    const { trace, annotation } = fixture();
    const zone = { label: 'threshold', category: 'service', environment: 'indoor' as const, position: p(200, 35), decision: 'accept' as const,
      evidence: 'Accepted functional space.', decisionBasis: 'Functional constraint.', boundary: [
        { point: p(100, 10), kind: 'passage' as const, evidence: 'Accepted crossing threshold.' },
        ...[p(100, 40), p(300, 40), p(300, 10)].map(point => ({ point, kind: 'unknown' as const, evidence: 'Uncertain remainder.' })),
      ] };
    const result = abstractCloseParallelWalls(trace, annotation, context, [zone]);
    expect(result.review.accepted).toHaveLength(0);
    expect(result.review.trials[0].status).toBe('functional-passage-in-envelope');
  });

  it('checks actual native wall width before filling a strip that a player could traverse', () => {
    const { trace, annotation } = fixture(); trace.walls[0].thicknessPx = .5;
    trace.walls[1] = { ...wall(20, 49.5, 420, 49.5), thicknessPx: .5 };
    const result = abstractCloseParallelWalls(trace, annotation, context);
    expect(result.review.accepted).toHaveLength(0);
    expect(result.review.trials[0].status).toBe('player-width-strip-retained');
  });

  it('retains a transverse aperture instead of absorbing the host into the thick wall', () => {
    const { trace, annotation } = fixture(); trace.walls[4].end = p(20, 30);
    trace.walls.push(wall(20, 30, 20, 20));
    annotation.openings!.push({ kind: 'door', endpoints: [p(20, 21), p(20, 29)], evidence: 'Accepted transverse source aperture.' });
    const result = abstractCloseParallelWalls(trace, annotation, context);
    expect(result.review.accepted).toHaveLength(0);
    expect(result.review.trials[0].reason).toBe('existing-opening-lost-or-resized');
  });

  it('keeps each usable doorway clear even when an alternative entrance preserves room connectivity', () => {
    const { trace, annotation } = fixture(); trace.walls[1] = wall(50, 30, 420, 30);
    annotation.openings![1].endpoints = [p(20, 26.5), p(20, 54.5)];
    annotation.openings!.push({ kind: 'door', endpoints: [p(20, 150), p(20, 190)], evidence: 'Alternative entrance.', doorType: 'opening', typeEvidence: 'Leafless.' });
    const result = abstractCloseParallelWalls(trace, annotation, context);
    expect(result.review.initialMetrics!.clearDoorIds).toContain('d1');
    expect(result.review.accepted).toHaveLength(0);
    expect(result.review.trials[0].reason).toBe('existing-door-clearance-lost');
  });

  it('does not silently coalesce two overlapping source apertures onto the merged host', () => {
    const { trace, annotation } = fixture(); annotation.openings![0].endpoints = [p(100, 20), p(150, 20)];
    annotation.openings!.push({ kind: 'window', endpoints: [p(100, 30), p(150, 30)], evidence: 'Separate source aperture.' });
    const result = abstractCloseParallelWalls(trace, annotation, context);
    expect(result.review.accepted).toHaveLength(0);
    expect(result.review.trials[0].reason).toBe('overlapping-openings');
  });

  it('retains legacy curves, air/railing boundaries and short unrelated parallel furniture-like strokes', () => {
    for (const special of [{ curvePoint: p(220, 10) }, { boundaryType: 'air' as const }, { boundaryType: 'railing' as const }]) {
      const { trace, annotation } = fixture(); Object.assign(trace.walls[1], special);
      expect(abstractCloseParallelWalls(trace, annotation, context).review.accepted).toHaveLength(0);
    }
    const { trace, annotation } = fixture(); trace.walls[1] = wall(90, 30, 125, 30);
    expect(abstractCloseParallelWalls(trace, annotation, context).review.accepted).toHaveLength(0);
  });

  it('preserves diagonal direction and is independent of source endpoint orientation', () => {
    const { trace, annotation } = fixture(), angle = Math.PI / 8;
    const rotate = (q: { x: number; y: number }) => p(200 + q.x * Math.cos(angle) - q.y * Math.sin(angle), 100 + q.x * Math.sin(angle) + q.y * Math.cos(angle));
    trace.walls = trace.walls.map(w => ({ start: rotate(w.start), end: rotate(w.end) }));
    [trace.walls[1].start, trace.walls[1].end] = [trace.walls[1].end, trace.walls[1].start];
    annotation.scaleEvidence.endpoints = annotation.scaleEvidence.endpoints.map(rotate) as any;
    annotation.openings!.forEach(o => o.endpoints = o.endpoints.map(rotate) as any);
    annotation.furniture!.forEach(f => f.position = rotate(f.position));
    const result = abstractCloseParallelWalls(trace, annotation);
    expect(result.review.accepted).toHaveLength(1);
    expect(result.normalizationInput.walls[0].thicknessPx).toBeCloseTo(16);
  });

  it('carries source-pixel thickness through splitting, native cm conversion and runtime collision', () => {
    const { trace, annotation } = fixture();
    const decision = { decision: 'accept', decisionBasis: 'Accepted feature.', evidence: 'Frozen original feature.' };
    const architecture = { schemaVersion: 'source-architecture-v1', scaleEvidence: annotation.scaleEvidence,
      walls: trace.walls.map((w, i) => ({ ...w, ...decision, label: `wall ${i}` })),
      openings: annotation.openings!.map((o, i) => ({ ...o, ...decision, label: `opening ${i}` })) };
    const furnishing = { schemaVersion: 'source-furnishing-v1', furniture: annotation.furniture };
    const stage = prepareArchitectureStage(architecture, context, furnishing), draft = assembleFrozenArchitecture(stage, furnishing).draft;
    expect(stage.logicalWallReview!.accepted).toHaveLength(1);
    expect(stage.wallAudit[0].normalizedWallIds).toEqual(stage.wallAudit[1].normalizedWallIds);
    expect(stage.wallTrace.walls).toHaveLength(5);
    expect(stage.centerlinePolicy).toBe('disabled');
    expect(draft.floors[0].walls[0].thickness).toBe(32);
    const project = draftToProject(draft, new Date(0)), floor = project.floors[0];
    const runtime = compileRuntimeScene(project);
    const nativeWall = runtime.entities.find(e => e.kind === 'wall' && e.id === floor.walls[0].id);
    expect(nativeWall).toMatchObject({ kind: 'wall', thickness: .32 });
    expect(runtime.colliders.filter(c => c.ownerId === nativeWall!.id && c.kind === 'box').every(c => c.kind === 'box' && c.size[2] === .32)).toBe(true);
    const clearance = buildFloorClearance({ ...floor, furniture: [] });
    expect(hasClearanceAlongSegment(p(100, -60), p(100, 80), clearance)).toBe(false);
    const legacy = prepareArchitectureStage(architecture, { ...context, wallAbstraction: 'preserve-source-lines' }, furnishing);
    expect(legacy.logicalWallReview).toBeUndefined();
    expect(legacy.openingAudit[0].programStatus).toBe('unresolved-host');
    const split = buildBareHouse({ schemaVersion: 'source-wall-trace-v1', walls: [
      { ...wall(20, 25, 420, 25), thicknessPx: 16 }, wall(200, 25, 200, 200),
    ] });
    expect(split.walls.filter(w => w.thicknessPx === 16)).toHaveLength(2);
    expect(() => buildBareHouse({ ...trace, walls: [{ ...trace.walls[0], thicknessPx: -1 }] })).toThrow(/positive/);
  });
});
