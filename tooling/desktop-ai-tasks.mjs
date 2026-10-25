import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { authorizeOpenRouter, connectOpenRouter, observeOpenRouter } from './desktop-openrouter.mjs';
import { reconstructFloorPlanWithObserver, MAX_FLOOR_PLAN_IMAGE_BYTES } from '../src/lib/plan2world/vision';
import { draftToProjectWithSourceBackground } from '../src/lib/plan2world/sourceBackground';
import { readProject } from '../src/lib/utils/projectValidation';
import { wallPointAt, wallTangentAt } from '../src/lib/utils/wallPath';


/** Optional desktop authoring only; no engine runtime code depends on this.
 * @param {any} request Private JSON IPC; validate operation-specific data below.
 * @param {(event:object)=>void} [emit] @param {import('./desktop-openrouter.mjs').ProviderFetch} [fetcher]
 * @returns {Promise<any>} Private response projection, never canonical data. */
export async function runDesktopAiTask(request, emit = () => {}, fetcher = fetch) {
  let result;
  if (request.op === 'login') result = await authorizeOpenRouter(url => emit({ authorize: url }), fetcher);
  else if (request.op === 'connect') result = await connectOpenRouter(request.apiKey, fetcher);
  else if (request.op === 'entrance') {
    const project = readProject(JSON.parse(await readFile(request.projectPath, 'utf8')));
    const floor = project.floors.find(f => f.id === request.floorId);
    if (!floor || !floor.doors.some(d => d.id === request.doorId && d.type !== 'opening') || !['left','right'].includes(request.side)) throw new Error('Choose an authored door and its inward side.');
    floor.entrance = { doorId: request.doorId, side: request.side }; delete floor.walkthroughStart;
    const destination = path.join(path.dirname(request.projectPath), 'entrance.project.json');
    await writeFile(destination, JSON.stringify(readProject(project), null, 2) + '\n');
    result = { projectPath: destination };
  } else if (request.op === 'reconstruct') {
    const bytes = await readFile(request.imagePath);
    if (!bytes.length || bytes.length > MAX_FLOOR_PLAN_IMAGE_BYTES) throw new Error('Choose an image up to 12 MB.');
    /** @type {Record<string,string>} */
    const mimeTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    const mime = mimeTypes[path.extname(request.imagePath).toLowerCase()];
    const { width, height } = request;
    if (!mime || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 24_000_000) throw new Error('Unsupported image or raster dimensions.');
    const pixels = await readFile(request.rasterPath);
    if (pixels.length !== width * height * 4) throw new Error('Original raster pixels do not match image dimensions.');
    const image = { dataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
    const output = path.resolve(request.outputDirectory); await mkdir(output);
    let pass = 0, cost = 0, knownCost = true;
    const reconstruction = await reconstructFloorPlanWithObserver(async prompt => {
      const stage = pass++ === 0 ? 'architecture' : 'furnishing';
      emit({ phase: stage === 'architecture' ? 'Observing architecture (1/2)…' : 'Observing furniture (2/2)…' });
      const observation = await observeOpenRouter(request, image, prompt, fetcher);
      await writeFile(path.join(output, `source-${stage}.json`), JSON.stringify(observation.value, null, 2) + '\n', { flag: 'wx' });
      if (observation.cost === null) knownCost = false; else cost += observation.cost;
      return observation.value;
    }, { context: { sourceWidthPx: width, sourceHeightPx: height }, raster: { width, height, data: pixels } }, { scaleHint: request.scaleHint || '' });
    emit({ phase: 'Assembling the editable Project…' });
    const project = draftToProjectWithSourceBackground(reconstruction.draft, { dataUrl: image.dataUrl, width, height, name: path.basename(request.imagePath) });
    if (project.reconstruction) project.reconstruction.observationReview = reconstruction.observationReview;
    const projectPath = path.join(output, 'project.json');
    await writeFile(projectPath, JSON.stringify(readProject(project), null, 2) + '\n', { flag: 'wx' });
    await writeFile(path.join(output, 'draft.json'), JSON.stringify(reconstruction.draft, null, 2) + '\n', { flag: 'wx' });
    result = { projectPath, name: project.name, cost: knownCost ? cost : null, assumptions: reconstruction.draft.assumptions || [],
      floors: project.floors.map(f => ({ id: f.id, name: f.name, wallCount: f.walls.length, furnitureCount: f.furniture.length, doors: f.doors.filter(d => d.type !== 'opening').map(d => {
        const wall = f.walls.find(w => w.id === d.wallId), background = f.backgroundImage;
        if (!wall) throw new Error('Source door has no authored wall.');
        const p = wallPointAt(wall, d.position), t = wallTangentAt(wall, d.position);
        if (!background) return { id: d.id, label: `${d.id} · wall ${d.wallId}` };
        const angle = background.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        const x = (p.x - background.position.x) / background.scale, y = (p.y - background.position.y) / background.scale;
        return { id: d.id, label: `${d.id} · wall ${d.wallId}`, sourcePoint: [(c*x+s*y)/width+.5,(-s*x+c*y)/height+.5],
          inwardLeft: [c*(-t.y)+s*t.x,-s*(-t.y)+c*t.x] };
      }) })) };
  } else throw new Error('Unsupported native AI task.');
  return { ok: true, ...result };
}
