#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cropSourcePixels, encodePngs } from './plan2world-source-views.mjs';
import { readSourceRaster } from './source-raster.mjs';

/** @typedef {{label: string, question: string, focusBox: number[], contextBox: number[]}} ContextRegion */
/** @typedef {{schemaVersion: string, regions: ContextRegion[]}} ContextRequest */
/** @param {Uint8Array} bytes */
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
/** @param {string} value */
const escapeHtml = value => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** Validate explicit pixel selections, never detect rooms or infer adjacency.
 * @param {ContextRequest} request
 * @param {number} width
 * @param {number} height
 */
export function contextViewLayout(request, width, height) {
  if (![width, height].every(n => Number.isSafeInteger(n) && n > 0)
    || request?.schemaVersion !== 'plan2world-context-view-request-v1'
    || !Array.isArray(request.regions) || !request.regions.length || request.regions.length > 16) {
    throw new Error('Expected a context-view request with 1–16 regions and positive source dimensions.');
  }
  /** @param {number[]} box */
  const validBox = box => Array.isArray(box) && box.length === 4 && box.every(Number.isSafeInteger)
    && box[0] >= 0 && box[1] >= 0 && box[2] <= width && box[3] <= height && box[2] > box[0] && box[3] > box[1];
  return request.regions.map((region, index) => {
    if (!region || typeof region.label !== 'string' || !region.label.trim()
      || typeof region.question !== 'string' || !region.question.trim()
      || !validBox(region.focusBox) || !validBox(region.contextBox)) throw new Error('Each region needs a label, question and valid original-pixel boxes.');
    const f = region.focusBox, c = region.contextBox;
    if (c[0] > f[0] || c[1] > f[1] || c[2] < f[2] || c[3] < f[3] || c.every((n, i) => n === f[i])) {
      throw new Error('Context must contain the entire focus and include additional source pixels.');
    }
    const id = `region-${String(index + 1).padStart(2, '0')}`;
    return { id, label: region.label, question: region.question,
      views: [['context', c], ['focus', f]].map(([role, box]) => {
        const sourceBox = /** @type {number[]} */ (box);
        return { id: `${id}-${role}`, role: String(role), path: `${id}-${role}.png`, sourceBox: [...sourceBox],
          localToSource: { xOffset: sourceBox[0], yOffset: sourceBox[1], scale: 1 } };
      }) };
  });
}

/** @param {string} sourcePath @param {string} requestPath @param {string} outputPath */
export async function createContextSourceViews(sourcePath, requestPath, outputPath) {
  const [bytes, requestBytes] = await Promise.all([readFile(sourcePath), readFile(requestPath)]);
  const raster = await readSourceRaster(bytes), request = JSON.parse(requestBytes.toString());
  const regions = contextViewLayout(request, raster.width, raster.height);
  const overview = { id: 'overview', role: 'overview', path: 'overview.png', sourceBox: [0, 0, raster.width, raster.height],
    localToSource: { xOffset: 0, yOffset: 0, scale: 1 } };
  const descriptors = [overview, ...regions.flatMap(region => region.views)];
  const pixels = descriptors.map(view => cropSourcePixels(raster, view.sourceBox));
  const pngs = (await encodePngs(pixels)).map(png => Buffer.from(png, 'base64'));
  const files = descriptors.map((view, i) => ({ ...view, width: pixels[i].width, height: pixels[i].height,
    pixelScale: 1, sha256: hash(pngs[i]), rgbaSha256: hash(pixels[i].data) }));
  const manifest = { schemaVersion: 'plan2world-context-views-v1',
    source: { filename: basename(sourcePath), sha256: hash(bytes), width: raster.width, height: raster.height, rgbaSha256: hash(raster.data) },
    request: { filename: basename(requestPath), sha256: hash(requestBytes) },
    coordinates: 'original-image-pixels', boxConvention: '[left, top, right, bottom)',
    enhancement: 'none', rescaling: 'none', overview: files[0],
    regions: regions.map((region, i) => ({ ...region, views: files.slice(1 + i * 2, 3 + i * 2) })),
    limitation: 'Explicit source views only. A larger box does not prove architectural connectivity or missing construction.' };
  /** @param {typeof files[number]} view */
  const figure = view => `<figure><a href="${view.path}"><img src="${view.path}" alt="${view.id}"></a><figcaption>${view.role} · [${view.sourceBox.join(', ')}] · ${view.width}×${view.height}</figcaption></figure>`;
  const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Spatial context evidence</title><style>body{max-width:1400px;margin:24px auto;padding:0 16px;font:16px/1.5 system-ui;color:#213047;background:#f1f4f7}section{margin:24px 0}.pair{display:grid;grid-template-columns:2fr 1fr;gap:16px}figure{margin:0;background:white;padding:12px}img{display:block;width:100%;height:auto}figcaption{font-size:13px}.overview{max-width:900px}h2{overflow-wrap:anywhere}@media(max-width:800px){.pair{grid-template-columns:1fr}}</style><h1>Spatial context evidence · optional</h1><p>Read overview, context and detail together during the same architectural observation. All coordinates remain original pixels. No enhancement, architecture detection or inference. <a href="manifest.json">Manifest</a></p><div class="overview">${figure(files[0])}</div>${manifest.regions.map(region => `<section><h2>${escapeHtml(region.label)}</h2><p>${escapeHtml(region.question)}</p><div class="pair">${region.views.map(figure).join('')}</div></section>`).join('')}</html>\n`;
  const output = resolve(outputPath);
  await mkdir(dirname(output), { recursive: true }); await mkdir(output);
  for (let i = 0; i < files.length; i++) await writeFile(resolve(output, files[i].path), pngs[i], { flag: 'wx', mode: 0o444 });
  /** @type {[string, string | Buffer][]} */
  const outputs = [['request.json', requestBytes], ['manifest.json', JSON.stringify(manifest, null, 2) + '\n'], ['index.html', page]];
  for (const [name, data] of outputs) {
    await writeFile(resolve(output, name), data, { flag: 'wx', mode: 0o444 });
  }
  return manifest;
}

async function main() {
  const args = process.argv.slice(2);
  /** @type {Record<string, string>} */
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--source', '--request', '--output'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('Usage: --source original.jpg --request regions.json --output NEW_DIRECTORY');
    options[args[i]] = args[i + 1];
  }
  if (!options['--source'] || !options['--request'] || !options['--output']) throw new Error('Source, explicit region request and new directory are required.');
  const manifest = await createContextSourceViews(options['--source'], options['--request'], options['--output']);
  console.log(JSON.stringify({ output: resolve(options['--output']), source: manifest.source, regions: manifest.regions.length }, null, 2));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
