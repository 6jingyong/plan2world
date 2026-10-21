import { describe, expect, it } from 'vitest';
import { reviewRasterCenterlines } from '$lib/plan2world/rasterCenterlines';
import { freezeRasterEvidence, decodeInkRuns } from '$lib/plan2world/rasterWallContinuation';
import { prepareArchitectureStage, assembleFrozenArchitecture } from '$lib/plan2world/architecture';
import { sourceRelativeGeometry } from '$lib/plan2world/sourceRelativeGeometry';
import type { SourceWallTraceV1 } from '$lib/plan2world/bareHouse';
import type { SourceAnnotationV1 } from '$lib/plan2world/reconstructionAssembly';

function scene(width = 240, height = 160, inverted = false) {
  const data = new Uint8ClampedArray(width * height * 4).fill(inverted ? 0 : 255);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  const rect = (x0: number, y0: number, x1: number, y1: number, value = inverted ? 255 : 0) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = value;
    }
  };
  const trace: SourceWallTraceV1 = { schemaVersion: 'source-wall-trace-v1', walls: [
    { start: { x: 20, y: 53 }, end: { x: 220, y: 53 } },
  ] };
  const annotation: SourceAnnotationV1 = { schemaVersion: 'source-annotation-v1', scaleEvidence: {
    kind: 'provided_length', realLengthCm: 1000, endpoints: [{ x: 20, y: 53 }, { x: 220, y: 53 }], evidence: 'Synthetic reference.' },
  openings: [], furniture: [] };
  const run = () => reviewRasterCenterlines(trace, annotation,
    freezeRasterEvidence({ width, height, data }));
  return { data, rect, trace, annotation, run, width, height };
}

describe('explicit read-only centerline diagnostics', () => {
  it.each([false, true])('fits the midpoint of two stroke edges and preserves the raw input (inverted=%s)', inverted => {
    const s = scene(240, 160, inverted); s.rect(20, 48, 220, 52);
    const raw = JSON.stringify([s.trace, s.annotation]), result = s.run();
    expect(result.audits[0].status).toBe('unapproved-candidate');
    expect(result.audits[0].fit!.start.y).toBeCloseTo(50);
    expect(result.audits[0].fit!.end.y).toBeCloseTo(50);
    expect(JSON.stringify([s.trace, s.annotation])).toBe(raw);
    expect(result.thresholds).toEqual([55, 95, 135]);
    expect(result.analysis.ridgePixelCount).toBeGreaterThan(100);
  });
  it('does not run or apply centerlines in generation, including a uniquely associated window', () => {
    const s = scene(); s.rect(20, 48, 80, 52); s.rect(121, 48, 220, 52);
    s.annotation.openings = [{ kind: 'window', endpoints: [{ x: 81, y: 53 }, { x: 120, y: 53 }], evidence: 'Visible jambs.' }];
    const decision = { decision: 'accept', decisionBasis: 'Synthetic cue.', evidence: 'Synthetic wall.' };
    const architecture = { schemaVersion: 'source-architecture-v1', scaleEvidence: s.annotation.scaleEvidence,
      walls: s.trace.walls.map(w => ({ ...w, ...decision, label: 'wall' })),
      openings: s.annotation.openings.map(o => ({ ...o, ...decision, label: 'window' })) };
    const furniture = { schemaVersion: 'source-furnishing-v1', furniture: [] };
    const context = { sourceWidthPx: s.width, sourceHeightPx: s.height };
    const control = prepareArchitectureStage(architecture, context, furniture);
    const stage = prepareArchitectureStage(architecture, context, furniture, { width: s.width, height: s.height, data: s.data });
    expect(stage.centerlinePolicy).toBe('disabled'); expect('centerlineReview' in stage).toBe(false);
    expect(stage.bareHouse).toEqual(control.bareHouse); expect(stage.architectureDraft).toEqual(control.architectureDraft);
    expect(stage.annotationBase.openings![0].endpoints.map(p => p.y)).toEqual([53, 53]);
    const frozen = JSON.stringify(stage), review = s.run();
    expect(review.audits[0].status).toBe('unapproved-candidate');
    expect(review).toMatchObject({ geometryChanged: false, appliedWallChanges: 0, appliedOpeningChanges: 0 });
    expect('normalizationInput' in review).toBe(false); expect('annotation' in review).toBe(false);
    expect(JSON.stringify(stage)).toBe(frozen);
    expect(assembleFrozenArchitecture(JSON.parse(frozen), furniture).architectureUnchanged).toBe(true);
    expect(stage.architectureDraft.floors[0].windows![0]).toMatchObject({ height: 280, sillHeight: 0 });
    stage.rasterEvidence!.layers![0].runs[0]++;
    expect(() => assembleFrozenArchitecture(stage, furniture)).toThrow();
  });

  it('does not choose between equally supported nearby parallel strokes', () => {
    const s = scene(); s.rect(20, 48, 220, 50); s.rect(20, 56, 220, 58);
    expect(s.run().audits[0].status).toBe('ambiguous-parallel-strokes');
  });
  it.each(['blank', 'thin', 'faint'])('does not invent a thick structural line from %s evidence', mode => {
    const s = scene();
    if (mode === 'thin') s.rect(20, 50, 220, 50);
    if (mode === 'faint') s.rect(20, 48, 220, 52, 180);
    const before = JSON.stringify(s.trace), r = s.run(); expect(JSON.stringify(s.trace)).toBe(before);
    expect(r.audits[0].status).not.toBe('unapproved-candidate');
  });
  it('keeps a short partition and curve instead of deleting them in a long-line filter', () => {
    const s = scene(); s.trace.walls.push({ start: { x: 30, y: 30 }, end: { x: 38, y: 30 } },
      { start: { x: 50, y: 90 }, end: { x: 150, y: 90 }, curvePoint: { x: 100, y: 130 } });
    const before = JSON.stringify(s.trace), r = s.run(); expect(JSON.stringify(s.trace)).toBe(before);
    expect(r.audits.map(a => a.status)).toEqual(['insufficient-thick-stroke', 'short-segment-kept', 'curve-kept']);
  });
  it('lowers weights of connected furniture ink without erasing wall-adjacent strokes or moving anchors', () => {
    const s = scene(); s.rect(20, 48, 220, 52); s.rect(95, 65, 105, 68);
    s.annotation.furniture = [{ sourceCategory: 'desk', position: { x: 100, y: 65 } },
      { sourceCategory: 'nightstand', position: { x: 150, y: 51 } }];
    const before = JSON.stringify(s.annotation), r = s.run(), a = r.analysis;
    const suppressed = decodeInkRuns(a.furnitureSuppressionRuns, a.width, a.height);
    expect(suppressed[66 * a.width + 100]).toBe(1);
    expect(suppressed[50 * a.width + 150]).toBe(0);
    expect(a.furniturePolicy.erasedPixels).toBe(0);
    expect(JSON.stringify(s.annotation)).toBe(before);
    expect(r.geometryChanged).toBe(false);
  });
  it('uses one coordinate divisor so a non-square source keeps its proportions', () => {
    const s = scene(), r = sourceRelativeGeometry(s.trace.walls, s.width, s.height);
    expect(r.divisorPx).toBe(240); expect(r.width).toBe(1); expect(r.height).toBeCloseTo(2 / 3);
    const w = r.walls[0]; expect((w.end.x - w.start.x) * r.divisorPx).toBeCloseTo(200);
  });
  it('fits an oblique wall without forcing it to a Manhattan axis', () => {
    const s = scene();
    for (let x = 20; x <= 220; x++) { const y = Math.round(40 + (x - 20) * 0.2); s.rect(x, y - 2, x, y + 2); }
    s.trace.walls[0] = { start: { x: 20, y: 43 }, end: { x: 220, y: 83 } };
    const r = s.run(), w = r.audits[0].fit!;
    expect(r.audits[0].status).toBe('unapproved-candidate');
    expect((w.end.y - w.start.y) / (w.end.x - w.start.x)).toBeCloseTo(0.2, 1);
    expect(w.start.y).toBeCloseTo(40, 0); expect(w.end.y).toBeCloseTo(80, 0);
  });
  it('leaves shared endpoints and T-junctions untouched even when it finds a candidate', () => {
    const s = scene(); s.rect(20, 48, 220, 52);
    s.trace.walls.push({ start: { x: 220, y: 53 }, end: { x: 227, y: 63 } },
      { start: { x: 100, y: 53 }, end: { x: 100, y: 95 } });
    const before = JSON.stringify(s.trace), review = s.run();
    expect(review.audits[0].status).toBe('unapproved-candidate');
    expect(JSON.stringify(s.trace)).toBe(before);
    expect('junctionMoves' in review).toBe(false); expect('openingMoves' in review).toBe(false);
  });
});
