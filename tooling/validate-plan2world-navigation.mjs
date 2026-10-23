import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
const root=process.cwd(), run=resolve(process.argv[2] ?? (await readFile('.plan2world-validation/current-run.txt','utf8')).trim());
const json=async p=>JSON.parse(await readFile(resolve(run,p),'utf8'));
const save=async(p,v)=>writeFile(resolve(run,p),JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o444});
const hash=b=>createHash('sha256').update(b).digest('hex');
const server=await createServer({root,configFile:false,logLevel:'error',resolve:{alias:{$lib:resolve(root,'src/lib')}},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null,ws:false},appType:'custom'});
try {
 const [{draftToProjectWithSourceBackground},{analyzeFloor},{pointInPolygon},collision,{floorInteriorPoint},{projectOntoWall},{wallPointAt}]=await Promise.all([
  server.ssrLoadModule('/src/lib/plan2world/sourceBackground.ts'),server.ssrLoadModule('/src/lib/utils/floorAnalysis.ts'),
  server.ssrLoadModule('/src/lib/utils/hitTesting.ts'),server.ssrLoadModule('/src/lib/utils/floorClearance.ts'),
  server.ssrLoadModule('/src/lib/utils/floorInteriorPoint.ts'),server.ssrLoadModule('/src/lib/utils/wallProjection.ts'),
  server.ssrLoadModule('/src/lib/utils/wallPath.ts')]);
 const draft=await json(`${process.argv[4] ?? 'assembled'}/draft.json`),stage=await json(`${process.argv[3] ?? 'prepared'}/architecture-stage.json`),source=await readFile(resolve(run,'source.jpg'));
 const project=draftToProjectWithSourceBackground(draft,{dataUrl:`data:image/jpeg;base64,${source.toString('base64')}`,width:stage.sourceContext.sourceWidthPx,height:stage.sourceContext.sourceHeightPx,name:'case02-original.jpg'});
 await save('inspection/native-project-with-source.json',project);
 const floor=project.floors[0], analysis=analyzeFloor(floor), world=collision.buildFloorClearance(floor);
 const rooms=analysis.rooms.filter(room=>!room.floorOpening&&room.roomType!=='outdoor');
 const contains=(room,p)=>pointInPolygon(p,analysis.polygons.get(room.id)??[])&&!(analysis.holes.get(room.id)??[]).some(hole=>pointInPolygon(p,hole));
 const roomIds=p=>rooms.filter(room=>contains(room,p)).map(room=>room.id),inside=p=>roomIds(p).length>0;
 const start=floorInteriorPoint(analysis,world),dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const traversable=(a,b)=>{
  for(let t=0,n=Math.max(1,Math.ceil(dist(a,b)/5));t<=n;t++)if(!inside({x:a.x+(b.x-a.x)*t/n,y:a.y+(b.y-a.y)*t/n}))return false;
  return collision.hasClearanceAlongSegment(a,b,world);
 };
 const points=rooms.flatMap(r=>analysis.polygons.get(r.id)??[]),minX=Math.min(...points.map(p=>p.x)),minY=Math.min(...points.map(p=>p.y));
 const step=20,cols=Math.ceil((Math.max(...points.map(p=>p.x))-minX)/step)+1,rows=Math.ceil((Math.max(...points.map(p=>p.y))-minY)/step)+1;
 const grid=Array.from({length:cols*rows},(_,id)=>({x:minX+id%cols*step,y:minY+Math.floor(id/cols)*step}));
 const free=grid.map(p=>inside(p)&&dist(collision.resolveClearancePoint(p,world),p)<1e-4);
 let bridge;
 const seed=grid.map((p,id)=>({id,d:dist(start,p)})).filter(p=>free[p.id]&&p.d<=step*2).sort((a,b)=>a.d-b.d).find(({id})=>{
  const p=grid[id];
  for(const mid of [{x:p.x,y:start.y},{x:start.x,y:p.y}])if(traversable(start,mid)&&traversable(mid,p)){bridge=[start,mid,p];return true;}
  return false;
 });
 const parent=new Int32Array(grid.length).fill(-2),queue=[];
 if(seed){parent[seed.id]=-1;queue.push(seed.id);}
 for(let i=0;i<queue.length;i++){
  const id=queue[i],x=id%cols,y=Math.floor(id/cols);
  for(const next of [x>0?id-1:-1,x+1<cols?id+1:-1,y>0?id-cols:-1,y+1<rows?id+cols:-1]){
   if(next<0||parent[next]!==-2||!free[next]||!traversable(grid[id],grid[next]))continue;
   parent[next]=id;queue.push(next);
  }
 }
 const roomAudit=rooms.map(room=>{const ids=grid.flatMap((p,id)=>free[id]&&contains(room,p)?[id]:[]);return {roomId:room.id,areaM2:room.area,
  availableGridNodes:ids.length,reachableGridNodes:ids.filter(id=>parent[id]!==-2).length,
  polygon:analysis.polygons.get(room.id),holes:analysis.holes.get(room.id)??[]};});
 const trace=await json('inspection/trace.json');
 const registration=draft.sourceRegistration;
 const scaleEvidence=stage.architecture.scaleEvidence;
 const cmPerPixel=scaleEvidence.realLengthCm/dist(...scaleEvidence.endpoints);
 // Correspondence uses the actual program-produced registration, never a new fit.
 const srcToPlan=p=>{
  const item=floor.furniture.find((_,i)=>i===0), anchor=stage.furnishingEvidence.furniture[0].position;
  return {x:item.position.x+(p.x-anchor.x)*cmPerPixel,y:item.position.y+(p.y-anchor.y)*cmPerPixel};
 };
 const routeTo=(id)=>{const reverse=[];for(let n=id;n!==-1;n=parent[n])reverse.push(grid[n]);const raw=[...bridge,...reverse.reverse().slice(1)],out=[];
  for(const p of raw){if(out.length&&dist(out.at(-1),p)<1e-5)continue;
   if(out.length>=2){const a=out.at(-2),b=out.at(-1);if(Math.abs((b.x-a.x)*(p.y-b.y)-(b.y-a.y)*(p.x-b.x))<1e-6){out[out.length-1]=p;continue;}}
   out.push(p);
  }return out;
 };
 const targets=await json('navigation-targets.json');
 const routes=targets.map(([name,xy])=>{
  const target=srcToPlan({x:xy[0],y:xy[1]}),targetRooms=roomIds(target),ordered=queue.filter(id=>targetRooms.some(r=>contains(rooms.find(q=>q.id===r),grid[id]))).sort((a,b)=>dist(grid[a],target)-dist(grid[b],target));
  const goal=ordered[0];
  return {name,sourceTarget:{x:xy[0],y:xy[1]},planTarget:target,targetRoomIds:targetRooms,
   status:goal===undefined?'no-reachable-sample-in-target-region':'sampled-route',
   ...(goal===undefined?{}:{sampleTarget:grid[goal],distanceFromDesiredTargetCm:dist(grid[goal],target),waypoints:routeTo(goal)})};
 });
 const furnitureRooms=floor.furniture.map((item,index)=>({index:index+1,category:draft.floors[0].furniture[index].sourceCategory,
  sourcePosition:stage.furnishingEvidence.furniture[index].position,position:item.position,roomIds:roomIds(item.position)}));
 const doorAudit=floor.doors.map(d=>{const wall=floor.walls.find(w=>w.id===d.wallId);return {doorId:d.id,position:wallPointAt(wall,d.position),widthCm:d.width,
  roomIds:rooms.filter(r=>r.walls.includes(d.wallId)).map(r=>r.id)};});
 const report={diagnosticOnly:process.argv[4]==='assembled-diagnostic',unresolvedAcceptedOpenings:stage.openingAudit.filter(item=>item.programStatus==='unresolved-host').map(item=>item.label),mode:'native full-collision sampling, not browser movement',draftSha256:hash(await readFile(resolve(run,`${process.argv[4] ?? 'assembled'}/draft.json`))),
  sourceRegistration:registration,sourceScaleCmPerPixel:cmPerPixel,geometryChanged:false,furnitureIncluded:true,exteriorTraversalAllowed:false,stepCm:step,
  playerRadiusCm:collision.DEFAULT_WALKTHROUGH_PLAYER_RADIUS,start,startRoomIds:roomIds(start),gridCells:grid.length,reachableGridNodes:queue.length,
  roomCount:rooms.length,reachedRoomCount:roomAudit.filter(r=>r.reachableGridNodes>0).length,rooms:roomAudit,furnitureRooms,doorAudit,routes,

  limitation:'Indoor native polygons can incorrectly merge source rooms. A grid route is a navigation plan, not proof of browser movement or source correctness. Full collision includes unchanged legacy imported-object blocks.'};
 await save('inspection/native-full-collision.json',report);
 console.log(JSON.stringify({start,regions:rooms.length,reached:report.reachedRoomCount,uncontainedFurniture:furnitureRooms.filter(f=>!f.roomIds.length),routes:routes.map(({waypoints,...r})=>({...r,waypointCount:waypoints?.length})),
  unresolvedHosts:stage.openingAudit.filter(x=>x.programStatus==='unresolved-host')},null,2));
} finally {await server.close();}
