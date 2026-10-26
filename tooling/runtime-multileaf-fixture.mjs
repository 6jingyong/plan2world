import { runtimeProductProject } from './runtime-product-fixture.mjs';
import { mkdir,writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Authored mechanism coverage, independent of real-image source fidelity. */
export async function runtimeMultileafProject() {
  const project=await runtimeProductProject(),floor=project.floors[0];
  project.id='authored-multileaf';project.name='Authored door mechanisms';delete project.customModels;
  project.floors=[floor];floor.rooms=[];floor.furniture=[];floor.stairs=[];floor.columns=[];floor.windows=[];
  const points=[[0,0],[2000,0],[2000,2400],[0,2400]];
  floor.walls=points.map(([x,y],i)=>({id:`outer-${i}`,start:{x,y},end:{x:points[(i+1)%4][0],y:points[(i+1)%4][1]},thickness:20,height:300,color:'#ccc'}));
  floor.doors=[{id:'entry',wallId:'outer-0',position:.15,width:100,height:220,type:'single',swingDirection:'left',flipSide:false}];
  floor.entrance={doorId:'entry',side:'left'};
  for(const [index,id] of ['two-track','three-track','four-split','pocket','unequal'].entries()) {
    const y=(index+1)*400,width=id==='unequal'?200:300;
    floor.walls.push({id:`host-${id}`,start:{x:0,y},end:{x:2000,y},thickness:20,height:300,color:'#ccc'});
    const count=id==='two-track'?2:id==='three-track'?3:id==='four-split'?4:1,w=width/count;
    const leaves=Array.from({length:count},(_,i)=>{
      const fixed=id!=='pocket'&&(i===0||(id==='four-split'&&i===3));
      return {id:`panel-${i+1}`,width:w,center:-width/2+w*(i+.5),track:id==='four-split'?(i===1||i===2?3:-3):(i-(count-1)/2)*6,
        motion:fixed?'fixed':'slide',travel:fixed?0:id==='pocket'?width:id==='four-split'?(i===1?-w:w):-i*w};
    });
    floor.doors.push({id,wallId:`host-${id}`,position:.5,width,height:220,type:id==='unequal'?'double':id==='pocket'?'pocket':'sliding',swingDirection:'left',flipSide:false,
      leafConfiguration:id==='unequal'?{kind:'paired',firstLeafRatio:.3}:{kind:'sliding',leaves}});
  }
  return project;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const directory=path.resolve(process.argv[2]);await mkdir(directory,{recursive:true});
  const input=path.join(directory,'doors.project.json');await writeFile(input,JSON.stringify(await runtimeMultileafProject()));
  execFileSync(process.execPath,['tooling/runtime-export.mjs',input,path.join(directory,'doors.runtime.json'),'--package',path.join(directory,'doors.scene.zip')],{stdio:'inherit'});
}
