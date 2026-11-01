import { describe, expect, it, vi } from 'vitest';
import { evaluateLogicalGeometry, preservesLogicalGeometry } from '$lib/plan2world/logicalGeometryConstraints';
import type { SourceWallTraceV1 } from '$lib/plan2world/bareHouse';
import type { SourceAnnotationV1 } from '$lib/plan2world/reconstructionAssembly';
import * as doors from '$lib/runtime/doorGeometryReview';

const p = (x: number, y: number) => ({ x, y });
const wall = (x: number, y: number, a: number, b: number) => ({ start: p(x,y), end: p(a,b) });
function fixture() {
  const trace: SourceWallTraceV1 = { schemaVersion: 'source-wall-trace-v1', walls: [
    wall(20,20,620,20), wall(620,20,620,620), wall(620,620,20,620), wall(20,620,20,20),
  ] };
  const annotation: SourceAnnotationV1 = { schemaVersion: 'source-annotation-v1',
    scaleEvidence: { kind:'provided_length',realLengthCm:100,endpoints:[p(20,20),p(120,20)],evidence:'Control scale.' },
    openings:[{kind:'door',endpoints:[p(275,20),p(365,20)],evidence:'Observed door.',doorType:'single',typeEvidence:'One leaf.'}],
    furniture:[{sourceCategory:'desk',position:p(300,300)}] };
  return { trace, annotation };
}
const state = (trace: SourceWallTraceV1, annotation: SourceAnnotationV1) =>
  evaluateLogicalGeometry(trace,annotation,{},annotation.furniture!.map(f=>f.position)).metrics;

describe('shared logical geometry acceptance',()=>{
  it('rejects replacement of one resolved source opening by another despite unchanged counts and widths',()=>{
    const { trace, annotation }=fixture();
    annotation.openings=[{kind:'window',endpoints:[p(70,20),p(110,20)],evidence:'First window.'},
      {kind:'window',endpoints:[p(170,30),p(210,30)],evidence:'Second window.'}];
    const before=state(trace,annotation), next=structuredClone(trace);
    next.walls[0].start.y=next.walls[0].end.y=30;
    const after=state(next,annotation);
    expect(before.openings).toHaveLength(1);expect(after.openings).toHaveLength(1);
    expect(preservesLogicalGeometry(before,after)).toBe('existing-opening-lost-or-resized');
  });
  it('rejects a clipped interval even though its source identity and opening count survive',()=>{
    const { trace, annotation }=fixture();
    annotation.openings=[{kind:'window',endpoints:[p(22,20),p(62,20)],evidence:'Near jamb.'}];
    const before=state(trace,annotation),next=structuredClone(trace);next.walls[0].start.x=24;
    const after=state(next,annotation);
    expect(before.openings[0].widthPx).toBeCloseTo(40);
    expect(after.openings[0].widthPx).toBeCloseTo(38);
    expect(preservesLogicalGeometry(before,after)).toBe('existing-opening-lost-or-resized');
  });
  it.each(['closed','sweep'])('rejects a new %s door obstruction without changing observations',kind=>{
    const { trace, annotation }=fixture(), original=JSON.stringify({trace,annotation});
    const before=state(trace,annotation),next=structuredClone(trace);
    next.walls.push(kind==='closed'?wall(365,20,365,200):wall(350,75,360,75));
    const after=state(next,annotation);
    expect(before.doorConflicts).toEqual([]);expect(after.doorConflicts.length).toBeGreaterThan(0);
    expect(preservesLogicalGeometry(before,after)).toBe('new-door-geometry-conflict');
    expect(JSON.stringify({trace,annotation})).toBe(original);
  });
  it('keeps existing source conflicts as conflicts rather than requiring silent repair',()=>{
    const { trace,annotation }=fixture();trace.walls.push(wall(365,20,365,200));
    const before=state(trace,annotation);expect(before.doorConflicts.length).toBeGreaterThan(0);
    expect(preservesLogicalGeometry(before,state(structuredClone(trace),annotation))).toBeUndefined();
  });
  it('fails closed on an incomplete sampled door check',()=>{
    const {trace,annotation}=fixture(),before=state(trace,annotation);
    vi.spyOn(doors,'reviewDoorGeometry').mockImplementation(scene=>({ ...doors.unavailableDoorGeometryReview(),
      status:'partial',uncheckedDoorIds:scene.entities.filter(e=>e.kind==='door').map(e=>e.id),pairTests:250000,
      angleStepRadians:Math.PI/180,travelStepMetres:.01 }));
    expect(preservesLogicalGeometry(before,state(trace,annotation))).toBe('door-geometry-check-incomplete');
  });
  it('preserves an empty passage with player clearance even without furniture at the threshold',()=>{
    const { trace,annotation }=fixture();annotation.openings![0].doorType='opening';
    const before=state(trace,annotation),next=structuredClone(trace);next.walls.push(wall(260,35,380,35));
    expect(before.clearDoorIds).toEqual(['d1']);
    expect(preservesLogicalGeometry(before,state(next,annotation))).toBe('existing-door-clearance-lost');
  });
  it('checks overlap on later fragments of a continuous window chain',()=>{
    const {trace,annotation}=fixture();trace.walls.push(wall(320,20,320,400));
    annotation.openings=[{kind:'window',endpoints:[p(270,20),p(370,20)],evidence:'Crosses one baseline junction.'},
      {kind:'window',endpoints:[p(340,20),p(380,20)],evidence:'Overlaps second fragment.'}];
    const result=evaluateLogicalGeometry(trace,annotation,{functionalZoneLabels:[]},[]).metrics;
    expect(result.openings).toHaveLength(2);expect(result.overlappingApertures).toBe(true);
    expect(result.doorCheckStatus).toBe('unavailable');
  });
});
