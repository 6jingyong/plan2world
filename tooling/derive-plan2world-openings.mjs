#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--trace') throw new Error('Usage: node tooling/derive-plan2world-openings.mjs --trace opening-trace.json');
const input = JSON.parse(await readFile(resolve(args[1]), 'utf8'));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({root,configFile:false,logLevel:'error',resolve:{alias:{'$lib':resolve(root,'src/lib')}},optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null,ws:false},appType:'custom'});
try {
  const { deriveSourceOpenings } = await server.ssrLoadModule('/src/lib/plan2world/sourceOpenings.ts');
  console.log(JSON.stringify(deriveSourceOpenings(input), null, 2));
} finally { await server.close(); }
