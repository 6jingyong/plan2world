#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';

function usage() {
  console.log('Usage: npm run runtime:export -- <project.json> [output.runtime.json]');
}

function defaultOutputPath(inputPath) {
  return inputPath.replace(/\.json$/i, '') + '.runtime.json';
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}
if (args.length < 1 || args.length > 2) {
  usage();
  process.exit(2);
}

const inputPath = path.resolve(args[0]);
const outputPath = path.resolve(args[1] ?? defaultOutputPath(inputPath));
if (inputPath === outputPath) {
  console.error('Runtime export failed: input and output paths must be different.');
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
  const [{ readProject }, { compileRuntimeScene }] = await Promise.all([
    vite.ssrLoadModule('/src/lib/utils/projectValidation.ts'),
    vite.ssrLoadModule('/src/lib/runtime/compileRuntimeScene.ts'),
  ]);
  const project = readProject(serializedProject);
  const runtime = compileRuntimeScene(project);
  await fs.writeFile(outputPath, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${outputPath}`);
  console.log(`plan2world-runtime-v1: ${runtime.floors.length} floor(s), ${runtime.entities.length} entities, ${runtime.colliders.length} colliders`);
} catch (error) {
  console.error(`Runtime export failed: ${messageOf(error)}`);
  process.exitCode = 1;
} finally {
  await vite.close();
}
