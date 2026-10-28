import{describe,it,expect}from'vitest';
import{projectPackageBytes,readProjectPackage}from'$lib/utils/projectPackageCodec';
import{readPackageZip,writePackageZip}from'$lib/utils/projectPackageZip';
import{readProject}from'$lib/utils/projectValidation';
import{slidingDoorPreset}from'$lib/utils/doorLeaves';
import{runtimeProductProject}from'../tooling/runtime-product-fixture.mjs';

describe('retained panel configuration after companion native edits',()=>{
  it.each(['width','type'])('keeps %s edits compatible without silently retaining an invalid panel layout',async field=>{
    const project=readProject(await runtimeProductProject()),door=project.floors[0].doors.find(d=>d.id==='slide-door')!;
    door.leafConfiguration=slidingDoorPreset(door.width,'two-track');const original=JSON.stringify(project);
    const files=readPackageZip(projectPackageBytes(project)),decode=(name:string)=>JSON.parse(new TextDecoder().decode(files[name]));
    const plan=decode('plan.json'),mapping=decode('mapping.json').entries;
    const opening=plan.openings.find((o:any)=>o.id===mapping.find((m:any)=>m.kind==='doors'&&m.webId===door.id).id);
    if(field==='width')opening.width=.8;else opening.style='single';
    files['plan.json']=new TextEncoder().encode(JSON.stringify(plan));
    const returned=readProjectPackage(writePackageZip(files)).project.floors[0].doors.find(d=>d.id===door.id)!;
    if(field==='width'){
      expect(returned.width).toBe(80);expect(returned.leafConfiguration).toEqual(slidingDoorPreset(80,'two-track'));
    }else{expect(returned.type).toBe('single');expect(returned.leafConfiguration).toBeUndefined();}
    expect(JSON.stringify(project)).toBe(original);
  });
});
