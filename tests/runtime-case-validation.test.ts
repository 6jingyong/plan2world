import { describe,expect,it } from 'vitest';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { validationOverall,validationScopes,validateRuntimeCase } from '../tooling/runtime-case-validation.mjs';

describe('layered real-case acceptance',()=>{
  it('never converts skipped source/rendering/route checks into an overall success',()=>{
    expect(validationOverall({})).toBe('review_required');
    const scopes=Object.fromEntries(validationScopes.map(key=>[key,{status:'pass'}]));
    expect(validationOverall(scopes)).toBe('pass');
    scopes.rendering.status='not_run';expect(validationOverall(scopes)).toBe('review_required');
    scopes.doorMotion.status='fail';expect(validationOverall(scopes)).toBe('fail');
    scopes.doorMotion.status='review_required';expect(validationOverall(scopes)).toBe('review_required');
    expect(validationOverall({structure:{status:'pass'},doorMotion:{status:'pass'}})).toBe('review_required');
  });
  it('retains the rejected candidate, fails at structure and leaves engine/display/persistence unclaimed',async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),'p2w-case-acceptance-'));
    try{
      const input=path.join(directory,'invalid.project.json'),output=path.join(directory,'run'),source=JSON.stringify({id:'invalid-case',floors:[]});
      await writeFile(input,source);
      const report=await validateRuntimeCase(input,output,{godot:'must-not-start'});
      expect(report.overall).toBe('fail');expect(report.scopes.input.status).toBe('pass');expect(report.scopes.structure.status).toBe('fail');
      for(const scope of ['doorMotion','sourceReview','rendering','persistence','walkthrough'])expect(report.scopes[scope].status).toBe('not_run');
      expect(await readFile(path.join(output,'source.project.json'),'utf8')).toBe(source);expect(await readFile(input,'utf8')).toBe(source);
      expect(JSON.parse(await readFile(path.join(output,'validation-report.json'),'utf8'))).toEqual(report);
      await expect(validateRuntimeCase(input,output)).rejects.toThrow(/EEXIST/);
    }finally{await rm(directory,{recursive:true,force:true});}
  },30_000);
});
