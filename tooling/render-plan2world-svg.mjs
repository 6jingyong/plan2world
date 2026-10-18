#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), options = {};
const usage = 'Usage: node tooling/render-plan2world-svg.mjs --draft draft.json --output directory [--source source.jpg --width W --height H] [--floor floor-id] [--labels true|false]';
for (let i=0;i<args.length;i+=2) {
  if (!['--draft','--output','--source','--width','--height','--floor','--labels'].includes(args[i]) || !args[i+1]) throw new Error(usage);
  options[args[i].slice(2)] = args[i+1];
}
if (!options.draft || !options.output) throw new Error(usage);
if (options.labels && !['true','false'].includes(options.labels)) throw new Error('--labels must be true or false.');
if (options.source && ![Number(options.width),Number(options.height)].every(n=>Number.isFinite(n)&&n>0)) throw new Error('Source overlay requires positive original raster width/height.');
const server = await createServer({root,configFile:false,logLevel:'error',resolve:{alias:{'$lib':resolve(root,'src/lib')}},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null,ws:false},appType:'custom'});
try {
  const { renderPlan2WorldDraftSvg } = await server.ssrLoadModule('/src/lib/plan2world/draftSvg.ts');
  const draft = JSON.parse(await readFile(resolve(options.draft),'utf8'));
  const svgOptions = {floorId:options.floor,labels:options.labels!=='false'};
  const outputs = [['plan.svg',renderPlan2WorldDraftSvg(draft,svgOptions)]];
  if (options.source) {
    const bytes = await readFile(resolve(options.source));
    const mime = bytes[0]===0x89 ? 'image/png' : bytes[0]===0xff ? 'image/jpeg' : bytes.toString('ascii',8,12)==='WEBP' ? 'image/webp' : null;
    if (!mime) throw new Error('Source must be a PNG, JPEG or WebP raster.');
    outputs.push(['overlay.svg',renderPlan2WorldDraftSvg(draft,{...svgOptions,labels:options.labels==='true',source:{width:Number(options.width),height:Number(options.height),dataUrl:`data:${mime};base64,${bytes.toString('base64')}`}})]);
  }
  const output = resolve(options.output); await mkdir(output,{recursive:true});
  for (const [name,svg] of outputs) await writeFile(resolve(output,name),svg);
  console.log(JSON.stringify({draft:resolve(options.draft),files:outputs.map(([name])=>resolve(output,name)),note:'Read-only JSON visualization, not reconstruction accuracy certification.'},null,2));
} finally { await server.close(); }
