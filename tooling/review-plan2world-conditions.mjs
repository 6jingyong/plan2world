#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const options = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  if (!['--stage', '--draft', '--source', '--output'].includes(args[i]) || !args[i + 1]) throw new Error('Usage: --stage architecture-stage.json --draft draft.json --source original.jpg --output NEW_DIRECTORY');
  if (options[args[i].slice(2)]) throw new Error('Duplicate option.');
  options[args[i].slice(2)] = resolve(args[i + 1]);
}
if (['stage', 'draft', 'source', 'output'].some(key => !options[key])) throw new Error('Provide stage, draft, original source and new output directory.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputBytes = Object.fromEntries(await Promise.all(['stage', 'draft', 'source'].map(async key => [key, await readFile(options[key])])));
const server = await createServer({ root, configFile: false, logLevel: 'error', resolve: { alias: { '$lib': resolve(root, 'src/lib') } },
  optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
try {
  const [{ assembleFrozenArchitecture }, { parsePlan2WorldDraft }, { reviewSpatialConditions }] = await Promise.all([
    server.ssrLoadModule('/src/lib/plan2world/architecture.ts'), server.ssrLoadModule('/src/lib/plan2world/draft.ts'),
    server.ssrLoadModule('/src/lib/plan2world/spatialConditionReview.ts'),
  ]);
  const stage = JSON.parse(inputBytes.stage), draft = parsePlan2WorldDraft(JSON.parse(inputBytes.draft), { requireFurnitureVocabulary: true });
  if (stage.centerlinePolicy !== 'disabled') throw new Error('This review requires the current centerlines-disabled stage.');
  if (!stage.furnishingEvidence) throw new Error('Review requires the frozen furniture anchors.');
  // Existing canonical program verifies frozen evidence in memory. Nothing from
  // this deterministic verification is saved over the stage or draft.
  const replay = assembleFrozenArchitecture(stage, stage.furnishingEvidence);
  if (JSON.stringify(replay.draft) !== JSON.stringify(draft)) throw new Error('Draft differs from the frozen canonical assembly.');
  const review = reviewSpatialConditions(stage, draft);
  const catalogBytes = await readFile(resolve(root, 'docs/floorplan-understanding/source-profiles.json'));
  const catalog = JSON.parse(catalogBytes), sourceSha256 = hash(inputBytes.source);
  const profile = catalog.cases.find(item => item.source.sha256 === sourceSha256);
  if (profile && (profile.source.width !== stage.sourceContext.sourceWidthPx || profile.source.height !== stage.sourceContext.sourceHeightPx)) throw new Error('Catalog source dimensions disagree with the frozen stage.');
  const programFiles = ['tooling/review-plan2world-conditions.mjs', 'src/lib/plan2world/spatialConditionReview.ts', 'src/lib/plan2world/architecture.ts',
    'src/lib/plan2world/sourceTopologyReview.ts', 'src/lib/plan2world/draftConverter.ts', 'src/lib/utils/floorAnalysis.ts', 'src/lib/utils/roomDetection.ts', 'src/lib/utils/wallPath.ts'];
  const programSha256 = Object.fromEntries(await Promise.all(programFiles.map(async path => [path, hash(await readFile(resolve(root, path)))])));
  for (const key of ['stage', 'draft', 'source']) if (hash(await readFile(options[key])) !== hash(inputBytes[key])) throw new Error(`Input changed during review: ${key}`);
  const provenance = { mode: 'frozen-input-read-only-audit', freshExtraction: false, deterministicAssemblyVerification: true, inputFilesUnchanged: true,
    inputs: Object.fromEntries(['stage', 'draft', 'source'].map(key => [key, { path: options[key], sha256: hash(inputBytes[key]) }])),
    sourceProfileId: profile?.id ?? null, catalogSha256: hash(catalogBytes), programSha256,
    classificationUse: 'Source profile is attached for human interpretation only; it is not an algorithm input or geometry reference.' };
  await mkdir(dirname(options.output), { recursive: true });
  await mkdir(options.output); // Never overwrite an earlier review.
  for (const [name, value] of [['condition-review.json', { ...review, provenance }], ['source-profile.json', profile ?? { status: 'uncatalogued' }]])
    await writeFile(resolve(options.output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  console.log(JSON.stringify({ output: options.output, nativeRegionCount: review.nativeRegionCount,
    invariantConflictCount: review.invariantConflictCount, reviewRuleIds: review.reviewRuleIds, geometryChanged: false, llmCalls: 0, sourceAcceptance: review.sourceAcceptance }));
  if (review.invariantConflictCount) process.exitCode = 1;
} finally { await server.close(); }
