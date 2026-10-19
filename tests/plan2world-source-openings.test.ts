import { describe, expect, it } from 'vitest';
import { deriveSourceOpenings } from '$lib/plan2world/sourceOpenings';
import { planOpening } from '$lib/utils/planOpening';

function trace(): any {
  return {cmPerPixel:2,walls:[{id:'w',start:{x:0,y:0},end:{x:400,y:0}}],openings:[{
    id:'d',kind:'door',wallId:'w',endpoints:[{x:50,y:0},{x:250,y:0}],
    evidence:'Visible frame/jambs and two opposing swing arcs',doorType:'double',typeEvidence:'Two leaves share one jamb-to-jamb aperture',
  }]};
}

describe('source opening intervals',()=>{
  it('keeps a double door as one total-width aperture and preserves inputs',()=>{
    const input=trace(),before=JSON.stringify(input),result=deriveSourceOpenings(input);
    expect(result.doors).toEqual([{id:'d',wallId:'w',position:.375,width:400,type:'double'}]);
    expect(JSON.stringify(input)).toBe(before);
    expect(result.unresolvedDoorTypes).toEqual([]);
    input.openings[0].endpoints.reverse();input.walls[0].start={x:400,y:0};input.walls[0].end={x:0,y:0};
    expect(deriveSourceOpenings(input).doors[0]).toMatchObject({position:.625,width:400,type:'double'});
  });
  it('does not infer leaf count from a wide aperture or give windows thickness',()=>{
    const input=trace();delete input.openings[0].doorType;delete input.openings[0].typeEvidence;
    let result=deriveSourceOpenings(input);
    expect(result.doors[0].type).toBeUndefined();expect(result.unresolvedDoorTypes).toEqual(['d']);
    input.openings[0].kind='window';result=deriveSourceOpenings(input);
    expect(result.windows).toEqual([{id:'d',wallId:'w',position:.375,width:400}]);
    expect(result.unresolvedDoorTypes).toEqual([]);
  });
  it('round trips asymmetric curved intervals through the existing physical opening metric',()=>{
    const input=trace();input.cmPerPixel=1;
    input.walls[0]={id:'w',start:{x:0,y:0},end:{x:1000,y:0},curvePoint:{x:0,y:1000}};
    input.openings[0].endpoints=[{x:14.4,y:211.2},{x:409.6,y:460.8}]; // analytic t=.12 and t=.64
    const result=deriveSourceOpenings(input),door=result.doors[0];
    expect(door.position).not.toBeCloseTo((.12+.64)/2,3);
    expect(door.width).toBeGreaterThan(Math.hypot(409.6-14.4,460.8-211.2));
    const projected=planOpening({...input.walls[0],thickness:20,height:280,color:'#fff'},door.position,door.width)!;
    expect(projected.curve!.start.x).toBeCloseTo(14.4,8);expect(projected.curve!.start.y).toBeCloseTo(211.2,8);
    expect(projected.curve!.end.x).toBeCloseTo(409.6,8);expect(projected.curve!.end.y).toBeCloseTo(460.8,8);
  });
  it('rejects an opening split across wall segments instead of stitching a host',()=>{
    const input=trace();
    input.walls=[
      {id:'w-left',start:{x:0,y:0},end:{x:45,y:0}},
      {id:'w-right',start:{x:55,y:0},end:{x:100,y:0}},
    ];
    input.openings[0].wallId='w-left';
    input.openings[0].endpoints=[{x:40,y:0},{x:60,y:0}];
    expect(()=>deriveSourceOpenings(input)).toThrow(/different wall segments.*one continuous host wall/);
    expect(input.walls).toHaveLength(2);
  });
  it.each(['no-evidence','no-leaf-evidence','no-endpoints','off-host','unknown-host','duplicate-id','thickness','heuristic-width','window-leaves'])('rejects %s rather than repairing source traces',failure=>{
    const input=trace(),opening=input.openings[0];
    if(failure==='no-evidence')opening.evidence='';
    if(failure==='no-leaf-evidence')delete opening.typeEvidence;
    if(failure==='no-endpoints')delete opening.endpoints;
    if(failure==='off-host')opening.endpoints[0].y=20;
    if(failure==='unknown-host')opening.wallId='missing';
    if(failure==='duplicate-id')input.openings.push(structuredClone(opening));
    if(failure==='thickness')opening.thickness=12;
    if(failure==='heuristic-width')opening.width=320;
    if(failure==='window-leaves')opening.kind='window';
    expect(()=>deriveSourceOpenings(input)).toThrow();
  });
});
