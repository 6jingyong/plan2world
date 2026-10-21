#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const options = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (!['--stage', '--source', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: --stage frozen-stage.json --source original.jpg --output new-directory');
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.stage || !options.source || !options.output) throw new Error('Provide frozen stage, original raster and a new output directory.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const server = await createServer({ root, configFile: false, logLevel: 'error', resolve: { alias: { '$lib': resolve(root, 'src/lib') } },
  optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
let browser;
try {
  const [{ prepareArchitectureStage }, { reviewRasterWallContinuations }, { buildBareHouse }, { assemblePlan2WorldDraftWithReview },
    { draftToProject }, { analyzeFloor }, { pointInPolygon }] = await Promise.all([
    server.ssrLoadModule('/src/lib/plan2world/architecture.ts'), server.ssrLoadModule('/src/lib/plan2world/rasterWallContinuation.ts'),
    server.ssrLoadModule('/src/lib/plan2world/bareHouse.ts'), server.ssrLoadModule('/src/lib/plan2world/reconstructionAssembly.ts'),
    server.ssrLoadModule('/src/lib/plan2world/draft.ts'), server.ssrLoadModule('/src/lib/utils/floorAnalysis.ts'),
    server.ssrLoadModule('/src/lib/utils/hitTesting.ts'),
  ]);
  const stageBytes = await readFile(resolve(options.stage)), sourceBytes = await readFile(resolve(options.source)), stage = JSON.parse(stageBytes);
  if (JSON.stringify(prepareArchitectureStage(stage.architecture, stage.sourceContext, stage.furnishingEvidence, stage.rasterEvidence)) !== JSON.stringify(stage)) {
    throw new Error('Frozen stage no longer matches its observations and current deterministic code.');
  }
  // Browser is a local image decoder only; no app/provider/API is opened.
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const mime = sourceBytes[0] === 0xff ? 'image/jpeg' : sourceBytes[0] === 0x89 ? 'image/png' : 'image/webp';
  const decoded = await page.evaluate(async url => {
    const image = new Image(); image.src = url; await image.decode();
    if (image.naturalWidth * image.naturalHeight > 24_000_000) throw new Error('Source raster exceeds the experimental pixel budget.');
    const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight), context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data, chunks = [];
    for (let i = 0; i < pixels.length; i += 8192) chunks.push(String.fromCharCode(...pixels.subarray(i, i + 8192)));
    return { width: canvas.width, height: canvas.height, rgba: btoa(chunks.join('')) };
  }, `data:${mime};base64,${sourceBytes.toString('base64')}`);
  await browser.close(); browser = undefined;
  if (decoded.width !== stage.sourceContext.sourceWidthPx || decoded.height !== stage.sourceContext.sourceHeightPx) throw new Error('Original raster dimensions differ from the frozen stage.');
  const raster = { width: decoded.width, height: decoded.height, data: Buffer.from(decoded.rgba, 'base64') };
  const annotation = { ...stage.annotationBase, furniture: stage.furnishingEvidence?.furniture ?? [],
    assumptions: [...(stage.annotationBase.assumptions ?? []), ...(stage.furnishingEvidence?.assumptions ?? [])] };
  const originalTrace = stage.closureReview?.normalizationInput ?? stage.wallTrace;
  const review = reviewRasterWallContinuations(originalTrace, annotation, raster);
  function evaluate(trace) {
    const assembled = assemblePlan2WorldDraftWithReview(buildBareHouse(trace), annotation, stage.sourceContext);
    const floor = draftToProject(assembled.draft).floors[0], analysis = analyzeFloor(floor), occupied = new Set();
    const memberships = floor.furniture.map(item => analysis.rooms.flatMap((room, index) => !room.floorOpening
      && pointInPolygon(item.position, analysis.polygons.get(room.id) ?? [])
      && !(analysis.holes.get(room.id) ?? []).some(hole => pointInPolygon(item.position, hole)) ? [index] : []));
    for (const group of memberships) for (const i of group) occupied.add(i);
    const entrances = new Set(analysis.rooms.flatMap((room, i) => floor.doors.some(d => room.walls.includes(d.wallId)) ? [i] : []));
    return { draft: assembled.draft, metrics: { nativeRegions: analysis.rooms.length, matchedOpenings: assembled.openingReview.sourceIntervals.length,
      uncontainedAnchors: memberships.filter(m => !m.length).length, overlappingAnchors: memberships.filter(m => m.length > 1).length,
      furnishedRegionsWithEntrance: [...occupied].filter(i => entrances.has(i)).length,
      furnishedRegionsWithoutEntrance: [...occupied].filter(i => !entrances.has(i)).length,
      memberships, bedMemberships: annotation.furniture.flatMap((item, i) => item.sourceCategory === 'bed' ? [{ sourcePosition: item.position, regions: memberships[i] }] : []) } };
  }
  let trace = structuredClone(originalTrace), state = evaluate(trace);
  const before = state.metrics, trials = [], selected = [];
  for (const candidate of [...review.suggestions].sort((a, b) => b.score - a.score || a.sourceWallIndex - b.sourceWallIndex)) {
    const trial = structuredClone(trace);
    // Append source-pixel-supported program geometry; preserve every original
    // source observation and endpoint. The existing normalizer owns splitting.
    trial.walls.push({ start: candidate.from, end: candidate.to });
    try {
      const next = evaluate(trial), previous = state.metrics, m = next.metrics;
      const safe = m.furnishedRegionsWithEntrance > previous.furnishedRegionsWithEntrance
        && m.furnishedRegionsWithoutEntrance <= previous.furnishedRegionsWithoutEntrance
        && m.matchedOpenings >= previous.matchedOpenings && m.overlappingAnchors <= previous.overlappingAnchors
        && previous.memberships.every((membership, i) => !membership.length || m.memberships[i].length);
      trials.push({ candidate, status: safe ? 'selected-for-experimental-draft' : 'no-safe-native-gain', before: previous, after: m });
      if (safe) { trace = trial; state = next; selected.push(candidate); }
    } catch (error) { trials.push({ candidate, status: 'invalid-native-trial', reason: String(error) }); }
  }
  const provenance = { mode: 'controlled deterministic algorithm comparison, not a fresh image-extraction run', llmCalls: 0,
    originalObservationsChanged: false, previousStandardizedJsonOrModelChanged: false, defaultRuntimeChanged: false,
    source: { path: resolve(options.source), sha256: hash(sourceBytes), width: decoded.width, height: decoded.height },
    stage: { path: resolve(options.stage), sha256: hash(stageBytes) },
    algorithmSha256: hash(await readFile(resolve(root, 'src/lib/plan2world/rasterWallContinuation.ts'))),
    toolSha256: hash(await readFile(fileURLToPath(import.meta.url))), rasterRgbaSha256: hash(raster.data),
    selectedCount: selected.length, normalAssemblyCertified: false,
    limitation: 'Optional experiment only. Unresolved source observations remain unresolved; selected continuations are not proof of semantic correctness. No third model call or geometry rewrite.' };
  const outputs = { 'raster-continuation-review.json': review, 'native-trials.json': { before, after: state.metrics, selected, trials },
    'experimental-normalization-input.json': trace, 'experimental-draft.json': state.draft, 'provenance.json': provenance };
  const output = resolve(options.output); await mkdir(output, { recursive: true });
  for (const [name, value] of Object.entries(outputs)) await writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  if (hash(await readFile(resolve(options.stage))) !== hash(stageBytes) || hash(await readFile(resolve(options.source))) !== hash(sourceBytes)) throw new Error('Input changed during read-only experiment.');
  console.log(JSON.stringify({ output, suggestions: review.suggestions.length, selected: selected.length,
    before: { ...before, memberships: undefined }, after: { ...state.metrics, memberships: undefined }, llmCalls: 0 }, null, 2));
} finally { await browser?.close(); await server.close(); }
