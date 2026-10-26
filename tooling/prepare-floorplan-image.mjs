import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { imagePreparationTransform,prepareImageRaster,orientImageRaster,jpegExifOrientation,validateImagePreparationEvidence } from '../src/lib/plan2world/imagePreparation';
import { encodeRgbaPng } from './png-raster.mjs';

const hash=(/** @type {Uint8Array} */ bytes)=>createHash('sha256').update(bytes).digest('hex');
/** @type {Record<string,string>} */
const mimeTypes={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};

/** Private desktop IPC supplies decoded pixels; CLI supplies its local decoder.
 * All perspective/orientation calculations live in the shared portable core.
 * @param {{imagePath:string,rasterPath:string,width:number,height:number,pixelOrientation:'raw'|'upright',recipe:import('../src/lib/plan2world/imagePreparation').ImagePreparationRecipe,outputDirectory:string,sourceName?:string}} request */
export async function prepareFloorPlanImage(request) {
  const bytes=await readFile(request.imagePath),extension=path.extname(request.imagePath).toLowerCase(),mime=mimeTypes[extension];
  if(!mime || !bytes.length || bytes.length>12*1024*1024) throw new Error('Choose a PNG, JPEG or WebP image up to 12 MB.');
  const pixels=await readFile(request.rasterPath),{width,height}=request;
  imagePreparationTransform(width,height,{mode:'identity',quarterTurns:0});
  if(pixels.length!==width*height*4 || !['raw','upright'].includes(request.pixelOrientation)) throw new Error('Image preparation source pixels or orientation are invalid.');
  const orientation=jpegExifOrientation(bytes),raw={width,height,data:pixels};
  const upright=request.pixelOrientation==='raw'?orientImageRaster(raw,orientation):raw;
  const {transform,raster}=prepareImageRaster(upright,request.recipe);
  const changed=orientation!==1 || request.recipe.mode!=='identity' || request.recipe.quarterTurns!==0;
  const workingBytes=changed?encodeRgbaPng(raster):bytes,workingMime=changed?'image/png':mime;
  if(workingBytes.length>12*1024*1024) throw new Error('Image preparation exceeds 12 MB. Choose a smaller output width before sending it to a model.');
  const manifest={schemaVersion:'plan2world-image-preparation-v1',coordinates:'exif-upright-source-pixel-edges',
    source:{name:request.sourceName??path.basename(request.imagePath),sha256:hash(bytes),rgbaSha256:hash(upright.data),width:upright.width,height:upright.height,exifOrientation:orientation},
    ...transform,working:{sha256:hash(workingBytes),rgbaSha256:hash(raster.data),mimeType:workingMime},sampling:request.recipe.mode==='identity'?'unchanged':'bilinear'};
  validateImagePreparationEvidence({manifest});
  const output=path.resolve(request.outputDirectory);await mkdir(path.dirname(output),{recursive:true});await mkdir(output);
  const originalPath=path.join(output,'original'+extension),imagePath=path.join(output,changed?'working.png':'working'+extension),rasterPath=path.join(output,'working.rgba'),manifestPath=path.join(output,'input-preparation.json');
  const sourceRasterPath=changed?path.join(output,'upright.rgba'):rasterPath;
  /** @type {[string,string|Uint8Array][]} */
  const outputs=[[originalPath,bytes],[imagePath,workingBytes],[rasterPath,raster.data],[manifestPath,JSON.stringify(manifest,null,2)+'\n']];
  for(const [file,data] of outputs) await writeFile(file,data,{flag:'wx'});
  if(changed) await writeFile(sourceRasterPath,upright.data,{flag:'wx'});
  return {imagePath,rasterPath,sourceRasterPath,originalPath,manifestPath,width:raster.width,height:raster.height,sourceWidth:upright.width,sourceHeight:upright.height,manifest};
}

/** Verify the frozen transport and pixels BEFORE a paid observation.
 * @param {{preparationManifestPath:string,originalImagePath:string,width:number,height:number}} request
 * @param {Uint8Array} bytes @param {Uint8Array} [pixels] */
export async function readPreparedImageEvidence(request,bytes,pixels) {
  const manifest=JSON.parse(await readFile(request.preparationManifestPath,'utf8'));
  validateImagePreparationEvidence({manifest});
  if(manifest.width!==request.width || manifest.height!==request.height || hash(bytes)!==manifest.working.sha256 || pixels && hash(pixels)!==manifest.working.rgbaSha256) throw new Error('Image preparation changed after confirmation. Prepare and confirm the image again.');
  const original=await readFile(request.originalImagePath);
  if(hash(original)!==manifest.source.sha256) throw new Error('Image preparation original no longer matches its recorded hash.');
  const originalMime=mimeTypes[path.extname(request.originalImagePath).toLowerCase()];
  const changed=manifest.recipe.mode!=='identity'||manifest.recipe.quarterTurns!==0||manifest.source.exifOrientation!==1;
  return {manifest,...(changed?{originalDataUrl:`data:${originalMime};base64,${original.toString('base64')}`}:{})};
}
