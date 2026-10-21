import {chromium,expect} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {Matrix4,Vector3} from 'three';
import assert from 'node:assert/strict';
const run=resolve(process.argv[2] ?? (await readFile('.plan2world-validation/current-run.txt','utf8')).trim());
const load=async p=>JSON.parse(await readFile(resolve(run,p),'utf8'));
const save=async(p,v)=>writeFile(resolve(run,p),JSON.stringify(v,null,2)+'\n',{flag:'wx',mode:0o444});
const attempt='browser-tests/native-walkthrough';
await (await import('node:fs/promises')).mkdir(resolve(run,attempt),{recursive:true});
const native=await load('inspection/native-project-with-source.json'),audit=await load('inspection/native-full-collision.json');
const geometry=p=>p.floors.map(f=>({id:f.id,walls:f.walls,doors:f.doors,windows:f.windows,furniture:f.furniture}));
const fingerprint=p=>createHash('sha256').update(JSON.stringify(geometry(p))).digest('hex');
const b=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await b.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:resolve(run,'browser-tests/native-walkthrough/video'),size:{width:1000,height:694}}});
await context.tracing.start({screenshots:true,snapshots:true,sources:true});
const page=await context.newPage(),errors=[],consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
await page.addInitScript(()=>{
 localStorage.setItem('o3d_locale','en');localStorage.setItem('o3d_tips_seen',JSON.stringify(['first-3d','first-export','first-door']));
 const realRAF=window.requestAnimationFrame.bind(window),realCancel=window.cancelAnimationFrame.bind(window),realNow=performance.now.bind(performance);
 const normal=new Set(),queued=new Map();let manual=false,now=0,next=-1;
 const audit={view:null,fired:0,start:()=>{if(normal.size)return false;manual=true;return true;},
  step:(delta,frames)=>{for(let frame=0;frame<frames;frame++){now+=delta;for(const[id,callback]of [...queued]){if(!queued.delete(id))continue;audit.fired++;callback(now);}}return audit.view;}};
 window.__caseAudit=audit;
 Object.defineProperty(performance,'now',{value:()=>manual?now:realNow()});
 window.requestAnimationFrame=callback=>{if(manual){const id=next--;queued.set(id,callback);return id;}const id=realRAF(time=>{normal.delete(id);callback(time);});normal.add(id);return id;};
 window.cancelAnimationFrame=id=>{if(id<0)queued.delete(id);else{normal.delete(id);realCancel(id);}};
 const seen=new WeakSet(),getContext=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(...args){const gl=getContext.apply(this,args);if(!gl||!String(args[0]).startsWith('webgl')||seen.has(gl))return gl;seen.add(gl);
  const uniforms=new Map(),locate=gl.getUniformLocation.bind(gl),matrix=gl.uniformMatrix4fv.bind(gl);
  gl.getUniformLocation=(program,name)=>{const location=locate(program,name);if(location)uniforms.set(location,name);return location;};
  gl.uniformMatrix4fv=(location,transpose,values,...rest)=>{if(uniforms.get(location)==='viewMatrix')audit.view=Array.from(values);return matrix(location,transpose,values,...rest);};return gl;};
 HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.reject(new DOMException('Denied for keyboard-fallback test','NotAllowedError'));
});
const step=(delta=250,frames=1)=>page.evaluate(({delta,frames})=>window.__caseAudit.step(delta,frames),{delta,frames});
const position=async()=>{const v=await page.evaluate(()=>window.__caseAudit.view);assert.equal(v?.length,16);const p=new Vector3().setFromMatrixPosition(new Matrix4().fromArray(v).invert());return {x:p.x,y:p.z,eyeHeight:p.y};};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pointInPolygon=(p,polygon)=>{let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;};
const roomIds=p=>audit.rooms.filter(r=>pointInPolygon(p,r.polygon)&&!r.holes.some(h=>pointInPolygon(p,h))).map(r=>r.roomId);
const moves=[];
async function walkAxis(target,axis){
 for(let attempt=0;attempt<3;attempt++){
  const from=await position(),delta=target[axis]-from[axis];if(Math.abs(delta)<.7)break;
  const key=axis==='x'?(delta>0?'ArrowRight':'ArrowLeft'):(delta>0?'ArrowDown':'ArrowUp');
  await page.keyboard.down(key);
  let milliseconds=Math.abs(delta)/80*1000;
  while(milliseconds>1e-5){const frame=Math.min(250,milliseconds);await step(frame,1);milliseconds-=frame;}
  await page.keyboard.up(key);await step(250,5);
  const to=await position();moves.push({key,from,to,target,axis,attempt,remainingCm:distance(to,target)});
  if(distance(from,to)<.1)break;
 }
}
let report={status:'running',diagnosticOnly:audit.diagnosticOnly,sourceAcceptance:'not determined by navigation',normalAssembly:audit.diagnosticOnly?'blocked; explicit diagnostic input':'assembled normally',unresolvedAcceptedOpenings:audit.unresolvedAcceptedOpenings,
 inputFile:'inspection/native-project-with-source.json',inputGeometrySha256:fingerprint(native),method:'Actual production app import, WebGL rendering and native keyboard/collision path. Controlled RAF timestamps accelerate execution; the camera is observed via WebGL viewMatrix. No camera pose or project geometry writes.',
 pointerLock:'Deliberately denied to test keyboard fallback',defaultMovementSpeedCmPerSecond:80,routeResults:[],pageErrors:errors,consoleErrors};
try{
 await page.goto('http://127.0.0.1:4188/editor');await expect(page.getByRole('button',{name:'Save',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Export',exact:true}).click();const chooser=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'Import JSON',exact:true}).click();await(await chooser).setFiles(resolve(run,'inspection/native-project-with-source.json'));
 await expect(page.getByRole('application')).toContainText(`${native.floors[0].walls.length} walls`);await expect(page.getByRole('application')).toContainText(`${native.floors[0].doors.length} doors`);
 await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Saved ✓',{exact:true})).toHaveAttribute('title',/^Last saved:/);
 const savedUrl=page.url();await page.screenshot({path:resolve(run,'visuals/native-2d.png')});
 await page.getByRole('button',{name:'3D',exact:true}).click();
 const viewer=page.getByRole('region',{name:'3D floor plan viewer'});
 await expect(viewer.locator('canvas').first()).toHaveAttribute('data-rendered','true');
 await page.waitForLoadState('networkidle');await page.screenshot({path:resolve(run,'visuals/native-3d.png')});
 await expect.poll(()=>page.evaluate(()=>window.__caseAudit.start()),{timeout:20000}).toBe(true);
 const selected=audit.routes.map(route=>route.name);
 for(const name of selected){
  const route=audit.routes.find(r=>r.name===name);if(route.status!=='sampled-route'){report.routeResults.push({name,status:'no-route',geometryChanged:false});continue;}
  await page.getByRole('button',{name:'Enter Walkthrough Mode',exact:true}).click();
  await expect(page.getByText('Walkthrough Controls',{exact:true})).toBeVisible();await step(0,1);
  const start=await position();assert.ok(distance(start,audit.start)<.1,'browser starts at the native automatic point');
  const visited=new Set(roomIds(start)),waypoints=[],firstMove=moves.length;
  for(const target of route.waypoints.slice(1)){
   const before=await position();
   // The route is four-neighbour and merged only along collinear spans.
   const axis=Math.abs(target.x-before.x)>Math.abs(target.y-before.y)?'x':'y';
   await walkAxis(target,axis);const after=await position();for(const id of roomIds(after))visited.add(id);
   waypoints.push({target,actual:after,errorCm:distance(target,after),nativeRoomIds:roomIds(after)});
   if(distance(target,after)>4)break;
  }
  const end=await position(),reached=route.targetRoomIds.some(id=>roomIds(end).includes(id))&&distance(end,route.sampleTarget)<4;
  const slug=name.replaceAll(' ','-');const image=await viewer.locator('canvas').first().evaluate(c=>c.toDataURL('image/png'));await writeFile(resolve(run,`visuals/walkthrough-${slug}.png`),Buffer.from(image.split(',')[1],'base64'),{flag:'wx',mode:0o444});
  report.routeResults.push({name,status:reached?'reached-sampled-target':'blocked-or-diverged',start,end,
   targetSourcePosition:route.sourceTarget,sampleTarget:route.sampleTarget,targetNativeRoomIds:route.targetRoomIds,visitedNativeRoomIds:[...visited],
   waypointCount:route.waypoints.length,waypoints,moveRange:[firstMove,moves.length],geometryChanged:false});
  console.log(JSON.stringify({name,status:report.routeResults.at(-1).status,end,waypoints:waypoints.length}));
  await page.getByRole('button',{name:'Exit Walkthrough Mode',exact:true}).click();await step(0,1);
 }
 // Exit navigation and reload the saved project; exported geometry must match the import exactly.
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.reload();
 await expect(page.getByRole('button',{name:'Save',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Export',exact:true}).click();const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download JSON',exact:true}).click();
 const path=await(await download).path(),restored=JSON.parse(await readFile(path,'utf8'));await save(attempt+'/exported-after-walkthrough.json',restored);
 assert.deepEqual(geometry(restored),geometry(native),'native import, movement, save and reload preserve all walls/openings/furniture');
 assert.deepEqual(restored.floors[0].backgroundImage,native.floors[0].backgroundImage);
 assert.deepEqual(errors,[]);
 report={...report,status:'completed',savedUrl,exportGeometrySha256:fingerprint(restored),geometryUnchanged:true,
  backgroundRegistrationUnchanged:true,actualWebGLRendered:true,keyboardMovementExercised:moves.some(m=>distance(m.from,m.to)>20),
  routesReached:report.routeResults.filter(r=>r.status==='reached-sampled-target').length,routeCount:report.routeResults.length,
  limitation:'Native room IDs may merge several source rooms. Reaching targets does not establish correct room topology. Furniture remains the unchanged legacy colliding block preview.'};
}catch(error){report={...report,status:'failed',error:String(error),stack:error.stack};await page.screenshot({path:resolve(run,'visuals/browser-walkthrough-failure.png'),timeout:3000}).catch(()=>{});process.exitCode=1;
}finally{
 await save(attempt+'/movement-events.json',moves);await save(attempt+'/walkthrough-result.json',report);
 await context.tracing.stop({path:resolve(run,attempt+'/trace.zip')});await context.close();await b.close();
 console.log(JSON.stringify({status:report.status,routesReached:report.routesReached,routeCount:report.routeCount,geometryUnchanged:report.geometryUnchanged,error:report.error,pageErrors:errors},null,2));
}
