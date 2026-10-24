import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runtimeAssetProject } from '../tooling/runtime-asset-fixture.mjs';
import { compileRuntimeArtifacts } from '$lib/runtime/runtimeArtifacts';
import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
import { compileRuntimeAssets, compileDefaultDoorAsset } from '$lib/runtime/runtimeAssets';
import { compileAssetNormalization } from '$lib/runtime/assetNormalization';
import { readLocalGLB } from '$lib/utils/localGLB';
import { furnitureCatalog } from '$lib/utils/furnitureCatalog';
import { getModelFile } from '$lib/utils/furnitureModelFiles';
import { readProject } from '$lib/utils/projectValidation';
import { serializePresentationGlb } from '$lib/runtime/architectureGlb';
import { appendBox, type MeshBuilder } from '$lib/runtime/presentationGeometry';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const catalog = async (file: string) => new Uint8Array(readFileSync(`static/models/${file}.glb`));

// Repack a test container after changing its scene metadata; the source binary stays exact.
function editGlb(bytes: Uint8Array, edit: (document: Record<string, any>) => void) {
  const { document, binary } = readLocalGLB(bytes);
  edit(document);
  const json = new TextEncoder().encode(JSON.stringify(document));
  const size = Math.ceil(json.length / 4) * 4;
  const result = new Uint8Array(28 + size + binary!.length), view = new DataView(result.buffer);
  [0x46546c67, 2, result.length, size, 0x4e4f534a].forEach((v, i) => view.setUint32(i*4, v, true));
  result.fill(32, 20, 20+size); result.set(json, 20);
  view.setUint32(20+size, binary!.length, true); view.setUint32(24+size, 0x004e4942, true);
  result.set(binary!, 28+size);
  return result;
}

describe('runtime asset package', () => {
  it('keeps native identity, exact retained bytes, sorted references and content deduplication deterministic', async () => {
    const source = await runtimeAssetProject(), before = structuredClone(source);
    const a = await compileRuntimeArtifacts(source, catalog), b = await compileRuntimeArtifacts(source, catalog);
    expect(source).toEqual(before);
    expect(a.runtime).toEqual(b.runtime);
    expect(a.architectureGlb).toEqual(b.architectureGlb);
    expect(a.assets).toEqual(b.assets);
    expect(a.assets.manifest.assets.map(asset => asset.id)).toEqual([
      'builtin:door-leaf-v1', 'catalog:chair', 'catalog:sofa', 'custom-model:box', 'custom-model:box-alias',
    ]);
    expect(a.assets.files.size).toBe(4);
    const custom = a.assets.manifest.assets.find(asset => asset.id === 'custom-model:box')!;
    expect(a.assets.files.get(custom.uri)).toEqual(new Uint8Array(readFileSync('tests/fixtures/local-model-textured-box.glb')));
    expect(custom.normalization).toEqual({ translation: [-0, -0.5, -0], scale: [1, 2, 4/3] });
    for (const asset of a.assets.manifest.assets) {
      const bytes = a.assets.files.get(asset.uri)!;
      expect(asset.sha256).toBe(hash(bytes));
      expect(asset.uri).toBe(`${asset.sha256}.glb`);
      expect(asset.byteLength).toBe(bytes.length);
    }
    expect(a.assets.diagnostics).toEqual([{ assetRef: 'catalog:imported_object', reason: 'no-model' }]);
    const semantics = JSON.stringify(a.runtime);
    expect(semantics).not.toMatch(/res:\/\/|\.tscn|positions|normals|bufferViews/);
    const architecture = readLocalGLB(a.architectureGlb).document;
    expect(architecture.nodes.every((node: any) => !['door', 'furniture'].includes(node.extras.plan2world.kind))).toBe(true);
  });

  it('accepts every GLB referenced by the existing furniture catalog', () => {
    const files = new Set(furnitureCatalog.map(item => getModelFile(item.id)).filter((file): file is string => file !== null));
    expect(files.size).toBeGreaterThan(0);
    for (const file of files) {
      const fit = compileAssetNormalization(new Uint8Array(readFileSync(`static/models/${file}.glb`)));
      expect(fit.scale.every(value => Number.isFinite(value) && value > 0), file).toBe(true);
    }
  });

  it('retains authored room IDs and stable floor/boundary identity for unsaved rooms', async () => {
    const project = readProject(await runtimeAssetProject());
    const first = compileRuntimeScene(project).floors[0].rooms[0].id;
    expect(first).toBe('room:ground:w0,w1,w2,w3');
    project.floors[0].rooms = [{ id: 'native-room', name: 'Authored room', walls: ['w0','w1','w2','w3'], floorTexture: 'hardwood', area: 48 }];
    expect(compileRuntimeScene(project).floors[0].rooms[0].id).toBe('native-room');
  });

  it('compiles effective custom dimensions, rotation, elevation and mirrors independently of presentation and collision', async () => {
    const project = readProject(await runtimeAssetProject());
    const runtime = compileRuntimeScene(project);
    const custom = runtime.entities.find(e => e.id === 'custom');
    expect(custom).toMatchObject({ assetRef: 'custom-model:box', sourceCategory: 'storage', size: [1.8, 0.3, 1.6],
      mirror: [-1, 1, -1], position: [3.1, 0.55, 3] });
    if (custom?.kind === 'furniture') expect(custom.yawClockwiseRadians).toBeCloseTo(Math.PI/3);
    const flat = runtime.entities.find(e => e.id === 'flat');
    expect(flat).toMatchObject({ assetRef: 'custom-model:box-alias', size: [1, 0.05, 0.75] });
    expect(runtime.colliders.some(c => c.ownerId === 'flat')).toBe(false);
    const colliders = structuredClone(runtime.colliders);
    const original = await compileRuntimeAssets(project, runtime, catalog);
    const missing = await compileRuntimeAssets(project, runtime, async () => null);
    expect(missing.diagnostics).toContainEqual({ assetRef: 'catalog:chair', reason: 'missing-source' });
    expect(original.manifest.assets.length).toBeGreaterThan(missing.manifest.assets.length);
    expect(runtime.colliders).toEqual(colliders);
  });

  it('never substitutes a catalog asset for a missing custom source and fails on corruption or unsupported content', async () => {
    const project = readProject(await runtimeAssetProject());
    const runtime = compileRuntimeScene(project);
    delete project.projectPackage;
    const result = await compileRuntimeAssets(project, runtime, catalog);
    expect(result.diagnostics).toContainEqual({ assetRef: 'custom-model:box', reason: 'missing-source' });
    expect(result.manifest.assets.some(a => a.id === 'custom-model:box')).toBe(false);
    const corrupt = readProject(await runtimeAssetProject());
    const bytes = Buffer.from(corrupt.projectPackage!.assets['assets/box.glb'], 'base64');
    bytes[bytes.length-1] ^= 1;
    corrupt.projectPackage!.assets['assets/box.glb'] = bytes.toString('base64');
    await expect(compileRuntimeAssets(corrupt, runtime, catalog)).rejects.toThrow('changed or is damaged');
    await expect(compileRuntimeAssets(project, runtime, async () => new Uint8Array(20))).rejects.toThrow('glTF 2.0');
  });

  it('shares deterministic default leaves while preserving every discriminated motion and leafless opening', async () => {
    const { runtime } = await compileRuntimeArtifacts(await runtimeAssetProject(), catalog);
    expect(compileDefaultDoorAsset()).toEqual(compileDefaultDoorAsset());
    expect(compileAssetNormalization(compileDefaultDoorAsset())).toEqual({ translation: [-0, -0, -0], scale: [1, 1, 1] });
    const doors = runtime.entities.filter(e => e.kind === 'door');
    expect(doors.map(d => d.interaction.kind)).toEqual(['swing', 'swing', 'slide', 'slide', 'unsupported', 'unsupported', 'none', 'swing', 'swing']);
    for (const door of doors) {
      if (door.interaction.kind === 'none') continue;
      for (const leaf of door.interaction.leaves) expect(leaf).toMatchObject({ assetRef: 'builtin:door-leaf-v1', size: [expect.any(Number), 2.1, 0.04] });
    }
    expect(doors[6].interaction).not.toHaveProperty('leaves');
    expect(doors.slice(-2).map(d => d.interaction.kind === 'swing' ? d.interaction.leaves.length : 0)).toEqual([2, 2]);
  });
});

describe('compiler-owned asset normalization', () => {
  it('uses active-scene nested TRS/matrix transforms and real vertices instead of accessor min/max claims', () => {
    const bytes = editGlb(compileDefaultDoorAsset(), d => {
      d.nodes = [{ translation: [4, 5, 6], rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2], children: [1] },
        { mesh: 0, matrix: [2,0,0,0, 0,3,0,0, 0,0,4,0, 1,0,0,1] }, { mesh: 0, scale: [100,100,100] }];
      d.scenes = [{ nodes: [0] }, { nodes: [2] }]; d.scene = 0;
      d.accessors[0].min = [-999,-999,-999]; d.accessors[0].max = [999,999,999];
    });
    const fit = compileAssetNormalization(bytes);
    fit.scale.forEach((v, i) => expect(v).toBeCloseTo([1/3, 1/2, 1/4][i]));
    fit.translation.forEach((v, i) => expect(v).toBeCloseTo([-4/3, -3, -1.5][i]));
  });

  it('honors static node morph weights and rejects flat, animated or externally referenced models', () => {
    const mesh: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
    appendBox(mesh, [1, 2, 3], [2, 4, 6], 0);
    const bytes = serializePresentationGlb([{ ...mesh, id: 'test', kind: 'furniture' }], {});
    const morphed = editGlb(bytes, d => {
      d.meshes[0].primitives[0].targets = [{ POSITION: 0 }];
      d.meshes[0].weights = [0.25]; d.nodes[0].weights = [1];
    });
    expect(compileAssetNormalization(morphed)).toEqual({ translation: [-0.5, -0.5, -0.5], scale: [1/4, 1/8, 1/12] });
    expect(() => compileAssetNormalization(editGlb(bytes, d => { d.nodes[0].scale = [1,0,1]; }))).toThrow('positive dimensions');
    expect(() => compileAssetNormalization(editGlb(bytes, d => { d.animations = [{}]; }))).toThrow('static mesh');
    expect(() => compileAssetNormalization(editGlb(bytes, d => { d.buffers[0].uri = 'https://example.com/model.bin'; }))).toThrow();
  });
});
