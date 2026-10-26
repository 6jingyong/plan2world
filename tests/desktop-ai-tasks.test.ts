import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runDesktopAiTask } from '../tooling/desktop-ai-tasks.mjs';
import { reconstructFloorPlanWithObserver } from '$lib/plan2world/vision';
import { readProject } from '$lib/utils/projectValidation';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { encodeRgbaPng } from '../tooling/png-raster.mjs';

const directories: string[]=[];
afterEach(async () => { await Promise.all(directories.splice(0).map(d => rm(d,{recursive:true,force:true}))); });
const evidence={decision:'accept',decisionBasis:'Unit source boundary.',evidence:'Unit source stroke.'};
const architecture={schemaVersion:'source-architecture-v1',scaleEvidence:{kind:'measured_dimension',realLengthCm:360,endpoints:[{x:0,y:0},{x:360,y:0}],evidence:'360cm'},
  walls:[[[0,0],[360,0]],[[360,0],[360,300]],[[360,300],[0,300]],[[0,300],[0,0]]].map(([a,b],i)=>({...evidence,label:'wall'+i,start:{x:a[0],y:a[1]},end:{x:b[0],y:b[1]}})),
  openings:[{...evidence,label:'entry',kind:'door',endpoints:[{x:135,y:0},{x:225,y:0}]}],doorGaps:[]};
const furnishing={schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:{x:180,y:150}}]};

// Original synthetic PNG and its exact opaque-white pixels, for transport parity
// only. This is not a real-floorplan/model extraction quality evaluation.
function png() {
  return encodeRgbaPng({width:360,height:300,data:Buffer.alloc(360*300*4,255)});
}
async function input() {
  const dir=await mkdtemp(path.join(tmpdir(),'p2w-desktop-test-'));directories.push(dir);
  const image=png(),pixels=Buffer.alloc(360*300*4,255);
  const imagePath=path.join(dir,'original.png'),rasterPath=path.join(dir,'original.rgba');
  await writeFile(imagePath,image);await writeFile(rasterPath,pixels);
  return {dir,image,pixels,request:{op:'reconstruct',apiKey:'fixture-private-key',model:'fixture/vision',imagePath,rasterPath,width:360,height:300,outputDirectory:path.join(dir,'result'),scaleHint:'360 cm'}};
}
describe('shared native desktop reconstruction',()=>{
  it('runs the same two-pass pipeline with original raster, freezes observations and saves canonical native data without credentials',async()=>{
    const {dir,image,pixels,request}=await input();let pass=0;
    const fetcher=vi.fn(async (_url:string,init:RequestInit)=>{
      const body=JSON.parse(init.body as string),prompt=body.messages[0].content[1].text;
      if(pass===0)expect(prompt).toContain('source-architecture-v1');
      else {expect(prompt).toContain('FROZEN_ARCHITECTURE_JSON:');expect(JSON.parse(await readFile(path.join(request.outputDirectory,'source-architecture.json'),'utf8'))).toEqual(architecture);}
      expect(body.messages[0].content[0].image_url.url).toBe('data:image/png;base64,'+image.toString('base64'));
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(pass++===0?architecture:furnishing)}}],usage:{cost:.01}}));
    });
    const events:unknown[]=[];
    const result=await runDesktopAiTask(request,(e:unknown)=>events.push(e),fetcher);
    expect(result.ok).toBe(true);expect(result.cost).toBe(.02);expect(result.floors[0].doors[0].sourcePoint[0]).toBeCloseTo(.5);expect(result.floors[0].doors[0].sourcePoint[1]).toBeCloseTo(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
    let observed=0;
    const shared=await reconstructFloorPlanWithObserver(async()=>observed++===0?architecture:furnishing,{context:{sourceWidthPx:360,sourceHeightPx:300},raster:{width:360,height:300,data:pixels}},{scaleHint:'360 cm'});
    expect(JSON.parse(await readFile(path.join(request.outputDirectory,'draft.json'),'utf8'))).toEqual(shared.draft);
    const project=readProject(JSON.parse(await readFile(result.projectPath,'utf8')));
    expect(project.floors[0].backgroundImage?.dataUrl).toContain(image.toString('base64'));
    expect(project.floors[0].entrance).toBeUndefined();
    expect(events).toHaveLength(3);
    for(const filename of await readdir(request.outputDirectory))expect(await readFile(path.join(request.outputDirectory,filename),'utf8')).not.toMatch(/fixture-private-key|apiKey|Authorization/);
    expect(await readFile(request.imagePath)).toEqual(image);
    const choice=result.floors[0].doors[0];
    const accepted=await runDesktopAiTask({op:'entrance',projectPath:result.projectPath,floorId:project.floors[0].id,doorId:choice.id,side:'left'});
    const after=readProject(JSON.parse(await readFile(accepted.projectPath,'utf8')));
    expect(after.floors[0].entrance).toEqual({doorId:choice.id,side:'left'});
    delete after.floors[0].entrance;
    expect(after).toEqual(project);
    await expect(runDesktopAiTask({op:'entrance',projectPath:result.projectPath,floorId:project.floors[0].id,doorId:'not-authored',side:'left'})).rejects.toThrow('Choose an authored');
    expect(dir).toContain('p2w-desktop-test');
  });
  it('rejects mismatched original pixels before any paid request',async()=>{
    const {request}=await input();const fetcher=vi.fn();
    await expect(runDesktopAiTask({...request,width:359},()=>{},fetcher)).rejects.toThrow('Original raster');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('retains failed architecture evidence and never requests furniture after preflight failure',async()=>{
    const {request}=await input(),bad={...architecture,walls:[...architecture.walls,architecture.walls[0]]};
    const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(bad)}}]})));
    await expect(runDesktopAiTask(request,()=>{},fetcher)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(path.join(request.outputDirectory,'source-architecture.json'),'utf8'))).toEqual(bad);
    expect((await readdir(request.outputDirectory)).sort()).toEqual(['architecture-freeze.json','source-architecture.json']);
    const receipt=JSON.parse(await readFile(path.join(request.outputDirectory,'architecture-freeze.json'),'utf8'));
    expect(receipt.modelId).toBe('fixture/vision');expect(receipt.promptSha256).toMatch(/^[a-f0-9]{64}$/);expect(receipt.observationSha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it('prepares without a provider, then uses the confirmed image for both observations, background and saved provenance',async()=>{
    const {request,image}=await input(),fetcher=vi.fn();
    const preparation=await runDesktopAiTask({...request,op:'prepare-image',pixelOrientation:'upright',recipe:{mode:'perspective',quarterTurns:0,corners:[{x:.1,y:.1},{x:.9,y:.15},{x:.85,y:.9},{x:.15,y:.85}],aspectRatio:1.2,outputWidth:360},outputDirectory:request.outputDirectory+'-image'},()=>{},fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    let pass=0;const working=await readFile(preparation.imagePath);
    const observe=vi.fn(async(_url:string,init:RequestInit)=>{
      const body=JSON.parse(init.body as string);
      expect(body.messages[0].content[0].image_url.url).toBe('data:image/png;base64,'+working.toString('base64'));
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(pass++===0?architecture:furnishing)}}]}));
    });
    const preparedRequest={...request,imagePath:preparation.imagePath,rasterPath:preparation.rasterPath,preparationManifestPath:preparation.manifestPath,originalImagePath:preparation.originalPath};
    const result=await runDesktopAiTask(preparedRequest,()=>{},observe);
    expect(observe).toHaveBeenCalledTimes(2);
    const project=readProject(JSON.parse(await readFile(result.projectPath,'utf8')));
    expect(project.floors[0].backgroundImage?.dataUrl).toBe('data:image/png;base64,'+working.toString('base64'));
    expect(project.reconstruction?.inputPreparation?.originalDataUrl).toBe('data:image/png;base64,'+image.toString('base64'));
    expect(project.reconstruction?.inputPreparation?.manifest).toEqual(preparation.manifest);
    const runtime=compileRuntimeScene(project),withoutEvidence=structuredClone(project);delete withoutEvidence.reconstruction!.inputPreparation;
    expect(compileRuntimeScene(withoutEvidence)).toEqual(runtime);
    const corrupted=Buffer.from(working);corrupted[20]^=1;await writeFile(preparation.imagePath,corrupted);
    await expect(runDesktopAiTask({...preparedRequest,outputDirectory:request.outputDirectory+'-tamper'},()=>{},fetcher)).rejects.toThrow(/after confirmation/);
    expect(fetcher).not.toHaveBeenCalled();expect(await readFile(request.imagePath)).toEqual(image);
  });
});
