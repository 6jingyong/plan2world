#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import { readSourceRaster } from './source-raster.mjs';
import { sourceEvaluationHtml } from './source-evaluation-html.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Offline only. Replay freezes the supplied observations; it never claims to
 * perform fresh image extraction. References are opened AFTER output freeze.
 * @param {Record<string,string>} options @param {'replay'|'evaluate'} command */
export async function evaluatePlan2WorldSource(options, command) {
  if (!options.source || !options.output || (command === 'replay' ? !options.architecture || !options.furnishing : !options.project)) throw new Error('Provide --source --output and either replay --architecture --furnishing, or evaluate --project [--audit].');
  if (options['check-runtime'] && !['true', 'false'].includes(options['check-runtime'])) throw new Error('--check-runtime must be true or false.');
  const output = path.resolve(options.output); await mkdir(output);
  const server = await createServer({ root, configFile: false, logLevel: 'error', resolve: { alias: { '$lib': path.join(root, 'src/lib') } }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
  const save = async (name, bytes) => writeFile(path.join(output, name), bytes, { flag: 'wx', mode: 0o444 });
  const saveJSON = async (name, value) => { const bytes = JSON.stringify(value, null, 2) + '\n'; await save(name, bytes); return bytes; };
  try {
    const sourceBytes = await readFile(path.resolve(options.source)), raster = await readSourceRaster(sourceBytes);
    const mime = sourceBytes[0] === 0xff ? 'image/jpeg' : sourceBytes[0] === 0x89 ? 'image/png' : 'image/webp';
    const image = { width: raster.width, height: raster.height, dataUrl: `data:${mime};base64,${sourceBytes.toString('base64')}`, name: path.basename(options.source) };
    let result, projectBytes;
    const { readProject } = await server.ssrLoadModule('/src/lib/utils/projectValidation.ts');
    if (command === 'replay') {
      const architectureBytes = await readFile(path.resolve(options.architecture)), furnishingBytes = await readFile(path.resolve(options.furnishing));
      const architecture = JSON.parse(architectureBytes), furnishing = JSON.parse(furnishingBytes);
      const { reconstructFloorPlanForCorrection } = await server.ssrLoadModule('/src/lib/plan2world/correction.ts');
      let pass = 0;
      result = await reconstructFloorPlanForCorrection(async () => pass++ === 0 ? architecture : furnishing, { image, sha256: hash(sourceBytes), raster });
      if (pass !== 2) throw new Error('Frozen replay changed the observation count.');
      projectBytes = await saveJSON('project.json', result.project);
      await save('source-architecture.json', architectureBytes); await save('source-furnishing.json', furnishingBytes);
      await saveJSON('audit.json', result.audit);
      if (result.draft) await saveJSON('draft.json', result.draft);
    } else {
      projectBytes = await readFile(path.resolve(options.project));
      const project = readProject(JSON.parse(projectBytes));
      const audit = options.audit ? JSON.parse(await readFile(path.resolve(options.audit), 'utf8')) : undefined;
      if (audit && (audit.source?.sha256 !== hash(sourceBytes) || audit.source?.width !== image.width || audit.source?.height !== image.height)) throw new Error('Audit belongs to another source.');
      if (audit?.correction && audit.correction.projectContentSha256 !== hash(JSON.stringify(project))) throw new Error('Audit does not match the frozen Project. Re-evaluate without a stale audit.');
      result = { project, ...audit?.correction };
      await save('project.json', projectBytes);
      if (audit) await saveJSON('audit.json', audit);
    }
    const project = result.project;
    if (project.architectureReview?.workingImageSha256 && project.architectureReview.workingImageSha256 !== hash(sourceBytes)) throw new Error('Project source identity disagrees with the supplied working raster.');
    const source = { sha256: hash(sourceBytes), width: image.width, height: image.height, resultSha256: hash(projectBytes) };
    await saveJSON('freeze.json', { schemaVersion: 'plan2world-source-evaluation-freeze-v1', source,
      scope: command === 'replay' ? 'frozen-observation-program-replay' : 'frozen-native-project-evaluation', externalProviderRequests: 0 });
    /** @type {import('../src/lib/plan2world/sourceEvaluation').SourceRuntimeCheck} */
    let runtime = { status: 'not_run' };
    if (options['check-runtime'] !== 'false') {
      const { compileRuntimeArtifacts } = await server.ssrLoadModule('/src/lib/runtime/runtimeArtifacts.ts');
      const { RuntimeProjectError } = await server.ssrLoadModule('/src/lib/runtime/runtimeProjectError.ts');
      try {
        await compileRuntimeArtifacts(project, async file => {
          const models = path.join(root, 'static/models'), location = path.resolve(models, `${file}.glb`);
          if (!location.startsWith(models + path.sep)) throw new Error('Invalid catalog asset path.');
          try { return new Uint8Array(await readFile(location)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
        });
        runtime = { status: 'compiled' };
      } catch (e) { if (!(e instanceof RuntimeProjectError)) throw e; runtime = { status: 'rejected', error: e.message }; }
    }
    // Opening a reference before this point would leak answers into generation.
    const reference = options.reference ? JSON.parse(await readFile(path.resolve(options.reference), 'utf8')) : undefined;
    const { evaluateSourceCorrection } = await server.ssrLoadModule('/src/lib/plan2world/sourceEvaluation.ts');
    const report = evaluateSourceCorrection({ project, source, partialImport: result.partialImport, diagnostics: result.diagnostics, features: result.features, runtime, reference });
    await saveJSON('evaluation.json', report);
    let before;
    if (options['before-project']) {
      const bytes = await readFile(path.resolve(options['before-project'])), earlier = readProject(JSON.parse(bytes));
      if (earlier.architectureReview?.workingImageSha256 && earlier.architectureReview.workingImageSha256 !== source.sha256) throw new Error('Before Project belongs to another source.');
      before = { project: earlier, report: evaluateSourceCorrection({ project: earlier, source: { ...source, resultSha256: hash(bytes) } }) };
    }
    await save('review.html', sourceEvaluationHtml({ title: image.name, source: image, before, after: { project, report } }));
    if (hash(await readFile(path.join(output, 'project.json'))) !== source.resultSha256) throw new Error('Frozen Project changed during evaluation.');
    return { output, source, reviewStatus: report.reviewStatus, pipeline: report.pipeline, runtime: report.runtime };
  } finally { await server.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--source','--output','--architecture','--furnishing','--project','--audit','--reference','--before-project','--check-runtime'].includes(args[i]) || !args[i+1]) throw new Error('Invalid source evaluation arguments.');
    options[args[i].slice(2)] = args[i+1];
  }
  if (!['replay','evaluate'].includes(command)) throw new Error('Expected replay or evaluate.');
  console.log(JSON.stringify(await evaluatePlan2WorldSource(options, /** @type {'replay'|'evaluate'} */ (command)), null, 2));
}
