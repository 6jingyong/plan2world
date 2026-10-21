#!/usr/bin/env node
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--stage', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Expected --stage frozen-stage.json --output new-directory');
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.stage || !options.output) throw new Error('Missing frozen stage or output.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), stagePath = resolve(options.stage);
const stageBytes = await readFile(stagePath), stage = JSON.parse(stageBytes), output = resolve(options.output);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const server = await createServer({ root, configFile: false, logLevel: 'error', resolve: { alias: { '$lib': resolve(root, 'src/lib') } },
  optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
try {
  if (stage.schemaVersion !== 'architecture-stage-v1' || !stage.rasterEvidence) throw new Error('Expected a frozen architectural stage with raster evidence.');
  const { parseSourceArchitecture, parseSourceFurnishing } = await server.ssrLoadModule('/src/lib/plan2world/architecture.ts');
  const { freezeRasterEvidence } = await server.ssrLoadModule('/src/lib/plan2world/rasterWallContinuation.ts');
  const { reviewRasterCenterlines } = await server.ssrLoadModule('/src/lib/plan2world/rasterCenterlines.ts');
  // Read original observations even for a historical stage. Do not reprepare or
  // reassemble it under different code merely to obtain a diagnostic.
  const architecture = parseSourceArchitecture(stage.architecture), rasterEvidence = freezeRasterEvidence(stage.rasterEvidence);
  const furnishingEvidence = stage.furnishingEvidence ? parseSourceFurnishing(stage.furnishingEvidence, architecture.scaleEvidence) : undefined;
  const wallTrace = { schemaVersion: 'source-wall-trace-v1', walls: architecture.walls.filter(w => w.decision === 'accept')
    .map(({ start, end, curvePoint }) => ({ start, end, ...(curvePoint ? { curvePoint } : {}) })) };
  const annotation = { schemaVersion: 'source-annotation-v1', scaleEvidence: architecture.scaleEvidence,
    openings: architecture.openings.filter(o => o.decision === 'accept').map(({ kind, endpoints, evidence, doorType, typeEvidence }) =>
      ({ kind, endpoints, evidence, ...(doorType ? { doorType } : {}), ...(typeEvidence ? { typeEvidence } : {}) })),
    furniture: furnishingEvidence?.furniture ?? [] };
  const centerlineReview = reviewRasterCenterlines(wallTrace, annotation, rasterEvidence);
  if (sha(await readFile(stagePath)) !== sha(stageBytes)) throw new Error('Input stage changed during read-only review.');
  const files = { 'centerline-diagnostic.json': { schemaVersion: 'raster-centerline-diagnostic-v1', rasterEvidence, furnishingEvidence, centerlineReview },
    'provenance.json': { mode: 'read-only-unapproved-candidates', stage: { path: stagePath, sha256: sha(stageBytes) },
      geometryChanged: false, stageUnchanged: true, llmCalls: 0, unapprovedCandidates: centerlineReview.audits.filter(a => a.status === 'unapproved-candidate').length } };
  await mkdir(output, { recursive: true });
  for (const name of Object.keys(files)) if (await access(resolve(output, name)).then(() => true, () => false)) throw new Error(`Refusing overwrite: ${name}`);
  for (const [name, value] of Object.entries(files)) await writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  console.log(JSON.stringify({ output, ...files['provenance.json'] }, null, 2));
} finally { await server.close(); }
