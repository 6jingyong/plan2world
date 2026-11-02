import { describe, it, expect } from 'vitest';
import { reprojectSourceObservations } from '$lib/plan2world/correction';
import { inspectFeedbackMotionContext } from '$lib/plan2world/visualFeedbackMotion';
import { slidingDoorPreset } from '$lib/utils/doorLeaves';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { encodeRgbaPng } from '../tooling/png-raster.mjs';

const p=(x:number,y:number)=>({x,y});
async function control(start=20) {
  const d={decision:'accept',evidence:'Synthetic source line.',decisionBasis:'Synthetic control.'};
  const observations={architecture:{schemaVersion:'source-architecture-v1',
    scaleEvidence:{kind:'provided_length',realLengthCm:100,endpoints:[p(20,20),p(120,20)],evidence:'Control.'},
    walls:[[20,20,480,20],[480,20,480,380],[480,380,20,380],[20,380,20,20]].map(([x,y,a,b],i)=>({...d,label:`wall ${i}`,start:p(x,y),end:p(a,b)})),
    openings:[{...d,label:'slider',kind:'door',doorType:'sliding',typeEvidence:'Control operation.',endpoints:[p(start,380),p(start+80,380)]}],functionalZones:[]},
    furnishing:{schemaVersion:'source-furnishing-v1',furniture:[]}};
  const source={sha256:'e'.repeat(64),image:{width:500,height:400,dataUrl:'data:image/png;base64,'+Buffer.from(encodeRgbaPng({width:500,height:400,data:Buffer.alloc(500*400*4,255)})).toString('base64')}};
  return reprojectSourceObservations(observations,source);
}

describe('human-only current sliding motion context',()=>{
  it('explains the current full-span default without changing source, geometry or compiler output',async()=>{
    const result=await control(),original=JSON.stringify(result),runtime=compileRuntimeScene(result.project);
    const review=inspectFeedbackMotionContext(result);
    expect(review.status).toBe('checked');expect(review.doors).toHaveLength(1);
    expect(review.doors[0]).toMatchObject({basis:'default-full-span',sourcePaths:['openings[0]'],panels:[{fixed:false}]});
    expect(review.doors[0].openingSpanCm).toBe(result.project.floors[0].doors[0].width);
    expect(review.doors[0].panels[0].widthCm).toBeCloseTo(80,12);expect(review.doors[0].panels[0].travelCm).toBeCloseTo(80,12);
    expect(JSON.stringify(result)).toBe(original);expect(compileRuntimeScene(result.project)).toEqual(runtime);
  });
  it('uses canonical configuration ownership instead of guessing from panel count or native ID',async()=>{
    const result=await control(),door=result.project.floors[0].doors[0],old=door.id;
    door.id='opaque-identity';door.leafConfiguration=slidingDoorPreset(door.width,'pocket');
    result.features.find(f=>f.kind==='opening'&&f.nativeIds.includes(old))!.nativeIds=['opaque-identity'];
    const review=inspectFeedbackMotionContext(result);
    expect(review.doors[0]).toMatchObject({entityId:'opaque-identity',basis:'explicit-panels',sourcePaths:['openings[0]']});
    expect(review.doors[0].panels).toHaveLength(1);expect(review.unmappedDoorIds).toEqual([]);
    result.features=result.features.filter(f=>f.kind!=='opening');
    expect(inspectFeedbackMotionContext(result).unmappedDoorIds).toEqual(['opaque-identity']);
  });
  it('limits context to conflicted sliding doors, without treating an unobstructed default as an error',async()=>{
    const result=await control(220);
    expect(inspectFeedbackMotionContext(result).doors).toEqual([]);
    result.project.floors[0].doors[0].type='single';
    expect(inspectFeedbackMotionContext(result).doors).toEqual([]);
  });
  it('keeps unsupported motion and compilation failure incomplete',async()=>{
    const result=await control(),f=result.project.floors[0];
    f.doors.push({...f.doors[0],id:'unsupported',position:.4,type:'bifold'});
    const review=inspectFeedbackMotionContext(result);
    expect(review.status).toBe('partial');expect(review.uncheckedDoorIds).toContain('unsupported');
    f.rooms.push({id:'bad-floor',name:'Bad',walls:[],floorTexture:'concrete',area:0,boundary:[]});
    expect(inspectFeedbackMotionContext(result).status).toBe('unavailable');
  });
});
