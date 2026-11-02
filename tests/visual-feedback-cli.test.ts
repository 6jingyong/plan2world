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

it('routes compiled door conflicts through the explicit CLI scope and preserves unknown',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'p2w-doors-cli-'));
 try{
  const point=(x:number,y:number)=>({x,y}),d={decision:'accept',evidence:'Synthetic stroke.',decisionBasis:'Synthetic source control.'};
  const architecture={schemaVersion:'source-architecture-v1',scaleEvidence:{kind:'provided_length',realLengthCm:100,endpoints:[point(20,20),point(120,20)],evidence:'Control.'},
   walls:[[20,20,480,20],[480,20,480,380],[480,380,20,380],[20,380,20,20]].map(([x,y,a,b],i)=>({...d,label:`wall ${i}`,start:point(x,y),end:point(a,b)})),
   openings:[{...d,label:'corner door',kind:'door',doorType:'sliding',typeEvidence:'Initial control.',endpoints:[point(20,380),point(100,380)]}]};
  await writeFile(path.join(dir,'architecture.json'),JSON.stringify(architecture));await writeFile(path.join(dir,'furnishing.json'),JSON.stringify({schemaVersion:'source-furnishing-v1',furniture:[]}));
  await writeFile(path.join(dir,'source.png'),Buffer.from(encodeRgbaPng({width:500,height:400,data:Buffer.alloc(500*400*4,255)})));
  const args=['tooling/plan2world-visual-feedback.mjs','--architecture',path.join(dir,'architecture.json'),'--furnishing',path.join(dir,'furnishing.json'),'--source',path.join(dir,'source.png'),'--scope','architecture-and-door-motion'],env={...process.env,NODE_ENV:'production'};
  execFileSync(process.execPath,[...args,'--output',path.join(dir,'packet')],{env,timeout:20000});
  const request=JSON.parse(await readFile(path.join(dir,'packet/request.json'),'utf8'));
  expect(request.schemaVersion).toBe('source-visual-feedback-v3');expect(request.doorReview.findings[0].openingPath).toBe('openings[0]');
  const motion=JSON.parse(await readFile(path.join(dir,'packet/motion-context.json'),'utf8'));
  expect(motion.review.doors[0].basis).toBe('default-full-span');expect(motion.sourceSha256).toBe(request.source.sha256);
  expect(request).not.toHaveProperty('motionContext');
  expect(await readFile(path.join(dir,'packet/review.html'),'utf8')).toContain('Current sliding motion model');
  await writeFile(path.join(dir,'answer.json'),JSON.stringify({schemaVersion:'source-visual-feedback-decision-v1',requestId:request.requestId,hypotheses:[],selected:null,unresolvedQuestions:['Source motion remains unresolved.']}));
  execFileSync(process.execPath,[...args,'--request',path.join(dir,'packet/request.json'),'--decision',path.join(dir,'answer.json'),'--output',path.join(dir,'result')],{env,timeout:20000});
  const audit=JSON.parse(await readFile(path.join(dir,'result/feedback-audit.json'),'utf8'));
  expect(audit.status).toBe('pending');expect(audit.reviews).toBe(1);
  expect(await readFile(path.join(dir,'result/project.json'))).toEqual(await readFile(path.join(dir,'result/baseline.project.json')));
 }finally{await rm(dir,{recursive:true,force:true});}
},60000);

it('applies an explicit source-object review through the CLI and freezes its furniture projection',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'p2w-support-cli-'));
 try{
  const point=(x:number,y:number)=>({x,y}),d={decision:'accept',evidence:'Synthetic stroke.',decisionBasis:'Synthetic source control.'};
  const architecture={schemaVersion:'source-architecture-v1',scaleEvidence:{kind:'provided_length',realLengthCm:100,endpoints:[point(20,20),point(120,20)],evidence:'Control.'},
   walls:[[20,20,480,20],[480,20,480,380],[480,380,20,380],[20,380,20,20]].map(([x,y,a,b],i)=>({...d,label:`wall ${i}`,start:point(x,y),end:point(a,b)})),
   openings:[{...d,label:'entry',kind:'door',doorType:'opening',typeEvidence:'Threshold.',endpoints:[point(20,120),point(20,200)]}]};
  const furnishing={schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:point(250,200)},{sourceCategory:'sink',position:point(490,80)}]};
  await writeFile(path.join(dir,'architecture.json'),JSON.stringify(architecture));await writeFile(path.join(dir,'furnishing.json'),JSON.stringify(furnishing));
  await writeFile(path.join(dir,'source.png'),Buffer.from(encodeRgbaPng({width:500,height:400,data:Buffer.alloc(500*400*4,255)})));
  const args=['tooling/plan2world-visual-feedback.mjs','--architecture',path.join(dir,'architecture.json'),'--furnishing',path.join(dir,'furnishing.json'),'--source',path.join(dir,'source.png'),'--scope','architecture-and-furnishing'];
  const env={...process.env,NODE_ENV:'production'};
  execFileSync(process.execPath,[...args,'--output',path.join(dir,'packet')],{env,timeout:20000});
  const request=JSON.parse(await readFile(path.join(dir,'packet/request.json'),'utf8'));
  expect(request.schemaVersion).toBe('source-visual-feedback-v2');expect(request.supportReview.findings[0].path).toBe('furniture[1]');
  await writeFile(path.join(dir,'answer.json'),JSON.stringify({schemaVersion:'source-visual-feedback-decision-v1',requestId:request.requestId,hypotheses:[{label:'Text, not a fixture',visualSupport:'clear',evidence:'Synthetic source control.',changes:[],furnitureChanges:[{path:'furniture[1]',action:'retract',evidence:'Synthetic text cue.'}]}],selected:0,unresolvedQuestions:[]}));
  execFileSync(process.execPath,[...args,'--request',path.join(dir,'packet/request.json'),'--decision',path.join(dir,'answer.json'),'--output',path.join(dir,'result')],{env,timeout:20000});
  const original=JSON.parse(await readFile(path.join(dir,'result/furnishing-original.json'),'utf8')),candidate=JSON.parse(await readFile(path.join(dir,'result/candidate-0/furnishing.json'),'utf8')),audit=JSON.parse(await readFile(path.join(dir,'result/feedback-audit.json'),'utf8'));
  expect(original).toEqual(furnishing);expect(candidate.furniture).toHaveLength(1);expect(audit.status).toBe('revised');expect(audit.candidates[0].furnitureSourceIndices).toEqual([0]);
  const provenance=JSON.parse(await readFile(path.join(dir,'result/provenance.json'),'utf8'));expect(provenance.actualProviderRequests).toBe(0);expect(provenance.reviewAnswersReplayed).toBe(1);
 }finally{await rm(dir,{recursive:true,force:true});}
},60000);
