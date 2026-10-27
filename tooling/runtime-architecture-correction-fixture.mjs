import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {encodeRgbaPng} from './png-raster.mjs';

/** Authored synthetic input for native editing, never an extraction-quality case. */
export function architectureCorrectionProject(broken=false){
 const walls=[[0,0,600,0],[600,0,600,600],[600,600,0,600],[0,600,0,0]].map(([x,y,a,b],i)=>({id:`w${i}`,start:{x,y},end:{x:a,y:b},height:280,thickness:15,color:'#444444'}));
 const floor={id:'ground',name:'Ground floor',level:0,walls:broken?walls.slice(1):walls,rooms:[],doors:broken?[]:[{id:'entry',wallId:'w0',position:.25,width:90,height:210,type:'single',swingDirection:'left',flipSide:false}],windows:[],furniture:[],stairs:[],columns:[],guides:[],measurements:[],annotations:[],textAnnotations:[],groups:[],
  backgroundImage:{dataUrl:'data:image/png;base64,'+Buffer.from(encodeRgbaPng({width:100,height:100,data:Buffer.alloc(40000,255)})).toString('base64'),position:{x:300,y:300},scale:6,rotation:0,opacity:.5,locked:true}};
 if(!broken)floor.entrance={doorId:'entry',side:'left'};
 return {id:'architecture-correction-fixture',name:'Synthetic architecture correction',createdAt:new Date(0),updatedAt:new Date(0),activeFloorId:floor.id,floors:[floor],architectureReview:{version:1,issues:[{id:'source-entry',floorId:floor.id,message:'Synthetic unhosted entry: add the north wall and door.',position:{x:150,y:0},sourceRecord:'Original synthetic observation retained.',resolved:false}]}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const directory=path.resolve(process.argv[2]);await mkdir(directory,{recursive:true});
 for(const [name,broken]of [['valid',false],['broken',true]])await writeFile(path.join(directory,name+'.project.json'),JSON.stringify(architectureCorrectionProject(broken),null,2)+'\n');
}
