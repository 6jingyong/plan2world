#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
import {readSourceRaster} from './source-raster.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
 if(!['--architecture','--furnishing','--source','--output','--preparation'].includes(args[i])||!args[i+1]||options[args[i]])throw Error('Usage: --architecture architecture.json --furnishing furniture.json --source working.jpg --output NEW_DIRECTORY [--preparation preparation-evidence.json]');
 options[args[i]]=args[i+1];
}
if(['--architecture','--furnishing','--source','--output'].some(k=>!options[k]))throw Error('Architecture, furnishing, confirmed source and a new output directory are required.');
const out=resolve(options['--output']);await mkdir(dirname(out),{recursive:true});await mkdir(out);
const hash=b=>createHash('sha256').update(b).digest('hex'),save=(name,value)=>writeFile(resolve(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o444});
const [a,f,bytes]=await Promise.all(['--architecture','--furnishing','--source'].map(k=>readFile(resolve(options[k]))));
await writeFile(resolve(out,'source-architecture-original.json'),a,{flag:'wx',mode:0o444});await writeFile(resolve(out,'source-furnishing-original.json'),f,{flag:'wx',mode:0o444});
const mime=bytes[0]===0xff?'image/jpeg':bytes[0]===0x89?'image/png':'image/webp';
await writeFile(resolve(out,mime==='image/jpeg'?'source.jpg':mime==='image/png'?'source.png':'source.webp'),bytes,{flag:'wx',mode:0o444});
const server=await createServer({root,configFile:false,logLevel:'error',resolve:{alias:{'$lib':resolve(root,'src/lib')}},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null,ws:false},appType:'custom'});
try{
 const raster=await readSourceRaster(bytes),preparation=options['--preparation']?JSON.parse(await readFile(resolve(options['--preparation']),'utf8')):undefined;
 if(preparation){
  const {validateImagePreparationEvidence}=await server.ssrLoadModule('/src/lib/plan2world/imagePreparation.ts');validateImagePreparationEvidence(preparation);
  if(preparation.manifest.working.sha256!==hash(bytes)||preparation.manifest.width!==raster.width||preparation.manifest.height!==raster.height)throw Error('Prepared image identity disagrees with the correction source.');
 }
 const {reconstructFloorPlanForCorrection}=await server.ssrLoadModule('/src/lib/plan2world/correction.ts');
 let reads=0;const inputs=[JSON.parse(a.toString()),JSON.parse(f.toString())];
 const result=await reconstructFloorPlanForCorrection(async()=>{if(reads>=2)throw Error('Unexpected extra source observation.');return inputs[reads++];},
  {image:{dataUrl:`data:${mime};base64,${bytes.toString('base64')}`,width:raster.width,height:raster.height,preparation},sha256:hash(bytes),raster});
 await save('project.json',result.project);await save('source-recovery-audit.json',result.audit);
 if(result.stage)await save('architecture-stage.json',result.stage);
 if(result.draft)await save('draft.json',result.draft);
 const code=Object.fromEntries(await Promise.all(['src/lib/plan2world/correction.ts','src/lib/plan2world/architecture.ts','src/lib/plan2world/sourceRecovery.ts','tooling/correct-plan2world-source.mjs'].map(async name=>[name,hash(await readFile(resolve(root,name)))])));
 await save('provenance.json',{operation:'annotated-native-correction',status:result.issueCount?'annotated-correction':'assembled',sourceSha256:hash(bytes),architectureSha256:hash(a),furnishingSha256:hash(f),frozenObservationReads:reads,externalModelCalls:0,modelRepairCalls:0,issueCount:result.issueCount,
  codeCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),code,limitation:'Authoring handoff only. Source notes are not source acceptance or runtime route validation. Incomplete Projects remain editable; walkthrough uses the strict compiler.'});
 console.log(JSON.stringify({output:out,issueCount:result.issueCount,externalModelCalls:0}));
}finally{await server.close();}
