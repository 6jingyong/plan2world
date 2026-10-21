import { describe, expect, it } from 'vitest';
import { freezeRasterEvidence, inkReader, type SourceRasterPixels } from '$lib/plan2world/rasterWallContinuation';
import { rasterSamplingBounds } from '$lib/plan2world/rasterBackground';

function image(background: number, width = 240, height = 160) {
  const data = new Uint8ClampedArray(width * height * 4);
  const paint = (x1: number, y1: number, x2: number, y2: number, value: number) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
    }
  };
  paint(0, 0, width - 1, height - 1, background);
  return { raster: { width, height, data } satisfies SourceRasterPixels, paint };
}

describe('source-raster background estimation', () => {
  it.each([false, true])('ignores an opposite-colour photo frame, inverted=%s', inverted => {
    const bg = inverted ? 0 : 255, fg = 255 - bg;
    const { raster, paint } = image(bg);
    // All four outer edges are misleading, not only the two edges in case 05.
    paint(0, 0, 239, 2, fg); paint(0, 157, 239, 159, fg);
    paint(0, 0, 2, 159, fg); paint(237, 0, 239, 159, fg);
    paint(80, 30, 85, 130, fg);
    const before = new Uint8ClampedArray(raster.data), mask = freezeRasterEvidence(raster), reader = inkReader(mask);
    expect(mask.polarity).toBe(inverted ? 'light-on-dark' : 'dark-on-light');
    expect(mask.backgroundEstimate?.status).toBe('resolved');
    expect(reader.ink(82, 80)).toBe(true); expect(reader.ink(150, 80)).toBe(false);
    expect(raster.data).toEqual(before);
  });

  it('samples the architectural extent of a dark CAD drawing on a large white page', () => {
    const { raster, paint } = image(255);
    paint(70, 40, 170, 120, 0); paint(100, 50, 104, 110, 255);
    const bounds = { minX: 70, minY: 40, maxX: 170, maxY: 120 };
    const mask = freezeRasterEvidence(raster, bounds);
    expect(mask.polarity).toBe('light-on-dark');
    expect(mask.backgroundEstimate).toMatchObject({ scope: 'architecture-bounds', bounds, status: 'resolved' });
    expect(inkReader(mask).ink(102, 80)).toBe(true);
    expect(inkReader(mask).ink(130, 80)).toBe(false);
  });

  it('uses the extent only for sampling, retaining real pixels outside that extent', () => {
    const { raster, paint } = image(255); paint(10, 60, 13, 100, 0);
    const mask = freezeRasterEvidence(raster, { minX: 60, minY: 30, maxX: 180, maxY: 130 });
    expect(mask.width).toBe(240); expect(mask.height).toBe(160);
    expect(inkReader(mask).ink(11, 80)).toBe(true);
  });

  it.each(['mixed', 'mid-grey'])('disables all contrast masks when polarity lacks support: %s', kind => {
    const { raster, paint } = image(kind === 'mixed' ? 255 : 128);
    if (kind === 'mixed') paint(0, 0, 119, 159, 0);
    const mask = freezeRasterEvidence(raster);
    expect(mask.backgroundEstimate?.status).toBe('ambiguous');
    expect(mask.runs).toEqual([240 * 160]);
    expect(mask.layers?.every(layer => layer.runs.length === 1)).toBe(true);
    expect(freezeRasterEvidence(mask)).toEqual(mask);
  });

  it('falls back safely when the optional extent is degenerate or outside the image', () => {
    const { raster } = image(255);
    for (const bounds of [{ minX: 10, minY: 10, maxX: 10, maxY: 20 },
      { minX: -5, minY: 0, maxX: 100, maxY: 100 }]) {
      expect(freezeRasterEvidence(raster, bounds).backgroundEstimate?.scope).toBe('image-interior');
    }
    expect(rasterSamplingBounds([])).toBeUndefined();
  });

  it('composites transparent pixels onto white before choosing polarity', () => {
    const { raster, paint } = image(0);
    for (let i = 3; i < raster.data.length; i += 4) raster.data[i] = 0;
    paint(80, 30, 85, 130, 0);
    const mask = freezeRasterEvidence(raster);
    expect(mask.polarity).toBe('dark-on-light'); expect(mask.background).toBe(255);
    expect(inkReader(mask).ink(82, 80)).toBe(true);
  });

  it('keeps legacy frozen pixels unchanged even when a new extent is supplied', () => {
    const legacy = { schemaVersion: 'source-ink-mask-v1' as const, width: 20, height: 20,
      polarity: 'light-on-dark', background: 87, runs: [20, 5, 375] };
    expect(freezeRasterEvidence(legacy, { minX: 0, minY: 0, maxX: 20, maxY: 20 })).toEqual(legacy);
    expect(inkReader(legacy).ink(2, 1)).toBe(true);
  });

  it('rejects invalid new metadata and ambiguous masks containing foreground', () => {
    const { raster } = image(128), mask = freezeRasterEvidence(raster);
    expect(() => freezeRasterEvidence({ ...mask, backgroundEstimate: { ...mask.backgroundEstimate!, sampleCount: 0 } })).toThrow(/Invalid/);
    expect(() => freezeRasterEvidence({ ...mask, runs: [0, 1, 240 * 160 - 1] })).toThrow(/Invalid/);
  });
});
