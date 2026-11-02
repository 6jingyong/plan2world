import {describe,it,expect,vi} from 'vitest';
import {reconstructFloorPlanForCorrection,reprojectSourceObservations} from '$lib/plan2world/correction';
import {applyVisualFeedback,buildVisualFeedbackRequest,type VisualFeedbackRequest} from '$lib/plan2world/visualFeedback';
import {inspectFeedbackSupport} from '$lib/plan2world/visualFeedbackSupport';
import {parseSourceArchitecture} from '$lib/plan2world/architecture';
import {compileRuntimeScene} from '$lib/runtime/compileRuntimeScene';
import {furnitureSupportFindings,validateFurnitureSupport} from '$lib/runtime/placementSupport';
import {readProject} from '$lib/utils/projectValidation';
import {encodeRgbaPng} from '../tooling/png-raster.mjs';

const p=(x:number,y:number)=>({x,y});
const supportedScope={scope:'architecture-and-furnishing' as const};
function control(){
 const d={decision:'accept',evidence:'Synthetic boundary stroke.',decisionBasis:'Synthetic observation control.'};
 return {architecture:{schemaVersion:'source-architecture-v1',scaleEvidence:{kind:'provided_length',realLengthCm:100,endpoints:[p(20,20),p(120,20)],evidence:'Control.'},
  walls:[[20,20,480,20],[480,20,480,380],[480,380,20,380],[20,380,20,20]].map(([x,y,a,b],i)=>({...d,label:`boundary ${i}`,start:p(x,y),end:p(a,b)})),
  openings:[{...d,label:'entry',kind:'door',doorType:'opening',typeEvidence:'Visible threshold.',endpoints:[p(20,120),p(20,200)]}],functionalZones:[],doorGaps:[]},
  furnishing:{schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:p(250,200)},{sourceCategory:'sink',position:p(490,80)},{sourceCategory:'table',position:p(250,300)}]}};
}
function source(){return {sha256:'c'.repeat(64),image:{width:500,height:400,dataUrl:'data:image/png;base64,'+Buffer.from(encodeRgbaPng({width:500,height:400,data:Buffer.alloc(500*400*4,255)})).toString('base64')}};}
const hypothesis=(furnitureChanges:unknown[],extra={})=>({label:'Review source-object identity',visualSupport:'clear',evidence:'Synthetic source review evidence.',changes:[],furnitureChanges,...extra});
const answer=(r:VisualFeedbackRequest,h:unknown[],selected:number|null=0)=>({schemaVersion:'source-visual-feedback-decision-v1',requestId:r.requestId,hypotheses:h,selected,unresolvedQuestions:[]});
const retract={path:'furniture[1]',action:'retract',evidence:'The control establishes text rather than a basin symbol.'};

describe('compiler source-point support feedback',()=>{
 it('exposes the same compiler rejection as structured read-only findings',async()=>{
  const o=control(),result=await reprojectSourceObservations(o,source()),runtime=compileRuntimeScene(result.project),original=JSON.stringify(runtime);
  const findings=[...furnitureSupportFindings(runtime)];
  expect(findings.map(f=>[f.code,f.entityId])).toEqual([['source-marker-no-floor','f2']]);
  expect(()=>validateFurnitureSupport(runtime)).toThrow(findings[0].message);expect(JSON.stringify(runtime)).toBe(original);
 });
 it('maps exact feature ownership without inferring a source index from native IDs',async()=>{
  const o=control(),result=await reprojectSourceObservations(o,source());
  result.project.floors[0].furniture[1].id='arbitrary-marker-id';result.features.find(f=>f.path==='furniture[1]')!.nativeIds=['arbitrary-marker-id'];
  const {review}=inspectFeedbackSupport(result,o.furnishing,parseSourceArchitecture(o.architecture));
  expect(review.status).toBe('assessed');expect(review.findings[0]).toMatchObject({path:'furniture[1]',entityId:'arbitrary-marker-id',position:p(490,80)});
 });
 it('keeps ordinary two observations and architecture-only feedback unchanged',async()=>{
  const o=control(),observer=vi.fn().mockResolvedValueOnce(o.architecture).mockResolvedValueOnce(o.furnishing),review=vi.fn();
  const result=await reconstructFloorPlanForCorrection(observer,source(),{},{review});
  expect(observer).toHaveBeenCalledTimes(2);expect(review).not.toHaveBeenCalled();expect(result.visualFeedback.status).toBe('not-needed');
  expect(()=>validateFurnitureSupport(compileRuntimeScene(result.project))).toThrow('Source marker');
 });
 it('routes a support conflict into one explicitly enabled local review',async()=>{
  const o=control(),result=await reprojectSourceObservations(o,source());
  const {request}=await buildVisualFeedbackRequest(result,o,source(),'guided',supportedScope.scope);
  expect(request!.schemaVersion).toBe('source-visual-feedback-v2');expect(request!.records.some(r=>r.path==='furniture[1]')).toBe(true);
  expect(request!.supportReview!.findings.map(f=>[f.path,f.position])).toEqual([['furniture[1]',p(490,80)]]);
 });
 it('retracts a visually false observation, preserves originals and maps surviving source indices',async()=>{
  const o=control(),original=JSON.stringify(o),baseline=await reprojectSourceObservations(o,source()),review=vi.fn(async(r:VisualFeedbackRequest)=>answer(r,[hypothesis([retract])]));
  const result=await applyVisualFeedback(baseline,o,source(),{},{...supportedScope,review});
  expect(review).toHaveBeenCalledTimes(1);expect(result.visualFeedback.status).toBe('revised');
  expect(result.project.floors[0].furniture.map(f=>f.sourceCategory)).toEqual(['chair','table']);
  expect(result.features.filter(f=>f.kind==='furniture').map(f=>[f.path,f.status])).toEqual([['furniture[0]','retained'],['furniture[2]','retained'],['furniture[1]','rejected']]);
  expect(result.visualFeedback.candidates[0].furnitureSourceIndices).toEqual([0,2]);
  expect(result.visualFeedback.candidates[0].supportReview!.findings).toHaveLength(0);
  expect(()=>validateFurnitureSupport(compileRuntimeScene(result.project))).not.toThrow();
  const provenance=JSON.parse(result.project.architectureReview!.sourceObservations!);
  expect(provenance.furnishing.furniture).toHaveLength(3);expect(provenance.visualFeedback.furnishingProjection.furniture).toHaveLength(2);
  expect(JSON.stringify(o)).toBe(original);expect(readProject(JSON.parse(JSON.stringify(result.project)))).toEqual(result.project);
 });
 it('corrects a source point only from an explicit local revision',async()=>{
  const o=control(),baseline=await reprojectSourceObservations(o,source());
  const result=await applyVisualFeedback(baseline,o,source(),{},{...supportedScope,review:async r=>answer(r,[hypothesis([{path:'furniture[1]',action:'revise',evidence:'The visible source basin centre is here.',value:{sourceCategory:'sink',position:p(450,80)}}])])});
  expect(result.visualFeedback.status).toBe('revised');expect(result.visualFeedback.candidates[0].retractedFurniturePaths).toEqual([]);
  expect(()=>validateFurnitureSupport(compileRuntimeScene(result.project))).not.toThrow();
  expect(result.visualFeedback.originalObservations.furnishing).toEqual(o.furnishing);
 });
 it('keeps an actual object with unresolved ground unknown rather than filling or relocating',async()=>{
  const o=control(),baseline=await reprojectSourceObservations(o,source()),review=vi.fn(async(r:VisualFeedbackRequest)=>answer(r,[hypothesis([],{visualSupport:'partial',evidence:'Object is present; surrounding ground evidence is unresolved.'})],null));
  const result=await applyVisualFeedback(baseline,o,source(),{},{...supportedScope,review});
  expect(result.visualFeedback.status).toBe('pending');expect(result.project).toEqual(baseline.project);expect(review).toHaveBeenCalledTimes(1);
 });
 it('does not automatically move or remove an unsupported object when no source revision is supplied',async()=>{
  const o=control(),baseline=await reprojectSourceObservations(o,source());
  const result=await applyVisualFeedback(baseline,o,source(),{},{...supportedScope,review:async r=>answer(r,[hypothesis([])])});
  expect(result.visualFeedback.status).toBe('unchanged');expect(result.project).toEqual(baseline.project);
 });
 it.each([
  {name:'unconflicted record',change:{...retract,path:'furniture[0]'}},
  {name:'missing evidence',change:{...retract,evidence:''}},
  {name:'remote position',change:{path:'furniture[1]',action:'revise',evidence:'Control.',value:{sourceCategory:'sink',position:p(100,80)}}},
  {name:'outside raster',change:{path:'furniture[1]',action:'revise',evidence:'Control.',value:{sourceCategory:'sink',position:p(501,80)}}},
  {name:'inferred ground',change:{path:'furniture[1]',action:'add-floor',evidence:'Control.'}},
 ])('rejects $name and retains the baseline',async({change})=>{
  const o=control(),baseline=await reprojectSourceObservations(o,source());
  const result=await applyVisualFeedback(baseline,o,source(),{},{...supportedScope,review:async r=>answer(r,[hypothesis([change])])});
  expect(result.visualFeedback.candidates[0].status).toBe('invalid');expect(result.project).toEqual(baseline.project);
 });
 it('blocks a visually selected architecture revision that introduces additional unsupported source anchors',async()=>{
  const o=control(),baseline=await reprojectSourceObservations(o,source());
  const result=await applyVisualFeedback(baseline,o,source(),{},{...supportedScope,review:async r=>answer(r,[hypothesis([],{changes:[{path:'walls[0]',value:{...o.architecture.walls[0],end:p(430,20)}}]})])});
  expect(result.visualFeedback.candidates[0].status).toBe('validated');
  expect(result.visualFeedback.candidates[0].introducedSupportPaths).toContain('furniture[0]');
  expect(result.visualFeedback.status).toBe('pending');expect(result.project).toEqual(baseline.project);
 });
 it('binds scope and support facts while keeping ordinary/guided images and records equal',async()=>{
  const o=control(),a=await reprojectSourceObservations(o,source()),b=await reprojectSourceObservations(o,source());
  const ordinary=(await buildVisualFeedbackRequest(a,o,source(),'ordinary',supportedScope.scope)).request!;
  const guided=(await buildVisualFeedbackRequest(a,o,source(),'guided',supportedScope.scope)).request!;
  const repeat=(await buildVisualFeedbackRequest(b,o,source(),'ordinary',supportedScope.scope)).request!;
  expect(ordinary).toEqual(repeat);expect(ordinary.requestId).not.toBe(guided.requestId);expect(ordinary.records).toEqual(guided.records);
  expect(ordinary.regions.map(r=>[r.focusBox,r.contextBox])).toEqual(guided.regions.map(r=>[r.focusBox,r.contextBox]));
 });
 it('keeps nearby high-index walls when a lower-priority region has many other walls',async()=>{
  const o=control(),base=await reprojectSourceObservations(o,source()),d=o.architecture.walls[0];
  const many=Array.from({length:30},(_,i)=>({...d,label:`remote fragment ${i}`,start:p(50+i*8,250),end:p(50+i*8,350)}));
  const nearby={...d,label:'local high-index boundary',start:p(460,30),end:p(460,140)};
  const broad={...d,label:'uncertain remote zone edge',start:p(30,250),end:p(390,250)};
  const architecture={...o.architecture,walls:[...o.architecture.walls,...many,nearby,broad]};
  const result={...base,audit:{...base.audit,programProjection:architecture},diagnostics:[...base.diagnostics,{id:'lower-priority-region',code:'uncertain-wall',phase:'assembly' as const,category:'uncertain' as const,message:'Review.',sourcePaths:[`walls[${architecture.walls.length-1}]`],blockedBy:[]}]};
  const request=(await buildVisualFeedbackRequest(result,{...o,architecture},source(),'guided',supportedScope.scope)).request!;
  expect(request.records.length).toBeLessThanOrEqual(24);expect(request.records.some(r=>r.path===`walls[${architecture.walls.length-2}]`)).toBe(true);
 });
 it('does not retry an unassessed compiler failure or guess ownership for an unmapped marker',async()=>{
  const o=control(),baseline=await reprojectSourceObservations(o,source()),review=vi.fn();
  const broken=structuredClone(baseline);
  broken.project.floors[0].rooms.push({id:'invalid-surface',name:'Invalid surface',walls:[],floorTexture:'concrete',area:0,boundary:[p(10,10),p(20,20),p(30,30)].map(point=>({point}))});
  const notAssessed=await applyVisualFeedback(broken,o,source(),{},{...supportedScope,review});
  expect(notAssessed.visualFeedback.supportReview!.status).toBe('not-assessed');expect(notAssessed.visualFeedback.status).toBe('not-reviewable');
  const unmapped={...baseline,features:baseline.features.filter(f=>f.path!=='furniture[1]')};
  const missing=await applyVisualFeedback(unmapped,o,source(),{},{...supportedScope,review});
  expect(missing.visualFeedback.supportReview!.unmappedEntityIds).toEqual(['f2']);expect(missing.visualFeedback.status).toBe('not-reviewable');expect(review).not.toHaveBeenCalled();
 });
});
