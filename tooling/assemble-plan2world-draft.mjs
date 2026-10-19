#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
};
const barePath = valueAfter('--bare-house');
const annotationsPath = valueAfter('--annotations');
if (!barePath || !annotationsPath) {
  throw new Error('Usage: node tooling/assemble-plan2world-draft.mjs --bare-house bare-house.json --annotations annotations.json [--source-width W --source-height H]');
}

const sourceWidth = valueAfter('--source-width');
const sourceHeight = valueAfter('--source-height');
if ((sourceWidth === undefined) !== (sourceHeight === undefined)) {
  throw new Error('--source-width and --source-height must be supplied together');
}
const context = sourceWidth === undefined ? {} : {
  sourceWidthPx: Number(sourceWidth),
  sourceHeightPx: Number(sourceHeight),
};

const bareHouse = JSON.parse(await readFile(resolve(barePath), 'utf8'));
const annotations = JSON.parse(await readFile(resolve(annotationsPath), 'utf8'));
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
  console.log(JSON.stringify(assemblePlan2WorldDraft(bareHouse, annotations, context), null, 2));
} finally {
  await server.close();
}
