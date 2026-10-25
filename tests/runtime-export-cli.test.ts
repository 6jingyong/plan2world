import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { runtimeAssetProject } from '../tooling/runtime-asset-fixture.mjs';
import { runtimeProductProject } from '../tooling/runtime-product-fixture.mjs';

describe('runtime export CLI', () => {
  it.each([false,true])('rejects door-clipping furniture before writing outputs (existing outputs: %s)', async existing => {
    const directory=await mkdtemp(path.join(tmpdir(),'plan2world-door-clearance-'));
    try {
      const source=await runtimeProductProject();
      source.floors[0].furniture.find((item:{id:string})=>item.id==='sofa').position={x:300,y:600};
      const input=path.join(directory,'input.json'), bytes=JSON.stringify(source);
      await writeFile(input,bytes);
      const retained=['scene.runtime.json','scene.architecture.glb','scene.assets/manifest.json','scene.assets/model.glb','scene.zip'];
      if(existing) {
        await mkdir(path.join(directory,'scene.assets'));
        for(const file of retained) await writeFile(path.join(directory,file),`preserve ${file}`);
      }
      const result=spawnSync(process.execPath,['tooling/runtime-export.mjs',input,path.join(directory,'scene.runtime.json'),'--package',path.join(directory,'scene.zip')],{
        encoding:'utf8',env:{...process.env,NODE_ENV:'production'},
      });
      expect(result.status).toBe(1);expect(result.stdout).not.toContain('Wrote');
      expect(result.stderr).toContain('Furniture "sofa" overlaps the closed pose of door "swing-door"');
      expect(await readFile(input,'utf8')).toBe(bytes);
      if(existing) for(const file of retained) expect(await readFile(path.join(directory,file),'utf8')).toBe(`preserve ${file}`);
      else expect(await readdir(directory)).toEqual(['input.json']);
    } finally { await rm(directory,{recursive:true,force:true}); }
  },15_000);

  it.each([false, true])('rejects an invalid native floor before writing outputs (existing outputs: %s)', async existing => {
    const directory = await mkdtemp(path.join(tmpdir(), 'plan2world-invalid-floor-'));
    try {
      const original = await runtimeAssetProject();
      const source = { ...original, floors: [{ ...original.floors[0], rooms: [{
        id: 'invalid-ground', name: 'Invalid ground', walls: [], area: 0, floorTexture: 'concrete',
        boundary: [[100, 100], [400, 400], [100, 400], [400, 100]].map(([x, y]) => ({ point: { x, y } })),
      }] }, ...original.floors.slice(1)] };
      const input = path.join(directory, 'input.json'), bytes = JSON.stringify(source);
      await writeFile(input, bytes);
      const output = path.join(directory, 'scene.runtime.json'), zip = path.join(directory, 'scene.zip');
      const retained = ['scene.runtime.json', 'scene.architecture.glb', 'scene.assets/manifest.json', 'scene.assets/model.glb', 'scene.zip'];
      if (existing) {
        await mkdir(path.join(directory, 'scene.assets'));
        for (const file of retained) await writeFile(path.join(directory, file), `preserve ${file}`);
      }
      const result = spawnSync(process.execPath, ['tooling/runtime-export.mjs', input, output, '--package', zip], {
        encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/floor "ground".*room "invalid-ground".*native boundary/i);
      expect(result.stdout).not.toContain('Wrote');
      expect(await readFile(input, 'utf8')).toBe(bytes);
      if (existing) {
        for (const file of retained) expect(await readFile(path.join(directory, file), 'utf8')).toBe(`preserve ${file}`);
        expect((await readdir(path.join(directory, 'scene.assets'))).sort()).toEqual(['manifest.json', 'model.glb']);
      } else {
        expect(await readdir(directory)).toEqual(['input.json']);
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  }, 15_000);

  it('compiles a serialized native Project into runtime JSON and architecture GLB', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'plan2world-runtime-'));
    const input = path.join(dir, 'house.project.json');
    const runtimeOutput = path.join(dir, 'house.runtime.json');
    const architectureOutput = path.join(dir, 'house.architecture.glb');
    const packageOutput = path.join(dir, 'house.runtime.zip');
    const nativeProject = {
      id: 'project-cli',
      name: 'CLI runtime fixture',
      activeFloorId: 'floor-1',
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      floors: [{
        id: 'floor-1',
        name: 'Ground',
        level: 0,
        walkthroughStart: { x: 100, y: 100 },
        walls: [
          { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 20, height: 280 },
          { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, thickness: 20, height: 280 },
          { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, thickness: 20, height: 280 },
          { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, thickness: 20, height: 280 },
        ],
        doors: [{ id: 'd1', wallId: 'w1', position: 0.5, width: 90 }],
        windows: [],
        furniture: [],
        stairs: [],
        columns: [],
        rooms: [],
        guides: [],
        measurements: [],
        annotations: [],
        textAnnotations: [],
        groups: [],
      }],
    };

    try {
      await writeFile(input, JSON.stringify(nativeProject), 'utf8');
      const stdout = execFileSync(process.execPath, ['tooling/runtime-export.mjs', input, runtimeOutput, '--package', packageOutput], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      const runtime = JSON.parse(await readFile(runtimeOutput, 'utf8'));
      const glb = await readFile(architectureOutput);

      expect(stdout).toContain('plan2world-runtime-v1');
      expect(stdout).toContain('architecture.glb');
      expect(runtime.schema).toBe('plan2world-runtime-v1');
      expect(runtime.floors[0].id).toBe('floor-1');
      expect(runtime.entities.some((entity: { id: string }) => entity.id === 'w1')).toBe(true);
      const door = runtime.entities.find((entity: { id: string }) => entity.id === 'd1');
      expect(door?.hostWallId).toBe('w1');
      expect(door?.interaction?.kind).toBe('swing');
      expect(runtime.colliders.some((collider: { ownerId: string }) => collider.ownerId === 'd1')).toBe(true);
      expect(glb.readUInt32LE(0)).toBe(0x46546c67);
      expect(glb.readUInt32LE(4)).toBe(2);
      expect(glb.readUInt32LE(8)).toBe(glb.byteLength);
      const zip = await JSZip.loadAsync(await readFile(packageOutput), { checkCRC32: true });
      expect(await zip.file('scene.runtime.json')!.async('text')).toBe(await readFile(runtimeOutput, 'utf8'));
      expect(await zip.file('scene.architecture.glb')!.async('nodebuffer')).toEqual(glb);
      expect(await zip.file('scene.assets/manifest.json')!.async('text')).toBe(await readFile(path.join(dir, 'house.assets/manifest.json'), 'utf8'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 15_000);
});
