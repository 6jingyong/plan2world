#!/usr/bin/env node
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const options = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (!['--stage', '--review', '--source', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Expected --review centerline-diagnostic.json --source original.jpg --output new-dir (or --stage for historical evidence)');
  options[args[i].slice(2)] = args[i + 1];
}
if (Boolean(options.stage) === Boolean(options.review) || !options.source || !options.output) throw new Error('Provide one review or historical stage, plus source and output.');
const stageBytes = await readFile(resolve(options.review ?? options.stage)), sourceBytes = await readFile(resolve(options.source));
const stage = JSON.parse(stageBytes), output = resolve(options.output);
if (!stage.centerlineReview || !stage.rasterEvidence) throw new Error('No centerline diagnostic. Generate an explicit read-only review first; default generation disables centerlines.');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const pictures = await page.evaluate(async ({ stage, source }) => {
    const e = stage.rasterEvidence, review = stage.centerlineReview, a = review.analysis;
    const original = new Image(); original.src = source; await original.decode();
    if (original.naturalWidth !== e.width || original.naturalHeight !== e.height) throw new Error('Source dimensions mismatch.');
    const images = [];
    const canvas = () => { const c = document.createElement('canvas'); c.width = e.width; c.height = e.height; return c; };
    const decode = (runs, width, height) => { const m = new Uint8Array(width * height); let p = 0; runs.forEach((r, i) => { if (i % 2) m.fill(1, p, p + r); p += r; }); return m; };
    const save = (name, c) => images.push({ name, png: c.toDataURL('image/png').split(',')[1] });
    const base = () => { const c = canvas(), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.globalAlpha = 0.48; x.drawImage(original, 0, 0); x.globalAlpha = 1; return c; };
    for (const layer of [{ contrast: 95, runs: e.runs }, ...(e.layers ?? [])].sort((a, b) => a.contrast - b.contrast)) {
      const c = canvas(), x = c.getContext('2d'), data = x.createImageData(c.width, c.height), m = decode(layer.runs, c.width, c.height);
      for (let i = 0; i < m.length; i++) { const v = m[i] ? 0 : 255; data.data.set([v, v, v, 255], i * 4); }
      x.putImageData(data, 0, 0); save(`threshold-${layer.contrast}.png`, c);
    }
    for (const [name, runs, color] of [ ['furniture-weights.png', a.furnitureSuppressionRuns, '#ef4444'],
      ['boundaries.png', a.boundaryRuns, '#0f766e'], ['centerline-ridges.png', a.ridgeRuns, '#7c3aed'] ]) {
      const c = base(), x = c.getContext('2d'), mask = decode(runs, a.width, a.height); x.fillStyle = color;
      for (let i = 0; i < mask.length; i++) if (mask[i]) x.fillRect((i % a.width) * a.sourcePixelsPerCell, Math.floor(i / a.width) * a.sourcePixelsPerCell, a.sourcePixelsPerCell, a.sourcePixelsPerCell);
      if (name === 'furniture-weights.png') for (const f of stage.furnishingEvidence?.furniture ?? []) {
        x.strokeStyle = '#1d4ed8'; x.lineWidth = 1; x.beginPath(); x.arc(f.position.x, f.position.y, 3, 0, Math.PI * 2); x.stroke();
      }
      save(name, c);
    }
    const c = base(), x = c.getContext('2d');
    const line = (w, color, width, dash = []) => { x.strokeStyle = color; x.lineWidth = width; x.setLineDash(dash); x.beginPath(); x.moveTo(w.start.x, w.start.y); x.lineTo(w.end.x, w.end.y); x.stroke(); };
    for (const audit of review.audits) {
      if (audit.before.curvePoint) continue;
      line(audit.before, '#ea580c', 1.4, [4, 3]);
      if (audit.status === 'selected') line(review.finalTrace?.walls[audit.sourceWallIndex] ?? audit.after, '#0284c7', 2);
      if (audit.status === 'unapproved-candidate') line(audit.fit, '#7c3aed', 2, [3, 3]);
    }
    for (const m of review.openingMoves ?? []) line({ start: m.after[0], end: m.after[1] }, '#16a34a', 3);
    save(review.mode === 'read-only' ? 'centerline-candidates.png' : 'centerline-fits.png', c); return images;
  }, { stage, source: `data:${sourceBytes[0] === 0xff ? 'image/jpeg' : 'image/png'};base64,${sourceBytes.toString('base64')}` });
  const decisions = stage.centerlineReview.audits.reduce((a, item) => { a[item.status] = (a[item.status] ?? 0) + 1; return a; }, {});
  const provenance = { mode: 'read-only-frozen-evidence-render', inputKind: options.review ? 'diagnostic' : 'historical-stage',
    geometryChanged: false, candidateLinesAreUnapproved: stage.centerlineReview.mode === 'read-only', sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
    stageSha256: createHash('sha256').update(stageBytes).digest('hex'), decisions, files: pictures.map(p => p.name) };
  for (const name of [...pictures.map(p => p.name), 'render-provenance.json']) if (await access(resolve(output, name)).then(() => true, () => false)) throw new Error(`Refusing overwrite: ${name}`);
  for (const p of pictures) await writeFile(resolve(output, p.name), Buffer.from(p.png, 'base64'), { flag: 'wx', mode: 0o444 });
  await writeFile(resolve(output, 'render-provenance.json'), JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  console.log(JSON.stringify({ output, ...provenance }, null, 2));
} finally { await browser.close(); }
