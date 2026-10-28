import{runtimeProductProject}from'./runtime-product-fixture.mjs';
import{mkdir,writeFile}from'node:fs/promises';
import path from'node:path';import{fileURLToPath}from'node:url';

/** Fixed author input for renderer calibration, not a reconstructed case. */
export async function runtimeLightingReferenceProject(){
  const project=await runtimeProductProject(),floor=project.floors[0];project.id='lighting-reference';project.name='Lighting reference';project.floors=[floor];delete project.customModels;delete project.projectPackage;
  const points=[[0,0],[600,0],[600,600],[0,600]];
  floor.walls=points.map(([x,y],i)=>({id:`reference-${i}`,start:{x,y},end:{x:points[(i+1)%4][0],y:points[(i+1)%4][1]},height:300,thickness:20,color:'#ccc'}));
  floor.doors=[{id:'entry',wallId:'reference-0',position:.2,width:100,height:220,type:'single',swingDirection:'left',flipSide:false}];floor.entrance={doorId:'entry',side:'left'};
  floor.rooms=[];floor.stairs=[];floor.columns=[];
  floor.windows=[{id:'daylight-window',wallId:'reference-1',position:.5,width:300,height:200,sillHeight:50,type:'fixed'}];
  const item=(id,catalogId,x,y,extra={})=>({id,catalogId,position:{x,y},rotation:0,scale:{x:1,y:1,z:1},...extra});
  floor.furniture=[item('reference-light','ceiling_light',300,300,{ceilingMount:{wallIds:floor.walls.map(w=>w.id)},light:{enabled:true,lumens:800,temperatureKelvin:4000}}),
    item('reference-art','wall_art',450,587.4,{rotation:180,wallMount:{wallId:'reference-2',side:'left',elevation:110}}),
    item('reference-mirror','mirror',12.6,350,{rotation:270,wallMount:{wallId:'reference-3',side:'left',elevation:110}}),
    item('reference-marker','imported_object',500,450,{sourceCategory:'storage',width:50,depth:50,height:60})];
  return project;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const output=path.resolve(process.argv[2]);await mkdir(output,{recursive:true});await writeFile(path.join(output,'lighting.project.json'),JSON.stringify(await runtimeLightingReferenceProject()));
}
