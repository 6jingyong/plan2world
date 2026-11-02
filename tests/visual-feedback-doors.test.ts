import { describe, it, expect, vi } from 'vitest';
import { reprojectSourceObservations, reconstructFloorPlanForCorrection } from '$lib/plan2world/correction';
import { applyVisualFeedback, buildVisualFeedbackRequest, type VisualFeedbackRequest } from '$lib/plan2world/visualFeedback';
import { inspectFeedbackDoors, doorConflictKeys } from '$lib/plan2world/visualFeedbackDoors';
import { parseSourceArchitecture } from '$lib/plan2world/architecture';
import { encodeRgbaPng } from '../tooling/png-raster.mjs';

const p = (x: number, y: number) => ({ x, y });
const d = { decision: 'accept', evidence: 'Synthetic source stroke.', decisionBasis: 'Control only.' };
const scope = { scope: 'architecture-and-door-motion' as const };
function control() {
  return { architecture: { schemaVersion: 'source-architecture-v1',
    scaleEvidence: { kind: 'provided_length', realLengthCm: 100, endpoints: [p(20,20),p(120,20)], evidence: 'Control.' },
    walls: [[20,20,480,20],[480,20,480,380],[480,380,20,380],[20,380,20,20]].map(([x,y,a,b],i)=>({...d,label:`wall ${i}`,start:p(x,y),end:p(a,b)})),
    openings: [{...d,label:'corner threshold',kind:'door',doorType:'single',typeEvidence:'Initial interpretation.',endpoints:[p(20,380),p(100,380)]}],
    functionalZones: [], doorGaps: [] }, furnishing: { schemaVersion: 'source-furnishing-v1', furniture: [] } };
}
function source() { return { sha256: 'd'.repeat(64), image: { width: 500, height: 400,
  dataUrl: 'data:image/png;base64,'+Buffer.from(encodeRgbaPng({width:500,height:400,data:Buffer.alloc(500*400*4,255)})).toString('base64') } }; }
const answer = (r: VisualFeedbackRequest, hypotheses: unknown[] = [], selected: number | null = null) =>
  ({schemaVersion:'source-visual-feedback-decision-v1',requestId:r.requestId,hypotheses,selected,unresolvedQuestions:[]});
const hypothesis = (changes: unknown[] = [], extra = {}) => ({label:'Control interpretation',visualSupport:'clear',evidence:'Explicit synthetic contrary source evidence.',changes,...extra});

describe('optional source-owned door conflict feedback', () => {
  it('finds mechanical conflicts despite complete assembly and zero source notes, without modifying artifacts', async () => {
    const o=control(), b=await reprojectSourceObservations(o,source()), frozen=JSON.stringify(b);
    expect(b.partialImport).toBe(false);expect(b.issueCount).toBe(0);
    const {review,diagnostics}=inspectFeedbackDoors(b,parseSourceArchitecture(o.architecture));
    expect(review.status).toBe('assessed');expect(review.findings.some(f=>f.code==='door-closed-overlap')).toBe(true);
    expect(diagnostics[0].sourcePaths).toContain('openings[0]');expect(diagnostics[0].position).toEqual(p(60,380));
    expect(JSON.stringify(b)).toBe(frozen);
  });
  it('requires explicit opt in and preserves default two observations', async () => {
    const o=control(),observe=vi.fn().mockResolvedValueOnce(o.architecture).mockResolvedValueOnce(o.furnishing),review=vi.fn();
    const result=await reconstructFloorPlanForCorrection(observe,source(),{},{review});
    expect(observe).toHaveBeenCalledTimes(2);expect(review).not.toHaveBeenCalled();expect(result.visualFeedback.status).toBe('not-needed');
    expect(result.visualFeedback.doorReview).toBeUndefined();
  });
  it('maps arbitrary IDs through ownership and retains all parents of a merged blocker', async () => {
    const o=control(),b=await reprojectSourceObservations(o,source()),f=b.project.floors[0];
    const door=f.doors[0],old=door.id;door.id='opaque-door';b.features.find(x=>x.nativeIds.includes(old))!.nativeIds=['opaque-door'];
    const wall=f.walls.find(w=>w.id!==door.wallId&&w.start.x===w.end.x&&w.start.x===0)!;
    const original=wall.id;wall.id='opaque-blocker';b.features.find(x=>x.nativeIds.includes(original))!.nativeIds=['opaque-blocker'];
    const architecture=parseSourceArchitecture(o.architecture);architecture.walls.push({...architecture.walls[3]});
    b.features.push({path:'walls[4]',kind:'wall',status:'retained',nativeIds:['opaque-blocker'],blockedBy:[]});
    const {review}=inspectFeedbackDoors(b,architecture);
    expect(review.unmappedEntityIds).toEqual([]);expect(review.findings.some(f=>f.entityId==='opaque-door'&&f.blockerPaths.length===2)).toBe(true);
  });
  it('binds scope but gives ordinary and guided modes identical images and records', async () => {
    const o=control(),b=await reprojectSourceObservations(o,source());
    const ordinary=(await buildVisualFeedbackRequest(b,o,source(),'ordinary',scope.scope)).request!;
    const guided=(await buildVisualFeedbackRequest(b,o,source(),'guided',scope.scope)).request!;
    expect(guided.schemaVersion).toBe('source-visual-feedback-v3');expect(ordinary.records).toEqual(guided.records);
    expect(ordinary.regions.map(r=>[r.focusBox,r.contextBox])).toEqual(guided.regions.map(r=>[r.focusBox,r.contextBox]));
    expect(guided.regions[0].questions.join(' ')).toContain('Default hinge/swing side');
    expect(guided.requestId).not.toBe(ordinary.requestId);expect(guided.records.some(r=>r.path==='walls[3]')).toBe(true);
  });
  it('keeps unknown mechanical/source ownership with one review and no retry', async () => {
    const o=control(),b=await reprojectSourceObservations(o,source()),review=vi.fn(async r=>answer(r));
    const result=await applyVisualFeedback(b,o,source(),{},{...scope,review});
    expect(result.visualFeedback.status).toBe('pending');expect(result.project).toEqual(b.project);expect(review).toHaveBeenCalledTimes(1);
    expect(result.visualFeedback.doorReview!.findings.length).toBeGreaterThan(0);
  });
  it('retains source-supported alternatives and applies a clear leafless interpretation without moving its aperture', async () => {
    const o=control(),b=await reprojectSourceObservations(o,source()),original=JSON.stringify(o);
    const result=await applyVisualFeedback(b,o,source(),{},{...scope,review:async r=>answer(r,[hypothesis([{path:'openings[0]',value:{...o.architecture.openings[0],doorType:'opening',typeEvidence:'Control source establishes an unadorned leafless threshold.'}}])],0)});
    expect(result.visualFeedback.status).toBe('revised');expect(result.project.floors[0].doors[0].width).toBe(b.project.floors[0].doors[0].width);
    expect(result.visualFeedback.candidates[0].doorReview!.findings).toEqual([]);expect(JSON.stringify(o)).toBe(original);
  });
  it('blocks a selected candidate with new source-owned collisions and retains the candidate', async () => {
    const o=control(),b=await reprojectSourceObservations(o,source());
    const result=await applyVisualFeedback(b,o,source(),{},{...scope,review:async r=>answer(r,[hypothesis([],{additionalWalls:[{...d,label:'new divider',start:p(70,330),end:p(70,360)}]})],0)});
    expect(result.visualFeedback.candidates[0].status).toBe('validated');
    expect(result.visualFeedback.candidates[0].introducedDoorConflicts!.some(k=>k.includes('walls[4]'))).toBe(true);
    expect(result.visualFeedback.status).toBe('pending');expect(result.project).toEqual(b.project);
  });
  it('does not mistake a newly unassembled accepted aperture for a resolved mechanical conflict', async () => {
    const o=control(),b=await reprojectSourceObservations(o,source());
    const result=await applyVisualFeedback(b,o,source(),{},{...scope,review:async r=>answer(r,[hypothesis([],{additionalWalls:[{...d,label:'intersecting divider',start:p(70,340),end:p(70,380)}]})],0)});
    expect(result.visualFeedback.candidates[0].doorReview!.status).toBe('incomplete');
    expect(result.visualFeedback.candidates[0].doorReview!.unassessedOpeningPaths).toContain('openings[0]');
    expect(result.visualFeedback.status).toBe('pending');expect(result.project).toEqual(b.project);
  });
  it('preserves incomplete compiler checks and unmapped ownership without an image retry', async () => {
    const o=control(),b=await reprojectSourceObservations(o,source()),review=vi.fn();
    const unmapped={...b,features:b.features.filter(f=>f.kind!=='opening')};
    const result=await applyVisualFeedback(unmapped,o,source(),{},{...scope,review});
    expect(result.visualFeedback.status).toBe('not-reviewable');expect(result.visualFeedback.doorReview!.unmappedEntityIds.length).toBeGreaterThan(0);
    expect(review).not.toHaveBeenCalled();
    const broken=structuredClone(b);broken.project.floors[0].rooms.push({id:'bad-floor',name:'Bad',walls:[],floorTexture:'concrete',area:0,boundary:[p(10,10),p(20,20),p(30,30)].map(point=>({point}))});
    const failure=await applyVisualFeedback(broken,o,source(),{},{...scope,review});
    expect(failure.visualFeedback.doorReview!.status).toBe('not-assessed');expect(failure.visualFeedback.status).toBe('not-reviewable');expect(review).not.toHaveBeenCalled();
  });
  it('compares conflict sets independently of generated IDs and duplicate split fragments', () => {
    const finding={code:'door-motion-overlap' as const,openingPath:'openings[2]',blockerPaths:['walls[7]'],hostPaths:['walls[1]'],entityId:'arbitrary',blockerId:'split-a'};
    const review={status:'assessed' as const,findings:[finding,{...finding,blockerId:'split-b'}],unmappedEntityIds:[],uncheckedDoorIds:[],unassessedOpeningPaths:[]};
    expect(doorConflictKeys(review)).toEqual([JSON.stringify(['door-motion-overlap','openings[2]','walls[7]'])]);
  });
});
