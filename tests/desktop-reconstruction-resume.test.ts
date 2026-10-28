import {afterEach,describe,it,expect,vi} from 'vitest';
import {mkdtemp,readFile,writeFile,rm,readdir,unlink} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runDesktopAiTask} from '../tooling/desktop-ai-tasks.mjs';
import {encodeRgbaPng} from '../tooling/png-raster.mjs';
import {observationUsage} from '../tooling/observation-usage.mjs';
import {createDefaultProject} from '$lib/models/projectDefaults';

const directories:string[]=[];
afterEach(async()=>{await Promise.all(directories.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
const evidence={decision:'accept',decisionBasis:'Synthetic observation',evidence:'Synthetic stroke'};
const architecture={schemaVersion:'source-architecture-v1',scaleEvidence:{kind:'measured_dimension',realLengthCm:360,endpoints:[{x:0,y:0},{x:360,y:0}],evidence:'360cm'},
 walls:[[0,0,360,0],[360,0,360,300],[360,300,0,300],[0,300,0,0]].map(([x,y,a,b],i)=>({...evidence,label:`w${i}`,start:{x,y},end:{x:a,y:b}})),
 openings:[{...evidence,label:'entry',kind:'door',endpoints:[{x:135,y:0},{x:225,y:0}]}],doorGaps:[]};
const furnishing={schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:{x:180,y:150}}]};
const metrics={prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_tokens_details:{cached_tokens:40},completion_tokens_details:{reasoning_tokens:5},cost:.003};
const reply=(value:unknown,usage:unknown=metrics)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}],usage}));
async function input(){
 const dir=await mkdtemp(path.join(tmpdir(),'p2w-resume-'));directories.push(dir);
 const pixels=Buffer.alloc(360*300*4,255),image=encodeRgbaPng({width:360,height:300,data:pixels});
 const imagePath=path.join(dir,'source.png'),rasterPath=path.join(dir,'source.rgba');await writeFile(imagePath,image);await writeFile(rasterPath,pixels);
 return {dir,request:{op:'reconstruct',apiKey:'fixture-secret-key',model:'fixture/vision',imagePath,rasterPath,width:360,height:300,scaleHint:'360 cm',outputDirectory:path.join(dir,'first')}};
}
function normal(){let count=0;return vi.fn(async()=>reply(count++===0?architecture:furnishing));}
async function scan(dir:string):Promise<string>{let text='';for(const e of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);text+=e.isDirectory()?await scan(file):await readFile(file,'utf8');}return text;}
describe('durable desktop observations and reported usage',()=>{
 it('resumes only furnishing after provider failure and preserves the frozen architecture and failed cost',async()=>{
  const {dir,request}=await input();let count=0;
  request.model='  fixture/vision  ';
  const first=vi.fn(async()=>count++===0?reply(architecture):new Response('private provider body',{status:503}));
  const failed=await runDesktopAiTask(request,()=>{},first);
  expect(failed.ok).toBe(false);expect(first).toHaveBeenCalledTimes(2);expect(failed.error).not.toContain('private provider body');
  expect(failed.usage.requestsStarted).toBe(2);expect(failed.usage.cost).toBeNull();
  expect(failed.usage.stages[0].responseBytes).toBe(Buffer.byteLength(JSON.stringify(architecture)));
  expect(failed.usage.stages[0].usage.totalTokens).toBe(120);
  const inspectFetch=vi.fn();const inspection=await runDesktopAiTask({op:'inspect-reconstruction',checkpointPath:failed.checkpointPath},()=>{},inspectFetch);
  expect(inspection.remainingRequests).toBe(1);expect(inspectFetch).not.toHaveBeenCalled();
  const saved=await readFile(path.join(request.outputDirectory,'source-architecture.json'));
  expect(saved.byteLength).toBeGreaterThan(failed.usage.stages[0].responseBytes);
  const resumedFetch=vi.fn(async(_url:string,_init:RequestInit)=>reply(furnishing));
  const resumed=await runDesktopAiTask({...request,op:'resume-reconstruction',checkpointPath:failed.checkpointPath,outputDirectory:path.join(dir,'second')},()=>{},resumedFetch);
  expect(resumed.ok).toBe(true);expect(resumedFetch).toHaveBeenCalledTimes(1);expect(resumed.cost).toBe(.003);
  expect(JSON.parse(resumedFetch.mock.calls[0][1]!.body as string).model).toBe('fixture/vision');
  expect(resumed.usage.stages.map((s:any)=>s.status)).toEqual(['reused','complete']);
  expect(await readFile(path.join(dir,'second/source-architecture.json'))).toEqual(saved);
  expect(await readFile(path.join(request.outputDirectory,'source-architecture.json'))).toEqual(saved);
  expect(await scan(dir)).not.toMatch(/fixture-secret-key|Authorization|private provider body/);
 });
 it('publishes inherited observations before advertising a resumed checkpoint, even if the task stops immediately',async()=>{
  const {dir,request}=await input();let count=0;
  const failed=await runDesktopAiTask(request,()=>{},vi.fn(async()=>count++===0?reply(architecture):new Response('',{status:503})));
  let checkpoint='';const fetcher=vi.fn();
  await expect(runDesktopAiTask({...request,op:'resume-reconstruction',checkpointPath:failed.checkpointPath,outputDirectory:path.join(dir,'interrupted-copy')},(e:any)=>{if(e.checkpoint){checkpoint=e.checkpoint;throw new Error('Synthetic stop at publication');}},fetcher)).rejects.toThrow('Synthetic stop');
  expect(fetcher).not.toHaveBeenCalled();
  const inspection=await runDesktopAiTask({op:'inspect-reconstruction',checkpointPath:checkpoint});
  expect(inspection.remainingRequests).toBe(1);
  expect(await readFile(path.join(path.dirname(checkpoint),'source-architecture.json'))).toEqual(await readFile(path.join(request.outputDirectory,'source-architecture.json')));
 });
 it('reassembles offline after a real output-write failure, with both observations retained and zero new requests',async()=>{
  const {dir,request}=await input();const fetcher=normal();
  const failed=await runDesktopAiTask(request,(e:any)=>{if(e.phase==='Assembling the editable Project…')mkdirSync(path.join(request.outputDirectory,'project.json'));},fetcher);
  expect(failed.ok).toBe(false);expect(fetcher).toHaveBeenCalledTimes(2);
  const inspection=await runDesktopAiTask({op:'inspect-reconstruction',checkpointPath:failed.checkpointPath});expect(inspection.remainingRequests).toBe(0);
  const noFetch=vi.fn();const resumed=await runDesktopAiTask({op:'resume-reconstruction',checkpointPath:failed.checkpointPath,outputDirectory:path.join(dir,'offline')},()=>{},noFetch);
  expect(resumed.ok).toBe(true);expect(noFetch).not.toHaveBeenCalled();expect(resumed.cost).toBe(0);expect(resumed.usage.requestsStarted).toBe(0);
  expect(JSON.parse(await readFile(path.join(dir,'offline/source-architecture.json'),'utf8'))).toEqual(architecture);
 });
 it.each(['model','scale','image','pixels','version','observation','prompt'])('refuses %s mismatch before any new request',async change=>{
  const {dir,request}=await input();const done=await runDesktopAiTask(request,()=>{},normal());
  const resume:any={...request,op:'resume-reconstruction',checkpointPath:done.checkpointPath,outputDirectory:path.join(dir,'mismatch')};
  if(change==='model')resume.model='other/model';
  if(change==='scale')resume.scaleHint='500 cm';
  if(change==='image')await writeFile(request.imagePath,Buffer.from('changed'));
  if(change==='pixels')await writeFile(request.rasterPath,Buffer.alloc(360*300*4,0));
  if(change==='version'){const m=JSON.parse(await readFile(done.checkpointPath,'utf8'));m.identity.instructionsVersion='changed';await writeFile(done.checkpointPath,JSON.stringify(m));}
  if(change==='observation')await writeFile(path.join(request.outputDirectory,'source-architecture.json'),'{}');
  if(change==='prompt'){const file=path.join(request.outputDirectory,'furnishing-freeze.json'),f=JSON.parse(await readFile(file,'utf8'));f.promptSha256='0'.repeat(64);await writeFile(file,JSON.stringify(f));}
  const fetcher=vi.fn();await expect(runDesktopAiTask(resume,()=>{},fetcher)).rejects.toThrow(/Saved task/);expect(fetcher).not.toHaveBeenCalled();
 });
 it('retains usage of a malformed model response without accepting it as a reusable observation',async()=>{
  const {request}=await input();const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{invalid JSON'}}],usage:metrics})));
  const failed=await runDesktopAiTask(request,()=>{},fetcher);expect(failed.ok).toBe(false);expect(fetcher).toHaveBeenCalledTimes(1);
  expect(failed.usage.stages[0]).toMatchObject({status:'failed',usage:{inputTokens:100,outputTokens:20,totalTokens:120,cachedTokens:40,reasoningTokens:5,cost:.003}});
  expect(failed.usage.cost).toBe(.003);
  const inspect=await runDesktopAiTask({op:'inspect-reconstruction',checkpointPath:failed.checkpointPath});expect(inspect.remainingRequests).toBe(2);
  expect(await readFile(path.join(request.outputDirectory,'architecture-response.txt'),'utf8')).toBe('{invalid JSON');
 });
 it('treats an interrupted started request as unknown billing and resumes without an automatic retry',async()=>{
  const {request}=await input();const failed=await runDesktopAiTask(request,()=>{},vi.fn(async()=>{throw new Error('aborted');}));
  await unlink(path.join(request.outputDirectory,'architecture-failed.json'));
  const inspect=await runDesktopAiTask({op:'inspect-reconstruction',checkpointPath:failed.checkpointPath});
  expect(inspect.usage.stages[0].status).toBe('started');expect(inspect.usage.cost).toBeNull();expect(inspect.remainingRequests).toBe(2);
 });
 it('keeps new tasks independent and frozen prompts/geometry unchanged across a zero-call replay',async()=>{
  const {dir,request}=await input();const first=await runDesktopAiTask(request,()=>{},normal());const fresh=normal();
  await runDesktopAiTask({...request,outputDirectory:path.join(dir,'fresh')},()=>{},fresh);expect(fresh).toHaveBeenCalledTimes(2);
  const noFetch=vi.fn();await runDesktopAiTask({op:'resume-reconstruction',checkpointPath:first.checkpointPath,outputDirectory:path.join(dir,'replay')},()=>{},noFetch);
  expect(noFetch).not.toHaveBeenCalled();expect(JSON.parse(await readFile(path.join(dir,'replay/draft.json'),'utf8'))).toEqual(JSON.parse(await readFile(path.join(dir,'first/draft.json'),'utf8')));
  expect(await readFile(path.join(dir,'first/source-furnishing.json'))).toEqual(await readFile(path.join(dir,'replay/source-furnishing.json')));
 });
 it('does not present missing/invalid usage as zero or add cached/reasoning subsets',()=>{
  expect(observationUsage({})).toEqual({inputTokens:null,outputTokens:null,totalTokens:null,cachedTokens:null,reasoningTokens:null,cost:null});
  expect(observationUsage({...metrics,prompt_tokens:-1,completion_tokens:1.5,total_tokens:NaN,cost:-1})).toMatchObject({inputTokens:null,outputTokens:null,totalTokens:null,cost:null});
  expect(observationUsage(metrics).totalTokens).toBe(120);
 });
 it('uses the shared entrance command, clearing other starts without overwriting any original Project',async()=>{
  const {dir}=await input(),p=createDefaultProject('Multi-floor entry');const upper=structuredClone(p.floors[0]);upper.id='upper';upper.walkthroughStart={x:100,y:100};p.floors.push(upper);
  const floor=p.floors[0];floor.walls=[{id:'wall',start:{x:0,y:0},end:{x:600,y:0},thickness:15,height:280,color:'#444444'}];floor.doors=[{id:'door',wallId:'wall',position:.5,width:90,height:210,type:'single',swingDirection:'left',flipSide:false}];
  const file=path.join(dir,'multi.project.json'),bytes=JSON.stringify(p);await writeFile(file,bytes);
  const a=await runDesktopAiTask({op:'entrance',projectPath:file,floorId:floor.id,doorId:'door',side:'left'}),b=await runDesktopAiTask({op:'entrance',projectPath:file,floorId:floor.id,doorId:'door',side:'right'});
  const saved=JSON.parse(await readFile(a.projectPath,'utf8'));expect(saved.floors[1].walkthroughStart).toBeUndefined();expect(saved.floors[0].entrance).toEqual({doorId:'door',side:'left'});
  expect(a.projectPath).not.toBe(b.projectPath);expect(await readFile(file,'utf8')).toBe(bytes);
 });
});
