#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
const options={},args=process.argv.slice(2);
for(let i=0;i<args.length;i+=2){if(!['--stage','--source','--output'].includes(args[i])||!args[i+1])throw Error('Usage: --stage architecture-stage.json --source original.jpg --output NEW_DIRECTORY');options[args[i].slice(2)]=resolve(args[i+1]);}
if(!options.stage||!options.source||!options.output)throw Error('Missing stage/source/output');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),bytes=await readFile(options.stage),source=await readFile(options.source),stage=JSON.parse(bytes),sha=b=>createHash('sha256').update(b).digest('hex');
if(!stage.functionalZoneReview)throw Error('Requires a functional-zone stage.');
const server=await createServer({root,configFile:false,logLevel:'error',resolve:{alias:{$lib:resolve(root,'src/lib')}},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null,ws:false},appType:'custom'});
try{
 const [{prepareArchitectureStage},{draftToProject},{analyzeFloor}]=await Promise.all([server.ssrLoadModule('/src/lib/plan2world/architecture.ts'),server.ssrLoadModule('/src/lib/plan2world/draft.ts'),server.ssrLoadModule('/src/lib/utils/floorAnalysis.ts')]);
 if(JSON.stringify(prepareArchitectureStage(stage.architecture,stage.sourceContext,stage.furnishingEvidence,stage.rasterEvidence))!==JSON.stringify(stage))throw Error('Frozen stage does not match current canonical program.');
 const floor=draftToProject(stage.architectureDraft,new Date(0)).floors[0],analysis=analyzeFloor(floor),review=stage.functionalZoneReview;
 const ref=stage.architecture.scaleEvidence,scale=ref.realLengthCm/Math.hypot(ref.endpoints[1].x-ref.endpoints[0].x,ref.endpoints[1].y-ref.endpoints[0].y);
 const points=stage.bareHouse.walls.flatMap(w=>[w.start,w.end,...(w.curvePoint?[w.curvePoint]:[])]),origin={x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y))};
 const back=p=>({x:p.x/scale+origin.x,y:p.y/scale+origin.y}),esc=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
 const pair=p=>`${p.x.toFixed(3)} ${p.y.toFixed(3)}`,ring=ps=>ps.length?`M ${ps.map(pair).join(' L ')} Z`:'';
 const colors=['#2397bb','#db9247','#a781b9','#2e9e83','#d4748e','#7475b7'];
 const accepted=stage.architecture.functionalZones.filter(z=>z.decision==='accept');
 let regions='',labels='';
 for(const z of review.finalMetrics.zones){
  const sourceZone=accepted[z.index],region=z.regionIndices.length===1?analysis.geometry[z.regionIndices[0]]:undefined,color=sourceZone.environment==='balcony'?'#7b4bb8':!z.resolved?'#d4564d':colors[z.index%colors.length];
  if(region){const holes=analysis.holes.get(region.room.id)??[];regions+=`<path d="${ring(region.polygon.map(back))} ${holes.map(h=>ring(h.map(back))).join(' ')}" fill="${color}" fill-opacity=".19" stroke="${color}" stroke-width=".8" fill-rule="evenodd"><title>${esc(z.label)} — ${esc(z.status)}</title></path>`;}
  if(!z.resolved){const outline=sourceZone.boundary.map(b=>b.point);regions+=`<path d="${ring(outline)}" fill="none" stroke="#d4564d" stroke-width="1.8" stroke-dasharray="4 3"><title>Unresolved source outline: ${esc(z.label)}</title></path>`;}const p=sourceZone.position;labels+=`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${color}" stroke="white" stroke-width="1"/><text x="${p.x+5}" y="${p.y-4}" font-size="8" fill="#172e3b" stroke="white" stroke-width="2.2" paint-order="stroke">${esc(z.label)}</text>`;
 }
 let boundaries='';for(const w of stage.bareHouse.walls){boundaries+=`<path d="M ${pair(w.start)} ${w.curvePoint?'Q '+pair(w.curvePoint)+' ':'L '}${pair(w.end)}" fill="none" stroke="${w.boundaryType==='air'?'#9b3db3':'#395867'}" stroke-width="${w.boundaryType==='air'?2:1}" ${w.boundaryType==='air'?'stroke-dasharray="4 3"':''}/>`;}
 const image=`<image href="data:${source[0]===0x89?'image/png':source[0]===0xff?'image/jpeg':'image/webp'};base64,${source.toString('base64')}" width="${stage.sourceContext.sourceWidthPx}" height="${stage.sourceContext.sourceHeightPx}" opacity=".75"/>`;
 const svg=(box,body)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${box[2]}" height="${box[3]}" viewBox="${box.join(' ')}" overflow="hidden" role="img">${image}${body}</svg>`;
 await mkdir(dirname(options.output),{recursive:true});await mkdir(options.output);
 const figures={'functional-zones.svg':svg([0,0,stage.sourceContext.sourceWidthPx,stage.sourceContext.sourceHeightPx],regions+boundaries+labels)};let balconyIndex=0;for(const zone of accepted.filter(z=>z.environment==='balcony')){const xs=zone.boundary.map(b=>b.point.x),ys=zone.boundary.map(b=>b.point.y),minX=Math.min(...xs),minY=Math.min(...ys),width=Math.max(...xs)-minX,height=Math.max(...ys)-minY,margin=Math.max(10,width*.12);figures[`balcony-${++balconyIndex}.svg`]=svg([minX-margin,minY-margin,width+2*margin,height+2*margin],regions+boundaries);}for(const[name,value]of Object.entries(figures))await writeFile(resolve(options.output,name),value,{flag:'wx',mode:0o444});
 const unchanged=sha(await readFile(options.stage))===sha(bytes);if(!unchanged)throw Error('Input stage changed');
 await writeFile(resolve(options.output,'provenance.json'),JSON.stringify({mode:'read-only-native-region-render',stageSha256:sha(bytes),sourceSha256:sha(source),stageUnchanged:unchanged,geometryChanged:false,independentFitting:false},null,2)+'\n',{flag:'wx',mode:0o444});
 console.log(JSON.stringify({output:options.output,sourceAligned:true,geometryChanged:false}));
}finally{await server.close()}
