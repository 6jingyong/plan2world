import { describe,it,expect } from 'vitest';
import type { Door } from '$lib/models/types';
import { slidingDoorPreset,validateDoorLeaves,reverseDoorLeaves } from '$lib/utils/doorLeaves';
import { compileRuntimeDoor } from '$lib/runtime/doorCompilation';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { applyNativeEditCommand } from '$lib/runtime/nativeEditing';
import { readProject } from '$lib/utils/projectValidation';
import { projectPackageBytes,readProjectPackage } from '$lib/utils/projectPackageCodec';
import { runtimeProductProject } from '../tooling/runtime-product-fixture.mjs';

const wall={id:'wall',floorId:'ground',kind:'wall' as const,path:{start:[0,0] as [number,number],end:[10,0] as [number,number]},thickness:.2,startHeight:3,endHeight:3,boundaryType:'solid' as const,visible:true};
const door:Door={id:'slider',wallId:'wall',position:.5,width:300,height:220,type:'sliding',swingDirection:'left',flipSide:false};
describe('explicit native door panels',()=>{
  it.each(['two-track','three-track','four-split','pocket'] as const)('compiles %s with real fixed bodies and stable author identities',preset=>{
    const input={...door,type:preset==='pocket'?'pocket' as const:door.type,leafConfiguration:slidingDoorPreset(door.width,preset)};
    validateDoorLeaves(input);const before=JSON.stringify(input);
    const a=compileRuntimeDoor('ground',.4,input,wall),b=compileRuntimeDoor('ground',.4,input,wall);
    expect(a).toEqual(b);expect(JSON.stringify(input)).toBe(before);
    if(a.entity.interaction.kind!=='slide')throw Error('slide required');
    const parts=a.entity.interaction.leaves;
    expect(parts.map(p=>p.colliderId)).toEqual(a.colliders.map(c=>c.id));
    const fixed=parts.filter(p=>p.fixed);expect(fixed.length).toBe(preset==='pocket'?0:preset==='four-split'?2:1);
    for(const part of fixed){expect(part.travel).toBe(0);expect(part.axis).toEqual([0,0,0]);}
    expect(parts.reduce((width,p)=>width+p.size[0],0)).toBeCloseTo(3,12);
    expect(a.entity.interaction.allowHostOverlap).toBe(preset==='pocket');
  });
  it('preserves physical panels when host direction reverses',()=>{
    const config=slidingDoorPreset(300,'three-track');
    const a=compileRuntimeDoor('ground',0,{...door,leafConfiguration:config},wall);
    const b=compileRuntimeDoor('ground',0,{...door,leafConfiguration:reverseDoorLeaves(config)},{...wall,path:{start:wall.path.end,end:wall.path.start}});
    if(a.entity.interaction.kind!=='slide'||b.entity.interaction.kind!=='slide')throw Error('slide required');
    a.entity.interaction.leaves.forEach((leaf,i)=>{
      const other=b.entity.interaction.kind==='slide'?b.entity.interaction.leaves[i]:null;
      expect(other!.id).toBe(leaf.id);leaf.closedPose.center.forEach((v,j)=>expect(other!.closedPose.center[j]).toBeCloseTo(v,12));
      leaf.axis.forEach((v,j)=>expect(other!.axis[j]).toBeCloseTo(v,12));
    });
  });
  it('keeps unequal jamb-hinged leaves meeting at the authored ratio',()=>{
    const a=compileRuntimeDoor('ground',0,{...door,type:'double',leafConfiguration:{kind:'paired',firstLeafRatio:.3}},wall);
    if(a.entity.interaction.kind!=='swing')throw Error('swing required');
    const [first,second]=a.entity.interaction.leaves;
    expect(first.size[0]).toBeCloseTo(.9);expect(second.size[0]).toBeCloseTo(2.1);
    expect(first.closedPose.center[0]+first.size[0]/2).toBeCloseTo(second.closedPose.center[0]-second.size[0]/2);
    expect(first.pivot[0]).toBe(3.5);expect(second.pivot[0]).toBe(6.5);
  });
  it('rejects malformed, overlapping or incomplete author configurations',()=>{
    const bad:any[]=[null,{kind:'paired',firstLeafRatio:.5},{kind:'sliding',leaves:[]}];
    const config=slidingDoorPreset(300,'two-track');if(config.kind!=='sliding')throw Error('sliding');
    for(const patch of [{id:'panel-1'},{track:-3,width:151,center:74.5},{width:0},{travel:0},{center:301},{motion:'hinge'},{width:100}]){
      const next=structuredClone(config);Object.assign(next.leaves[1],patch);bad.push(next);
    }
    for(const leafConfiguration of bad)expect(()=>validateDoorLeaves({...door,leafConfiguration})).toThrow(/leaf configuration/);
  });
  it('round trips native JSON and packages, preserves architecture bytes and rejects invalid candidates atomically',async()=>{
    const source=readProject(await runtimeProductProject()),before=JSON.stringify(source),target=source.floors[0].doors.find(d=>d.id==='slide-door')!;
    const result=applyNativeEditCommand(source,{type:'door-leaves',floorId:'ground',id:target.id,configuration:slidingDoorPreset(target.width,'two-track')},new Date(0));
    expect(result.updateKind).toBe('doors');expect(JSON.stringify(source)).toBe(before);
    const reopened=readProjectPackage(projectPackageBytes(result.project)).project;
    expect(reopened.floors[0].doors.find(d=>d.id===target.id)?.leafConfiguration).toEqual(result.project.floors[0].doors.find(d=>d.id===target.id)?.leafConfiguration);
    const a=await compileRuntimeArtifacts(source,async()=>null),b=await compileRuntimeArtifacts(reopened,async()=>null),c=await compileRuntimeArtifacts(reopened,async()=>null);
    expect(b.architectureGlb).toEqual(a.architectureGlb);expect(b).toEqual(c);
    expect(()=>applyNativeEditCommand(source,{type:'door-leaves',floorId:'ground',id:target.id,configuration:{kind:'paired',firstLeafRatio:.5}})).toThrow();
    expect(JSON.stringify(source)).toBe(before);
  });
});
