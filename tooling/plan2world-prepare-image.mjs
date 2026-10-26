#!/usr/bin/env node
import { createServer } from 'vite';
import { readFile,writeFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readSourceRaster } from './source-raster.mjs';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2) {
  if(!['--source','--recipe','--output'].includes(args[i]) || !args[i+1] || options[args[i]]) throw new Error('Usage: --source photo.jpg --recipe recipe.json --output NEW_DIRECTORY');
  options[args[i]]=args[i+1];
}
if(!options['--source'] || !options['--output']) throw new Error('Source image and fresh output directory are required.');
const server=await createServer({appType:'custom',logLevel:'error',server:{middlewareMode:true,hmr:false}}),temporary=await mkdtemp(path.join(tmpdir(),'p2w-image-input-'));
try {
  const raster=await readSourceRaster(await readFile(options['--source'])),rasterPath=path.join(temporary,'upright.rgba');
  await writeFile(rasterPath,raster.data);
  const {prepareFloorPlanImage}=await server.ssrLoadModule('/tooling/prepare-floorplan-image.mjs');
  const recipe=options['--recipe']?JSON.parse(await readFile(options['--recipe'],'utf8')):{mode:'identity',quarterTurns:0};
  const result=await prepareFloorPlanImage({imagePath:path.resolve(options['--source']),rasterPath,width:raster.width,height:raster.height,pixelOrientation:'upright',recipe,outputDirectory:path.resolve(options['--output'])});
  console.log(JSON.stringify(result,null,2));
} finally {await server.close();await rm(temporary,{recursive:true,force:true});}
