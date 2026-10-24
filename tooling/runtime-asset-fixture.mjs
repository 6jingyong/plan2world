#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Native, editable input for the real CLI -> Godot asset integration gate. */
export async function runtimeAssetProject() {
  const bytes = await readFile(new URL('../tests/fixtures/local-model-textured-box.glb', import.meta.url));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const points = [[0, 0], [800, 0], [800, 600], [0, 600]];
  const walls = points.map(([x, y], i) => ({ id: `w${i}`, start: { x, y },
    end: { x: points[(i+1)%4][0], y: points[(i+1)%4][1] }, thickness: 20, height: 280 }));
  const doors = ['single', 'single', 'sliding', 'pocket', 'bifold', 'garage', 'opening'].map((type, i) => ({
    id: `door-${i}`, wallId: `w${i%4}`, position: i < 4 ? 0.25 : 0.75, width: 90, height: 210,
    type, swingDirection: i%2 ? 'right' : 'left', flipSide: i%2 === 1,
  }));
  doors.push(...['double', 'french'].map((type, i) => ({
    id: type, wallId: `w${i}`, position: 0.5, width: 140, height: 210,
    type, swingDirection: 'left', flipSide: i === 1,
  })));
  const furniture = [
    { id: 'catalog-sofa', catalogId: 'sofa' },
    { id: 'catalog-chair', catalogId: 'chair' },
    { id: 'custom', catalogId: 'imported_object', customModelId: 'box', sourceCategory: 'storage', width: 120, depth: 80, height: 60 },
    { id: 'flat', catalogId: 'imported_object', customModelId: 'box-alias', height: 5 },
    { id: 'missing', catalogId: 'imported_object', sourceCategory: 'bed' },
    { id: 'missing-flat', catalogId: 'imported_object', height: 5 },
  ].map((item, i) => ({ position: { x: 150 + i*80, y: 300 }, rotation: i*30,
    scale: { x: i === 2 ? -1.5 : 1, y: i === 2 ? -2 : 1, z: i === 2 ? 0.5 : 1 }, ...item }));
  return {
    id: 'runtime-assets', name: 'Runtime asset integration', activeFloorId: 'ground',
    createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
    customModels: ['box', 'box-alias'].map(id => ({ id, name: 'Fixture box', assetName: 'box.glb', sourceFilename: 'box.glb',
      sha256, byteLength: bytes.length, width: 100, depth: 75, height: 50 })),
    projectPackage: { version: 1, furnitureCategoriesVersion: 1, native: { version: 1, title: 'Asset fixture', rooms: [], walls: [], furniture: [] },
      mapping: [], assets: { 'assets/box.glb': bytes.toString('base64') } },
    floors: [{ id: 'ground', name: 'Ground', level: 0, elevation: 40, walkthroughStart: { x: 400, y: 400 }, walls, doors,
      furniture, windows: [], stairs: [], columns: [], rooms: [], guides: [], measurements: [], annotations: [], textAnnotations: [], groups: [] }],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2]);
  await mkdir(directory, { recursive: true });
  const input = path.join(directory, 'assets.project.json');
  await writeFile(input, JSON.stringify(await runtimeAssetProject()));
  execFileSync(process.execPath, ['tooling/runtime-export.mjs', input, path.join(directory, 'assets.runtime.json')], { stdio: 'inherit' });
}
