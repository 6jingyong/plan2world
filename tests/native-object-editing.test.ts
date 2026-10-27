import {describe,it,expect} from 'vitest';
import {createDefaultProject} from '$lib/models/projectDefaults';
import {applyNativeEditCommand} from '$lib/runtime/nativeEditing';
import {nativeOpeningCatalog,nativeOpeningEditor} from '$lib/runtime/objectCatalog';
import {compileRuntimeArtifacts} from '$lib/runtime/runtimeArtifacts';

function input(){
 const p=createDefaultProject('Object editing'),f=p.floors[0];
 f.walls=[[0,0,600,0],[600,0,600,600],[600,600,0,600],[0,600,0,0]].map(([x,y,a,b],i)=>({id:`w${i}`,start:{x,y},end:{x:a,y:b},height:280,thickness:15,color:'#444444'}));
 f.windows=[{id:'window',wallId:'w2',position:.5,width:160,height:120,sillHeight:90,type:'standard'}];
 f.doors=[{id:'door',wallId:'w0',position:.25,width:90,height:210,type:'single',swingDirection:'left',flipSide:false}];f.entrance={doorId:'door',side:'left'};
 return p;
}
describe('selected native object editing',()=>{
 it('changes a window presentation without changing its aperture, room support or physics',async()=>{
  const p=input(),original=structuredClone(p),f=p.floors[0];
  const result=applyNativeEditCommand(p,{type:'window-style',floorId:f.id,id:'window',windowType:'sliding'});
  expect(p).toEqual(original);expect(result.selectedId).toBe('window');expect(result.updateKind).toBe('window-style');
  expect(result.project.floors[0].windows[0]).toEqual({...f.windows[0],type:'sliding'});
  const [before,after]=await Promise.all([compileRuntimeArtifacts(p,async()=>null),compileRuntimeArtifacts(result.project,async()=>null)]);
  expect(after.runtime.colliders).toEqual(before.runtime.colliders);expect(after.runtime.floors).toEqual(before.runtime.floors);
  expect(after.runtime.source.architectureSha256).not.toBe(before.runtime.source.architectureSha256);
 });
 it('binds choices to the selected native kind, floor and identity',()=>{
  const p=input(),floorId=p.floors[0].id;
  expect(()=>applyNativeEditCommand(p,{type:'window-style',floorId,id:'door',windowType:'fixed'})).toThrow();
  expect(()=>applyNativeEditCommand(p,{type:'window-style',floorId:'another-floor',id:'window',windowType:'fixed'})).toThrow();
  expect(()=>applyNativeEditCommand(p,{type:'window-style',floorId,id:'window',windowType:'invented' as any})).toThrow();
  const selection=applyNativeEditCommand(p,{type:'door-material',floorId,id:'door',material:'glass'});
  expect(selection.selectedId).toBe('door');expect(selection.project.floors[0].doors[0].type).toBe('single');
 });
 it('projects compact material and window cards independently from door motion',()=>{
  const choices=nativeOpeningCatalog(),openings=nativeOpeningEditor(input());
  expect(choices.filter(c=>c.kind==='door').map(c=>'material' in c&&c.material)).toEqual(['wood','glass','steel']);
  expect(choices.filter(c=>c.kind==='window')).toHaveLength(5);
  expect(choices.every(c=>c.symbolSvg.includes('viewBox="0 0 72 72"'))).toBe(true);
  expect(openings.map(o=>[o.id,o.kind])).toEqual([['door','door'],['window','window']]);
 });
});
