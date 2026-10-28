import {runtimeProductProject} from './runtime-product-fixture.mjs';

/** A valid source with a narrow hole between the old five footprint probes. */
export async function runtimeSupportProject(){
  const project=await runtimeProductProject(),floor=project.floors[0];
  project.id='authored-support';project.name='Explicit footprint support';
  floor.furniture.find(item=>item.id==='sofa').position={x:600,y:200};
  floor.rooms.push({id:'slit',name:'1cm floor slit',walls:[],floorTexture:'concrete',area:0,floorOpening:true,
    boundary:[[470,150],[471,150],[471,250],[470,250]].map(([x,y])=>({point:{x,y}}))});
  return project;
}
