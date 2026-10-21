import { describe, expect, it } from 'vitest';
import { reviewRasterWallContinuations, type SourceRasterPixels } from '$lib/plan2world/rasterWallContinuation';
import type { SourceWallTraceV1 } from '$lib/plan2world/bareHouse';
import type { SourceAnnotationV1 } from '$lib/plan2world/reconstructionAssembly';

function sample(inverted = false) {
  const raster: SourceRasterPixels = { width: 300, height: 240, data: new Uint8ClampedArray(300 * 240 * 4) };
  const data = raster.data as Uint8ClampedArray;
  for (let i = 0; i < data.length; i += 4) { data[i] = data[i + 1] = data[i + 2] = inverted ? 0 : 255; data[i + 3] = 255; }
  const rectangle = (x1: number, y1: number, x2: number, y2: number, ink = true) => {
    const value = (ink !== inverted) ? 0 : 255;
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      const i = (y * raster.width + x) * 4; data[i] = data[i + 1] = data[i + 2] = value;
    }
  };
  rectangle(20, 118, 130, 122); rectangle(128, 30, 132, 210);
  const trace: SourceWallTraceV1 = { schemaVersion: 'source-wall-trace-v1', walls: [
    { start: { x: 20, y: 120 }, end: { x: 90, y: 120 } },
    { start: { x: 130, y: 30 }, end: { x: 130, y: 210 } },
  ] };
  const annotation: SourceAnnotationV1 = { schemaVersion: 'source-annotation-v1',
    scaleEvidence: { kind: 'provided_length', realLengthCm: 300, endpoints: [{ x: 20, y: 120 }, { x: 90, y: 120 }], evidence: 'Synthetic reference.' },
    openings: [], furniture: [] };
  return { raster, rectangle, trace, annotation };
}

describe('deterministic source-raster continuation experiment', () => {
  it.each([false, true])('finds a continuous observed-wall extension with inverted background=%s', inverted => {
    const { raster, trace, annotation } = sample(inverted), before = JSON.stringify({ trace, annotation });
    const result = reviewRasterWallContinuations(trace, annotation, raster);
    expect(result.llmCalls).toBe(0); expect(result.geometryChanged).toBe(false);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toMatchObject({ from: { x: 90, y: 120 }, to: { x: 130, y: 120 }, coverage: 1 });
    expect(result.raster.polarity).toBe(inverted ? 'light-on-dark' : 'dark-on-light');
    expect(JSON.stringify({ trace, annotation })).toBe(before);
    expect(reviewRasterWallContinuations(trace, annotation, raster)).toEqual(result);
  });

  it('rejects a blank gap instead of extrapolating across empty floor', () => {
    const { raster, rectangle, trace, annotation } = sample(); rectangle(104, 110, 116, 130, false);
    expect(reviewRasterWallContinuations(trace, annotation, raster).suggestions).toEqual([]);
  });

  it('rejects thin furniture-like continuation strokes after a thick wall ends', () => {
    const { raster, rectangle, trace, annotation } = sample();
    rectangle(94, 113, 125, 127, false); rectangle(94, 120, 125, 120);
    expect(reviewRasterWallContinuations(trace, annotation, raster).suggestions).toEqual([]);
  });

  it('retains an observed aperture even if the raster has a solid line across it', () => {
    const { raster, trace, annotation } = sample();
    annotation.openings!.push({ kind: 'door', endpoints: [{ x: 106, y: 120 }, { x: 124, y: 120 }], evidence: 'Observed aperture takes precedence over an unclassified stroke.' });
    const result = reviewRasterWallContinuations(trace, annotation, raster);
    expect(result.suggestions).toEqual([]);
    expect(result.candidates.some(c => c.status === 'observed-opening-conflict')).toBe(true);
  });

  it('does not connect a wall through a furniture anchor', () => {
    const { raster, trace, annotation } = sample(); annotation.furniture!.push({ sourceCategory: 'chair', position: { x: 110, y: 120 } });
    const result = reviewRasterWallContinuations(trace, annotation, raster);
    expect(result.suggestions).toEqual([]);
    expect(result.candidates.some(c => c.status === 'furniture-anchor-conflict')).toBe(true);
  });

  it('does not propose a wall already present in the observation', () => {
    const { raster, trace, annotation } = sample(); trace.walls.push({ start: { x: 90, y: 120 }, end: { x: 130, y: 120 } });
    const result = reviewRasterWallContinuations(trace, annotation, raster);
    expect(result.suggestions).toEqual([]);
    expect(result.candidates.some(c => c.status === 'already-covered-by-observed-wall')).toBe(true);
  });

  it('does not search beyond the bounded raster-relative extension distance', () => {
    const { raster, rectangle, trace, annotation } = sample();
    rectangle(128, 20, 132, 220, false); rectangle(20, 118, 220, 122); rectangle(218, 30, 222, 210);
    trace.walls[1] = { start: { x: 220, y: 30 }, end: { x: 220, y: 210 } };
    expect(reviewRasterWallContinuations(trace, annotation, raster).suggestions).toEqual([]);
  });

  it('keeps equally supported distinct boundary choices ambiguous', () => {
    const { raster, rectangle, trace, annotation } = sample();
    rectangle(20, 117, 140, 123); rectangle(128, 30, 132, 119); rectangle(130, 121, 134, 210);
    trace.walls[1] = { start: { x: 130, y: 30 }, end: { x: 130, y: 120 } };
    trace.walls.push({ start: { x: 132, y: 120 }, end: { x: 132, y: 210 } });
    const result = reviewRasterWallContinuations(trace, annotation, raster);
    expect(result.suggestions).toEqual([]);
    expect(result.candidates.some(c => c.status === 'ambiguous-target')).toBe(true);
  });

  it('excludes curved seed observations and rejects malformed raster buffers', () => {
    const { raster, trace, annotation } = sample(); trace.walls[0].curvePoint = { x: 45, y: 100 };
    expect(reviewRasterWallContinuations(trace, annotation, raster).suggestions).toEqual([]);
    expect(() => reviewRasterWallContinuations(trace, annotation, { ...raster, data: [] })).toThrow(/RGBA/);
  });
});
