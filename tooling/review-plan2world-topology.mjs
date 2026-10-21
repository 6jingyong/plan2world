#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Recheck frozen source geometry with newer diagnostics; never rebuild a draft
// or overwrite the historical prepare report. This is a post-hoc review entry.
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--stage', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: --stage architecture-stage.json --output new-directory');
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.stage || !options.output) throw new Error('Provide stage and new output directory.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, logLevel: 'error', resolve: { alias: { '$lib': resolve(root, 'src/lib') } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const { buildBareHouse } = await server.ssrLoadModule('/src/lib/plan2world/bareHouse.ts');
  const { reviewSourceTopology } = await server.ssrLoadModule('/src/lib/plan2world/sourceTopologyReview.ts');
  const bytes = await readFile(resolve(options.stage)), stage = JSON.parse(bytes);
  if (stage.schemaVersion !== 'architecture-stage-v1') throw new Error('Expected architecture-stage-v1.');
  if (stage.closureReview || stage.functionalZoneReview) {
    const { prepareArchitectureStage } = await server.ssrLoadModule('/src/lib/plan2world/architecture.ts');
    if (JSON.stringify(prepareArchitectureStage(stage.architecture, stage.sourceContext, stage.furnishingEvidence, stage.rasterEvidence)) !== JSON.stringify(stage)) throw new Error('Frozen guided stage does not match the recorded evidence and this code.');
  } else if (JSON.stringify(buildBareHouse(stage.wallTrace)) !== JSON.stringify(stage.bareHouse)) throw new Error('Frozen source geometry does not match this normalizer; review with the recorded code version.');
  const review = reviewSourceTopology(stage.bareHouse, stage.sourceContext, (stage.architecture.junctions ?? []).filter(item => item.decision === 'accept'));
  const output = resolve(options.output); await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'source-topology-review.json'), JSON.stringify({ ...review,
    provenance: { mode: 'read-only-post-hoc-review', stagePath: resolve(options.stage), stageSha256: hash(bytes),
      diagnosticSha256: hash(await readFile(resolve(root, 'src/lib/plan2world/sourceTopologyReview.ts'))),
      frozenStageAndGeometryUnchanged: true } }, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  console.log(JSON.stringify({ output, nearMissCount: review.nearMisses.length, reviewRequired: review.reviewRequired, geometryChanged: false }));
} finally { await server.close(); }
