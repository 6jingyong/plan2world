#!/usr/bin/env node
import {createServer} from 'vite';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {runtimeProductProject} from './runtime-product-fixture.mjs';

const directory=path.resolve(process.argv[2]??'.plan2world-validation/layout-benchmark');
await mkdir(directory); // New evidence only; do not overwrite earlier timings.
const vite=await createServer({appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false}});
const results=[];
try{
  const {compileRuntimeArtifacts}=await vite.ssrLoadModule('/src/lib/runtime/runtimeArtifacts.ts');
  const {serializeRuntimePackage,runtimePackageFiles}=await vite.ssrLoadModule('/src/lib/runtime/runtimePackage.ts');
  const {applyNativeEditCommand}=await vite.ssrLoadModule('/src/lib/runtime/nativeEditing.ts');
  for(const count of [100,500,1000]){
    const project=await runtimeProductProject(),floor=project.floors[0],columns=Math.ceil(Math.sqrt(count)),span=columns*300+600;
    project.id=`layout-benchmark-${count}`;project.name=`Authored ${count}-item layout`;project.floors=[floor];delete project.customModels;delete project.projectPackage;
    const points=[[0,0],[span,0],[span,span],[0,span]];
    floor.walls=points.map(([x,y],i)=>({id:`wall-${i}`,start:{x,y},end:{x:points[(i+1)%4][0],y:points[(i+1)%4][1]},thickness:20,height:300,color:'#ccc'}));
    floor.doors=[{id:'entry',wallId:'wall-0',position:.1,width:100,height:220,type:'single',swingDirection:'left',flipSide:false}];floor.entrance={doorId:'entry',side:'left'};
    floor.rooms=[{id:'benchmark-ground',name:'Explicit benchmark ground',walls:[],floorTexture:'concrete',area:0,boundary:points.map(([x,y])=>({point:{x,y}}))}];floor.stairs=[];floor.columns=[];floor.windows=[];
    const catalog=['sofa','chair','coffee_table','bed_queen','dining_table','wardrobe','potted_plant','bookshelf'];
    floor.furniture=Array.from({length:count},(_,i)=>({id:`piece-${i}`,catalogId:catalog[i%catalog.length],position:{x:300+(i%columns)*300,y:300+Math.floor(i/columns)*300},rotation:0,scale:{x:1,y:1,z:1}}));
    const output=path.join(directory,String(count));await mkdir(output);await writeFile(path.join(output,'project.json'),JSON.stringify(project));
    const compileMs=[],packageMs=[],editMs=[];
    let artifacts,zip;
    const reader=async file=>new Uint8Array(await readFile(new URL(`../static/models/${file}.glb`,import.meta.url)));
    for(let i=0;i<5;i++){
      let start=performance.now();const candidate=applyNativeEditCommand(project,{type:'move',floorId:floor.id,id:'piece-0',position:{x:310,y:300}},new Date(0)).project;
      editMs.push(performance.now()-start);start=performance.now();artifacts=await compileRuntimeArtifacts(candidate,reader);compileMs.push(performance.now()-start);
      start=performance.now();zip=await serializeRuntimePackage(artifacts);packageMs.push(performance.now()-start);
    }
    for(const [name,bytes] of runtimePackageFiles(artifacts)){const file=path.join(output,name);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,bytes);}
    await writeFile(path.join(output,'scene.zip'),zip);
    const row={count,compileMs,packageMs,editMs,entities:artifacts.runtime.entities.length,colliders:artifacts.runtime.colliders.length,zipBytes:zip.length};results.push(row);console.log(JSON.stringify(row));
  }
  await writeFile(path.join(directory,'report.json'),JSON.stringify({node:process.version,platform:process.platform,scope:'local authored workload; five in-process samples, including cold first sample; excludes process startup and Godot main-thread loading',results},null,2)+'\n');
}finally{await vite.close();}
