import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { serializeRuntimePackage } from '$lib/runtime/runtimePackage';
import { runtimeAssetProject } from '../tooling/runtime-asset-fixture.mjs';

describe('portable runtime scene package', () => {
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
