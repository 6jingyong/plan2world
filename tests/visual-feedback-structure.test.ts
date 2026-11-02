import {describe,it,expect,vi} from 'vitest';
import {reprojectSourceObservations, reconstructFloorPlanForCorrection} from '$lib/plan2world/correction';
import {applyVisualFeedback, buildVisualFeedbackRequest, type VisualFeedbackRequest} from '$lib/plan2world/visualFeedback';
import {inspectStructuralReview,compareStructuralReviews} from '$lib/plan2world/structuralReview';
import {parseSourceArchitecture} from '$lib/plan2world/architecture';
import {encodeRgbaPng} from '../tooling/png-raster.mjs';

const p=(x:number,y:number)=>({x,y});
const d={decision:'accept',evidence:'Synthetic source stroke.',decisionBasis:'Controlled observation.'};
function control() {
  return {architecture:{schemaVersion:'source-architecture-v1',
    scaleEvidence:{kind:'provided_length',realLengthCm:100,endpoints:[p(20,20),p(120,20)],evidence:'Control.'},
    walls:[[20,20,480,20],[480,20,480,380],[480,380,20,380],[20,380,20,20]].map(([x,y,a,b],i)=>({...d,label:`wall ${i}`,start:p(x,y),end:p(a,b)})),
    openings:[{...d,label:'corner threshold',kind:'door',doorType:'single',typeEvidence:'Control.',endpoints:[p(20,380),p(100,380)]}],
    functionalZones:[],doorGaps:[]},
    furnishing:{schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:p(250,200)}]}};
}
function source(){return {sha256:'e'.repeat(64),image:{width:500,height:400,
  dataUrl:'data:image/png;base64,'+Buffer.from(encodeRgbaPng({width:500,height:400,data:Buffer.alloc(500*400*4,255)})).toString('base64')}};}
const scope={scope:'unified-structure' as const};
const hypothesis=(changes:unknown[]=[],extra={})=>({label:'Source-supported control',visualSupport:'clear',evidence:'Explicit contrary visual evidence in the synthetic control.',changes,...extra});
const answer=(r:VisualFeedbackRequest,h:unknown[],selected:number|null=0)=>({schemaVersion:'source-visual-feedback-decision-v1',requestId:r.requestId,hypotheses:h,selected,unresolvedQuestions:[]});

describe('optional unified structural feedback',()=>{
  it('preserves the default two observations and requires explicit scope',async()=>{
    const o=control(),observe=vi.fn().mockResolvedValueOnce(o.architecture).mockResolvedValueOnce(o.furnishing),review=vi.fn();
    const result=await reconstructFloorPlanForCorrection(observe,source(),{},{review});
    expect(observe).toHaveBeenCalledTimes(2);expect(review).not.toHaveBeenCalled();expect(result.visualFeedback.structuralReview).toBeUndefined();
  });
  it('shares native checks without mutating the source or project and keeps request IDs stable across new native IDs',async()=>{
    const o=control(),a=await reprojectSourceObservations(o,source()),b=await reprojectSourceObservations(o,source());
    const frozen=JSON.stringify(a),observed=JSON.stringify(o);
    const first=(await buildVisualFeedbackRequest(a,o,source(),'guided',scope.scope)).request!;
    const repeat=(await buildVisualFeedbackRequest(b,o,source(),'guided',scope.scope)).request!;
    const ordinary=(await buildVisualFeedbackRequest(a,o,source(),'ordinary',scope.scope)).request!;
    expect(first.schemaVersion).toBe('source-visual-feedback-v4');expect(first).toEqual(repeat);
    expect(first.records).toEqual(ordinary.records);expect(first.regions.map(r=>[r.focusBox,r.contextBox])).toEqual(ordinary.regions.map(r=>[r.focusBox,r.contextBox]));
    expect(first.records.length).toBeLessThanOrEqual(24);expect(first.regions.length).toBeLessThanOrEqual(3);
    expect(first).not.toHaveProperty('doorReview');expect(first).not.toHaveProperty('use');
    expect(JSON.stringify(a)).toBe(frozen);expect(JSON.stringify(o)).toBe(observed);
  });
  it('binds current assessment facts, defers contract findings and rejects mismatched registration',async()=>{
    const o=control(),base=await reprojectSourceObservations(o,source());
    const first=(await buildVisualFeedbackRequest(base,o,source(),'guided',scope.scope)).request!;
    const changed=structuredClone(base);changed.project.floors[0].backgroundImage!.position.x+=1000;
    const next=(await buildVisualFeedbackRequest(changed,o,source(),'guided',scope.scope)).request!;
    expect(next.structuralReview!.assessmentSha256).not.toBe(first.structuralReview!.assessmentSha256);
    expect(next.requestId).not.toBe(first.requestId);
    const wrong=inspectStructuralReview(base,parseSourceArchitecture(o.architecture),o.furnishing,{width:501,height:400}).report;
    expect(wrong.status).toBe('incomplete');expect(wrong.errors.join(' ')).toContain('registration');
    const operational={...base,diagnostics:[...base.diagnostics,{id:'contract-control',code:'invalid-contract',phase:'assembly' as const,category:'root' as const,message:'Invalid contract.',sourcePaths:['walls[0]'],blockedBy:[]}]};
    const inspected=inspectStructuralReview(operational,parseSourceArchitecture(o.architecture),o.furnishing,source().image);
    expect(inspected.report.routes.find(r=>r.diagnosticId==='contract-control')!.route).toBe('deferred');
    expect(inspected.diagnostics.some(d=>d.id==='contract-control')).toBe(false);
  });
  it('retains the v3 negative arm: clearing a jamb conflict can remove the floor under unchanged furniture',async()=>{
    const o=control(),base=await reprojectSourceObservations(o,source());
    const changes=[{path:'walls[3]',value:{...o.architecture.walls[3],start:p(20,310)}},
      {path:'openings[0]',value:{...o.architecture.openings[0],doorType:'opening',typeEvidence:'Control establishes a leafless threshold.'}}];
    const review=async(r:VisualFeedbackRequest)=>answer(r,[hypothesis(changes)]);
    const old=await applyVisualFeedback(base,o,source(),{},{scope:'architecture-and-door-motion',review});
    const unified=await applyVisualFeedback(base,o,source(),{},{...scope,review});
    expect(old.visualFeedback.status,JSON.stringify(old.visualFeedback.candidates)).toBe('revised');
    expect(unified.visualFeedback.candidates[0].status).toBe('validated');
    expect(unified.visualFeedback.candidates[0].structuralGuard!.reasons).toContain('new-unsupported-source-anchor');
    expect(unified.visualFeedback.status).toBe('pending');expect(unified.project).toEqual(base.project);
  });
  it('allows a clear source-backed leafless threshold while preserving width, support and closure',async()=>{
    const o=control(),base=await reprojectSourceObservations(o,source());
    const result=await applyVisualFeedback(base,o,source(),{},{...scope,review:async r=>answer(r,[hypothesis([{path:'openings[0]',value:{...o.architecture.openings[0],doorType:'opening',typeEvidence:'Control establishes a leafless threshold.'}}])])});
    expect(result.visualFeedback.candidates[0].structuralGuard).toEqual({eligible:true,reasons:[]});
    expect(result.visualFeedback.status).toBe('revised');expect(result.project.floors[0].doors[0].width).toBe(base.project.floors[0].doors[0].width);
  });
  it('retains the v2 negative arm: object retraction must not introduce a new door collision',async()=>{
    const o=control();o.architecture.openings[0].endpoints=[p(480,20),p(480,100)];
    o.furnishing.furniture.push({sourceCategory:'sink',position:p(490,80)});
    const base=await reprojectSourceObservations(o,source());
    const review=async(r:VisualFeedbackRequest)=>answer(r,[hypothesis([],{additionalWalls:[{...d,label:'observed local partition',start:p(440,50),end:p(440,90)}],
      furnitureChanges:[{path:'furniture[1]',action:'retract',evidence:'Control symbol is text.'}]})]);
    const old=await applyVisualFeedback(base,o,source(),{},{scope:'architecture-and-furnishing',review});
    const unified=await applyVisualFeedback(base,o,source(),{},{...scope,review});
    expect(old.visualFeedback.status,JSON.stringify(old.visualFeedback.candidates)).toBe('revised');
    expect(unified.visualFeedback.candidates[0].structuralGuard!.reasons).toContain('new-door-geometry-conflict');
    expect(unified.visualFeedback.status).toBe('pending');expect(unified.project).toEqual(base.project);
  });
  it('routes motion-only default sliding assumptions separately and preserves actual closed-leaf questions',async()=>{
    const o=control();o.architecture.openings[0].doorType='sliding';
    o.architecture.openings[0].endpoints=[p(100,380),p(180,380)];
    o.architecture.walls.push({...d,label:'sweep-only divider',start:p(50,350),end:p(50,380)});
    const base=await reprojectSourceObservations(o,source());
    const inspected=inspectStructuralReview(base,parseSourceArchitecture(o.architecture),o.furnishing,source().image);
    const motion=inspected.report.doors.findings.map((f,i)=>({f,id:`door-review-${i+1}`})).filter(x=>x.f.code==='door-motion-overlap');
    expect(motion.length).toBeGreaterThan(0);
    for(const {id} of motion){expect(inspected.report.routes.find(r=>r.diagnosticId===id)!.route).toBe('program-assumption');expect(inspected.diagnostics.some(d=>d.id===id)).toBe(false);}
    const corner=control();corner.architecture.openings[0].doorType='sliding';
    const cornerBase=await reprojectSourceObservations(corner,source());
    expect(inspectStructuralReview(cornerBase,parseSourceArchitecture(corner.architecture),corner.furnishing,source().image).diagnostics.some(d=>d.code==='door-closed-overlap')).toBe(true);
  });
  it('preserves unknown with one batch, and keeps incomplete ownership out of automatic acceptance',async()=>{
    const o=control(),base=await reprojectSourceObservations(o,source()),review=vi.fn(async r=>answer(r,[],null));
    const result=await applyVisualFeedback(base,o,source(),{},{...scope,review});
    expect(review).toHaveBeenCalledTimes(1);expect(result.visualFeedback.status).toBe('pending');
    const unmapped={...base,features:base.features.filter(f=>f.kind!=='opening')};
    const packet=await buildVisualFeedbackRequest(unmapped,o,source(),'guided',scope.scope);
    expect(packet.structuralReview!.status).toBe('incomplete');expect(packet.request).toBeUndefined();
  });
  it('keeps the original furniture indices after a contrary-evidence retraction',async()=>{
    const o=control();o.furnishing.furniture=[{sourceCategory:'sink',position:p(490,80)},...o.furnishing.furniture];
    o.architecture.openings[0].doorType='opening';
    const base=await reprojectSourceObservations(o,source());
    const result=await applyVisualFeedback(base,o,source(),{},{...scope,review:async r=>answer(r,[hypothesis([],{furnitureChanges:[{path:'furniture[0]',action:'retract',evidence:'Control symbol is a caption rather than a sink.'}]})])});
    expect(result.visualFeedback.status).toBe('revised');
    expect(result.visualFeedback.candidates[0].furnitureSourceIndices).toEqual([1]);
    expect(result.features.find(f=>f.path==='furniture[0]')!.status).toBe('rejected');
    expect(result.features.find(f=>f.path==='furniture[1]')!.status).toBe('retained');
    expect(result.visualFeedback.candidates[0].structuralReview!.anchors.map(a=>a.path)).toContain('furniture[1]');
  });
  it('protects unchanged apertures, source anchors and positive traversal evidence together',async()=>{
    const o=control(),base=await reprojectSourceObservations(o,source());
    const before=inspectStructuralReview(base,parseSourceArchitecture(o.architecture),o.furnishing,source().image).report;
    const after=structuredClone(before);after.apertures=[];after.use!.closed[0]=false;
    expect(compareStructuralReviews(before,after).reasons).toEqual(expect.arrayContaining(['unchanged-opening-lost-or-resized','existing-enclosure-lost']));
    const missing=structuredClone(before);missing.anchors=[];
    expect(compareStructuralReviews(before,missing).reasons).toContain('unchanged-anchor-lost');
    const resolved={...before,resolvedZonePaths:['functionalZones[0]']};
    expect(compareStructuralReviews(resolved,before).reasons).toContain('resolved-functional-zone-lost');
    const overBudget={...o.furnishing,furniture:Array.from({length:65},()=>({sourceCategory:'chair',position:p(250,200)}))};
    const report=inspectStructuralReview(base,parseSourceArchitecture(o.architecture),overBudget,source().image).report;
    expect(report.status).toBe('incomplete');expect(report.deferredAnchorPaths).toEqual(['furniture[64]']);
  });
});
