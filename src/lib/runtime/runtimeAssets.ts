import type { Project } from '../models/types';
import { readCustomModelSource } from '../services/customModelSource';
import { getModelFile } from '../utils/furnitureModelFiles';
import { compileAssetNormalization, type AssetNormalization } from './assetNormalization';
import { appendBox, type MeshBuilder } from './presentationGeometry';
import { serializePresentationGlb } from './architectureGlb';
import type { Plan2WorldRuntimeSceneV1 } from './types';

export interface RuntimeAsset {
  id: string;
  uri: string;
  sha256: string;
  byteLength: number;
  normalization: AssetNormalization;
}
export interface RuntimeAssetManifest {
  schema: 'plan2world-runtime-assets-v1';
  version: 1;
  assets: RuntimeAsset[];
}
export interface RuntimeAssetDiagnostic { assetRef: string; reason: 'no-model' | 'missing-source' }
export type ReadCatalogAsset = (file: string) => Promise<Uint8Array | null>;

/** A reusable centered unit leaf. Presentation is independent of collider shape;
 * instance width/height/thickness and motion all come from runtime semantics. */
export function compileDefaultDoorAsset() {
  const mesh: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  appendBox(mesh, [0, 0, 0], [1, 1, 1], 0);
  return serializePresentationGlb([{ ...mesh, id: 'builtin:door-leaf-v1', kind: 'door', material: 'door' }], {
    artifact: 'runtime-asset', assetId: 'builtin:door-leaf-v1',
  });
}

/** Resolve only referenced assets. Source bytes remain immutable and are shared
 * by digest; native identity is preserved separately from storage filenames.
 * Missing sources are explicit diagnostics. Invalid retained sources fail export. */
export async function compileRuntimeAssets(project: Project, runtime: Plan2WorldRuntimeSceneV1, readCatalogAsset: ReadCatalogAsset) {
  const refs = [...new Set(runtime.entities.flatMap(entity =>
    entity.kind === 'furniture' || entity.kind === 'door' ? entity.assetRef ? [entity.assetRef] : [] : []))].sort();
  const manifest: RuntimeAssetManifest = { schema: 'plan2world-runtime-assets-v1', version: 1, assets: [] };
  const files = new Map<string, Uint8Array>();
  const diagnostics: RuntimeAssetDiagnostic[] = [];
  const catalogSources = new Map<string, Uint8Array | null>();
  for (const id of refs) {
    let bytes: Uint8Array | null = null;
    let reason: RuntimeAssetDiagnostic['reason'] = 'missing-source';
    if (id === 'builtin:door-leaf-v1') bytes = compileDefaultDoorAsset();
    else if (id.startsWith('custom-model:')) {
      const modelId = id.slice('custom-model:'.length);
      const model = project.customModels?.find(model => model.id === modelId);
      if (model && project.projectPackage?.assets[`assets/${model.assetName}`] !== undefined) {
        bytes = (await readCustomModelSource(project, modelId)).bytes;
      }
    } else if (id.startsWith('catalog:')) {
      const file = getModelFile(id.slice('catalog:'.length));
      if (file) {
        if (!catalogSources.has(file)) catalogSources.set(file, await readCatalogAsset(file));
        bytes = catalogSources.get(file)!;
      } else reason = 'no-model';
    }
    if (!bytes) { diagnostics.push({ assetRef: id, reason }); continue; }
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)),
      byte => byte.toString(16).padStart(2, '0')).join('');
    const uri = `${sha256}.glb`;
    const normalization = compileAssetNormalization(bytes);
    manifest.assets.push({ id, uri, sha256, byteLength: bytes.byteLength, normalization });
    if (!files.has(uri)) files.set(uri, bytes);
  }
  return { manifest, files, diagnostics };
}
