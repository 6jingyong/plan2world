import {describe,it,expect} from 'vitest';
import {compileRuntimeArtifacts} from '$lib/runtime/runtimeArtifacts';
import {RuntimeProjectError} from '$lib/runtime/runtimeProjectError';
import {runtimeProductProject} from '../tooling/runtime-product-fixture.mjs';

describe('recoverable native geometry vs operational failure',()=>{
 it('identifies unsupported geometry in a valid Project without changing it',async()=>{
  const p=await runtimeProductProject();p.floors[0].furniture.find((i:any)=>i.id==='sofa')!.position={x:2000,y:2000};const before=JSON.stringify(p);
  await expect(compileRuntimeArtifacts(p,async()=>null)).rejects.toBeInstanceOf(RuntimeProjectError);
  expect(JSON.stringify(p)).toBe(before);
 });
 it('does not offer geometry recovery for invalid native data',async()=>{
  try {await compileRuntimeArtifacts({floors:[]},async()=>null);expect.fail('Invalid data must fail');}
  catch(error){expect(error).not.toBeInstanceOf(RuntimeProjectError);expect(String(error)).toContain('Invalid project');}
 });
 it('retains asset-reader failures as operational failures',async()=>{
  const error=new Error('Synthetic asset read failure');
  await expect(compileRuntimeArtifacts(await runtimeProductProject(),async()=>{throw error;})).rejects.toBe(error);
 });
});
