import { describe, expect, it } from 'vitest';
import { prepareArchitectureStage, assembleFrozenArchitecture } from '$lib/plan2world/architecture';
import { refineRasterWindows } from '$lib/plan2world/rasterArchitecture';
import { freezeRasterEvidence, inkReader, type SourceRasterPixels } from '$lib/plan2world/rasterWallContinuation';

function sample() {
  const data = new Uint8ClampedArray(200 * 200 * 4).fill(255), raster: SourceRasterPixels = { width: 200, height: 200, data };
  const rectangle = (a: number, b: number, c: number, d: number, value = 0) => {
    for (let y = b; y <= d; y++) for (let x = a; x <= c; x++) { const i = (y * 200 + x) * 4; data[i] = data[i + 1] = data[i + 2] = value; }
  };
  rectangle(20, 98, 180, 102); rectangle(177, 97, 183, 103);
  const decision = { decision: 'accept', decisionBasis: 'Synthetic source feature.', evidence: 'Synthetic architectural stroke.' };
  const architecture: any = { schemaVersion: 'source-architecture-v1', scaleEvidence: { kind: 'provided_length',
    realLengthCm: 800, endpoints: [{ x: 20, y: 20 }, { x: 180, y: 20 }], evidence: 'Synthetic length.' }, walls: [
    [{ x: 20, y: 20 }, { x: 180, y: 20 }], [{ x: 180, y: 20 }, { x: 180, y: 180 }],
    [{ x: 180, y: 180 }, { x: 20, y: 180 }], [{ x: 20, y: 180 }, { x: 20, y: 20 }],
    [{ x: 20, y: 100 }, { x: 176, y: 100 }],
  ].map(([start, end], i) => ({ label: `wall ${i}`, ...decision, start, end })), openings: [
    { label: 'upper window', ...decision, kind: 'window', endpoints: [{ x: 181, y: 30 }, { x: 181, y: 105 }] },
    { label: 'upper door', ...decision, kind: 'door', doorType: 'single', typeEvidence: 'Synthetic leaf.', endpoints: [{ x: 60, y: 20 }, { x: 80, y: 20 }] },
    { label: 'lower door', ...decision, kind: 'door', doorType: 'single', typeEvidence: 'Synthetic leaf.', endpoints: [{ x: 60, y: 180 }, { x: 80, y: 180 }] },
  ] };
  const furniture = { schemaVersion: 'source-furnishing-v1', furniture: [
    { sourceCategory: 'bed', position: { x: 70, y: 60 } }, { sourceCategory: 'desk', position: { x: 70, y: 140 } },
  ] };
  return { data, raster, rectangle, architecture, furniture };
}
const context = { sourceWidthPx: 200, sourceHeightPx: 200 };

describe('canonical raster refinement before final freeze', () => {
  it('combines accepted wall and zone extents for sampling without turning outlines into walls', () => {
    const { raster, architecture, furniture } = sample();
    const zone = (decision: string, lo: number, hi: number) => ({ label: decision, category: 'living', environment: 'indoor',
      position: { x: 100, y: 100 }, decision, evidence: 'Synthetic semantic extent.', decisionBasis: 'Synthetic extent.',
      boundary: [[lo, lo], [hi, lo], [hi, hi], [lo, hi]].map(([x, y]) => ({ point: { x, y }, kind: 'unknown', evidence: 'No solid-wall authority.' })) });
    architecture.functionalZones = [zone('accept', 10, 190), zone('uncertain', 0, 199)];
    architecture.walls.push({ ...architecture.walls[0], decision: 'reject', start: { x: 0, y: 0 }, end: { x: 199, y: 0 } });
    const before = JSON.stringify(architecture), stage = prepareArchitectureStage(architecture, context, furniture, raster);
    expect(stage.rasterEvidence?.backgroundEstimate?.bounds).toEqual({ minX: 10, minY: 10, maxX: 190, maxY: 190 });
    expect(stage.wallTrace.walls).toHaveLength(5);
    expect(stage.bareHouse.walls.every(w => [w.start, w.end].every(p => p.x >= 20 && p.x <= 180 && p.y >= 20 && p.y <= 180))).toBe(true);
    expect(JSON.stringify(architecture)).toBe(before);
  });

  it('keeps a window when normalization splits its facade just before the approximate jamb', () => {
    const { raster, architecture, furniture } = sample(); architecture.walls[4].end.x = 180;
    const before = JSON.stringify(architecture), stage = prepareArchitectureStage(architecture, context, furniture, raster);
    expect(stage.normalizedWindowReview?.audits[0]).toMatchObject({ status: 'bounded-normalized-junction-trim' });
    expect(stage.openingAudit[0].programStatus).toBe('assembled');
    expect(stage.architectureDraft.floors[0].windows).toHaveLength(1);
    expect(JSON.stringify(architecture)).toBe(before);
    expect(assembleFrozenArchitecture(stage, furniture).architectureUnchanged).toBe(true);
  });

  it.each(['blank', 'thin', 'disconnected'])('does not clamp a split-host window without connected solid pier evidence: %s', mode => {
    const { raster, rectangle, architecture, furniture } = sample(); architecture.walls[4].end.x = 180;
    rectangle(165, 90, 190, 110, 255);
    if (mode === 'thin') rectangle(165, 100, 183, 100);
    if (mode === 'disconnected') rectangle(177, 105, 183, 109);
    const stage = prepareArchitectureStage(architecture, context, furniture, raster);
    expect(stage.normalizedWindowReview?.audits[0].status).toBe('no-supported-junction-refinement');
    expect(stage.openingAudit[0].programStatus).toBe('unresolved-host');
  });
  it('shortens a window at a visible pier, closes the observed partition and replays exactly with no extra observation', () => {
    const { raster, architecture, furniture } = sample(), before = JSON.stringify({ architecture, furniture });
    const stage = prepareArchitectureStage(architecture, context, furniture, raster);
    expect(stage.windowRefinementReview?.audits[0]).toMatchObject({ status: 'bounded-solid-pier-trim', before: [{ x: 181, y: 30 }, { x: 181, y: 105 }] });
    expect(stage.closureReview?.accepted).toHaveLength(1);
    expect(stage.closureReview?.finalMetrics.furnishedRegionsWithEntrance).toBe(2);
    expect(stage.openingAudit.every(item => item.programStatus === 'assembled')).toBe(true);
    const result = assembleFrozenArchitecture(JSON.parse(JSON.stringify(stage)), furniture);
    expect(result.architectureUnchanged).toBe(true);
    expect(result.draft.floors[0].windows![0]).toMatchObject({ height: 280, sillHeight: 0 });
    expect(JSON.stringify({ architecture, furniture })).toBe(before);
    const again = prepareArchitectureStage(architecture, context, furniture, stage.rasterEvidence);
    expect(again).toEqual(stage);
    stage.annotationBase.openings![0].endpoints[1].y--;
    expect(() => assembleFrozenArchitecture(stage, furniture)).toThrow(/inconsistent/);
  });

  it.each(['blank', 'thin', 'door', 'interior'])('keeps an aperture unchanged without safe endpoint pier evidence: %s', mode => {
    const { raster, rectangle, architecture, furniture } = sample();
    if (mode === 'blank' || mode === 'thin') { rectangle(170, 90, 190, 110, 255); if (mode === 'thin') rectangle(180, 90, 180, 110); }
    if (mode === 'door') Object.assign(architecture.openings[0], { kind: 'door', doorType: 'single', typeEvidence: 'Visible leaf.' });
    if (mode === 'interior') architecture.openings[0].endpoints[1].y = 150;
    const stage = prepareArchitectureStage(architecture, context, furniture);
    const refined = refineRasterWindows(stage.wallTrace, stage.annotationBase, context, raster);
    expect(refined.annotation.openings).toEqual(stage.annotationBase.openings);
    expect(refined.review.audits.filter(a => a.status === 'bounded-solid-pier-trim')).toHaveLength(0);
  });

  it('freezes a lossless ink mask, validates it, and rejects mismatched original dimensions', () => {
    const { raster, architecture, furniture } = sample(), mask = freezeRasterEvidence(raster);
    expect(freezeRasterEvidence(mask)).toEqual(mask);
    expect(inkReader(mask).ink(180, 100)).toBe(true); expect(inkReader(mask).ink(180, 60)).toBe(false);
    expect(() => freezeRasterEvidence({ ...mask, runs: [0, 200 * 200 + 1] })).toThrow(/Invalid/);
    expect(() => prepareArchitectureStage(architecture, { ...context, sourceWidthPx: 201 }, furniture, raster)).toThrow(/match original/);
  });
});
