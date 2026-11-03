import {describe,it,expect,vi} from 'vitest';
import {parseSourceArchitecture} from '$lib/plan2world/architecture';
import {inspectStructureEvidence,parseStructureEvidence,type StructureEvidence} from '$lib/plan2world/structureEvidence';
import {reprojectSourceObservations,reconstructFloorPlanForCorrection} from '$lib/plan2world/correction';
import {applyVisualFeedback,buildVisualFeedbackRequest} from '$lib/plan2world/visualFeedback';
import {compileRuntimeScene} from '$lib/runtime/compileRuntimeScene';
import {encodeRgbaPng} from '../tooling/png-raster.mjs';
import {attachStructureEvidence} from '$lib/plan2world/structureEvidenceAuthoring';
import {planPointToSourcePixel} from '$lib/plan2world/reconstructionTrace';

const p=(x:number,y:number)=>({x,y}),d={decision:'accept',evidence:'Synthetic source line.',decisionBasis:'Controlled observation.'};
function control(){return {architecture:{schemaVersion:'source-architecture-v1',
  scaleEvidence:{kind:'provided_length',realLengthCm:100,endpoints:[p(20,20),p(120,20)],evidence:'Control.'},
  walls:[[20,20,480,20],[480,20,480,380],[480,380,20,380],[20,380,20,20]].map(([x,y,a,b],i)=>({...d,label:`boundary ${i}`,start:p(x,y),end:p(a,b)})),
  openings:[{...d,label:'threshold',kind:'door',doorType:'opening',typeEvidence:'Control.',endpoints:[p(20,120),p(20,200)]}],functionalZones:[],doorGaps:[]},
  furnishing:{schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:p(250,250)}]}};}
function source(){return {sha256:'f'.repeat(64),image:{width:500,height:400,dataUrl:'data:image/png;base64,'+Buffer.from(encodeRgbaPng({width:500,height:400,data:Buffer.alloc(500*400*4,255)})).toString('base64')}};}
function evidence():StructureEvidence{return {schemaVersion:'source-structure-evidence-v1',anchors:[{path:'walls[0]',role:'outline',evidence:'Clear top exterior stroke.'}],questions:[{paths:['walls[4]'],region:[300,170,420,230],conflict:'Line may be a boundary or furnishing stroke.',alternatives:[{label:'partition',evidence:'A straight continuous stroke.'},{label:'furnishing edge',evidence:'No established end junction.'}]}]};}
function ambiguous(){const o=control();o.architecture.walls.push({...d,decision:'uncertain',label:'faint line',start:p(20,200),end:p(480,200)});return {...o,architecture:{...o.architecture,structureEvidence:evidence()}};}
const normalize=(floor:any)=>({...floor,id:'floor',rooms:floor.rooms.map((room:any,i:number)=>({...room,id:`room-${i}`}))});

describe('first-observation structural evidence',()=>{
  it('attaches retained questions using the current calibrated source registration',async()=>{
    const o=ambiguous(),base=await reprojectSourceObservations(control(),source()),project=structuredClone(base.project),floor=project.floors[0];
    floor.backgroundImage!.scale*=2;floor.backgroundImage!.rotation=90;floor.backgroundImage!.position.x+=40;
    const frozen=JSON.stringify(project),next=attachStructureEvidence(project,{...o,sourceSha256:source().sha256},source().image);
    expect(JSON.stringify(project)).toBe(frozen);expect(next.floors).toEqual(project.floors);
    const issue=next.architectureReview!.issues.find(i=>i.code==='structure-question')!;
    const point=planPointToSourcePixel(issue.position!,source().image,next.floors[0].backgroundImage!);
    expect(point.x).toBeCloseTo(360,8);expect(point.y).toBeCloseTo(200,8);
    expect(JSON.parse(next.architectureReview!.sourceObservations!).architecture.structureEvidence).toEqual(evidence());
  });
  it('preserves malformed optional evidence as a native note without changing the supplied project',async()=>{
    const o=control(),base=await reprojectSourceObservations(o,source()),snapshot={...o,architecture:{...o.architecture,structureEvidence:{selected:0}}};
    const next=attachStructureEvidence(base.project,snapshot,source().image);
    expect(next.floors).toEqual(base.project.floors);expect(next.architectureReview!.issues[0].code).toBe('invalid-structure-evidence');
    expect(attachStructureEvidence(base.project,undefined,source().image)).toBe(base.project);
  });
  it('retains original hypotheses without constructing an uncertain line or selecting a role',async()=>{
    const o=ambiguous(),frozen=JSON.stringify(o),result=await reprojectSourceObservations(o,source());
    expect(result.partialImport).toBe(false);expect(result.project.floors[0].walls).toHaveLength(4);
    expect(result.features.find(f=>f.path==='walls[4]')!.status).toBe('uncertain');
    expect(result.diagnostics.some(d=>d.code==='structure-question')).toBe(true);
    expect(JSON.parse(result.project.architectureReview!.sourceObservations!).architecture.structureEvidence).toEqual(evidence());
    expect(JSON.stringify(o)).toBe(frozen);
  });
  it('does not invalidate supported architecture when optional hints are malformed',async()=>{
    const o=control(),base=await reprojectSourceObservations(o,source());
    const malformed={...o,architecture:{...o.architecture,structureEvidence:{anchors:[{position:p(-100,200)}],selected:0}}};
    const result=await reprojectSourceObservations(malformed,source());
    expect(result.partialImport).toBe(false);expect(normalize(result.project.floors[0])).toEqual(normalize(base.project.floors[0]));
    expect(result.diagnostics.some(d=>d.code==='invalid-structure-evidence')).toBe(true);
    expect(result.audit.changes.some(c=>c.kind==='invalid-structure-evidence')).toBe(true);
    expect(JSON.parse(result.project.architectureReview!.sourceObservations!).architecture.structureEvidence).toEqual(malformed.architecture.structureEvidence);
  });
  it('preserves anchor-only evidence through native save even with zero source issues and no runtime change',async()=>{
    const o=control(),base=await reprojectSourceObservations(o,source());
    const result=await reprojectSourceObservations({...o,architecture:{...o.architecture,structureEvidence:{...evidence(),questions:[]}}},source());
    expect(result.issueCount).toBe(0);expect(result.project.architectureReview!.issues).toEqual([]);
    const sameProject=structuredClone(base.project);sameProject.architectureReview=result.project.architectureReview;
    expect(compileRuntimeScene(sameProject)).toEqual(compileRuntimeScene(base.project));
  });
  it('keeps exactly two observations and supplies the frozen first evidence to furnishing',async()=>{
    const o=ambiguous(),observe=vi.fn(async(prompt:string)=>{
      if(!observe.mock.calls.length||!prompt.includes('FROZEN_ARCHITECTURE_JSON:'))return o.architecture;
      const frozen=JSON.parse(prompt.split('FROZEN_ARCHITECTURE_JSON:\n')[1]);expect(frozen.structureEvidence).toEqual(evidence());return o.furnishing;
    });
    const result=await reconstructFloorPlanForCorrection(observe,source());
    expect(observe).toHaveBeenCalledTimes(2);expect(observe.mock.calls[0][0]).toContain('Whole-plan anchors');
    expect(result.features.find(f=>f.path==='walls[4]')!.status).toBe('uncertain');
  });
  it('remaps references after existing exact duplicate union while retaining the original ledger',async()=>{
    const o=ambiguous();o.architecture.walls.splice(1,0,structuredClone(o.architecture.walls[0]));
    o.architecture.structureEvidence.anchors[0].path='walls[4]';o.architecture.structureEvidence.questions[0].paths=['walls[5]'];
    const result=await reprojectSourceObservations(o,source());
    const current=inspectStructureEvidence(parseSourceArchitecture(result.audit.programProjection)).evidence!;
    expect(current.anchors[0].path).toBe('walls[3]');expect(current.questions[0].paths).toEqual(['walls[4]']);
    expect(result.audit.changes.some(c=>c.kind==='structure-evidence-remap')).toBe(true);
    expect((result.audit.originalObservation as any).structureEvidence.questions[0].paths).toEqual(['walls[5]']);
  });
  it('uses the retained local box and early anchors in v4, without spending another crop on the generic warning',async()=>{
    const o=ambiguous(),base=await reprojectSourceObservations(o,source());
    const guided=(await buildVisualFeedbackRequest(base,o,source(),'guided','unified-structure')).request!;
    const ordinary=(await buildVisualFeedbackRequest(base,o,source(),'ordinary','unified-structure')).request!;
    expect(guided.regions).toHaveLength(1);expect(guided.regions[0].focusBox).toEqual([288,158,432,242]);
    expect(guided.structureEvidence!.questions).toEqual(evidence().questions);
    expect(guided.anchors[0].evidence).toMatchObject({path:'walls[0]',role:'outline'});
    expect(guided.records).toEqual(ordinary.records);expect(guided.anchors).toEqual(ordinary.anchors);
    expect(guided.regions.map(r=>[r.focusBox,r.contextBox])).toEqual(ordinary.regions.map(r=>[r.focusBox,r.contextBox]));
    const review=vi.fn(async r=>({schemaVersion:'source-visual-feedback-decision-v1',requestId:r.requestId,hypotheses:[],selected:null,unresolvedQuestions:['Still ambiguous.']}));
    const result=await applyVisualFeedback(base,o,source(),{},{scope:'unified-structure',review});
    expect(review).toHaveBeenCalledTimes(1);expect(result.visualFeedback.status).toBe('pending');expect(result.project).toEqual(base.project);
  });
  it.each([
    ['dangling path',(e:any)=>e.anchors[0].path='walls[999]'],
    ['native host',(e:any)=>e.anchors[0].wallId='native-wall'],
    ['selected answer',(e:any)=>e.questions[0].selected=0],
    ['out of bounds',(e:any)=>e.questions[0].region=[300,170,600,230]],
    ['duplicate alternatives',(e:any)=>e.questions[0].alternatives[1]=e.questions[0].alternatives[0]],
    ['excess questions',(e:any)=>e.questions=Array(4).fill(e.questions[0])],
    ['wrong anchor role',(e:any)=>e.anchors[0].role='opening'],
  ])('reports %s as an advisory contract problem',(_name,change)=>{
    const architecture=parseSourceArchitecture(ambiguous().architecture),value=evidence();(change as (e:any)=>void)(value);
    expect(()=>parseStructureEvidence(value,architecture,source().image)).toThrow();
    architecture.structureEvidence=value;expect(inspectStructureEvidence(architecture,source().image).status).toBe('invalid');
  });
});
