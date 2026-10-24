#!/usr/bin/env node
// Rebuild the bundled compatibility demo from native editable input. It shares
// the real walkthrough fixture, avoiding a second hand-maintained runtime scene.
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { runtimeWalkthroughProject } from './runtime-walkthrough-fixture.mjs';

const vite = await createServer({ appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false } });
try {
  const { readProject } = await vite.ssrLoadModule('/src/lib/utils/projectValidation.ts');
  const { compileRuntimeScene } = await vite.ssrLoadModule('/src/lib/runtime/compileRuntimeScene.ts');
  const scene = compileRuntimeScene(readProject(await runtimeWalkthroughProject()));
  await writeFile(new URL('../runtime/godot/demo/runtime-scene.json', import.meta.url), JSON.stringify(scene, null, 2) + '\n');
} finally {
  await vite.close();
}
