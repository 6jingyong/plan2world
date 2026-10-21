#!/usr/bin/env node
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { readSourceRaster } from './source-raster.mjs';

const [command, ...args] = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--input', '--stage', '--furnishing', '--output', '--source', '--source-width', '--source-height'].includes(args[i]) || !args[i + 1]) throw new Error('Invalid architecture command arguments.');
  options[args[i].slice(2)] = args[i + 1];
}
if (!['prepare', 'assemble', 'assemble-diagnostic'].includes(command) || !options.output) throw new Error('Usage: prepare --input architecture.json [--furnishing furnishing.json] --output new-dir [--source original.jpg | --source-width W --source-height H] | assemble[‑diagnostic] --stage architecture-stage.json --furnishing furnishing.json --output new-dir');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: false, logLevel: 'error', resolve: { alias: { '$lib': resolve(root, 'src/lib') } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const input = async path => { if (!path) throw new Error('Missing required input path.'); const bytes = await readFile(resolve(path)); return { value: JSON.parse(bytes), sha256: hash(bytes), path: resolve(path) }; };
try {
  const { prepareArchitectureStage, assembleFrozenArchitecture } = await server.ssrLoadModule('/src/lib/plan2world/architecture.ts');
  let outputs, provenance;
  if (command === 'prepare') {
    const source = await input(options.input);
    const width = options['source-width'], height = options['source-height'];
    if ((width === undefined) !== (height === undefined)) throw new Error('Source width and height must be supplied together.');
    const furnishing = options.furnishing ? await input(options.furnishing) : undefined;
    const sourceBytes = options.source ? await readFile(resolve(options.source)) : undefined;
    const raster = sourceBytes ? await readSourceRaster(sourceBytes) : undefined;
    if (raster && width !== undefined && (raster.width !== Number(width) || raster.height !== Number(height))) throw new Error('Source dimensions disagree with decoded original.');
    const context = raster ? { sourceWidthPx: raster.width, sourceHeightPx: raster.height }
      : width === undefined ? {} : { sourceWidthPx: Number(width), sourceHeightPx: Number(height) };
    const stage = prepareArchitectureStage(source.value, context, furnishing?.value, raster);
    outputs = { 'architecture-stage.json': stage, 'wall-trace.json': stage.wallTrace, 'bare-house.json': stage.bareHouse,
      'architecture-annotation.json': stage.annotationBase, 'architecture-draft.json': stage.architectureDraft,
      'decision-audit.json': { walls: stage.wallAudit, openings: stage.openingAudit, junctions: stage.architecture.junctions, functionalZones: stage.architecture.functionalZones ?? [] },
      'source-topology-review.json': stage.sourceTopologyReview,
      'centerline-policy.json': { mode: stage.centerlinePolicy, diagnostics: 'explicit-read-only-command' } };
    if (stage.relativeGeometry) outputs['relative-geometry.json'] = stage.relativeGeometry;
    if (stage.closureReview) outputs['furniture-closure-review.json'] = stage.closureReview;
    if (stage.functionalZoneReview) outputs['functional-zone-review.json'] = stage.functionalZoneReview;
    if (stage.rasterEvidence) {
      outputs['source-ink-mask.json'] = stage.rasterEvidence;
      outputs['window-refinement-review.json'] = stage.windowRefinementReview;
      outputs['normalized-window-review.json'] = stage.normalizedWindowReview;
      if (stage.rasterContinuationReview) outputs['raster-continuation-review.json'] = stage.rasterContinuationReview;
    }
    provenance = { command, centerlinePolicy: stage.centerlinePolicy, architecture: { path: source.path, sha256: source.sha256 },
      ...(raster ? { sourceRaster: { path: resolve(options.source), sha256: hash(sourceBytes), rgbaSha256: hash(raster.data) }, deterministicRasterEnabled: true } : { deterministicRasterEnabled: false }),
      appliedOpenings: stage.openingAudit.filter(item => item.programStatus === 'assembled').length,
      unresolvedAcceptedOpenings: stage.openingAudit.filter(item => item.programStatus === 'unresolved-host').length,
      uncertainCandidates: [...stage.wallAudit, ...stage.openingAudit, ...stage.architecture.junctions, ...(stage.architecture.functionalZones ?? [])].filter(item => item.decision === 'uncertain').length,
      sourceNearMissCount: stage.sourceTopologyReview.nearMisses.length,
      sourceReviewRequired: stage.sourceTopologyReview.reviewRequired,
      ...(furnishing ? { furnishing: { path: furnishing.path, sha256: furnishing.sha256 },
        closurePolicy: stage.functionalZoneReview?.policy ?? stage.closureReview?.policy,
        acceptedFurnitureGuidedConnections: stage.closureReview?.accepted.length ?? 0,
        functionalZones: stage.functionalZoneReview?.acceptedZoneCount ?? 0,
        uniquelyClosedFunctionalZones: stage.functionalZoneReview?.finalMetrics.uniqueClosedZoneCount ?? 0,
        supportedFunctionalZones: stage.functionalZoneReview?.finalMetrics.resolvedZoneCount ?? 0,
        acceptedFunctionalConnections: stage.functionalZoneReview?.accepted.length ?? 0 } : {}) };
  } else {
    const stage = await input(options.stage), furnishing = await input(options.furnishing);
    const result = assembleFrozenArchitecture(stage.value, furnishing.value, { allowUnresolvedOpenings: command === 'assemble-diagnostic' });
    outputs = { 'draft.json': result.draft, 'architecture-preservation.json': { architectureUnchanged: result.architectureUnchanged, openingAudit: result.openingAudit, validationStatus: result.validationStatus } };
    provenance = { command, stage: { path: stage.path, sha256: stage.sha256 }, furnishing: { path: furnishing.path, sha256: furnishing.sha256 }, architectureUnchanged: result.architectureUnchanged, validationStatus: result.validationStatus };
  }
  const output = resolve(options.output); await mkdir(output, { recursive: true });
  outputs['provenance.json'] = provenance;
  // Refuse all overwrites, including after a partial failed command.
  for (const name of Object.keys(outputs)) {
    const exists = await access(resolve(output, name)).then(() => true, () => false);
    if (exists) throw new Error(`Refusing to overwrite generated artifact: ${name}`);
  }
  for (const [name, value] of Object.entries(outputs)) await writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  console.log(JSON.stringify({ output, ...provenance }, null, 2));
  if (provenance.unresolvedAcceptedOpenings) process.exitCode = 1;
} finally { await server.close(); }
