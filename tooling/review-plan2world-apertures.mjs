#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { readSourceRaster } from './source-raster.mjs';
import { apertureBandHtml } from './aperture-band-html.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

/** Explicit read-only diagnostic. No observer/provider, normalizer, assembly,
 * editor commands or writer of production geometry participates.
 * @param {Record<string,string>} options */
export async function reviewPlan2WorldApertures(options) {
  if (!options.source || !options.output || Boolean(options.project) === Boolean(options.observations)) throw new Error('Provide --source --output and exactly one --project or --observations.');
  if (options.observations && !/^[a-f0-9]{64}$/.test(options['source-sha256'] ?? '')) throw new Error('Standalone observations require their confirmed --source-sha256.');
  const sourcePath = path.resolve(options.source), inputPath = path.resolve(options.project ?? options.observations);
  const sourceBytes = await readFile(sourcePath), inputBytes = await readFile(inputPath);
  const output = path.resolve(options.output); await mkdir(path.dirname(output), { recursive: true }); await mkdir(output);
  const server = await createServer({ root, configFile: false, logLevel: 'error', resolve: { alias: { '$lib': path.join(root, 'src/lib') } },
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
  try {
    let observations, expectedSource;
    if (options.project) {
      const { readProject } = await server.ssrLoadModule('/src/lib/utils/projectValidation.ts');
      const project = readProject(JSON.parse(inputBytes));
      if (!project.architectureReview?.sourceObservations || !project.architectureReview.workingImageSha256) throw new Error('Project lacks the retained raw observations and working-image identity. Use frozen observations explicitly.');
      observations = JSON.parse(project.architectureReview.sourceObservations).architecture;
      expectedSource = project.architectureReview.workingImageSha256;
    } else { observations = JSON.parse(inputBytes); expectedSource = options['source-sha256']; }
    if (sha(sourceBytes) !== expectedSource) throw new Error('Source image does not match the frozen observation identity.');
    const raster = await readSourceRaster(sourceBytes);
    const { reviewApertureWallBands } = await server.ssrLoadModule('/src/lib/plan2world/apertureWallBands.ts');
    const review = reviewApertureWallBands(observations, raster);
    if (sha(await readFile(sourcePath)) !== sha(sourceBytes) || sha(await readFile(inputPath)) !== sha(inputBytes)) throw new Error('Frozen diagnostic inputs changed.');
    const mime = sourceBytes[0] === 0xff ? 'image/jpeg' : sourceBytes[0] === 0x89 ? 'image/png' : 'image/webp';
    const provenance = { scope: 'read-only-local-aperture-wall-band-hypotheses', source: { path: sourcePath, sha256: sha(sourceBytes), width: raster.width, height: raster.height },
      input: { kind: options.project ? 'retained-source-observations' : 'explicit-frozen-observations', path: inputPath, sha256: sha(inputBytes), observationsSha256: sha(JSON.stringify(observations)) },
      geometryChanged: false, appliedChanges: 0, llmCalls: 0, inputsUnchanged: true };
    for (const [name, value] of Object.entries({ 'aperture-wall-band-review.json': review, 'provenance.json': provenance })) await writeFile(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
    await writeFile(path.join(output, 'review.html'), apertureBandHtml({ source: { width: raster.width, height: raster.height, dataUrl: `data:${mime};base64,${sourceBytes.toString('base64')}` }, observations, review }), { flag: 'wx', mode: 0o444 });
    return { output, ...provenance, statuses: Object.fromEntries([...new Set(review.audits.map(a => a.status))].map(status => [status, review.audits.filter(a => a.status === status).length])), wallBandGroups: review.wallBandGroups };
  } finally { await server.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = {}, args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 2) {
    if (!['--project','--observations','--source-sha256','--source','--output'].includes(args[i]) || !args[i+1]) throw new Error('Expected --project frozen.project.json --source working.png --output new-dir, or --observations architecture.json --source-sha256 HASH.');
    options[args[i].slice(2)] = args[i+1];
  }
  console.log(JSON.stringify(await reviewPlan2WorldApertures(options), null, 2));
}
