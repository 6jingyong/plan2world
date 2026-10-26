#!/usr/bin/env node
import { validateRuntimeCase } from './runtime-case-validation.mjs';
const args=process.argv.slice(2);
if(![2,4].includes(args.length)||args.length===4&&args[2]!=='--arranged')throw new Error('Usage: npm run runtime:validate -- project.json NEW_DIRECTORY [--arranged arranged.project.json]');
const result=await validateRuntimeCase(args[0],args[1],{arranged:args[3]});
console.log(`Case validation: ${result.overall}. See ${args[1]}/validation-report.json; untested scopes remain not_run.`);
process.exitCode=result.overall==='fail'?1:result.overall==='pass'?0:2;
