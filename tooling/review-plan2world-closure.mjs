#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

// Explain candidate guards without rebuilding/replacing a standardized draft.
const options = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (!['--stage', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: --stage architecture-stage.json --output new-directory');
  options[args[i].slice(2)] = args[i + 1];
}
if (!options.stage || !options.output) throw new Error('Provide a frozen stage and new output directory.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, logLevel: 'error', resolve: { alias: { '$lib': resolve(root, 'src/lib') } },
  optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
const hash = value => createHash('sha256').update(value).digest('hex');
try {
  const [{ prepareArchitectureStage }, { reviewFurnitureClosureCandidates }] = await Promise.all([
    server.ssrLoadModule('/src/lib/plan2world/architecture.ts'), server.ssrLoadModule('/src/lib/plan2world/furnitureGuidedClosure.ts'),
  ]);
  const bytes = await readFile(resolve(options.stage)), stage = JSON.parse(bytes);
  if (JSON.stringify(prepareArchitectureStage(stage.architecture, stage.sourceContext, stage.furnishingEvidence, stage.rasterEvidence)) !== JSON.stringify(stage)) {
    throw new Error('Frozen architecture stage differs from recorded evidence and this code. No diagnostic was written.');
  }
  const annotation = { ...stage.annotationBase, furniture: stage.furnishingEvidence?.furniture ?? [] };
  const review = reviewFurnitureClosureCandidates(stage.closureReview?.normalizationInput ?? stage.wallTrace, annotation, stage.sourceContext, stage.wallTrace);
  const accepted = stage.architecture.openings.filter(item => item.decision === 'accept');
  const output = resolve(options.output); await mkdir(output, { recursive: true });
  const report = { ...review, exclusions: review.exclusions.map(item => ({ ...item,
    ...(item.openingIndices ? { conflictingObservations: item.openingIndices.map(index => ({ index, label: accepted[index].label, kind: accepted[index].kind, endpoints: accepted[index].endpoints })) } : {}) })),
    provenance: { mode: 'read-only-post-hoc-review', stageSha256: hash(bytes),
      diagnosticSha256: hash(await readFile(resolve(root, 'src/lib/plan2world/furnitureGuidedClosure.ts'))), frozenStageAndGeometryUnchanged: true } };
  await writeFile(resolve(output, 'closure-candidates-review.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  console.log(JSON.stringify({ output, eligibleBeforeTrials: review.candidates.length, exclusions: review.exclusions.length,
    openingConflicts: review.exclusions.filter(item => item.status === 'observed-opening-conflict').length, geometryChanged: false }));
} finally { await server.close(); }
