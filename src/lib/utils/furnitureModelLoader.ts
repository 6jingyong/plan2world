/** Lightweight built-in furniture plus optional custom project models. */
import * as THREE from 'three';
import { createGamePieceFurnitureModel } from './gamePieceFurniture3d';
import { getCatalogItem, type FurnitureDef } from './furnitureCatalog';
import type { FurnitureItem, Project } from '$lib/models/types';
import { furnitureFinishes } from './furnitureFinishes';
import { disposeModel, isModelDisposed, releaseWithModel } from './furnitureModelResources';

export interface FurnitureAppearance { color?: string; material?: string; ghost?: boolean }

function applyAppearance(model: THREE.Group, appearance: FurnitureAppearance, tint: boolean) {
  const seen = new Set<THREE.Material>();
  model.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
      if (seen.has(material)) continue;
      seen.add(material);
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (tint && appearance.color) material.color.multiply(new THREE.Color(appearance.color));
      const finish = appearance.material && Object.hasOwn(furnitureFinishes, appearance.material) ? furnitureFinishes[appearance.material] : undefined;
      if (finish) {
        material.roughness = finish.roughness; material.metalness = finish.metalness;
        if (finish.opacity !== undefined) {
          material.opacity *= finish.opacity; material.transparent = true; material.depthWrite = false;
        }
      }
      if (appearance.ghost) {
        material.transparent = true; material.opacity *= 0.5; material.depthWrite = false;
        material.emissive.set(0x4488ff); material.emissiveIntensity = 0.3;
      }
    }
  });
}

/** Match the complete custom model's footprint, center it, and place its bottom at zero. */
export function fitFurnitureModel(model: THREE.Group, def: FurnitureDef) {
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  if ([size.x, size.y, size.z, def.width, def.height, def.depth].some(value => !Number.isFinite(value) || value <= 0)) {
    throw new Error('Furniture model has invalid dimensions.');
  }
  model.scale.multiply(new THREE.Vector3(def.width / size.x, def.height / size.y, def.depth / size.z));
  model.updateMatrixWorld(true);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  model.updateMatrixWorld(true);
}

/**
 * Compatibility entry point used by the 3D viewer and placement ghost.
 * Built-in catalog furniture is deliberately represented as a cheap game piece;
 * detailed catalog GLBs are no longer required by the default path.
 */
export function createFurnitureModelWithGLB(
  catalogId: string, def: FurnitureDef, _onLoaded?: (model: THREE.Group) => void,
  appearance: FurnitureAppearance = {},
): THREE.Group {
  const container = new THREE.Group();
  container.name = `furniture_${catalogId}`;
  const piece = createGamePieceFurnitureModel(def, { color: appearance.color });
  applyAppearance(piece, { material: appearance.material, ghost: appearance.ghost }, false);
  container.add(piece);
  return container;
}

/** Retain a game-piece fallback until a verified custom project source is ready. */
function createProjectFurniture(item: FurnitureItem, def: FurnitureDef, project?: Project, onLoaded?: (model: THREE.Group) => void) {
  const container = new THREE.Group();
  container.name = `furniture_${item.customModelId}`;
  const appearance = { color: item.color, material: item.material };
  const fallback = createGamePieceFurnitureModel(def, { color: item.color });
  applyAppearance(fallback, { material: item.material }, false);
  container.add(fallback);
  if (!project) return container;
  void import('$lib/services/customModelResources').then(async ({ acquireCustomModel }) => {
    if (isModelDisposed(container)) return;
    const lease = acquireCustomModel(project, item.customModelId!);
    releaseWithModel(container, lease.release);
    try {
      const model = await lease.model;
      if (!model) return;
      if (isModelDisposed(container)) { disposeModel(model); return; }
      try { fitFurnitureModel(model, def); applyAppearance(model, appearance, true); }
      catch { disposeModel(model); lease.release(); return; }
      container.remove(fallback); disposeModel(fallback); container.add(model);
      try { onLoaded?.(container); }
      catch (error) { console.warn('[FurnitureLoader] Custom model redraw failed:', error); }
    } catch (error) {
      lease.release();
      if (!isModelDisposed(container)) console.warn('[FurnitureLoader] Custom model unavailable:', error);
    }
  }).catch(error => {
    if (!isModelDisposed(container)) console.warn('[FurnitureLoader] Custom model loader unavailable:', error);
  });
  return container;
}

/** Build a saved item even when its original catalog is unavailable. */
export function createPlacedFurnitureModel(item: FurnitureItem, onLoaded?: (model: THREE.Group) => void, project?: Project): THREE.Group | null {
  const catalog = getCatalogItem(item.catalogId);
  const custom = project?.customModels?.find(model => model.id === item.customModelId);
  if (catalog?.symbol && !item.customModelId) return null;
  const definition: FurnitureDef = {
    id: item.catalogId, name: custom?.name ?? 'Unknown furniture', category: 'Unknown', icon: '🪑',
    ...catalog,
    width: item.width ?? custom?.width ?? catalog?.width ?? 50,
    depth: item.depth ?? custom?.depth ?? catalog?.depth ?? 50,
    height: item.height ?? custom?.height ?? catalog?.height ?? 50,
    color: item.color ?? catalog?.color ?? '#888888',
  };
  const model = item.customModelId
    ? createProjectFurniture(item, definition, project, onLoaded)
    : createFurnitureModelWithGLB(item.catalogId, definition, onLoaded, {
      color: item.color, material: item.material,
    });
  model.position.set(item.position.x, 1.5, item.position.y);
  model.rotation.y = -item.rotation * Math.PI / 180;
  // The plan's Y scale is world Z; height uses the saved Z magnitude.
  model.scale.set(item.scale?.x ?? 1, Math.abs(item.scale?.z ?? 1), item.scale?.y ?? 1);
  return model;
}
