import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { MAX_FLOOR_PLAN_IMAGE_BYTES } from '../src/lib/plan2world/vision';
import { PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION, buildArchitectureInstructions } from '../src/lib/plan2world/reconstructionInstructions';
import { reconstructFloorPlanForCorrection } from '../src/lib/plan2world/correction';
import { readPreparedImageEvidence } from './prepare-floorplan-image.mjs';
import { observeOpenRouter } from './desktop-openrouter.mjs';
import { observationUsage, summarizeObservationUsage } from './observation-usage.mjs';
import { safeDesktopError } from './desktop-ai-errors.mjs';

const version = 'plan2world-desktop-checkpoint-v1';
const stages = ['architecture', 'furnishing'];
/** @param {any} value */
const byteCount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
/** @param {string|Uint8Array} value */
const digest = value => createHash('sha256').update(value).digest('hex');
/** @param {string} file */
async function optional(file) { try { return await readFile(file); } catch (error) { if (/** @type {any} */ (error).code === 'ENOENT') return null; throw error; } }
/** Atomic publication of files owned by this new attempt, never a source file.
 * @param {string} file @param {string|Uint8Array} value */
export async function writeSessionFile(file, value) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, value, { flag: 'wx' });
  await rename(temporary, file);
}
/** @param {string} file @param {any} value */
const writeJSON = (file, value) => writeSessionFile(file, JSON.stringify(value, null, 2) + '\n');

/** @param {any} request */
async function readInput(request) {
  const bytes = await readFile(request.imagePath), pixels = await readFile(request.rasterPath);
  const mime = /** @type {Record<string,string>} */ ({ '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp' })[path.extname(request.imagePath).toLowerCase()];
  const { width, height } = request;
  if (!mime || !bytes.length || bytes.length > MAX_FLOOR_PLAN_IMAGE_BYTES) throw new Error('Choose a PNG, JPEG or WebP image up to 12 MB.');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 24_000_000 || pixels.length !== width * height * 4) throw new Error('Original raster pixels do not match image dimensions.');
  if (typeof request.model !== 'string' || !request.model.trim() || typeof request.scaleHint !== 'string') throw new Error('Choose a model and a valid scale hint.');
  const preparation = request.preparationManifestPath ? await readPreparedImageEvidence(request, bytes, pixels) : undefined;
  const manifestBytes = request.preparationManifestPath ? await readFile(request.preparationManifestPath) : null;
  const originalBytes = preparation ? await readFile(request.originalImagePath) : bytes;
  const identity = { transport:'openrouter',modelId:request.model.trim(),instructionsVersion:PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION,
    width,height,scaleHint:request.scaleHint,workingImageSha256:digest(bytes),workingPixelsSha256:digest(pixels),sourceImageSha256:digest(originalBytes),
    preparationSha256:manifestBytes ? digest(manifestBytes) : null };
  const source = { image: { dataUrl:`data:${mime};base64,${bytes.toString('base64')}`,width,height,name:preparation?.manifest.source.name ?? request.sourceName ?? path.basename(request.imagePath),preparation },
    sha256:digest(bytes),raster:{width,height,data:pixels} };
  return { request,bytes,pixels,originalBytes,manifestBytes,identity,source };
}

/** @param {string} checkpointPath */
async function loadCheckpoint(checkpointPath) {
  const checkpoint = JSON.parse(await readFile(checkpointPath, 'utf8')), directory = path.dirname(path.resolve(checkpointPath));
  if (checkpoint.schemaVersion !== version || checkpoint.identity?.instructionsVersion !== PLAN2WORLD_RECONSTRUCTION_INSTRUCTIONS_VERSION) throw new Error('Saved task version changed. Start a new task; no request was sent.');
  const input = checkpoint.input;
  if (!input || typeof input !== 'object') throw new Error('Saved task input is incomplete. No request was sent.');
  /** @type {any} */ const request = { model:checkpoint.identity.modelId,scaleHint:checkpoint.identity.scaleHint,width:checkpoint.identity.width,height:checkpoint.identity.height,sourceName:checkpoint.sourceName };
  for (const key of ['imagePath','rasterPath','preparationManifestPath','originalImagePath']) {
    if (input[key] == null) continue;
    if (typeof input[key] !== 'string' || !/^input\/[a-z0-9.-]+$/.test(input[key])) throw new Error('Saved task input path is invalid. No request was sent.');
    request[key] = path.join(directory, input[key]);
  }
  const context = await readInput(request);
  if (JSON.stringify(context.identity) !== JSON.stringify(checkpoint.identity)) throw new Error('Saved task inputs changed. Start a new task; no request was sent.');
  /** @type {Record<string,any>} */ const cached = {};
  /** @type {any[]} */ const usage = [];
  for (const stage of stages) {
    const frozen = await optional(path.join(directory, `${stage}-freeze.json`));
    if (frozen) {
      const receipt = JSON.parse(frozen.toString('utf8')), observation = await readFile(path.join(directory, `source-${stage}.json`));
      if (JSON.stringify(receipt.identity) !== JSON.stringify(context.identity) || receipt.stage !== stage || receipt.observationSha256 !== digest(observation)) throw new Error('Saved task observation changed or is incomplete. No request was sent.');
      cached[stage] = { text:observation.toString('utf8'),value:JSON.parse(observation.toString('utf8')),receipt };
    }
    const started = await optional(path.join(directory, `${stage}-started.json`));
    const response = await optional(path.join(directory, `${stage}-response.json`));
    const failed = await optional(path.join(directory, `${stage}-failed.json`));
    const reused = await optional(path.join(directory, `${stage}-reused.json`));
    if (started) {
      const entry = JSON.parse(started.toString('utf8'));
      const returned=response?JSON.parse(response.toString('utf8')):null;
      usage.push({ stage,requestId:entry.requestId,status:failed ? 'failed' : cached[stage] ? 'complete' : response ? 'responded' : 'started',
        promptBytes:byteCount(entry.promptBytes),responseBytes:byteCount(returned?.responseBytes),imageBytes:byteCount(entry.imageBytes),
        usage:returned ? observationUsageFromReceipt(returned.usage) : observationUsage(null) });
    } else if (reused) {
      const previous=JSON.parse(reused.toString('utf8'));
      usage.push({stage,status:'reused',promptBytes:byteCount(previous.promptBytes),responseBytes:byteCount(previous.responseBytes),imageBytes:byteCount(previous.imageBytes),usage:observationUsageFromReceipt(previous.usage)});
    }
  }
  if (cached.furnishing && !cached.architecture) throw new Error('Saved task furniture has no frozen architecture. No request was sent.');
  return { context,cached,usage,directory,checkpoint };
}
/** Validate stored numeric metadata before it reaches native UI.
 * @param {any} value */
function observationUsageFromReceipt(value) {
  return observationUsage({prompt_tokens:value?.inputTokens,completion_tokens:value?.outputTokens,total_tokens:value?.totalTokens,
    prompt_tokens_details:{cached_tokens:value?.cachedTokens},completion_tokens_details:{reasoning_tokens:value?.reasoningTokens},cost:value?.cost});
}

class MissingObservation extends Error {}
/** Inspection replays the SAME program only until the first missing observation.
 * No provider, files or canonical Project are changed.
 * @param {Awaited<ReturnType<typeof loadCheckpoint>>} loaded */
async function verifyPrompts(loaded) {
  let pass = 0;
  try {
    await reconstructFloorPlanForCorrection(async prompt => {
      const stage = stages[pass++], saved = loaded.cached[stage];
      if (!saved) throw new MissingObservation();
      if (saved.receipt.promptSha256 !== digest(prompt)) throw new Error('Saved task prompt changed. Start a new task; no request was sent.');
      return saved.value;
    }, loaded.context.source, {scaleHint:loaded.context.identity.scaleHint});
  } catch (error) { if (!(error instanceof MissingObservation)) throw error; }
  if (loaded.cached.architecture?.receipt.promptSha256 !== undefined && loaded.cached.architecture.receipt.promptSha256 !== digest(buildArchitectureInstructions({scaleHint:loaded.context.identity.scaleHint}))) throw new Error('Saved task prompt changed. No request was sent.');
}

/** @param {string} checkpointPath */
export async function inspectDesktopReconstruction(checkpointPath) {
  const loaded = await loadCheckpoint(checkpointPath); await verifyPrompts(loaded);
  return { checkpointPath:path.resolve(checkpointPath),remainingRequests:stages.filter(s => !loaded.cached[s]).length,
    input:loaded.context.request,usage:summarizeObservationUsage(loaded.usage) };
}

/** New attempt, including on resume. Originals and previous attempts are frozen.
 * @param {any} request @param {(event:any)=>void} emit @param {import('./desktop-openrouter.mjs').ProviderFetch} fetcher */
export async function runDesktopReconstruction(request, emit, fetcher) {
  /** @type {Awaited<ReturnType<typeof loadCheckpoint>>|undefined} */
  let loaded;
  if (request.op === 'resume-reconstruction') {
    loaded = await loadCheckpoint(request.checkpointPath); await verifyPrompts(loaded);
    if ((request.model !== undefined && request.model.trim() !== loaded.context.identity.modelId) || (request.scaleHint !== undefined && request.scaleHint !== loaded.context.identity.scaleHint)) throw new Error('Saved task model or scale hint changed. Start a new task; no request was sent.');
    if (request.imagePath) {
      const selected = await readInput({...request,model:request.model ?? loaded.context.identity.modelId,scaleHint:request.scaleHint ?? loaded.context.identity.scaleHint});
      if (JSON.stringify(selected.identity) !== JSON.stringify(loaded.context.identity)) throw new Error('Saved task image changed. Start a new task; no request was sent.');
    }
  }
  const context = loaded?.context ?? await readInput({...request,scaleHint:request.scaleHint ?? ''});
  const remaining = stages.filter(s => !loaded?.cached[s]);
  if (remaining.length && (!request.apiKey || !request.model?.trim())) throw new Error('Connect OpenRouter and select the saved model before continuing.');
  const output = path.resolve(request.outputDirectory); await mkdir(output); await mkdir(path.join(output,'input'));
  /** @type {any} */ const input = {imagePath:'input/working'+path.extname(context.request.imagePath).toLowerCase(),rasterPath:'input/working.rgba'};
  await writeSessionFile(path.join(output,input.imagePath),context.bytes); await writeSessionFile(path.join(output,input.rasterPath),context.pixels);
  if (context.manifestBytes) {
    input.preparationManifestPath='input/preparation.json';input.originalImagePath='input/original'+path.extname(context.request.originalImagePath).toLowerCase();
    await writeSessionFile(path.join(output,input.preparationManifestPath),context.manifestBytes);await writeSessionFile(path.join(output,input.originalImagePath),context.originalBytes);
    await writeSessionFile(path.join(output,'input-preparation.json'),context.manifestBytes);
  }
  const checkpointPath=path.join(output,'checkpoint.json');
  // Publish the new checkpoint only after all inherited observations are durable.
  // A cancellation while copying cannot advertise a task that lost its cache.
  for(const stage of stages){
    const saved=loaded?.cached[stage];if(!saved)continue;
    await writeSessionFile(path.join(output,`source-${stage}.json`),saved.text);
    await writeJSON(path.join(output,`${stage}-freeze.json`),saved.receipt);
    const prior=loaded?.usage.find(e=>e.stage===stage);
    await writeJSON(path.join(output,`${stage}-reused.json`),{...prior,stage,status:'reused',usage:prior?.usage??observationUsage(null)});
  }
  await writeJSON(checkpointPath,{schemaVersion:version,identity:context.identity,input,sourceName:context.source.image.name,
    ...(loaded ? {previousCheckpoint:path.resolve(request.checkpointPath)} : {})});
  emit({checkpoint:checkpointPath});
  /** @type {any[]} */ const entries=[];
  const publishUsage=()=>emit({usage:summarizeObservationUsage([...entries])});
  let pass=0;
  try {
    const reconstruction=await reconstructFloorPlanForCorrection(async prompt=>{
      const stage=stages[pass++],saved=loaded?.cached[stage];
      if(saved) {
        if(saved.receipt.promptSha256!==digest(prompt))throw new Error('Saved task prompt changed. No request was sent.');
        const prior=loaded?.usage.find(e=>e.stage===stage);
        const reuse={...prior,stage,status:'reused',usage:prior?.usage ?? observationUsage(null)};
        entries.push(reuse);publishUsage();
        return saved.value;
      }
      const entry={stage,requestId:randomUUID(),status:'started',promptBytes:Buffer.byteLength(prompt),responseBytes:/** @type {number|null} */(null),imageBytes:context.bytes.byteLength,usage:observationUsage(null)};
      entries.push(entry);await writeJSON(path.join(output,`${stage}-started.json`),entry);publishUsage();
      emit({phase:stage==='architecture'?'Observing architecture (1/2)…':'Observing furniture (2/2)…'});
      try {
        const observed=await observeOpenRouter(request,context.source.image,prompt,fetcher,async response=>{
          entry.usage=response.usage;entry.status='responded';
          entry.responseBytes=response.content===null?null:Buffer.byteLength(response.content);
          if(response.content!==null)await writeSessionFile(path.join(output,`${stage}-response.txt`),response.content);
          await writeJSON(path.join(output,`${stage}-response.json`),{...entry,finishReason:response.finishReason});publishUsage();
        });
        const text=JSON.stringify(observed.value,null,2)+'\n';
        await writeSessionFile(path.join(output,`source-${stage}.json`),text);
        await writeJSON(path.join(output,`${stage}-freeze.json`),{...context.identity,identity:context.identity,stage,promptSha256:digest(prompt),observationSha256:digest(text)});
        entry.status='complete';publishUsage();return observed.value;
      }catch(error){entry.status='failed';await writeJSON(path.join(output,`${stage}-failed.json`),{...entry,error:safeDesktopError(error,request.apiKey)});publishUsage();throw error;}
    },context.source,{scaleHint:context.identity.scaleHint});
    return {ok:/** @type {true} */ (true),reconstruction,context,output,checkpointPath,usage:summarizeObservationUsage(entries)};
  }catch(error){const usage=summarizeObservationUsage(entries);await writeJSON(path.join(output,'usage.json'),usage);return {ok:/** @type {false} */ (false),error:safeDesktopError(error,request.apiKey),checkpointPath,usage};}
}
