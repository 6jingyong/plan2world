#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {readSourceRaster} from './source-raster.mjs';
import {recoveryReviewPage} from './plan2world-recovery-review.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--input','--source','--output','--furnishing','--decision','--review-actor'].includes(args[i])||!args[i+1]||options[args[i]])throw new Error('Usage: --input observations.json --source original.jpg --output NEW_DIRECTORY [--furnishing furniture.json] [--decision source-review-decision.json --review-actor human|model]');options[args[i]]=args[i+1];}
if(!options['--input']||!options['--source']||!options['--output'])throw new Error('Input, original raster and new output directory are required.');
if(options['--review-actor']&&(!options['--decision']||!['human','model'].includes(options['--review-actor'])))throw new Error('Review actor requires a decision file and human/model.');
const output=resolve(options['--output']);await mkdir(dirname(output),{recursive:true});await mkdir(output);
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(name,value)=>writeFile(resolve(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o444});
const inputBytes=await readFile(resolve(options['--input'])),sourceBytes=await readFile(resolve(options['--source']));
await writeFile(resolve(output,'observation-original.json'),inputBytes,{flag:'wx',mode:0o444});
const mime=sourceBytes[0]===0xff?'image/jpeg':sourceBytes[0]===0x89?'image/png':'image/webp';
const sourceName=mime==='image/jpeg'?'source.jpg':mime==='image/png'?'source.png':'source.webp';
await writeFile(resolve(output,sourceName),sourceBytes,{flag:'wx',mode:0o444});
const server=await createServer({root,configFile:false,logLevel:'error',resolve:{alias:{'$lib':resolve(root,'src/lib')}},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null,ws:false},appType:'custom'});
let session;const stages=[];
try{
 const raster=await readSourceRaster(sourceBytes),context={sourceWidthPx:raster.width,sourceHeightPx:raster.height,sourceImageSha256:hash(sourceBytes)};
 const {SourceRecoverySession,SourceRecoveryRequired}=await server.ssrLoadModule('/src/lib/plan2world/sourceRecovery.ts');
 const decisionBytes=options['--decision']?await readFile(resolve(options['--decision'])):undefined;
 if(decisionBytes)await writeFile(resolve(output,'review-decision-original.json'),decisionBytes,{flag:'wx',mode:0o444});
 const decision=decisionBytes?JSON.parse(decisionBytes.toString()):undefined;
 session=await SourceRecoverySession.create(JSON.parse(inputBytes.toString()),context,{...(decisionBytes?{review:async()=>decision,reviewActor:options['--review-actor']??'human'}:{}),onStage:(stage,phase)=>stages.push({stage,phase})});
 const provenance={operation:'explicit-source-recovery',inputSha256:hash(inputBytes),source:{sha256:hash(sourceBytes),width:raster.width,height:raster.height},...(decisionBytes?{reviewDecisionSha256:hash(decisionBytes),reviewActor:options['--review-actor']??'human'}:{}),
  codeCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  code:Object.fromEntries(await Promise.all(['src/lib/plan2world/sourceRecovery.ts','src/lib/plan2world/architecture.ts','src/lib/plan2world/sourcePointReferences.ts','tooling/recover-plan2world-source.mjs'].map(async p=>[p,hash(await readFile(resolve(root,p)))])))};
 await save('provenance.json',provenance);
 try{
  const architecture=await session.preflight();await save('source-architecture-preflight.json',architecture);
  if(options['--furnishing']){
   const furnishingBytes=await readFile(resolve(options['--furnishing']));await writeFile(resolve(output,'source-furnishing.json'),furnishingBytes,{flag:'wx',mode:0o444});
   const furnishing=JSON.parse(furnishingBytes.toString()),stage=await session.prepare(furnishing,raster);
   const {assembleFrozenArchitecture}=await server.ssrLoadModule('/src/lib/plan2world/architecture.ts');
   const result=assembleFrozenArchitecture(stage,furnishing);
   await save('architecture-stage.json',stage);await save('bare-house.json',stage.bareHouse);await save('draft.json',result.draft);
   const {draftToProjectWithSourceBackground}=await server.ssrLoadModule('/src/lib/plan2world/sourceBackground.ts'),{summarizeArchitectureObservation}=await server.ssrLoadModule('/src/lib/plan2world/review.ts');
   const project=draftToProjectWithSourceBackground(result.draft,{dataUrl:`data:${mime};base64,${sourceBytes.toString('base64')}`,width:raster.width,height:raster.height});
   project.reconstruction.observationReview=summarizeArchitectureObservation(stage);await save('project.json',project);
  }
  await save('source-architecture.json',session.architecture);
 }catch(e){
  await save('failure.json',{name:e.name,message:e.message});
  if(e instanceof SourceRecoveryRequired&&e.request){await save('review-request.json',e.request);await writeFile(resolve(output,'review.html'),recoveryReviewPage(e.request,`data:${mime};base64,${sourceBytes.toString('base64')}`),{flag:'wx',mode:0o444});}
  process.exitCode=2;
 }
 for(let i=0;i<stages.length;i++)await save(`stage-${i}-${stages[i].phase}.json`,stages[i].stage);
 await save('recovery-audit.json',session.audit);
 console.log(JSON.stringify({output,status:session.audit.status,programChanges:session.audit.changes.length,reviewCount:session.audit.reviewCount,automaticModelReviews:session.audit.automaticReviewCount}));
}finally{await server.close();}
