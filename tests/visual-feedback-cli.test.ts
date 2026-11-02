import{it,expect}from'vitest';
import{mkdtemp,writeFile,readFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';import{execFileSync,spawnSync}from'node:child_process';
import{encodeRgbaPng}from'../tooling/png-raster.mjs';

it('freezes local review packets, refuses overwrites and retains failed stale-review audit without retry',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'p2w-feedback-cli-'));
 try{
  const d={decision:'accept',evidence:'Synthetic control line.',decisionBasis:'Synthetic visual control.'},point=(x:number,y:number)=>({x,y});
  const architecture={schemaVersion:'source-architecture-v1',scaleEvidence:{kind:'provided_length',realLengthCm:100,endpoints:[point(20,20),point(120,20)],evidence:'Control scale.'},
   walls:[[20,20,480,20],[480,20,480,380],[480,380,20,380],[20,380,20,20],[20,21,480,21]].map(([x,y,a,b],i)=>({...d,label:`wall ${i}`,start:point(x,y),end:point(a,b)})),
   openings:[{...d,label:'entry',kind:'door',doorType:'opening',typeEvidence:'Visible threshold.',endpoints:[point(20,120),point(20,200)]}]};
  const original=JSON.stringify(architecture);await writeFile(path.join(dir,'architecture.json'),original);await writeFile(path.join(dir,'furnishing.json'),JSON.stringify({schemaVersion:'source-furnishing-v1',furniture:[]}));
  await writeFile(path.join(dir,'source.png'),Buffer.from(encodeRgbaPng({width:500,height:400,data:Buffer.alloc(500*400*4,255)})));
  const args=['tooling/plan2world-visual-feedback.mjs','--architecture',path.join(dir,'architecture.json'),'--furnishing',path.join(dir,'furnishing.json'),'--source',path.join(dir,'source.png')];
  const prepare=[...args,'--mode','ordinary','--output',path.join(dir,'first')];
  execFileSync(process.execPath,prepare,{env:{...process.env,NODE_ENV:'production'},timeout:20000});
  const request=JSON.parse(await readFile(path.join(dir,'first/request.json'),'utf8')),provenance=JSON.parse(await readFile(path.join(dir,'first/provenance.json'),'utf8'));
  expect(provenance.actualProviderRequests).toBe(0);expect(provenance.images.length).toBeGreaterThan(0);expect(request.maxReviews).toBe(1);
  const bytes=await readFile(path.join(dir,'first/request.json'));
  expect(spawnSync(process.execPath,prepare,{timeout:20000}).status).not.toBe(0);expect(await readFile(path.join(dir,'first/request.json'))).toEqual(bytes);
  await writeFile(path.join(dir,'answer.json'),JSON.stringify({schemaVersion:'source-visual-feedback-decision-v1',requestId:request.requestId,hypotheses:[],selected:null,unresolvedQuestions:['Unknown.']}));
  const fail=spawnSync(process.execPath,[...args,'--mode','guided','--request',path.join(dir,'first/request.json'),'--decision',path.join(dir,'answer.json'),'--output',path.join(dir,'stale')],{env:{...process.env,NODE_ENV:'production'},timeout:20000});
  expect(fail.status).toBe(1);
  const audit=JSON.parse(await readFile(path.join(dir,'stale/feedback-audit.json'),'utf8')),failure=JSON.parse(await readFile(path.join(dir,'stale/failure.json'),'utf8'));
  expect(audit.status).toBe('review-failed');expect(audit.reviews).toBe(1);expect(failure).toMatchObject({baselinePreserved:true,automaticRetries:0});
  expect(await readFile(path.join(dir,'architecture.json'),'utf8')).toBe(original);
 }finally{await rm(dir,{recursive:true,force:true});}
},60000);
