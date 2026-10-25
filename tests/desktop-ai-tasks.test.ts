import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { runDesktopAiTask } from '../tooling/desktop-ai-tasks.mjs';
import { reconstructFloorPlanWithObserver } from '$lib/plan2world/vision';
import { readProject } from '$lib/utils/projectValidation';

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
  const crc=(bytes:Buffer) => { let v=0xffffffff;for(const b of bytes){v^=b;for(let j=0;j<8;j++)v=(v>>>1)^((v&1)?0xedb88320:0);}return(v^0xffffffff)>>>0; };
  const chunk=(type:string,body:Buffer)=>{const data=Buffer.concat([Buffer.from(type),body]),n=Buffer.alloc(4),c=Buffer.alloc(4);n.writeUInt32BE(body.length);c.writeUInt32BE(crc(data));return Buffer.concat([n,data,c]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(360);header.writeUInt32BE(300,4);header[8]=8;header[9]=6;
  const scan=Buffer.alloc((360*4+1)*300,255);for(let i=0;i<300;i++)scan[i*(360*4+1)]=0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
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
    expect(await readdir(request.outputDirectory)).toEqual(['source-architecture.json']);
  });
});
