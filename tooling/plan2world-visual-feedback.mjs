#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import {createServer} from 'vite';
import {readSourceRaster} from './source-raster.mjs';
import {encodeRgbaPng} from './png-raster.mjs';

export async function runVisualFeedback(options){
 const root=fileURLToPath(new URL('../',import.meta.url));
 for(const key of ['architecture','furnishing','source','output'])if(!options[key])throw Error(`Missing --${key}`);
 if(options.mode&&!['ordinary','guided'].includes(options.mode))throw Error('Mode must be ordinary or guided.');
 if(options.scope&&!['architecture','architecture-and-furnishing','architecture-and-door-motion','unified-structure'].includes(options.scope))throw Error('Scope must be architecture, architecture-and-furnishing, architecture-and-door-motion or unified-structure.');
 if(options.decision&&!options.request)throw Error('Applying a review requires its frozen --request.');
 const output=path.resolve(options.output);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
 const save=(name,value)=>writeFile(path.join(output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o444});
 const hash=b=>createHash('sha256').update(b).digest('hex');
 const imageBytes=await readFile(path.resolve(options.source)),architectureBytes=await readFile(path.resolve(options.architecture)),furnishingBytes=await readFile(path.resolve(options.furnishing));
 const observations={architecture:JSON.parse(architectureBytes),furnishing:JSON.parse(furnishingBytes)};
 const mime=imageBytes[0]===255?'image/jpeg':'image/png',imageFile=mime==='image/jpeg'?'original.jpg':'original.png';
 await writeFile(path.join(output,imageFile),imageBytes,{flag:'wx',mode:0o444});
 await writeFile(path.join(output,'architecture-original.json'),architectureBytes,{flag:'wx',mode:0o444});
 await writeFile(path.join(output,'furnishing-original.json'),furnishingBytes,{flag:'wx',mode:0o444});
 const server=await createServer({root,configFile:false,logLevel:'error',resolve:{alias:{$lib:path.join(root,'src/lib')}},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null,ws:false},appType:'custom'});
 try{
  const {reprojectSourceObservations}=await server.ssrLoadModule('/src/lib/plan2world/correction.ts');
  const {applyVisualFeedback,buildVisualFeedbackInstructions,cropFeedbackRaster}=await server.ssrLoadModule('/src/lib/plan2world/visualFeedback.ts');
  const raster=await readSourceRaster(imageBytes),source={image:{width:raster.width,height:raster.height,dataUrl:`data:${mime};base64,${imageBytes.toString('base64')}`},sha256:hash(imageBytes),raster};
  const baseline=await reprojectSourceObservations(observations,source);
  await save('baseline.project.json',baseline.project);await save('baseline.audit.json',baseline.audit);if(baseline.stage)await save('baseline.stage.json',baseline.stage);
  let expected,answer;
  if(options.decision){const bytes=await readFile(path.resolve(options.decision));answer=JSON.parse(bytes);expected=JSON.parse(await readFile(path.resolve(options.request),'utf8'));await writeFile(path.join(output,'answer-original.json'),bytes,{flag:'wx',mode:0o444});}
  const candidates=[],audits=[];
  let result;
  try{result=await applyVisualFeedback(baseline,observations,source,{}, {mode:options.mode??'guided',scope:options.scope??'architecture',actor:options.actor??(answer?'frozen-review-answer':'none'),
   ...(answer?{review:async request=>{if(JSON.stringify(request)!==JSON.stringify(expected))throw Error('Frozen request does not match current source, interpretation, mode or instructions.');return answer;}}:{}),
   onAudit:a=>audits.push(a),onCandidate:(index,architecture,result,furnishing)=>candidates.push({index,architecture,result,furnishing})});}
  catch(error){
   if(error.audit){await save('feedback-audit.json',error.audit);await save('feedback-audit-snapshots.json',audits);}
   await save('failure.json',{name:error.name,message:error.message,baselinePreserved:true,automaticRetries:0});throw error;
  }
  const feedback=result.visualFeedback,request=feedback.request;
  let motionContext;
  if(options.scope==='architecture-and-door-motion'||options.scope==='unified-structure'){
   const {inspectFeedbackMotionContext}=await server.ssrLoadModule('/src/lib/plan2world/visualFeedbackMotion.ts');
   const bind=value=>({sourceSha256:source.sha256,projectContentSha256:value.audit.correction.projectContentSha256,review:inspectFeedbackMotionContext(value)});
   await save('baseline.motion-context.json',bind(baseline));motionContext=bind(result);await save('motion-context.json',motionContext);
  }
  if(options.scope==='unified-structure'){
   await save('baseline.structural-review.json',{sourceSha256:source.sha256,projectContentSha256:baseline.audit.correction.projectContentSha256,review:feedback.structuralReview});
   // Keep selected retraction mappings in the audit; candidate files carry the
   // compact furnishing projection before source indices are restored.
   const selected=candidates.find(c=>c.index===feedback.selected);
   const review=feedback.status==='revised'&&selected
    ?feedback.candidates.find(c=>c.index===selected.index)?.structuralReview
    :feedback.structuralReview;
   await save('structural-review.json',{sourceSha256:source.sha256,projectContentSha256:result.audit.correction.projectContentSha256,review});
  }
  await save('feedback-audit.json',feedback);await save('feedback-audit-snapshots.json',audits);await save('project.json',result.project);await save('correction-audit.json',result.audit);
  if(result.draft)await save('draft.json',result.draft);if(result.stage)await save('architecture-stage.json',result.stage);
  for(const c of candidates){const folder=`candidate-${c.index}`;await mkdir(path.join(output,folder));await save(folder+'/architecture.json',c.architecture);await save(folder+'/furnishing.json',c.furnishing);await save(folder+'/project.json',c.result.project);await save(folder+'/audit.json',c.result.audit);if(c.result.stage)await save(folder+'/stage.json',c.result.stage);}
  const images=[];
  if(request){await save('request.json',request);await writeFile(path.join(output,'prompt.txt'),buildVisualFeedbackInstructions(request),{flag:'wx',mode:0o444});
   for(const region of request.regions)for(const role of ['context','focus']){
    const crop=cropFeedbackRaster(raster,region[role+'Box']),bytes=encodeRgbaPng(crop),name=`${region.id}-${role}.png`;await writeFile(path.join(output,name),bytes,{flag:'wx',mode:0o444});
    images.push({region:region.id,role,file:name,sourceBox:crop.sourceBox,width:crop.width,height:crop.height,sha256:hash(bytes),rgbaSha256:hash(crop.data)});
   }
  }
  const provenance={source:{file:imageFile,sha256:source.sha256,width:raster.width,height:raster.height},observations:{architectureSha256:hash(architectureBytes),furnishingSha256:hash(furnishingBytes)},images,
   mode:options.mode??'guided',scope:options.scope??'architecture',reviewAnswersReplayed:answer?1:0,actualProviderRequests:0,providerUsage:null,
   attribution:'undetermined; compare outcomes and independent visual evidence, not warning counts alone',
   instructionSha256:request?.instructionSha256,promptBytes:request?Buffer.byteLength(buildVisualFeedbackInstructions(request)):0};
  await save('provenance.json',provenance);
  const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const motionSection=motionContext?`<section><h2>Current sliding motion model</h2><p>Program assumptions, not source evidence. Default full-span means one panel moves its full compiled width; explicit panels come from native authoring. This report does not choose a configuration or change the image interpretation.</p><pre>${esc(JSON.stringify(motionContext,null,2))}</pre></section>`:'';
  await writeFile(path.join(output,'review.html'),`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"><title>Plan2World local visual review</title><style>body{font:16px system-ui;max-width:1100px;margin:auto;padding:24px;background:#f4f3ed}img{max-width:100%;background:white}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{margin:24px 0;padding:16px;background:white}</style><h1>Local visual reinspection</h1><p>${esc(provenance.mode)} · ${esc(feedback.status)} · Original observations and unknown alternatives remain available.</p><section><h2>Overview</h2><img src="${imageFile}"></section>${motionSection}${images.map(i=>`<section><h2>${esc(i.region+' '+i.role)}</h2><p>Original pixels: ${esc(i.sourceBox.join(', '))}</p><img src="${esc(i.file)}"></section>`).join('')}<section><h2>Request and bounded source records</h2><pre>${esc(JSON.stringify(request??{reason:feedback.reason},null,2))}</pre></section><section><h2>Result</h2><pre>${esc(JSON.stringify(feedback,null,2))}</pre></section>`,{flag:'wx',mode:0o444});
  return{output,status:feedback.status,partialImport:result.partialImport,issues:result.issueCount,candidates:feedback.candidates,actualProviderRequests:0};
 }finally{await server.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');if(!['architecture','furnishing','source','output','mode','scope','request','decision','actor'].includes(key)||!args[i+1]||options[key])throw Error('Usage: --architecture file --furnishing file --source image --output NEW_DIRECTORY [--mode ordinary|guided] [--scope architecture|architecture-and-furnishing|architecture-and-door-motion|unified-structure] [--decision answer --request frozen-request --actor label]');options[key]=args[i+1];}
 try{console.log(JSON.stringify(await runVisualFeedback(options),null,2));}catch(e){console.error(e.message);process.exitCode=1;}
}
