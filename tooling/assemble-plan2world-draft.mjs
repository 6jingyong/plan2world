#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const bareIndex = args.indexOf('--bare-house');
const annotationsIndex = args.indexOf('--annotations');
if (bareIndex < 0 || annotationsIndex < 0 || !args[bareIndex + 1] || !args[annotationsIndex + 1]) {
  throw new Error('Usage: node tooling/assemble-plan2world-draft.mjs --bare-house bare-house.json --annotations annotations.json');
}

const bareHouse = JSON.parse(await readFile(resolve(args[bareIndex + 1]), 'utf8'));
const annotations = JSON.parse(await readFile(resolve(args[annotationsIndex + 1]), 'utf8'));
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  resolve: { alias: { '$lib': resolve(root, 'src/lib') } },
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null, ws: false },
  appType: 'custom',
});

try {
  const { assemblePlan2WorldDraft } = await server.ssrLoadModule('/src/lib/plan2world/reconstructionAssembly.ts');
  console.log(JSON.stringify(assemblePlan2WorldDraft(bareHouse, annotations), null, 2));
} finally {
  await server.close();
}
