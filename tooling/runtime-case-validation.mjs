import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile,writeFile,mkdir,readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const hash=(/** @type {Uint8Array} */ bytes)=>createHash('sha256').update(bytes).digest('hex');
export const validationScopes=['input','sourceReview','structure','doorMotion','arrangement','persistence','walkthrough','rendering'];
/** @param {Record<string,any>} scopes */
export function validationOverall(scopes) {
  const statuses=validationScopes.map(key=>scopes[key]?.status??'not_run');
  return statuses.includes('fail')?'fail':statuses.every(s=>s==='pass')?'pass':'review_required';
}
async function files(/** @type {string} */ directory,prefix='') {
  /** @type {Record<string,string>} */
  const result={};
  for(const entry of (await readdir(path.join(directory,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
    const relative=path.join(prefix,entry.name);
    if(entry.isDirectory())Object.assign(result,await files(directory,relative));
    else result[relative]=hash(await readFile(path.join(directory,relative)));
  }
  return result;
}
function run(/** @type {string} */ program,/** @type {string[]} */ args) {
  try {const text=execFileSync(program,args,{cwd:root,encoding:'utf8',timeout:180_000,env:{...process.env,NODE_ENV:'production'}});return {text};}
  catch(caught){const error=/** @type {any} */(caught);throw new Error(`Validation command failed: ${path.basename(program)} ${args[0]}\n${error.stdout??''}\n${error.stderr??error.message}`);}
}
async function compile(/** @type {string} */ input,/** @type {string} */ output) {
  await mkdir(output);const scene=path.join(output,'scene.runtime.json');
  const log=run(process.execPath,[path.join(root,'tooling/runtime-export.mjs'),input,scene,'--package',path.join(output,'scene.zip')]);
  await writeFile(path.join(path.dirname(output),path.basename(output)+'-export.log'),log.text);
  return scene;
}
async function checkArtifacts(/** @type {string} */ directory) {
  const runtime=JSON.parse(await readFile(path.join(directory,'scene.runtime.json'),'utf8')),glb=await readFile(path.join(directory,'scene.architecture.glb'));
  if(!/^[a-f0-9]{64}$/.test(runtime.source.architectureSha256)||hash(glb)!==runtime.source.architectureSha256)throw new Error('Actual architecture GLB digest does not match runtime JSON.');
  const gltf=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString().trimEnd());
  const owners=new Set([...runtime.entities.map((/** @type {any} */ e)=>e.id),...runtime.floors.flatMap((/** @type {any} */ f)=>f.rooms.map((/** @type {any} */ r)=>r.id))]);
  for(const node of gltf.nodes)if(!owners.has(node.extras?.plan2world?.ownerId))throw new Error('Static GLB owner does not resolve to a compiled entity or room.');
  const manifest=JSON.parse(await readFile(path.join(directory,'scene.assets/manifest.json'),'utf8'));
  for(const asset of manifest.assets)if(asset.uri){
    const bytes=await readFile(path.join(directory,'scene.assets',asset.uri));
    if(hash(bytes)!==asset.sha256 || bytes.length!==asset.byteLength)throw new Error('Packaged asset hash or size does not match its descriptor.');
  }
  return {architectureSha256:hash(glb),staticOwners:gltf.nodes.length,entities:runtime.entities.length,colliders:runtime.colliders.length,assets:manifest.assets.length};
}
function architectureFields(/** @type {any} */ project) {
  return project.floors.map((/** @type {any} */ floor)=>{const {furniture,...architecture}=floor;return architecture;});
}

/** Mechanical acceptance only. Untested source fidelity, rendering, saving and
 * player routes stay NOT_RUN rather than borrowing success from compiler/doors.
 * @param {string} inputPath @param {string} outputPath
 * @param {{godot?:string,arranged?:string}} [options] */
export async function validateRuntimeCase(inputPath,outputPath,{godot=process.env.GODOT_BIN||'godot',arranged}={}) {
  const output=path.resolve(outputPath);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
  /** @type {Record<string,any>} */
  const scopes=Object.fromEntries(validationScopes.map(key=>[key,{status:'not_run'}]));
  const report={schemaVersion:'plan2world-case-validation-v1',candidate:{},scopes,overall:'review_required'};
  let active='input';let original;
  try {
    const bytes=await readFile(inputPath);original=hash(bytes);const project=JSON.parse(bytes.toString());
    report.candidate={projectSha256:original,codeCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),workingTreeDirty:execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()!==''};
    const snapshot=path.join(output,'source.project.json');await writeFile(snapshot,bytes,{flag:'wx'});
    scopes.input={status:'pass',projectSha256:original,...(project.reconstruction?.inputPreparation?{imagePreparation:project.reconstruction.inputPreparation.manifest}:{})};
    const sourceReview=project.reconstruction?.observationReview;
    if(sourceReview?.zoneFindings.length)scopes.sourceReview={status:'review_required',findings:sourceReview.zoneFindings};
    active='structure';
    await compile(snapshot,path.join(output,'baseline'));await compile(snapshot,path.join(output,'repeat'));
    const first=await files(path.join(output,'baseline')),second=await files(path.join(output,'repeat'));
    if(JSON.stringify(first)!==JSON.stringify(second))throw new Error('Repeated runtime artifacts are not byte-stable.');
    scopes.structure={status:'pass',...await checkArtifacts(path.join(output,'baseline')),files:first};
    active='doorMotion';
    const version=execFileSync(godot,['--version'],{encoding:'utf8'}).trim();
    if(!version.startsWith('4.7.2.stable.'))throw new Error('Door audit requires pinned Godot 4.7.2 stable.');
    const auditPath=path.join(output,'door-motion.json');
    const audit=run(godot,['--headless','--fixed-fps','60','--path',path.join(root,'runtime/godot'),'--script',path.join(root,'tooling/runtime-door-audit.gd'),'--',path.join(output,'baseline/scene.runtime.json'),auditPath]);
    await writeFile(path.join(output,'godot-door-motion.log'),audit.text);
    scopes.doorMotion=JSON.parse(await readFile(auditPath,'utf8'));scopes.doorMotion.engine=version;
    // A failed door motion does not invalidate independent arrangement checks.
    if(arranged) {
      active='arrangement';const arrangedBytes=await readFile(arranged),arrangedProject=JSON.parse(arrangedBytes.toString()),arrangedSnapshot=path.join(output,'arranged.project.json');
      await writeFile(arrangedSnapshot,arrangedBytes,{flag:'wx'});
      if(JSON.stringify(architectureFields(project))!==JSON.stringify(architectureFields(arrangedProject)))throw new Error('Arrangement changed native architecture fields.');
      await compile(arrangedSnapshot,path.join(output,'arranged'));await compile(arrangedSnapshot,path.join(output,'arranged-repeat'));
      const a=await files(path.join(output,'arranged')),b=await files(path.join(output,'arranged-repeat'));
      if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Arranged artifacts are not byte-stable.');
      const checked=await checkArtifacts(path.join(output,'arranged'));
      if(checked.architectureSha256!==scopes.structure.architectureSha256)throw new Error('Furniture-only arrangement changed architecture GLB bytes.');
      if(hash(await readFile(arranged))!==hash(arrangedBytes))throw new Error('Arranged native input changed during validation.');
      scopes.arrangement={status:'pass',scope:'saved input/architecture preservation and deterministic export; not interactive save/reopen',projectSha256:hash(arrangedBytes),...checked};
    }
    if(hash(await readFile(inputPath))!==original)throw new Error('Source Project changed during validation.');
  }catch(error){scopes[active]={status:'fail',message:error instanceof Error?error.message:String(error)};}
  report.overall=validationOverall(scopes);
  await writeFile(path.join(output,'validation-report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  return report;
}
