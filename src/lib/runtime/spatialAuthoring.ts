import type { Door, Point, Window } from '../models/types';
import { readProject } from '../utils/projectValidation';
import { projectOntoWall } from '../utils/wallProjection';
import { wallPointAt } from '../utils/wallPath';
import { wallPathProfile } from '../utils/wallProfiles';
import { applyArchitectureEditCommand, type ArchitectureEditCommand } from './architectureEditing';
import { compileRuntimeScene } from './compileRuntimeScene';
import { compileArchitecturePresentation } from './architecturePresentation';
import { validateRuntimeSpawns } from './playerSpawn';
import { validateFurnitureSupport } from './placementSupport';
import { validateFurnitureDoorClearance } from './doorClearance';

export type SpatialRequest = ArchitectureEditCommand | {
  type: 'opening-placement'; floorId:string; kind:'door'|'window'; id?:string;
  wallId:string; point:Point; width:number; height?:number; sillHeight?:number; material?:Door['material']; windowType?:Window['type'];
};
/** Read-only placement projection and validation; no candidate file, source
 * repair or retained edit history. The accepted command is compiled again by
 * the normal atomic native authoring boundary. */
export function spatialAuthoringPreview(input:unknown, request:SpatialRequest) {
  const source=readProject(input);
  let command:ArchitectureEditCommand;
  if(request.type==='opening-placement') {
    const floor=source.floors.find(f=>f.id===request.floorId),wall=floor?.walls.find(w=>w.id===request.wallId);
    if(!floor||!wall||wall.boundaryType==='air'||wall.boundaryType==='railing')throw new Error('Choose the actual solid wall for this opening.');
    const projection=projectOntoWall(request.point,wall);
    if(!projection)throw new Error('The opening cannot attach to this wall.');
    const existing=request.id?[...floor.doors,...floor.windows].find(o=>o.id===request.id):undefined;
    if(request.id&&!existing)throw new Error('Choose an existing opening.');
    if(existing && floor.doors.includes(existing as Door)!==(request.kind==='door')) throw new Error('Keep the selected opening kind.');
    const center=existing&&wallPointAt(wall,existing.position);
    const position=existing&&existing.wallId===wall.id&&center?.x===request.point.x&&center?.y===request.point.y?existing.position:projection.position;
    // No endpoint clamping: a too-wide or overlapping aperture stays invalid.
    command=existing?{type:'opening-update',floorId:floor.id,id:existing.id,wallId:wall.id,position,width:request.width,height:request.height??existing.height,...('sillHeight' in existing?{sillHeight:request.sillHeight??existing.sillHeight}:{})}
      :{type:'opening-add',floorId:floor.id,wallId:wall.id,position,width:request.width,kind:request.kind,material:request.material,windowType:request.windowType,height:request.height,sillHeight:request.sillHeight};
  } else command=request;
  const edited=applyArchitectureEditCommand(source,command);
  const scene=compileRuntimeScene(edited.project),architecture=compileArchitecturePresentation(scene);
  const problem=architecture.diagnostics.find(d=>d.code==='invalid-opening'||d.code==='overlapping-openings');
  if(problem)throw new Error(problem.message);
  validateRuntimeSpawns(scene);validateFurnitureSupport(scene);validateFurnitureDoorClearance(scene);
  let outline:Point[]=[];
  let center:Point|undefined;
  if(command.type==='opening-add'||command.type==='opening-update') {
    const floor=edited.project.floors.find(f=>f.id===command.floorId)!,wall=floor.walls.find(w=>w.id===command.wallId)!;
    const profile=wallPathProfile(wall),distance=profile.distanceAt(command.position);
    center=wallPointAt(wall,command.position);
    // Sample the actual path, retaining curved walls and its native distance scale.
    const atDistance=(target:number)=>{let lo=0,hi=1;for(let i=0;i<40;i++){const t=(lo+hi)/2;if(profile.distanceAt(t)<target)lo=t;else hi=t;}return wallPointAt(wall,(lo+hi)/2);};
    outline=Array.from({length:17},(_,i)=>atDistance(distance-command.width/2+command.width*i/16));
  }else if(command.type==='floor-area-add'||command.type==='floor-area-update')outline=command.points;
  return {command,outline,...(center?{center}:{}),selectedId:edited.selectedId,valid:true};
}
