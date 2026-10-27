import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contextViewLayout, createContextSourceViews } from '../tooling/plan2world-context-views.mjs';
import { cropSourcePixels } from '../tooling/plan2world-source-views.mjs';
import { readSourceRaster } from '../tooling/source-raster.mjs';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const request = { schemaVersion: 'plan2world-context-view-request-v1', regions: [{ label: '<boundary>', question: 'Both sides?', focusBox: [1, 1, 3, 3], contextBox: [0, 0, 4, 4] }] };

describe('optional spatial-context evidence', () => {
  it('rejects clipped, unchanged, fractional or out-of-source contexts without inferring replacements', () => {
    for (const contextBox of [[2, 0, 4, 4], [1, 1, 3, 3], [0, 0, 5, 4], [0, 0.5, 4, 4]]) {
      expect(() => contextViewLayout({ ...request, regions: [{ ...request.regions[0], contextBox }] }, 4, 4)).toThrow();
    }
    expect(() => contextViewLayout({ ...request, regions: [] }, 4, 4)).toThrow();
    const before = structuredClone(request);
    const layout = contextViewLayout(request, 4, 4);
    layout[0].views[0].sourceBox[0] = 1;
    expect(request).toEqual(before);
  });

  it('preserves overview/context/detail pixels and local translations, freezes provenance and refuses overwrites', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'p2w-context-views-'));
    const input = 'tests/fixtures/underlay-orientation.png', bytes = await readFile(input);
    try {
      const original = await readSourceRaster(bytes), requestPath = join(directory, 'request.json');
      const selection = { ...request, regions: [{ ...request.regions[0], focusBox: [1, 1, original.width - 1, original.height - 1], contextBox: [0, 0, original.width, original.height] }] };
      await writeFile(requestPath, JSON.stringify(selection));
      const output = join(directory, 'views'), manifest = await createContextSourceViews(input, requestPath, output);
      expect(manifest.source.sha256).toBe(hash(bytes));
      expect(manifest.request.sha256).toBe(hash(await readFile(requestPath)));
      expect(await readFile(join(output, 'request.json'))).toEqual(await readFile(requestPath));
      for (const view of [manifest.overview, ...manifest.regions[0].views]) {
        const png = await readFile(join(output, view.path)), decoded = await readSourceRaster(png);
        expect(decoded.data).toEqual(cropSourcePixels(original, view.sourceBox).data);
        expect(hash(png)).toBe(view.sha256);
        expect(hash(decoded.data)).toBe(view.rgbaSha256);
        expect(view.localToSource).toEqual({ xOffset: view.sourceBox[0], yOffset: view.sourceBox[1], scale: 1 });
      }
      expect(await readFile(input)).toEqual(bytes);
      expect((await readFile(join(output, 'index.html'), 'utf8'))).toContain('&lt;boundary&gt;');
      const frozen = await readFile(join(output, 'manifest.json'));
      await expect(createContextSourceViews(input, requestPath, output)).rejects.toThrow(/EEXIST/);
      expect(await readFile(join(output, 'manifest.json'))).toEqual(frozen);
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 30_000);
});
