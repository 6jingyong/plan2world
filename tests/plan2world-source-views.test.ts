import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sourceViewLayout, cropSourcePixels, createSourceViews } from '../tooling/plan2world-source-views.mjs';
import { readSourceRaster } from '../tooling/source-raster.mjs';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

describe('experimental original-pixel evidence views', () => {
  it('partitions odd dimensions exactly once while overlap stays clipped to the source', () => {
    const width = 17, height = 11, views = sourceViewLayout(width, height, { columns: 3, rows: 2, overlapPx: 2 });
    const owners = new Uint8Array(width * height);
    for (const { coreBox, sourceBox } of views) {
      const [left, top, right, bottom] = coreBox;
      expect(sourceBox[0]).toBeGreaterThanOrEqual(0);
      expect(sourceBox[1]).toBeGreaterThanOrEqual(0);
      expect(sourceBox[2]).toBeLessThanOrEqual(width);
      expect(sourceBox[3]).toBeLessThanOrEqual(height);
      expect(sourceBox[0]).toBeLessThanOrEqual(left);
      expect(sourceBox[1]).toBeLessThanOrEqual(top);
      expect(sourceBox[2]).toBeGreaterThanOrEqual(right);
      expect(sourceBox[3]).toBeGreaterThanOrEqual(bottom);
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) owners[y * width + x]++;
    }
    expect([...owners].every(count => count === 1)).toBe(true);
    expect(views[0]).toEqual({ id: 'r1-c1', coreBox: [0, 0, 5, 5], sourceBox: [0, 0, 7, 7] });
    expect(views.at(-1)).toEqual({ id: 'r2-c3', coreBox: [11, 5, 17, 11], sourceBox: [9, 3, 17, 11] });
    expect(sourceViewLayout(width, height, { columns: 3, rows: 2, overlapPx: 2 })).toEqual(views);
  });

  it('copies exact RGBA pixels in source orientation without changing the input', () => {
    const data = Buffer.from(Array.from({ length: 4 * 3 * 4 }, (_, i) => i));
    const before = Buffer.from(data);
    const crop = cropSourcePixels({ width: 4, height: 3, data }, [1, 1, 3, 3]);
    expect(crop).toMatchObject({ width: 2, height: 2 });
    expect(crop.data).toEqual(Buffer.concat([data.subarray(20, 28), data.subarray(36, 44)]));
    expect(data).toEqual(before);
  });

  it.each([
    [0, 10, {}], [10, 10, { columns: 11 }], [10, 10, { overlapPx: -1 }], [10, 10, { rows: 1.5 }],
  ])('rejects empty, noninteger or out-of-source grid requests', (width, height, options) => {
    expect(() => sourceViewLayout(width, height, options)).toThrow(/positive integers/);
  });

  it('keeps a one-cell or zero-overlap view on the full original coordinate grid', () => {
    expect(sourceViewLayout(7, 5, { columns: 1, rows: 1, overlapPx: 0 })).toEqual([
      { id: 'r1-c1', coreBox: [0, 0, 7, 5], sourceBox: [0, 0, 7, 5] },
    ]);
    const source = { width: 7, height: 5, data: Buffer.alloc(7 * 5 * 4) };
    expect(() => cropSourcePixels(source, [-1, 0, 7, 5])).toThrow(/Invalid original-pixel crop/);
    expect(() => cropSourcePixels(source, [0, 0, 7.5, 5])).toThrow(/Invalid original-pixel crop/);
  });

  it('writes stable lossless images with verified provenance and refuses to overwrite a run', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'p2w-source-views-'));
    const input = 'tests/fixtures/underlay-orientation.png', bytes = await readFile(input);
    const options = { columns: 2, rows: 2, overlapPx: 1 };
    try {
      const first = await createSourceViews(input, join(directory, 'first'), options);
      const repeat = await createSourceViews(input, join(directory, 'repeat'), options);
      expect(repeat).toEqual(first);
      expect(first.source.sha256).toBe(hash(bytes));
      expect(await readFile(input)).toEqual(bytes);
      const original = await readSourceRaster(bytes);
      for (const view of [first.overview, ...first.views]) {
        const png = await readFile(join(directory, 'first', view.path));
        expect(png).toEqual(await readFile(join(directory, 'repeat', view.path)));
        expect(hash(png)).toBe(view.sha256);
        const decoded = await readSourceRaster(png);
        expect(decoded.width).toBe(view.width);
        expect(decoded.height).toBe(view.height);
        expect(decoded.data).toEqual(cropSourcePixels(original, view.sourceBox).data);
        expect(hash(decoded.data)).toBe(view.rgbaSha256);
      }
      expect(first.overview.rgbaSha256).toBe(first.source.rgbaSha256);
      const manifest = await readFile(join(directory, 'first/manifest.json'));
      await expect(createSourceViews(input, join(directory, 'first'), options)).rejects.toThrow(/EEXIST/);
      expect(await readFile(join(directory, 'first/manifest.json'))).toEqual(manifest);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30_000);
});
