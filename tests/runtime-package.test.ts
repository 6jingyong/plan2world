import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { serializeRuntimePackage } from '$lib/runtime/runtimePackage';
import { runtimeAssetProject } from '../tooling/runtime-asset-fixture.mjs';

describe('portable runtime scene package', () => {
  it.each(['single', 'opening'] as const)('exports a full-wall %s without changing native semantics or collision', async type => {
    const source = {
      id: 'full-wall-aperture', name: 'Full wall aperture', activeFloorId: 'ground',
      createdAt: new Date(0).toISOString(), updatedAt: new Date(0).toISOString(),
      floors: [{
        id: 'ground', name: 'Ground', level: 0, walkthroughStart: { x: 200, y: 150 },
        walls: [
          { id: 'north', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 20, height: 280 },
          { id: 'east', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, thickness: 20, height: 280 },
          { id: 'south', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, thickness: 20, height: 280 },
          { id: 'west', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, thickness: 20, height: 280 },
        ],
        doors: [{ id: 'aperture', wallId: 'north', position: 0.5, width: 400, height: 280, type }],
        windows: [], furniture: [], stairs: [], columns: [], rooms: [],
      }],
    };
    const original = structuredClone(source);
    const artifacts = await compileRuntimeArtifacts(source, async () => null);
    const again = await compileRuntimeArtifacts(source, async () => null);
    expect(source).toEqual(original);
    expect(artifacts.runtime.entities.find(entity => entity.id === 'north')).toMatchObject({
      kind: 'wall', path: { start: [0, 0], end: [4, 0] }, startHeight: 280 * 0.01, endHeight: 280 * 0.01,
    });
    const door = artifacts.runtime.entities.find(entity => entity.kind === 'door');
    expect(door).toMatchObject({
      id: 'aperture', hostWallId: 'north', width: 4, height: 280 * 0.01, doorType: type,
      interaction: { kind: type === 'opening' ? 'none' : 'swing' },
    });
    expect(artifacts.runtime.colliders.filter(collider => collider.ownerId === 'north')).toEqual([]);
    expect(artifacts.runtime.colliders.filter(collider => collider.ownerId === 'aperture')).toHaveLength(type === 'opening' ? 0 : 1);
    expect(artifacts.architecture.primitives.some(primitive => primitive.ownerId === 'north')).toBe(false);
    expect(artifacts.architecture.primitives.filter(primitive => primitive.kind === 'wall')).toHaveLength(3);
    expect(artifacts.architecture.primitives.some(primitive => primitive.kind === 'floor')).toBe(true);
    expect(again.runtime).toEqual(artifacts.runtime);
    expect(again.architectureGlb).toEqual(artifacts.architectureGlb);
    expect(await serializeRuntimePackage(again)).toEqual(await serializeRuntimePackage(artifacts));
  });

  it('preserves exact compiler artifacts, content-addressed assets and native input in a stable ZIP', async () => {
    const source = await runtimeAssetProject(), original = structuredClone(source);
    const artifacts = await compileRuntimeArtifacts(source, async file => new Uint8Array(readFileSync(`static/models/${file}.glb`)));
    const first = await serializeRuntimePackage(artifacts);
    const second = await serializeRuntimePackage(artifacts);
    expect(second).toEqual(first);
    expect(source).toEqual(original);
    const zip = await JSZip.loadAsync(first, { checkCRC32: true });
    const names = Object.keys(zip.files);
    expect(names).toEqual([...names].sort());
    expect(names).toHaveLength(4 + artifacts.assets.files.size);
    expect(JSON.parse(await zip.file('scene.runtime.json')!.async('text'))).toEqual(artifacts.runtime);
    expect(await zip.file('scene.architecture.glb')!.async('uint8array')).toEqual(artifacts.architectureGlb);
    const manifest = JSON.parse(await zip.file('scene.assets/manifest.json')!.async('text'));
    expect(await zip.file('scene.assets/manifest.json')!.async('text')).toBe(`${JSON.stringify(artifacts.assets.manifest, null, 2)}\n`);
    for (const asset of manifest.assets) {
      const bytes = await zip.file(`scene.assets/${asset.uri}`)!.async('uint8array');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      expect(bytes).toEqual(artifacts.assets.files.get(asset.uri));
    }
    expect(await zip.file('README.txt')!.async('text')).toContain('native Project');
    expect(names.some(name => /\.tscn|\.pck|\.exe|project\.json/.test(name))).toBe(false);
  });
});
