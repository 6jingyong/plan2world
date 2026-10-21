import { describe, expect, it } from 'vitest';
import { closeWallsWithFurniture, reviewFurnitureClosureCandidates } from '$lib/plan2world/furnitureGuidedClosure';
import type { SourceWallTraceV1 } from '$lib/plan2world/bareHouse';
import type { SourceAnnotationV1 } from '$lib/plan2world/reconstructionAssembly';
import { prepareArchitectureStage, assembleFrozenArchitecture } from '$lib/plan2world/architecture';

function input() {
  const trace: SourceWallTraceV1 = { schemaVersion: 'source-wall-trace-v1', walls: [
    { start: { x: 0, y: 0 }, end: { x: 240, y: 0 } },
    { start: { x: 240, y: 0 }, end: { x: 240, y: 200 } },
    { start: { x: 240, y: 200 }, end: { x: 0, y: 200 } },
    { start: { x: 0, y: 200 }, end: { x: 0, y: 0 } },
    { start: { x: 0, y: 100 }, end: { x: 236, y: 100 } },
  ] };
  const annotation: SourceAnnotationV1 = { schemaVersion: 'source-annotation-v1',
    scaleEvidence: { kind: 'measured_dimension', realLengthCm: 100, endpoints: [{ x: 0, y: 0 }, { x: 20, y: 0 }], evidence: 'Printed scale bar.' },
    openings: [
      { kind: 'door', endpoints: [{ x: 80, y: 0 }, { x: 110, y: 0 }], evidence: 'North entry jambs.' },
      { kind: 'door', endpoints: [{ x: 100, y: 100 }, { x: 130, y: 100 }], evidence: 'Partition door jambs.' },
    ], furniture: [
      { sourceCategory: 'bed', position: { x: 60, y: 60 } },
      { sourceCategory: 'desk', position: { x: 60, y: 150 } },
    ] };
  return { trace, annotation };
}
const context = { sourceWidthPx: 400, sourceHeightPx: 300 };

describe('furniture-guided local wall closure before architecture freeze', () => {
  it('uses furniture on both sides to select a bounded continuation of an existing partition', () => {
    const { trace, annotation } = input(), before = JSON.stringify({ trace, annotation });
    const result = closeWallsWithFurniture(trace, annotation, context);
    expect(result.review.accepted).toHaveLength(1);
    expect(result.review.initialMetrics.furnishedRegionsWithEntrance).toBe(1);
    expect(result.review.finalMetrics.furnishedRegionsWithEntrance).toBe(2);
    expect(result.review.accepted[0].candidate).toMatchObject({ from: { x: 236, y: 100 }, to: { x: 240, y: 100 }, movementPx: 4 });
    expect(result.review.normalizationInput.walls).toHaveLength(trace.walls.length);
    expect(JSON.stringify({ trace, annotation })).toBe(before);
    expect(closeWallsWithFurniture(trace, annotation, context)).toEqual(result);
  });

  it('does not close the same geometric gap without furniture anchors', () => {
    const { trace, annotation } = input(); annotation.furniture = [];
    expect(closeWallsWithFurniture(trace, annotation, context).review.accepted).toEqual([]);
  });

  it('moves the already joined ends of two partitions together', () => {
    const { trace, annotation } = input();
    trace.walls.push({ start: { x: 120, y: 40 }, end: { x: 236, y: 100 } });
    const result = closeWallsWithFurniture(trace, annotation, context);
    expect(result.review.accepted[0].candidate.endpoints).toHaveLength(2);
    expect(result.review.normalizationInput.walls[4].end).toEqual({ x: 240, y: 100 });
    expect(result.review.normalizationInput.walls[5].end).toEqual({ x: 240, y: 100 });
  });

  it('does not maximize the count of empty rooms', () => {
    const { trace, annotation } = input(); annotation.furniture!.pop();
    expect(closeWallsWithFurniture(trace, annotation, context).review.accepted).toEqual([]);
  });

  it('preserves an open furnished room when no observed partition candidate exists', () => {
    const { trace, annotation } = input(); trace.walls.pop();
    expect(closeWallsWithFurniture(trace, annotation, context).review.accepted).toEqual([]);
  });

  it('refuses to create a furnished room without an observed entrance', () => {
    const { trace, annotation } = input(); annotation.openings!.pop();
    expect(closeWallsWithFurniture(trace, annotation, context).review.accepted).toEqual([]);
  });

  it('does not connect a partition into the middle of an observed aperture', () => {
    const { trace, annotation } = input();
    annotation.openings!.push({ kind: 'door', endpoints: [{ x: 240, y: 85 }, { x: 240, y: 115 }], evidence: 'Right exterior doorway.' });
    expect(closeWallsWithFurniture(trace, annotation, context).review.accepted).toEqual([]);
  });

  it('explains a pre-trial opening conflict without changing frozen output or source evidence', () => {
    const { trace, annotation } = input();
    annotation.openings!.push({ kind: 'window', endpoints: [{ x: 240, y: 85 }, { x: 240, y: 115 }], evidence: 'Right facade aperture.' });
    const before = JSON.stringify({ trace, annotation });
    const frozen = closeWallsWithFurniture(trace, annotation, context);
    const diagnostic = reviewFurnitureClosureCandidates(trace, annotation, context);
    expect(frozen.review.trialCount).toBe(0);
    expect(diagnostic.exclusions).toContainEqual({ from: { x: 236, y: 100 }, to: { x: 240, y: 100 },
      targetWallId: 'w2', status: 'observed-opening-conflict', openingIndices: [2] });
    expect(diagnostic.geometryChanged).toBe(false);
    expect(closeWallsWithFurniture(trace, annotation, context)).toEqual(frozen);
    expect(JSON.stringify({ trace, annotation })).toBe(before);
  });

  it('preserves larger gaps and curved partitions', () => {
    const { trace, annotation } = input(); trace.walls[4].end.x = 220;
    expect(closeWallsWithFurniture(trace, annotation, context).review.accepted).toEqual([]);
    trace.walls[4].end.x = 236; trace.walls[4].curvePoint = { x: 120, y: 40 };
    expect(closeWallsWithFurniture(trace, annotation, context).review.accepted).toEqual([]);
  });

  it('does not extend a wall through a furniture anchor', () => {
    const { trace, annotation } = input();
    annotation.furniture!.push({ sourceCategory: 'chair', position: { x: 238, y: 100 } });
    const result = closeWallsWithFurniture(trace, annotation, context);
    expect(result.review.accepted).toEqual([]);
    expect(result.review.evaluated.some(item => item.status === 'new-wall-path-crosses-furniture-anchor')).toBe(true);
  });

  it('retains the original observation and rejects changing frozen furniture or decisions', () => {
    const { trace, annotation } = input();
    const evidence = { decision: 'accept', decisionBasis: 'Visible stroke.', evidence: 'Visible source geometry.' };
    const architecture = { schemaVersion: 'source-architecture-v1', scaleEvidence: annotation.scaleEvidence,
      walls: trace.walls.map((wall, index) => ({ ...wall, label: `wall ${index}`, ...evidence })),
      openings: annotation.openings!.map((opening, index) => ({ ...opening, label: `door ${index}`, ...evidence })) };
    const furnishing = { schemaVersion: 'source-furnishing-v1', furniture: annotation.furniture };
    const before = JSON.stringify({ architecture, furnishing });
    const stage = prepareArchitectureStage(architecture, context, furnishing);
    const result = assembleFrozenArchitecture(stage, furnishing);
    expect(stage.wallTrace.walls[4].end.x).toBe(236);
    expect(stage.closureReview!.normalizationInput.walls[4].end.x).toBe(240);
    expect(result.architectureUnchanged).toBe(true);
    expect(JSON.stringify({ architecture, furnishing })).toBe(before);
    const changed = structuredClone(furnishing); changed.furniture![0].position.x = 70;
    expect(() => assembleFrozenArchitecture(stage, changed)).toThrow(/anchors were frozen/);
    stage.closureReview!.accepted[0].candidate.to.x = 241;
    expect(() => assembleFrozenArchitecture(stage, furnishing)).toThrow(/Frozen architecture stage is inconsistent/);
  });

  it('keeps a misplaced exterior furniture anchor unchanged rather than growing the exterior around it', () => {
    const { trace, annotation } = input();
    annotation.furniture!.push({ sourceCategory: 'chair', position: { x: 300, y: 250 } });
    const result = closeWallsWithFurniture(trace, annotation, context);
    expect(result.review.finalMetrics.closedAnchors.at(-1)).toBe(false);
    expect(result.review.normalizationInput.walls.slice(0, 4)).toEqual(trace.walls.slice(0, 4));
  });

  it('retains an ambiguous corner when two nearby boundary choices have the same furnished-region gain', () => {
    const { trace, annotation } = input(); trace.walls.pop();
    trace.walls.push({ start: { x: 0, y: 5 }, end: { x: 235, y: 5 } },
      { start: { x: 235, y: 5 }, end: { x: 235, y: 200 } });
    annotation.furniture = [
      { sourceCategory: 'chair', position: { x: 120, y: 2 } },
      { sourceCategory: 'chair', position: { x: 238, y: 100 } },
      { sourceCategory: 'desk', position: { x: 120, y: 100 } },
    ];
    annotation.openings = [
      { kind: 'door', endpoints: [{ x: 100, y: 0 }, { x: 130, y: 0 }], evidence: 'North entry.' },
      { kind: 'door', endpoints: [{ x: 240, y: 80 }, { x: 240, y: 110 }], evidence: 'East entry.' },
      { kind: 'door', endpoints: [{ x: 100, y: 200 }, { x: 130, y: 200 }], evidence: 'South entry.' },
    ];
    const result = closeWallsWithFurniture(trace, annotation, context);
    expect(result.review.ambiguousCandidates).toBeGreaterThan(0);
    expect(result.review.accepted).toEqual([]);
  });
});
