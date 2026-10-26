import { encodeFloorPlanImage,type EncodedFloorPlanImage,MAX_FLOOR_PLAN_IMAGE_BYTES } from './vision';
import { imageSha256,jpegExifOrientation,prepareImageRaster,type ImagePreparationRecipe,type ImagePreparationEvidence } from './imagePreparation';
import type { SourceFloorPlanImage } from './sourceBackground';

export async function loadFloorPlanInput(file: File) {
  const encoded=await encodeFloorPlanImage(file),bytes=new Uint8Array(await file.arrayBuffer());
  const image=new Image();image.src=encoded.dataUrl;await image.decode();
  const width=image.naturalWidth,height=image.naturalHeight;
  if(width*height>24_000_000) throw new Error('Source raster exceeds 24 million pixels.');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context) throw new Error('Image preparation cannot read the selected image.');
  context.drawImage(image,0,0);
  return {encoded,bytes,name:file.name,raster:{width,height,data:context.getImageData(0,0,width,height).data}};
}
export type LoadedFloorPlanInput = Awaited<ReturnType<typeof loadFloorPlanInput>>;
export interface PreparedBrowserFloorPlan { image: EncodedFloorPlanImage; source: SourceFloorPlanImage }

export async function prepareBrowserFloorPlan(input: LoadedFloorPlanInput,recipe: ImagePreparationRecipe): Promise<PreparedBrowserFloorPlan> {
  const {transform,raster}=prepareImageRaster(input.raster,recipe),orientation=jpegExifOrientation(input.bytes);
  const changed=recipe.mode!=='identity' || recipe.quarterTurns!==0 || orientation!==1;
  let image=input.encoded,bytes=input.bytes;
  if(changed) {
    const canvas=document.createElement('canvas');canvas.width=raster.width;canvas.height=raster.height;
    const context=canvas.getContext('2d');if(!context)throw new Error('Image preparation cannot create its preview.');
    context.putImageData(new ImageData(Uint8ClampedArray.from(raster.data),raster.width,raster.height),0,0);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image preparation could not encode its preview.')),'image/png'));
    if(blob.size>MAX_FLOOR_PLAN_IMAGE_BYTES) throw new Error('Image preparation exceeds 12 MB. Choose a smaller output width.');
    bytes=new Uint8Array(await blob.arrayBuffer());
    image=await encodeFloorPlanImage(new File([blob],'prepared.png',{type:'image/png'}));
  }
  const preparation:ImagePreparationEvidence={manifest:{schemaVersion:'plan2world-image-preparation-v1',coordinates:'exif-upright-source-pixel-edges',
    source:{name:input.name,sha256:await imageSha256(input.bytes),rgbaSha256:await imageSha256(input.raster.data),width:input.raster.width,height:input.raster.height,exifOrientation:orientation},
    ...transform,working:{sha256:await imageSha256(bytes),rgbaSha256:await imageSha256(raster.data),mimeType:image.mimeType},sampling:recipe.mode==='identity'?'unchanged':'bilinear'},
    ...(changed?{originalDataUrl:input.encoded.dataUrl}:{})};
  return {image,source:{dataUrl:image.dataUrl,width:raster.width,height:raster.height,name:input.name,preparation}};
}
