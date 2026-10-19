import { describe, expect, it } from 'vitest';
import { deriveSourceOpenings } from '$lib/plan2world/sourceOpenings';
import { planOpening } from '$lib/utils/planOpening';

function trace(): any {
  return {cmPerPixel:2,walls:[{id:'w',start:{x:0,y:0},end:{x:400,y:0}}],openings:[{
    id:'d',kind:'door',wallId:'w',endpoints:[{x:50,y:0},{x:250,y:0}],
    evidence:'Visible frame/jambs and two opposing swing arcs',doorType:'double',typeEvidence:'Two leaves share one jamb-to-jamb aperture',
  }]};
}

function glazedRoom(): any {
  return {
    cmPerPixel:1,
    walls:[
      {id:'w1',start:{x:0,y:0},end:{x:100,y:0}},
      {id:'w2',start:{x:100,y:0},end:{x:100,y:100}},
      {id:'w3',start:{x:100,y:100},end:{x:0,y:100}},
      {id:'w4',start:{x:0,y:100},end:{x:0,y:0}},
    ],
    openings:[
      {id:'n1',kind:'window',wallId:'w1',endpoints:[{x:0,y:0},{x:100,y:0}],evidence:'Full-height glazing across the complete side'},
      {id:'n2',kind:'window',wallId:'w2',endpoints:[{x:100,y:0},{x:100,y:100}],evidence:'Full-height glazing across the complete side'},
      {id:'n3',kind:'window',wallId:'w3',endpoints:[{x:100,y:100},{x:0,y:100}],evidence:'Full-height glazing across the complete side'},
      {id:'d1',kind:'door',wallId:'w4',endpoints:[{x:0,y:100},{x:0,y:0}],evidence:'Multi-panel sliding access spans the complete room side',doorType:'sliding',typeEvidence:'Parallel track and sliding panels are visible'},
    ],
    enclosures:[{id:'space-1',boundary:[{wallId:'w1'},{wallId:'w2'},{wallId:'w3'},{wallId:'w4'}]}],
    wallSurfaces:[
      {wallId:'w1',segments:[{kind:'window',openingId:'n1',endpoints:[{x:0,y:0},{x:100,y:0}],evidence:'Complete glazed side'}]},
      {wallId:'w2',segments:[{kind:'window',openingId:'n2',endpoints:[{x:100,y:0},{x:100,y:100}],evidence:'Complete glazed side'}]},
      {wallId:'w3',segments:[{kind:'window',openingId:'n3',endpoints:[{x:100,y:100},{x:0,y:100}],evidence:'Complete glazed side'}]},
      {wallId:'w4',segments:[{kind:'door',openingId:'d1',endpoints:[{x:0,y:100},{x:0,y:0}],evidence:'Complete sliding-door side'}]},
    ],
  };
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
  it('accepts a closed bare room whose sides are entirely windows or a sliding door',()=>{
    const input=glazedRoom(),before=JSON.stringify(input),result=deriveSourceOpenings(input);
    expect(result.roomEnvelope).toEqual({enclosureCount:1,coveredWallCount:4,enclosureIds:['space-1']});
    expect(result.windows).toHaveLength(3);
    expect(result.doors).toEqual([{id:'d1',wallId:'w4',position:.5,width:100,type:'sliding'}]);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('rejects an incomplete room-side classification instead of silently calling the remainder solid',()=>{
    const input=glazedRoom();
    input.wallSurfaces[0].segments[0].endpoints=[{x:0,y:0},{x:60,y:0}];
    input.openings[0].endpoints=[{x:0,y:0},{x:60,y:0}];
    expect(()=>deriveSourceOpenings(input)).toThrow(/unclassified boundary tail/);
  });
  it('rejects an enclosure loop that does not close',()=>{
    const input=glazedRoom();input.walls[2].end={x:10,y:100};
    input.openings[2].endpoints=[{x:100,y:100},{x:10,y:100}];
    input.wallSurfaces[2].segments[0].endpoints=[{x:100,y:100},{x:10,y:100}];
    expect(()=>deriveSourceOpenings(input)).toThrow(/enclosure is not closed/);
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
