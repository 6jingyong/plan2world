import {describe,it,expect,vi} from 'vitest';
import {reconstructFloorPlanForCorrection} from '$lib/plan2world/correction';
import {readProject} from '$lib/utils/projectValidation';
import {encodeRgbaPng} from '../tooling/png-raster.mjs';

const p=(x:number,y:number)=>({x,y}),e={decision:'accept',evidence:'Synthetic line',decisionBasis:'Synthetic observation'};
const architecture=()=>({schemaVersion:'source-architecture-v1',scaleEvidence:{kind:'provided_length',realLengthCm:600,endpoints:[p(0,0),p(100,0)],evidence:'Synthetic scale'},
  walls:[[0,0,100,0],[100,0,100,100],[100,100,0,100],[0,100,0,0]].map(([x,y,a,b],i)=>({...e,label:`wall ${i}`,start:p(x,y),end:p(a,b)})),
  openings:[{...e,label:'entry',kind:'door',endpoints:[p(20,0),p(40,0)]}],doorGaps:[]});
const furnishing={schemaVersion:'source-furnishing-v1',furniture:[{sourceCategory:'chair',position:p(50,50)}]};
const source=()=>({sha256:'a'.repeat(64),image:{width:100,height:100,dataUrl:'data:image/png;base64,'+Buffer.from(encodeRgbaPng({width:100,height:100,data:Buffer.alloc(40000,255)})).toString('base64')}});
describe('annotated source correction without another model call',()=>{
  it('keeps a normal reconstruction free of correction notes and uses exactly two observations',async()=>{
    const observe=vi.fn().mockResolvedValueOnce(architecture()).mockResolvedValueOnce(furnishing),result=await reconstructFloorPlanForCorrection(observe,source());
    expect(observe).toHaveBeenCalledTimes(2);expect(result.draft).toBeDefined();expect(result.issueCount).toBe(0);expect(result.project.architectureReview).toBeUndefined();
  });
  it('turns an unhosted accepted opening into a located source note, retains complete originals, and does not invent a host',async()=>{
    const a=architecture();a.walls.shift();const wire=JSON.stringify(a),observe=vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(furnishing);
    const result=await reconstructFloorPlanForCorrection(observe,source());
    expect(observe).toHaveBeenCalledTimes(2);expect(result.audit.reviewCount).toBe(0);expect(result.issueCount).toBeGreaterThan(0);
    const project=readProject(result.project),floor=project.floors[0];
    expect(floor.doors).toHaveLength(0);expect(floor.walls).toHaveLength(3);expect(floor.backgroundImage?.dataUrl).toBe(source().image.dataUrl);
    expect(project.architectureReview!.issues.some(i=>i.message.includes('entry')&&i.position)).toBe(true);
    expect(project.architectureReview!.sourceObservations).toContain(wire);expect(JSON.stringify(a)).toBe(wire);
  });
  it('retains uncertain openings as notes even when the rest can assemble',async()=>{
    const a=architecture();a.openings[0].decision='uncertain';
    const out=await reconstructFloorPlanForCorrection(vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(furnishing),source());
    expect(out.project.floors[0].doors).toHaveLength(0);expect(out.project.architectureReview!.issues.some(i=>i.message.includes('uncertain'))).toBe(true);
  });
  it('preserves overlapping source walls for explicit correction and keeps their original evidence',async()=>{
    const a=architecture();a.walls.push({...a.walls[0],label:'nearby disputed line',start:p(0,1),end:p(100,1)});
    const out=await reconstructFloorPlanForCorrection(vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(furnishing),source());
    expect(out.issueCount).toBeGreaterThan(0);expect(out.project.floors[0].walls).toHaveLength(5);expect(readProject(out.project)).toBeDefined();
    expect(out.project.architectureReview!.issues.some(i=>i.message.includes('has not been assessed'))).toBe(true);
    expect(out.project.architectureReview!.issues.some(i=>i.message.includes('needs a wall host'))).toBe(false);
  });
  it('does not present a closed footprint with zero confirmed apertures as a source pass',async()=>{
    const a=architecture();a.openings=[];
    const out=await reconstructFloorPlanForCorrection(vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(furnishing),source());
    expect(out.draft).toBeDefined();expect(out.issueCount).toBe(1);
    expect(out.project.architectureReview!.issues[0].message).toContain('site/footprint');
    expect(out.project.floors[0].doors).toHaveLength(0);expect(out.project.floors[0].windows).toHaveLength(0);
  });
  it('retains malformed source data as an annotated canvas while operational provider failures still propagate',async()=>{
    const out=await reconstructFloorPlanForCorrection(vi.fn().mockResolvedValueOnce({unexpected:'source'}).mockResolvedValueOnce(furnishing),source());
    expect(readProject(out.project)).toBeDefined();expect(out.project.floors[0].walls).toHaveLength(0);expect(out.project.architectureReview!.sourceObservations).toContain('unexpected');
    const fail=vi.fn().mockRejectedValue(new Error('provider unavailable'));
    await expect(reconstructFloorPlanForCorrection(fail,source())).rejects.toThrow('provider unavailable');expect(fail).toHaveBeenCalledTimes(1);
  });
  it('keeps each usable wall when another wall record is malformed, preserving the rejected raw input',async()=>{
    const a=architecture();(a.walls[0] as any).wallId='invalid-provider-native-field';
    const out=await reconstructFloorPlanForCorrection(vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(furnishing),source());
    expect(out.project.floors[0].walls).toHaveLength(3);expect(out.project.architectureReview!.sourceObservations).toContain('invalid-provider-native-field');
  });
});
