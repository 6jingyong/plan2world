#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { readSourceRaster } from './source-raster.mjs';

/** @typedef {{columns?: number, rows?: number, overlapPx?: number}} LayoutOptions */
/** @typedef {{width: number, height: number, data: Uint8Array}} SourcePixels */
/** @typedef {{id: string, coreBox: number[], sourceBox: number[], path: string, width: number, height: number, pixelScale: number, sha256: string, rgbaSha256: string}} SourceView */

/** @param {Uint8Array} bytes */
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Pixel partitions only: no architecture detection, resizing or fitted bounds.
 * @param {number} width
 * @param {number} height
 * @param {LayoutOptions} options
 */
export function sourceViewLayout(width, height, { columns = 3, rows = 3, overlapPx = 32 } = {}) {
  if (![width, height, columns, rows].every(n => Number.isSafeInteger(n) && n > 0)
    || columns > width || rows > height || !Number.isSafeInteger(overlapPx) || overlapPx < 0) {
    throw new Error('Source size and grid must be positive integers with nonempty cells; overlap must be nonnegative integer pixels.');
  }
  return Array.from({ length: rows * columns }, (_, index) => {
    const row = Math.floor(index / columns), column = index % columns;
    const coreBox = [Math.floor(column * width / columns), Math.floor(row * height / rows),
      Math.floor((column + 1) * width / columns), Math.floor((row + 1) * height / rows)];
    return { id: `r${row + 1}-c${column + 1}`, coreBox,
      sourceBox: [Math.max(0, coreBox[0] - overlapPx), Math.max(0, coreBox[1] - overlapPx),
        Math.min(width, coreBox[2] + overlapPx), Math.min(height, coreBox[3] + overlapPx)] };
  });
}

/** @param {SourcePixels} raster
 * @param {number[]} box
 */
export function cropSourcePixels(raster, box) {
  const [left, top, right, bottom] = box;
  if (box.length !== 4 || !box.every(Number.isSafeInteger) || left < 0 || top < 0
    || right > raster.width || bottom > raster.height || right <= left || bottom <= top
    || raster.data.length !== raster.width * raster.height * 4) throw new Error('Invalid original-pixel crop.');
  const width = right - left, height = bottom - top, data = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((top + row) * raster.width + left) * 4;
    data.set(raster.data.subarray(from, from + width * 4), row * width * 4);
  }
  return { width, height, data };
}

/** @param {{width: number, height: number, data: Buffer}[]} pictures */
export async function encodePngs(pictures) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    return await page.evaluate(async pictures => {
      const results = [];
      for (const { width, height, rgba } of pictures) {
        const bytes = Uint8ClampedArray.from(atob(rgba), c => c.charCodeAt(0));
        const canvas = new OffscreenCanvas(width, height);
        const context = /** @type {OffscreenCanvasRenderingContext2D} */ (canvas.getContext('2d'));
        context.putImageData(new ImageData(bytes, width, height), 0, 0);
        const png = new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
        const chunks = [];
        for (let i = 0; i < png.length; i += 8192) chunks.push(String.fromCharCode(...png.subarray(i, i + 8192)));
        results.push(btoa(chunks.join('')));
      }
      return results;
    }, pictures.map(p => ({ width: p.width, height: p.height, rgba: p.data.toString('base64') })));
  } finally { await browser.close(); }
}

/** @param {{layout: {columns: number}, source: {sha256: string}, overview: SourceView, views: SourceView[]}} manifest */
function reviewPage(manifest) {
  /** @param {SourceView} view */
  const figure = view => `<figure><a href="${view.path}"><img src="${view.path}" alt="${view.id}"></a><figcaption>${view.id} · sourceBox [${view.sourceBox.join(', ')}] · ${view.width} × ${view.height} px</figcaption></figure>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plan2World source views</title><style>body{max-width:1500px;margin:24px auto;padding:0 16px;font:16px/1.5 system-ui;color:#213047;background:#f1f4f7}h1{font-size:26px}figure{margin:0;background:white;padding:12px;border:1px solid #d4dce5}img{display:block;width:100%;height:auto}figcaption{font-size:13px;overflow-wrap:anywhere}.overview{max-width:900px;margin:20px auto}.grid{display:grid;grid-template-columns:repeat(${manifest.layout.columns},minmax(0,1fr));gap:16px}@media(max-width:700px){.grid{grid-template-columns:1fr}}</style><h1>Source evidence views · experimental</h1><p>No enhancement, rescaling, geometry detection or model call. All observations must use original-image pixels. Boxes are [left, top, right, bottom), with the right/bottom edges excluded. Overlap supplies context; each coreBox owns a separate source region. Click an image for its original pixel dimensions.</p><p>Source SHA-256: ${manifest.source.sha256} · <a href="manifest.json">manifest.json</a></p><section class="overview">${figure(manifest.overview)}</section><section class="grid">${manifest.views.map(figure).join('')}</section></html>\n`;
}

/** @param {string} sourcePath
 * @param {string} outputPath
 * @param {LayoutOptions} options
 */
export async function createSourceViews(sourcePath, outputPath, options = {}) {
  const bytes = await readFile(sourcePath), output = resolve(outputPath);
  const raster = await readSourceRaster(bytes);
  const { columns = 3, rows = 3, overlapPx = 32 } = options, layout = { columns, rows, overlapPx };
  const views = sourceViewLayout(raster.width, raster.height, layout);
  const overview = { id: 'overview', coreBox: [0, 0, raster.width, raster.height], sourceBox: [0, 0, raster.width, raster.height] };
  // A fresh directory prevents overwriting either a complete or a partial run.
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
  const descriptors = [overview, ...views], pixels = descriptors.map(view => cropSourcePixels(raster, view.sourceBox));
  const pngs = (await encodePngs(pixels)).map(png => Buffer.from(png, 'base64'));
  const files = descriptors.map((view, i) => ({ ...view, path: `${view.id}.png`, width: pixels[i].width, height: pixels[i].height,
    pixelScale: 1, sha256: hash(pngs[i]), rgbaSha256: hash(pixels[i].data) }));
  const manifest = { schemaVersion: 'plan2world-source-views-v1',
    source: { filename: basename(sourcePath), sha256: hash(bytes), width: raster.width, height: raster.height, rgbaSha256: hash(raster.data) },
    coordinates: 'original-image-pixels', boxConvention: '[left, top, right, bottom)',
    layout, enhancement: 'none', rescaling: 'none', overview: files[0], views: files.slice(1) };
  for (let i = 0; i < files.length; i++) await writeFile(resolve(output, files[i].path), pngs[i], { flag: 'wx', mode: 0o444 });
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  await writeFile(resolve(output, 'index.html'), reviewPage(manifest), { flag: 'wx', mode: 0o444 });
  return manifest;
}

async function main() {
  const args = process.argv.slice(2);
  /** @type {Record<string, string>} */
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--source', '--output', '--grid', '--overlap'].includes(args[i]) || !args[i + 1] || options[args[i]] !== undefined) {
      throw new Error('Usage: --source original.jpg --output NEW_DIRECTORY [--grid 3x3] [--overlap 32]');
    }
    options[args[i]] = args[i + 1];
  }
  if (!options['--source'] || !options['--output']) throw new Error('Source and new output directory are required.');
  const grid = /^(\d+)x(\d+)$/.exec(options['--grid'] ?? '3x3');
  if (!grid) throw new Error('Grid must be columns x rows, e.g. 3x3.');
  const manifest = await createSourceViews(resolve(options['--source']), options['--output'], {
    columns: Number(grid[1]), rows: Number(grid[2]), overlapPx: Number(options['--overlap'] ?? 32),
  });
  console.log(JSON.stringify({ output: resolve(options['--output']), source: manifest.source, views: manifest.views.length }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
