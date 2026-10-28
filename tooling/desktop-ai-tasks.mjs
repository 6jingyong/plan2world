import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { authorizeOpenRouter, connectOpenRouter } from './desktop-openrouter.mjs';
import { readProject } from '../src/lib/utils/projectValidation';
import { wallPointAt, wallTangentAt } from '../src/lib/utils/wallPath';
import { prepareFloorPlanImage } from './prepare-floorplan-image.mjs';
import { applyNativeEditCommand } from '../src/lib/runtime/nativeEditing';
import { inspectDesktopReconstruction, runDesktopReconstruction, writeSessionFile } from './desktop-reconstruction-session.mjs';
import { safeDesktopError } from './desktop-ai-errors.mjs';


/** Optional desktop authoring only; no engine runtime code depends on this.
 * @param {any} request Private JSON IPC; validate operation-specific data below.
 * @param {(event:object)=>void} [emit] @param {import('./desktop-openrouter.mjs').ProviderFetch} [fetcher]
 * @returns {Promise<any>} Private response projection, never canonical data. */
export async function runDesktopAiTask(request, emit = () => {}, fetcher = fetch) {
  let result;
  if (request.op === 'prepare-image') result = await prepareFloorPlanImage(request);
  else if (request.op === 'login') result = await authorizeOpenRouter(url => emit({ authorize: url }), fetcher);
  else if (request.op === 'connect') result = await connectOpenRouter(request.apiKey, fetcher);
  else if (request.op === 'inspect-reconstruction') result = await inspectDesktopReconstruction(request.checkpointPath);
  else if (request.op === 'entrance') {
    const project = readProject(JSON.parse(await readFile(request.projectPath, 'utf8')));
    if (!['left','right'].includes(request.side)) throw new Error('Choose an authored door and its inward side.');
    const edited = applyNativeEditCommand(project, {type:'set-entrance',floorId:request.floorId,id:request.doorId,side:request.side}).project;
    const directory = path.join(path.dirname(request.projectPath), 'entrance-' + randomUUID()); await mkdir(directory);
    const destination = path.join(directory,'project.json');
    await writeSessionFile(destination, JSON.stringify(edited, null, 2) + '\n');
    result = { projectPath: destination };
  } else if (request.op === 'reconstruct' || request.op === 'resume-reconstruction') {
    const session = await runDesktopReconstruction(request, emit, fetcher);
    if (!session.ok) return session;
    const {reconstruction,context,output,checkpointPath,usage} = session;
    const {width,height} = context.identity;
    try {
    emit({ phase: 'Assembling the editable Project…' });
    const project = reconstruction.project;
    const projectPath = path.join(output, 'project.json');
    await writeSessionFile(projectPath, JSON.stringify(readProject(project), null, 2) + '\n');
    if (reconstruction.draft) await writeSessionFile(path.join(output, 'draft.json'), JSON.stringify(reconstruction.draft, null, 2) + '\n');
    await writeSessionFile(path.join(output, 'source-correction-audit.json'), JSON.stringify(reconstruction.audit, null, 2) + '\n');
    await writeSessionFile(path.join(output,'usage.json'),JSON.stringify(usage,null,2)+'\n');
    result = { projectPath, checkpointPath, usage, name: project.name, cost: usage.cost, assumptions: project.reconstruction?.assumptions || [], correction: reconstruction.issueCount > 0, issueCount: reconstruction.issueCount,
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
    } catch (error) { return {ok:false,error:safeDesktopError(error,request.apiKey),checkpointPath,usage}; }
  } else throw new Error('Unsupported native AI task.');
  return { ok: true, ...result };
}
