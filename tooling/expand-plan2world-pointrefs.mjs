#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { readSourceRaster } from './source-raster.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = {}, args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  if (!['--input', '--source', '--output'].includes(key) || !args[i + 1] || options[key]) throw new Error('Usage: --input pointrefs.json --source original.jpg --output NEW_DIRECTORY');
  options[key] = args[i + 1];
}
if (!options['--input'] || !options['--source'] || !options['--output']) throw new Error('Input, source and a new output directory are required.');
const inputPath = resolve(options['--input']), sourcePath = resolve(options['--source']), output = resolve(options['--output']);
// Reserve once before decoding or loading the shared core. An existing run must
// fail without a second browser/Vite startup, and partial failures stay visible.
await mkdir(dirname(output), { recursive: true }); await mkdir(output);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const inputBytes = await readFile(inputPath), sourceBytes = await readFile(sourcePath), raster = await readSourceRaster(sourceBytes);
const server = await createServer({ root, configFile: false, logLevel: 'error', resolve: { alias: { '$lib': resolve(root, 'src/lib') } },
  optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false }, appType: 'custom' });
try {
  const { expandSourcePointReferences } = await server.ssrLoadModule('/src/lib/plan2world/sourcePointReferences.ts');
  const result = expandSourcePointReferences(JSON.parse(inputBytes.toString()), { width: raster.width, height: raster.height });
  const codeFiles = ['src/lib/plan2world/sourcePointReferences.ts', 'src/lib/plan2world/architecture.ts', 'src/lib/plan2world/functionalZones.ts', 'tooling/expand-plan2world-pointrefs.mjs'];
  const code = Object.fromEntries(await Promise.all(codeFiles.map(async name => [name, hash(await readFile(resolve(root, name)))])));
  const provenance = { operation: 'lossless-source-point-reference-expansion', input: { path: inputPath, sha256: hash(inputBytes) },
    source: { path: sourcePath, sha256: hash(sourceBytes), width: raster.width, height: raster.height }, code,
    codeCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    workingTreeDirty: execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '',
    limitation: 'Transport expansion only. No normalization, host acceptance, source-fidelity or recognition-quality verdict.' };
  for (const [name, value] of [['source-architecture.json', result.architecture], ['point-reference-audit.json', result.audit], ['provenance.json', provenance]]) {
    await writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  }
  console.log(JSON.stringify({ output, ...result.audit, source: provenance.source }, null, 2));
} finally { await server.close(); }
