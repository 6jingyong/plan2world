import type { SourceRasterPixels } from './rasterWallContinuation';

export interface ImagePoint { x: number; y: number }
export type ImageQuad = [ImagePoint, ImagePoint, ImagePoint, ImagePoint];
export type ImageMatrix = [number, number, number, number, number, number, number, number, number];
export interface ImagePreparationRecipe {
  mode: 'identity' | 'perspective';
  /** Clockwise turns AFTER rectification. Corners refer to the upright source. */
  quarterTurns: 0 | 1 | 2 | 3;
  /** Normalized, ordered top-left / top-right / bottom-right / bottom-left. */
  corners?: ImageQuad;
  /** Known rectangle width / height, never inferred from the floor-plan outline. */
  aspectRatio?: number;
  outputWidth?: number;
}
export interface ImagePreparationTransform {
  recipe: ImagePreparationRecipe;
  width: number;
  height: number;
  /** Pixel-edge coordinates: [0,width] × [0,height]; pixel centres are n+0.5. */
  sourceToWorking: ImageMatrix;
  workingToSource: ImageMatrix;
}
export interface ImagePreparationManifest extends ImagePreparationTransform {
  schemaVersion: 'plan2world-image-preparation-v1';
  coordinates: 'exif-upright-source-pixel-edges';
  source: { name: string; sha256: string; rgbaSha256: string; width: number; height: number; exifOrientation: number };
  working: { sha256: string; rgbaSha256: string; mimeType: string };
  sampling: 'unchanged' | 'bilinear';
}
export interface ImagePreparationEvidence {
  manifest: ImagePreparationManifest;
  /** Kept only when pixels/orientation changed; the background owns working data. */
  originalDataUrl?: string;
}
export const IDENTITY_IMAGE_RECIPE: ImagePreparationRecipe = { mode: 'identity', quarterTurns: 0 };
export const FULL_IMAGE_QUAD: ImageQuad = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];

function dimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 2 || height < 2 || width * height > 24_000_000) {
    throw new Error('Image preparation requires dimensions of at least 2 pixels and at most 24 million pixels.');
  }
}
function inverse(m: ImageMatrix): ImageMatrix {
  const [a,b,c,d,e,f,g,h,i] = m;
  const v: ImageMatrix = [e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  const det = a*v[0]+b*v[3]+c*v[6];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error('Image preparation corners form a degenerate rectangle.');
  return v.map(n => n / det) as ImageMatrix;
}
function multiply(a: ImageMatrix, b: ImageMatrix): ImageMatrix {
  return Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i/3)*3, c = i%3;
    return a[r]*b[c]+a[r+1]*b[c+3]+a[r+2]*b[c+6];
  }) as ImageMatrix;
}
export function transformImagePoint(m: ImageMatrix, point: ImagePoint): ImagePoint {
  const w = m[6]*point.x+m[7]*point.y+m[8];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) throw new Error('Image preparation crosses a perspective horizon.');
  return { x: (m[0]*point.x+m[1]*point.y+m[2])/w, y: (m[3]*point.x+m[4]*point.y+m[5])/w };
}

/** Four-point plane rectification. No detection, topology, geometry fitting or AI. */
export function imagePreparationTransform(width: number, height: number, recipe: ImagePreparationRecipe): ImagePreparationTransform {
  dimensions(width,height);
  if (!recipe || !['identity','perspective'].includes(recipe.mode) || ![0,1,2,3].includes(recipe.quarterTurns)) throw new Error('Image preparation recipe is invalid.');
  let targetWidth = width, targetHeight = height;
  let forward: ImageMatrix = [1,0,0,0,1,0,0,0,1];
  let normalized: ImagePreparationRecipe = { mode: recipe.mode, quarterTurns: recipe.quarterTurns };
  if (recipe.mode === 'perspective') {
    const q = recipe.corners;
    if (!Array.isArray(q) || q.length !== 4 || q.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) throw new Error('Image preparation needs four corners inside the source image.');
    for (let i=0;i<4;i++) {
      const a=q[i], b=q[(i+1)%4], c=q[(i+2)%4];
      if ((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x) <= 1e-7) throw new Error('Image preparation corners must form a convex clockwise quadrilateral without crossing.');
    }
    if (!Number.isFinite(recipe.aspectRatio) || recipe.aspectRatio! < .05 || recipe.aspectRatio! > 20) throw new Error('Image preparation needs a known rectangle width/height ratio between 1:20 and 20:1.');
    targetWidth = recipe.outputWidth ?? Math.round(Math.max(Math.hypot((q[1].x-q[0].x)*width,(q[1].y-q[0].y)*height),Math.hypot((q[2].x-q[3].x)*width,(q[2].y-q[3].y)*height)));
    targetHeight = Math.round(targetWidth / recipe.aspectRatio!);
    dimensions(targetWidth,targetHeight);
    normalized = { ...normalized, corners: q.map(p => ({...p})) as ImageQuad, aspectRatio: recipe.aspectRatio!, outputWidth: targetWidth };
    // Map a unit square to the source quad, then invert. Normalized coordinates
    // keep the solve independent of source resolution and large pixel values.
    const [a,b,c,d] = q;
    const dx1=b.x-c.x, dx2=d.x-c.x, dx3=a.x-b.x+c.x-d.x;
    const dy1=b.y-c.y, dy2=d.y-c.y, dy3=a.y-b.y+c.y-d.y;
    const determinant=dx1*dy2-dx2*dy1;
    if (Math.abs(determinant)<1e-12) throw new Error('Image preparation corners are degenerate.');
    const g=(dx3*dy2-dx2*dy3)/determinant, h=(dx1*dy3-dx3*dy1)/determinant;
    const unitToSource: ImageMatrix = [b.x-a.x+g*b.x,d.x-a.x+h*d.x,a.x,b.y-a.y+g*b.y,d.y-a.y+h*d.y,a.y,g,h,1];
    const denominators = [1,1+g,1+g+h,1+h];
    if (denominators.some(n => n <= 1e-6)) throw new Error('Image preparation crosses a perspective horizon.');
    forward = multiply([targetWidth,0,0,0,targetHeight,0,0,0,1],multiply(inverse(unitToSource),[1/width,0,0,0,1/height,0,0,0,1]));
  } else if (recipe.corners !== undefined || recipe.aspectRatio !== undefined || recipe.outputWidth !== undefined) throw new Error('Image preparation identity must not crop or resize the source.');
  for (let i=0;i<recipe.quarterTurns;i++) {
    forward=multiply([0,-1,targetHeight,1,0,0,0,0,1],forward);
    [targetWidth,targetHeight]=[targetHeight,targetWidth];
  }
  return { recipe: normalized, width: targetWidth, height: targetHeight, sourceToWorking: forward, workingToSource: inverse(forward) };
}

export function prepareImageRaster(source: SourceRasterPixels, recipe: ImagePreparationRecipe) {
  if (source.data.length !== source.width*source.height*4) throw new Error('Image preparation source pixels disagree with their dimensions.');
  const transform=imagePreparationTransform(source.width,source.height,recipe), { width,height,workingToSource:m }=transform;
  const data=new Uint8Array(width*height*4);
  if (recipe.mode==='identity' && recipe.quarterTurns===0) data.set(source.data);
  else for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const point=transformImagePoint(m,{x:x+.5,y:y+.5});
    const px=Math.max(0,Math.min(source.width-1,point.x-.5)), py=Math.max(0,Math.min(source.height-1,point.y-.5));
    const x0=Math.floor(px),y0=Math.floor(py),x1=Math.min(x0+1,source.width-1),y1=Math.min(y0+1,source.height-1),fx=px-x0,fy=py-y0;
    const weights=[(1-fx)*(1-fy),fx*(1-fy),fx*fy,(1-fx)*fy];
    const offsets=[(y0*source.width+x0)*4,(y0*source.width+x1)*4,(y1*source.width+x1)*4,(y1*source.width+x0)*4];
    // Interpolate premultiplied alpha so transparent pixels do not leave dark edges.
    const alpha=offsets.reduce((sum,p,i)=>sum+source.data[p+3]*weights[i],0), to=(y*width+x)*4;
    data[to+3]=Math.round(alpha);
    for(let channel=0;channel<3;channel++) data[to+channel]=alpha===0?0:Math.round(offsets.reduce((sum,p,i)=>sum+source.data[p+channel]*source.data[p+3]*weights[i],0)/alpha);
  }
  return { transform, raster: { width,height,data } };
}

/** TIFF orientation in JPEG APP1 only. Unsupported/missing metadata means 1. */
export function jpegExifOrientation(bytes: Uint8Array): number {
  if (bytes[0]!==0xff || bytes[1]!==0xd8) return 1;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  for(let offset=2;offset+4<=bytes.length;) {
    if(bytes[offset]!==0xff) break;
    const marker=bytes[offset+1];offset+=2;
    if(marker===0xda || marker===0xd9) break;
    const length=view.getUint16(offset),end=offset+length;
    if(length<2 || end>bytes.length) break;
    if(marker===0xe1 && length>=16 && String.fromCharCode(...bytes.subarray(offset+2,offset+8))==='Exif\0\0') {
      const tiff=offset+8, little=view.getUint16(tiff)===0x4949;
      if(!little && view.getUint16(tiff)!==0x4d4d || view.getUint16(tiff+2,little)!==42) return 1;
      const ifd=tiff+view.getUint32(tiff+4,little);
      if(ifd<tiff+8 || ifd+2>end) return 1;
      const count=view.getUint16(ifd,little);
      for(let i=0;i<count;i++) {
        const at=ifd+2+i*12;if(at+12>end) return 1;
        if(view.getUint16(at,little)===0x112 && view.getUint16(at+2,little)===3 && view.getUint32(at+4,little)===1) {
          const value=view.getUint16(at+8,little);return value>=1 && value<=8?value:1;
        }
      }
    }
    offset=end;
  }
  return 1;
}

/** Native JPEG decoder ignores EXIF; browser/CLI decoders already apply it. */
export function orientImageRaster(source: SourceRasterPixels, orientation: number): {width:number;height:number;data:Uint8Array} {
  if(!Number.isInteger(orientation) || orientation<1 || orientation>8 || source.data.length!==source.width*source.height*4) throw new Error('Image preparation EXIF orientation is invalid.');
  const swapped=orientation>=5, width=swapped?source.height:source.width,height=swapped?source.width:source.height,data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const [sx,sy]=orientation===1?[x,y]:orientation===2?[source.width-1-x,y]:orientation===3?[source.width-1-x,source.height-1-y]:orientation===4?[x,source.height-1-y]:orientation===5?[y,x]:orientation===6?[y,source.height-1-x]:orientation===7?[source.width-1-y,source.height-1-x]:[source.width-1-y,x];
    for(let channel=0;channel<4;channel++) data[(y*width+x)*4+channel]=source.data[(sy*source.width+sx)*4+channel];
  }
  return {width,height,data};
}

export async function imageSha256(bytes: Uint8Array | Uint8ClampedArray): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(bytes).buffer)),v=>v.toString(16).padStart(2,'0')).join('');
}

export function validateImagePreparationEvidence(value: unknown): asserts value is ImagePreparationEvidence {
  const fail=():never=>{throw new Error('Invalid project: image preparation evidence is malformed.');};
  const evidence=value as ImagePreparationEvidence, m=evidence?.manifest;
  const sha=(s:unknown)=>typeof s==='string' && /^[a-f0-9]{64}$/.test(s);
  if(!m || m.schemaVersion!=='plan2world-image-preparation-v1' || m.coordinates!=='exif-upright-source-pixel-edges'
    || !m.source || typeof m.source.name!=='string' || !sha(m.source.sha256) || !sha(m.source.rgbaSha256)
    || !Number.isInteger(m.source.exifOrientation) || m.source.exifOrientation<1 || m.source.exifOrientation>8
    || !m.working || !sha(m.working.sha256) || !sha(m.working.rgbaSha256) || !['image/png','image/jpeg','image/webp'].includes(m.working.mimeType)
    || !['unchanged','bilinear'].includes(m.sampling)
    || evidence.originalDataUrl!==undefined && (typeof evidence.originalDataUrl!=='string' || !/^data:image\/(png|jpeg|webp);base64,/.test(evidence.originalDataUrl))) fail();
  try {
    const expected=imagePreparationTransform(m.source.width,m.source.height,m.recipe);
    if(expected.width!==m.width || expected.height!==m.height) fail();
    for(const key of ['sourceToWorking','workingToSource'] as const) {
      if(!Array.isArray(m[key]) || m[key].length!==9 || m[key].some((v,i)=>!Number.isFinite(v) || Math.abs(v-expected[key][i])>1e-8*Math.max(1,Math.abs(v)))) fail();
    }
    if(m.sampling!==(m.recipe.mode==='identity'?'unchanged':'bilinear')) fail();
  } catch { fail(); }
}
