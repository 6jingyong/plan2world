import {describe,it,expect,vi}from'vitest';
import {reconstructFloorPlanForCorrection,reprojectSourceObservations}from'$lib/plan2world/correction';
import {applyVisualFeedback,buildVisualFeedbackRequest,cropFeedbackRaster,VisualFeedbackOperationalError}from'$lib/plan2world/visualFeedback';
import {readProject}from'$lib/utils/projectValidation';
import {SourceRecoverySession}from'$lib/plan2world/sourceRecovery';
import {encodeRgbaPng}from'../tooling/png-raster.mjs';
import type {VisualFeedbackRequest}from'$lib/plan2world/visualFeedback';

const p=(x:number,y:number)=>({x,y});
const d={decision:'accept',evidence:'Observed control stroke.',decisionBasis:'Synthetic independent source cue.'};
function observations(){
 const architecture={schemaVersion:'source-architecture-v1',scaleEvidence:{kind:'provided_length',realLengthCm:100,endpoints:[p(20,20),p(120,20)],evidence:'Control scale.'},
  walls:[[20,20,480,20],[480,20,480,380],[480,380,20,380],[20,380,20,20],[20,21,480,21]].map(([x,y,a,b],i)=>({...d,label:i===4?'possible furniture edge':`boundary ${i}`,start:p(x,y),end:p(a,b)})),
  openings:[{...d,label:'entry',kind:'door',endpoints:[p(20,120),p(20,200)],doorType:'opening',typeEvidence:'Visible leafless threshold.'}],functionalZones:[],doorGaps:[]};
 return{architecture,furnishing:{schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:p(250,200)}]}};
}
function source(){const data=Buffer.alloc(500*400*4,255);return{sha256:'a'.repeat(64),image:{width:500,height:400,dataUrl:'data:image/png;base64,'+Buffer.from(encodeRgbaPng({width:500,height:400,data})).toString('base64')}};}
const correct=(o:ReturnType<typeof observations>)=>({label:'Furniture edge, not an architectural divider',visualSupport:'clear',evidence:'Control cabinet outline is distinguished from the wall.',changes:[{path:'walls[4]',value:{...o.architecture.walls[4],decision:'reject',evidence:'Visible cabinet face.',decisionBasis:'The source establishes a furnishing edge.'}}]});
const answer=(request:VisualFeedbackRequest,hypotheses:unknown[],selected:number|null=0)=>({schemaVersion:'source-visual-feedback-decision-v1',requestId:request.requestId,hypotheses,selected,unresolvedQuestions:[]});

describe('bounded visual/logic feedback through the actual correction entry',()=>{
 it('keeps default execution at exactly two observations',async()=>{
  const o=observations(),observe=vi.fn().mockResolvedValueOnce(o.architecture).mockResolvedValueOnce(o.furnishing);
  const result=await reconstructFloorPlanForCorrection(observe,source());
  expect(observe).toHaveBeenCalledTimes(2);expect(result).not.toHaveProperty('visualFeedback');expect(result.partialImport).toBe(true);
 });
 it('allows new visual evidence to retract a first accepted interpretation without overwriting it',async()=>{
  const o=observations(),original=JSON.stringify(o),observe=vi.fn().mockResolvedValueOnce(o.architecture).mockResolvedValueOnce(o.furnishing);
  const review=vi.fn(async(request:VisualFeedbackRequest)=>answer(request,[correct(o)]));
  const result=await reconstructFloorPlanForCorrection(observe,source(),{},{review,actor:'synthetic-control'});
  expect(observe).toHaveBeenCalledTimes(2);expect(review).toHaveBeenCalledTimes(1);
  expect(result.visualFeedback.status).toBe('revised');expect(result.partialImport).toBe(false);
  expect(result.project.floors[0].walls).toHaveLength(4);expect(result.project.floors[0].furniture).toHaveLength(1);
  expect(result.visualFeedback.originalObservations).toEqual(o);expect(JSON.stringify(o)).toBe(original);
  const evidence=JSON.parse(result.project.architectureReview!.sourceObservations!);
  expect(evidence.architecture.walls[4].decision).toBe('accept');expect(evidence.visualFeedback.hypothesis.changes[0].value.decision).toBe('reject');
  expect(readProject(JSON.parse(JSON.stringify(result.project)))).toEqual(result.project);
  expect(result.visualFeedback.attribution).toBe('undetermined');
 });
 it('preserves alternatives without choosing the lowest-warning hypothesis',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source());
  const result=await applyVisualFeedback(baseline,o,source(),{},{review:async r=>answer(r,[correct(o),{label:'Still unclear',visualSupport:'unclear',evidence:'Insufficient framing evidence.',changes:[]}],null)});
  expect(result.visualFeedback.candidates).toHaveLength(2);expect(result.visualFeedback.status).toBe('pending');
  expect(result.project).toEqual(baseline.project);expect(result.visualFeedback.candidates[0].partialImport).toBe(false);
 });
 it('keeps one bad hypothesis without discarding a separate valid hypothesis',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source());
  const invalid={...correct(o),changes:[{path:'scaleEvidence',value:{realLengthCm:10}}]};
  const result=await applyVisualFeedback(baseline,o,source(),{},{review:async r=>answer(r,[invalid,correct(o)],1)});
  expect(result.visualFeedback.candidates.map(c=>c.status)).toEqual(['invalid','validated']);expect(result.visualFeedback.status).toBe('revised');
 });
 it('leaves an explicitly unknown answer pending without another review',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source()),review=vi.fn(async(r:VisualFeedbackRequest)=>({...answer(r,[],null),unresolvedQuestions:['Neither interpretation is established.']}));
  const result=await applyVisualFeedback(baseline,o,source(),{},{review});
  expect(result.visualFeedback.status).toBe('pending');expect(review).toHaveBeenCalledTimes(1);expect(result.project).toEqual(baseline.project);
 });
 it('does not apply a selected hypothesis with partial visual support',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source());
  const result=await applyVisualFeedback(baseline,o,source(),{},{review:async r=>answer(r,[{...correct(o),visualSupport:'partial'}])});
  expect(result.project).toEqual(baseline.project);expect(result.visualFeedback.candidates[0].status).toBe('validated');
 });
 it('pins answers to source, interpretation, furnishing, mode and guide',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source());
  const {request:a}=await buildVisualFeedbackRequest(baseline,o,source(),'ordinary'),{request:b}=await buildVisualFeedbackRequest(baseline,o,source(),'guided');
  expect(a!.regions.map(r=>[r.focusBox,r.contextBox])).toEqual(b!.regions.map(r=>[r.focusBox,r.contextBox]));expect(a!.records).toEqual(b!.records);expect(a!.anchors).toEqual(b!.anchors);
  expect(a!.requestId).not.toBe(b!.requestId);
  const result=await applyVisualFeedback(baseline,o,source(),{},{review:async()=>answer(a!,[correct(o)])});
  expect(result.visualFeedback.status).toBe('invalid-response');expect(result.project).toEqual(baseline.project);
  const changed=await buildVisualFeedbackRequest(baseline,o,{...source(),sha256:'b'.repeat(64)});
  expect(changed.request!.requestId).not.toBe(b!.requestId);
 });
 it('rejects unpinned/global edits and added features outside the context',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source());
  const bad={...correct(o),changes:[],additionalWalls:[{...d,label:'outside',start:p(200,350),end:p(300,350)}]};
  const result=await applyVisualFeedback(baseline,o,source(),{},{review:async r=>answer(r,[bad])});
  expect(result.visualFeedback.candidates[0].status).toBe('invalid');expect(result.project).toEqual(baseline.project);
 });
 it('does not retract the remote part of a long wall that merely touches the review context',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source());
  const bad={...correct(o),changes:[{path:'walls[1]',value:{...o.architecture.walls[1],decision:'reject'}}]};
  const result=await applyVisualFeedback(baseline,o,source(),{},{review:async r=>answer(r,[bad])});
  expect(result.visualFeedback.candidates[0].status).toBe('invalid');expect(result.project).toEqual(baseline.project);
 });
 it('propagates provider/transport errors with a retained baseline and no automatic retry',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source()),review=vi.fn(async()=>{throw Error('provider unavailable');});
  try{await applyVisualFeedback(baseline,o,source(),{},{review});throw Error('Expected failure');}
  catch(e){expect(e).toBeInstanceOf(VisualFeedbackOperationalError);expect((e as VisualFeedbackOperationalError).baseline.project).toEqual(baseline.project);expect((e as VisualFeedbackOperationalError).audit.status).toBe('review-failed');}
  expect(review).toHaveBeenCalledTimes(1);
 });
 it('does not call a visual reviewer for an input-format failure or healthy geometry',async()=>{
  const o=observations();o.architecture.walls.pop();const review=vi.fn();
  const healthy=await reconstructFloorPlanForCorrection(vi.fn().mockResolvedValueOnce(o.architecture).mockResolvedValueOnce(o.furnishing),source(),{},{review});
  expect(healthy.visualFeedback.status).toBe('not-needed');expect(review).not.toHaveBeenCalled();
  const malformed=await reconstructFloorPlanForCorrection(vi.fn().mockResolvedValueOnce({unexpected:true}).mockResolvedValueOnce(o.furnishing),source(),{},{review});
  expect(malformed.visualFeedback.status).toBe('not-reviewable');expect(review).not.toHaveBeenCalled();
 });
 it('protects frozen inputs from reviewer mutation',async()=>{
  const o=observations(),before=JSON.stringify(o),baseline=await reprojectSourceObservations(o,source());
  await applyVisualFeedback(baseline,o,source(),{},{review:async(r,s)=>{(r.records[0].value as any).label='mutation';s.image.width=1;return answer(r,[],null);}});
  expect(JSON.stringify(o)).toBe(before);
 });
 it('extracts lossless source pixels with explicit original offsets',()=>{
  const data=Uint8Array.from({length:4*3*4},(_,i)=>i),original=[...data],crop=cropFeedbackRaster({width:4,height:3,data},[1,1,3,3]);
  expect(crop.sourceBox).toEqual([1,1,3,3]);expect([...crop.data]).toEqual([...data.slice(20,28),...data.slice(36,44)]);expect([...data]).toEqual(original);
  expect(()=>cropFeedbackRaster({width:4,height:3,data},[-1,0,2,2])).toThrow();
 });
 it('does not let a large low-priority zone consume an aperture review or hide its wall context',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source());
  const d=structuredClone(baseline.diagnostics[0]);d.id='large-zone';d.code='uncertain-zone';d.sourcePaths=['walls[1]','walls[3]'];
  const request=await buildVisualFeedbackRequest({...baseline,diagnostics:[...baseline.diagnostics,d]},o,source());
  expect(request.request!.regions[0].focusBox[3]).toBeLessThan(100);
  expect(request.request!.records.some(r=>r.path==='walls[0]')).toBe(true);
  expect(request.deferredDiagnosticIds).toContain('large-zone');
 });
 it('uses neutral diagnostic questions rather than copying an editor repair instruction',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source());
  const request=await buildVisualFeedbackRequest({...baseline,diagnostics:baseline.diagnostics.map(d=>({...d,message:'Add the missing wall immediately.'}))},o,source());
  expect(JSON.stringify(request.request!.regions)).not.toContain('Add the missing wall');
  expect(request.request!.regions[0].questions[0]).toContain('program representation can be wrong');
 });
 it('distinguishes the old review-contract limit from visual capability using the same accepted-feature retraction',async()=>{
  const o=observations(),src=source(),change=correct(o).changes[0];
  const legacy=await SourceRecoverySession.create(o.architecture,{sourceWidthPx:500,sourceHeightPx:400,sourceImageSha256:src.sha256},{review:async request=>({
    schemaVersion:'source-architecture-review-decision-v1',requestId:request.requestId,choice:'revise-local-source',evidence:'Visible furnishing edge, not a wall.',replacements:[change],
  })});
  await expect(legacy.preflight()).rejects.toThrow(/accepted|remove|decision/i);
  const baseline=await reprojectSourceObservations(o,src),current=await applyVisualFeedback(baseline,o,src,{},{review:async r=>answer(r,[correct(o)])});
  expect(current.visualFeedback.status).toBe('revised');expect(current.partialImport).toBe(false);
 });
 it('does not label a candidate persistence failure as a model interpretation error',async()=>{
  const o=observations(),baseline=await reprojectSourceObservations(o,source());
  try{await applyVisualFeedback(baseline,o,source(),{},{review:async r=>answer(r,[correct(o)]),onCandidate:()=>{throw Error('disk unavailable');}});throw Error('Expected failure');}
  catch(e){expect(e).toBeInstanceOf(VisualFeedbackOperationalError);expect((e as VisualFeedbackOperationalError).audit.candidates.map(c=>c.status)).toEqual(['validated']);expect((e as VisualFeedbackOperationalError).audit.reason).toBe('disk unavailable');}
 });
});
