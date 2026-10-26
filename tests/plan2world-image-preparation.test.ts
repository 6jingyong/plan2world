import { describe,expect,it } from 'vitest';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { imagePreparationTransform,prepareImageRaster,transformImagePoint,orientImageRaster,jpegExifOrientation,validateImagePreparationEvidence,FULL_IMAGE_QUAD,type ImageQuad,type ImagePreparationRecipe } from '$lib/plan2world/imagePreparation';
import { prepareFloorPlanImage,readPreparedImageEvidence } from '../tooling/prepare-floorplan-image.mjs';
import { encodeRgbaPng } from '../tooling/png-raster.mjs';
import { readSourceRaster } from '../tooling/source-raster.mjs';

const quad:ImageQuad=[{x:.1,y:.1},{x:.9,y:.2},{x:.8,y:.9},{x:.2,y:.8}];
const recipe:ImagePreparationRecipe={mode:'perspective',quarterTurns:0,corners:quad,aspectRatio:4/3,outputWidth:400};
describe('shared floor-plan input preparation',()=>{
  it('rectifies a plane and maps every corner and interior point back to the original upright pixels',()=>{
    const plan=imagePreparationTransform(1000,800,recipe);
    const targets=[{x:0,y:0},{x:400,y:0},{x:400,y:300},{x:0,y:300}];
    quad.forEach((p,i)=>{
      const actual=transformImagePoint(plan.sourceToWorking,{x:p.x*1000,y:p.y*800});
      expect(actual.x).toBeCloseTo(targets[i].x,8);expect(actual.y).toBeCloseTo(targets[i].y,8);
    });
    for(const p of [...targets,{x:213,y:127}]){
      const back=transformImagePoint(plan.sourceToWorking,transformImagePoint(plan.workingToSource,p));
      expect(back.x).toBeCloseTo(p.x,8);expect(back.y).toBeCloseTo(p.y,8);
    }
    expect(plan.recipe).toEqual(recipe);
  });
  it('leaves an unprepared raster byte-exact and rotates a marked raster without mirrored axes or interpolated colours',()=>{
    const data=Uint8Array.from([1,2,3,4,5,6].flatMap(v=>[v,0,0,255])),source={width:3,height:2,data},before=data.slice();
    expect(prepareImageRaster(source,{mode:'identity',quarterTurns:0}).raster.data).toEqual(data);
    expect(prepareImageRaster(source,{mode:'identity',quarterTurns:1}).raster).toEqual({width:2,height:3,data:Uint8Array.from([4,1,5,2,6,3].flatMap(v=>[v,0,0,255]))});
    expect(prepareImageRaster(source,{mode:'identity',quarterTurns:2}).raster.data).toEqual(Uint8Array.from([6,5,4,3,2,1].flatMap(v=>[v,0,0,255])));
    expect(data).toEqual(before);
  });
  it('uses pixel-edge coordinates without a half-pixel registration drift',()=>{
    const source={width:6,height:4,data:Uint8Array.from(Array.from({length:24},(_,i)=>[i,0,0,255]).flat())};
    const result=prepareImageRaster(source,{mode:'perspective',quarterTurns:0,corners:[{x:1/6,y:1/4},{x:5/6,y:1/4},{x:5/6,y:3/4},{x:1/6,y:3/4}],aspectRatio:2,outputWidth:4});
    expect([...result.raster.data].filter((_,i)=>i%4===0)).toEqual([7,8,9,10,13,14,15,16]);
  });
  it.each([
    {...recipe,corners:[quad[0],quad[2],quad[1],quad[3]]},
    {...recipe,corners:[quad[0],quad[1],{x:.3,y:.3},quad[3]]},
    {...recipe,corners:[quad[0],quad[1],{x:1.01,y:1},quad[3]]},
    {...recipe,corners:[quad[0],quad[0],quad[2],quad[3]]},
    {...recipe,aspectRatio:undefined},{...recipe,aspectRatio:Infinity},{...recipe,outputWidth:10000},{...recipe,quarterTurns:4},
  ])('rejects crossing/concave/degenerate/outside corners, missing proportions and unbounded output',bad=>{
    expect(()=>imagePreparationTransform(1000,800,bad as ImagePreparationRecipe)).toThrow(/Image preparation/);
  });
  it('does not infer rectangle proportions or reshape an irregular footprint during passthrough',()=>{
    expect(()=>imagePreparationTransform(100,80,{mode:'perspective',quarterTurns:0,corners:FULL_IMAGE_QUAD})).toThrow(/known rectangle/);
    expect(()=>imagePreparationTransform(100,80,{mode:'identity',quarterTurns:0,corners:FULL_IMAGE_QUAD})).toThrow(/must not crop/);
  });
  it.each([
    [1,[1,2,3,4,5,6]],[2,[3,2,1,6,5,4]],[3,[6,5,4,3,2,1]],[4,[4,5,6,1,2,3]],
    [5,[1,4,2,5,3,6]],[6,[4,1,5,2,6,3]],[7,[6,3,5,2,4,1]],[8,[3,6,2,5,1,4]],
  ])('normalizes EXIF %i exactly once, including mirrored phone images',(orientation,expected)=>{
    const source={width:3,height:2,data:Uint8Array.from([1,2,3,4,5,6].flatMap(v=>[v,0,0,255]))};
    const result=orientImageRaster(source,orientation);
    expect([...result.data].filter((_,i)=>i%4===0)).toEqual(expected);
    expect([result.width,result.height]).toEqual(orientation>=5?[2,3]:[3,2]);
    const exif=Buffer.from('ffd8ffe1002245786966000049492a0008000000010012010300010000000600000000000000ffd9','hex');
    exif.writeUInt16LE(orientation,30);expect(jpegExifOrientation(exif)).toBe(orientation);
    expect(jpegExifOrientation(exif.subarray(0,17))).toBe(1);
  });
  it('freezes original, working image/pixels, ratio and reversible transform; repeat is byte-stable and overwrites/tampering are rejected',async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),'p2w-prepare-image-'));
    try{
      const raster={width:20,height:16,data:Uint8Array.from(Array.from({length:320},(_,i)=>[i%256,Math.floor(i/20)*15,90,255]).flat())};
      const imagePath=path.join(directory,'photo.png'),rasterPath=path.join(directory,'photo.rgba');
      const original=encodeRgbaPng(raster);await writeFile(imagePath,original);await writeFile(rasterPath,raster.data);
      const request={imagePath,rasterPath,width:20,height:16,pixelOrientation:'upright' as const,recipe:{...recipe,outputWidth:40},outputDirectory:path.join(directory,'first')};
      const first=await prepareFloorPlanImage(request),second=await prepareFloorPlanImage({...request,outputDirectory:path.join(directory,'repeat')});
      expect(first.manifest).toEqual(second.manifest);
      const working=await readFile(first.imagePath),pixels=await readFile(first.rasterPath);
      expect(working).toEqual(await readFile(second.imagePath));
      expect((await readSourceRaster(working)).data).toEqual(pixels);
      expect(await readFile(first.originalPath)).toEqual(original);
      const accepted={preparationManifestPath:first.manifestPath,originalImagePath:first.originalPath,width:first.width,height:first.height};
      const evidence=await readPreparedImageEvidence(accepted,working,pixels);expect(evidence.originalDataUrl).toContain(original.toString('base64'));validateImagePreparationEvidence(evidence);
      const corrupt=structuredClone(evidence);corrupt.manifest.sourceToWorking[2]+=1;
      expect(()=>validateImagePreparationEvidence(corrupt)).toThrow(/image preparation/);
      await expect(prepareFloorPlanImage(request)).rejects.toThrow(/EEXIST/);
      const changed=Buffer.from(working);changed[20]^=1;
      await expect(readPreparedImageEvidence(accepted,changed,pixels)).rejects.toThrow(/after confirmation/);
      expect(await readFile(imagePath)).toEqual(original);
    }finally{await rm(directory,{recursive:true,force:true});}
  },30_000);
});
