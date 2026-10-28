import type {FurnitureItem} from '../models/types';
import {readProject} from '../utils/projectValidation';
import {getFurnitureSize} from '../utils/furnitureCatalog';
import {needsWallMount,furnitureWallFrame} from '../utils/furniturePlacement';
import {needsCeilingMount,ceilingHosts} from '../utils/ceilingFurniture';
import {floorElevations} from '../utils/floors';
import {layoutAssetFields,layoutElementIds,type FurnitureLayoutCommand} from './furnitureLayout';
import {runtimeWallMovement} from './furnitureMovement';
import type {RuntimeFurnitureEntity} from './types';

export type PlacementPreviewRequest=Extract<FurnitureLayoutCommand,{type:'add'|'replace'}>;
/** Read-only UI descriptor. It may preview an invalid landing; only the accepted
 * add/replace command compiles a Project/package. No provisional Project is saved. */
export function furniturePlacementPreview(input:unknown,command:PlacementPreviewRequest):RuntimeFurnitureEntity {
  const project=readProject(input),floor=project.floors.find(f=>f.id===command.floorId);
  if(!floor||!['add','replace'].includes(command.type))throw new Error('Choose a floor and a furniture asset.');
  const existing=command.type==='replace'?floor.furniture.find(item=>item.id===command.id):undefined;
  if(command.type==='replace'&&(!existing||existing.locked))throw new Error('Choose unlocked furniture to replace.');
  let id=existing?.id??'placement-preview';
  const ids=layoutElementIds(project);
  while(!existing&&ids.has(id))id+='-new';
  const fields=layoutAssetFields(project,command.asset),position=command.position??existing?.position;
  if(!position||![position.x,position.y].every(Number.isFinite))throw new Error('Preview position must be finite.');
  const item: FurnitureItem={id,catalogId:fields.catalogId!,...fields,position:{...position},rotation:command.rotation??existing?.rotation??0,scale:{x:1,y:1,z:1}};
  const size=getFurnitureSize(item),elevation=floorElevations(project.floors).find(f=>f.floor.id===floor.id)!.elevation;
  let movement:RuntimeFurnitureEntity['movement']={kind:'floor',elevation:elevation*.01};
  let bottom=0;
  if(needsCeilingMount(item.catalogId)){
    const mount=command.ceilingMount??existing?.ceilingMount;
    const host=mount&&ceilingHosts(floor).find(h=>JSON.stringify([...h.wallIds].sort())===JSON.stringify([...mount.wallIds].sort()));
    if(!host||size.height>=host.height)throw new Error('Choose a supported ceiling that fits this light.');
    bottom=host.height-size.height;movement={kind:'ceiling',roomId:host.id,elevation:(elevation+host.height)*.01};
  }else if(needsWallMount(item.catalogId)||command.wallMount||existing?.wallMount){
    const mount=command.wallMount??existing?.wallMount;
    if(!mount||!Number.isFinite(mount.elevation))throw new Error('Choose an explicit wall, side and height.');
    item.wallMount={...mount};const frame=furnitureWallFrame(floor,item);
    const along=Math.max(frame.along[0],Math.min(frame.along[1],(position.x-frame.origin.x)*frame.tangent.x+(position.y-frame.origin.y)*frame.tangent.y));
    bottom=Math.max(frame.bottom[0],Math.min(frame.bottom[1],mount.elevation));
    item.position={x:frame.origin.x+along*frame.tangent.x,y:frame.origin.y+along*frame.tangent.y};item.rotation=frame.rotation;
    movement=runtimeWallMovement(frame,mount,elevation);
  }
  return {id,floorId:floor.id,kind:'furniture',catalogId:item.catalogId,assetRef:fields.customModelId?`custom-model:${fields.customModelId}`:`catalog:${item.catalogId}`,
    locked:false,movement,position:[item.position.x*.01,(elevation+bottom+size.height/2)*.01,item.position.y*.01],yawClockwiseRadians:item.rotation*Math.PI/180,size:[size.width*.01,size.height*.01,size.depth*.01]};
}
