#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';

function usage() {
  console.log('Usage: npm run runtime:export -- <project.json> [output.runtime.json] [output.architecture.glb]');
}

function defaultRuntimePath(inputPath) {
  return inputPath.replace(/\.json$/i, '') + '.runtime.json';
}

function defaultArchitecturePath(runtimePath) {
  if (/\.runtime\.json$/i.test(runtimePath)) return runtimePath.replace(/\.runtime\.json$/i, '.architecture.glb');
  if (/\.json$/i.test(runtimePath)) return runtimePath.replace(/\.json$/i, '.architecture.glb');
  return runtimePath + '.architecture.glb';
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}
if (args.length < 1 || args.length > 3) {
  usage();
  process.exit(2);
}

const inputPath = path.resolve(args[0]);
const runtimePath = path.resolve(args[1] ?? defaultRuntimePath(inputPath));
const architecturePath = path.resolve(args[2] ?? defaultArchitecturePath(runtimePath));
const assetsPath = (/\.json$/i.test(runtimePath) ? runtimePath.replace(/(?:\.runtime)?\.json$/i, '') : runtimePath) + '.assets';
const uniquePaths = new Set([inputPath, runtimePath, architecturePath, assetsPath]);
if (uniquePaths.size !== 4) {
  console.error('Runtime export failed: input, runtime output, and architecture output paths must be different.');
  process.exit(2);
}

let source;
try {
  source = await fs.readFile(inputPath, 'utf8');
} catch (error) {
  console.error(`Runtime export failed: could not read ${inputPath}: ${messageOf(error)}`);
  process.exit(1);
}

let serializedProject;
try {
  serializedProject = JSON.parse(source);
} catch (error) {
  console.error(`Runtime export failed: ${inputPath} is not valid JSON: ${messageOf(error)}`);
  process.exit(1);
}

const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
});

try {
  const { compileRuntimeArtifacts } = await vite.ssrLoadModule('/src/lib/runtime/runtimeArtifacts.ts');
  const { runtime, architecture, architectureGlb, assets } = await compileRuntimeArtifacts(serializedProject, async file => {
    try { return new Uint8Array(await fs.readFile(new URL(`../static/models/${file}.glb`, import.meta.url))); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  });

  await fs.mkdir(assetsPath, { recursive: true });
  for (const [uri, bytes] of assets.files) await fs.writeFile(path.join(assetsPath, uri), bytes);
  await fs.writeFile(path.join(assetsPath, 'manifest.json'), `${JSON.stringify(assets.manifest, null, 2)}\n`);

  await Promise.all([
    fs.writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8'),
    fs.writeFile(architecturePath, architectureGlb),
  ]);

  console.log(`Wrote ${runtimePath}`);
  console.log(`Wrote ${architecturePath}`);
  console.log(`Wrote ${assetsPath}/manifest.json (${assets.manifest.assets.length} asset references, ${assets.files.size} GLBs)`);
  for (const diagnostic of assets.diagnostics) console.warn(`asset warning [${diagnostic.reason}] ${diagnostic.assetRef}: using missing-asset proxy`);
  console.log(`plan2world-runtime-v1: ${runtime.floors.length} floor(s), ${runtime.entities.length} entities, ${runtime.colliders.length} colliders`);
  console.log(`architecture.glb: ${architecture.primitives.length} primitive(s), ${architecture.diagnostics.length} diagnostic(s)`);
  for (const diagnostic of architecture.diagnostics) {
    console.warn(`architecture warning [${diagnostic.code}] ${diagnostic.entityId}: ${diagnostic.message}`);
  }
} catch (error) {
  console.error(`Runtime export failed: ${messageOf(error)}`);
  process.exitCode = 1;
} finally {
  await vite.close();
}
