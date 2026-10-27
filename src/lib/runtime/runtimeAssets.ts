import type { Project } from '../models/types';
import { readCustomModelSource } from '../services/customModelSource';
import { getModelFile } from '../utils/furnitureModelFiles';
import { compileAssetNormalization, type AssetNormalization } from './assetNormalization';
import { appendBox, type MeshBuilder } from './presentationGeometry';
import { serializePresentationGlb } from './architectureGlb';
import type { Plan2WorldRuntimeSceneV1 } from './types';
import { needsCeilingMount } from '../utils/ceilingFurniture';
import {hasBuiltinWallDecor} from '../utils/builtinWallDecor';

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
export function compileDefaultDoorAsset(material: 'wood' | 'glass' | 'steel' = 'wood') {
  const mesh: MeshBuilder = { positions: [], normals: [], uvs: [], indices: [] };
  appendBox(mesh, [0, 0, 0], [1, 1, 1], 0);
  const id = material === 'wood' ? 'builtin:door-leaf-v1' : `builtin:door-${material}-leaf-v1`;
  return serializePresentationGlb([{ ...mesh, id, kind: 'door', material: material === 'wood' ? 'door' : material === 'glass' ? 'glass' : 'door-steel' }], {
    artifact: 'runtime-asset', assetId: id,
  });
}

/** Reusable compiler-owned luminaire assets. Normalization/fitting stays shared;
 * light emission, mounting and physics are separate runtime contracts. */
export function compileCeilingLightAsset(id: string) {
  const body: MeshBuilder={positions:[],normals:[],uvs:[],indices:[]};
  const emitter: MeshBuilder={positions:[],normals:[],uvs:[],indices:[]};
  const hanging=id==='chandelier'||id==='pendant_light';
  appendBox(body,[0,.45,0],[hanging?.4:1,.1,hanging?.4:1],0);
  if(hanging) appendBox(body,[0,.1,0],[.05,.6,.05],0);
  if(id==='chandelier') {
    appendBox(body,[0,-.2,0],[1,.08,.1],0);
    appendBox(body,[0,-.2,0],[.1,.08,1],0);
    for(const [x,z] of [[-.35,-.35],[-.35,.35],[.35,-.35],[.35,.35]])appendBox(emitter,[x,-.35,z],[.3,.3,.3],0);
  } else appendBox(emitter,[0,hanging?-.3:-.05,0],[id==='recessed_light'?.75:1,hanging?.4:.9,id==='recessed_light'?.75:1],0);
  const ref=`builtin:${id}-v1`;
  return serializePresentationGlb([{...body,id:ref+':body',kind:'furniture',material:'lamp-body'},
    {...emitter,id:ref+':emitter',kind:'furniture',material:'lamp-emitter'}],{artifact:'runtime-asset',assetId:ref});
}

/** Reusable generic wall decoration, front +Z. Fit, mounting and collider size
 * remain compiler-owned and independent of this presentation geometry. */
export function compileWallDecorAsset(id:string){
  const frame:MeshBuilder={positions:[],normals:[],uvs:[],indices:[]},face:MeshBuilder={positions:[],normals:[],uvs:[],indices:[]};
  for(const x of [-.47,.47])appendBox(frame,[x,0,0],[.06,1,1],0);
  for(const y of [-.47,.47])appendBox(frame,[0,y,0],[.88,.06,1],0);
  appendBox(frame,[0,0,-.4],[.88,.88,.2],0);
  appendBox(face,[0,0,.3],[.88,.88,.2],0);
  const ref=`builtin:${id}-v1`;
  return serializePresentationGlb([{...frame,id:ref+':frame',kind:'furniture',material:'decor-frame'},
    {...face,id:ref+':face',kind:'furniture',material:id==='mirror'?'mirror-face':'wall-art'}],{artifact:'runtime-asset',assetId:ref});
}

/** Resolve only referenced assets. Source bytes remain immutable and are shared
 * by digest; native identity is preserved separately from storage filenames.
 * Missing sources are explicit diagnostics. Invalid retained sources fail export. */
export async function compileRuntimeAssets(project: Project, runtime: Plan2WorldRuntimeSceneV1, readCatalogAsset: ReadCatalogAsset) {
  const refs = [...new Set(runtime.entities.flatMap(entity =>
    entity.kind === 'furniture' ? [entity.assetRef] :
      entity.kind === 'door' && entity.interaction.kind !== 'none' ? entity.interaction.leaves.map(leaf => leaf.assetRef) : []))].sort();
  const manifest: RuntimeAssetManifest = { schema: 'plan2world-runtime-assets-v1', version: 1, assets: [] };
  const files = new Map<string, Uint8Array>();
  const diagnostics: RuntimeAssetDiagnostic[] = [];
  const catalogSources = new Map<string, Uint8Array | null>();
  for (const id of refs) {
    let bytes: Uint8Array | null = null;
    let reason: RuntimeAssetDiagnostic['reason'] = 'missing-source';
    if (id === 'builtin:door-leaf-v1') bytes = compileDefaultDoorAsset();
    else if (id === 'builtin:door-glass-leaf-v1') bytes = compileDefaultDoorAsset('glass');
    else if (id === 'builtin:door-steel-leaf-v1') bytes = compileDefaultDoorAsset('steel');
    else if (id.startsWith('builtin:') && id.endsWith('-v1') && needsCeilingMount(id.slice(8,-3))) bytes = compileCeilingLightAsset(id.slice(8,-3));
    else if (id.startsWith('builtin:') && id.endsWith('-v1') && hasBuiltinWallDecor(id.slice(8,-3))) bytes = compileWallDecorAsset(id.slice(8,-3));
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
