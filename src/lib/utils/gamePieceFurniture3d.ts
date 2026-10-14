import * as THREE from 'three';
import type { FurnitureDef } from './furnitureCatalog';

export interface GamePieceAppearance {
  color?: string;
  ghost?: boolean;
}

function material(color: string, ghost = false) {
  const value = new THREE.Color(color);
  return new THREE.MeshStandardMaterial({
    color: value,
    roughness: 0.72,
    metalness: 0.02,
    transparent: ghost,
    opacity: ghost ? 0.48 : 1,
    depthWrite: !ghost,
    emissive: ghost ? new THREE.Color(0x4488ff) : new THREE.Color(0x000000),
    emissiveIntensity: ghost ? 0.24 : 0,
  });
}

/**
 * Deliberately game-like furniture representation.
 *
 * The footprint is authoritative: width × depth always matches the catalog item.
 * Height is only a readability cue, not a photorealistic reconstruction. This keeps
 * the scene cheap and makes furniture behave like colored board-game pieces while
 * preserving the plan-space information used by placement, snapping and exports.
 */
export function createGamePieceFurnitureModel(
  def: FurnitureDef,
  appearance: GamePieceAppearance = {},
): THREE.Group {
  const group = new THREE.Group();
  group.name = `game_piece_${def.id}`;
  group.userData.gamePiece = true;
  group.userData.footprint = { width: def.width, depth: def.depth };

  const color = appearance.color ?? def.color ?? '#888888';
  const baseHeight = Math.min(10, Math.max(5, Math.min(def.width, def.depth) * 0.08));
  const visualHeight = Math.max(baseHeight + 8, Math.min(60, def.height * 0.3));

  // Full-footprint base keeps the spatial extent exact even when the upper token
  // is inset for readability.
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(def.width, baseHeight, def.depth),
    material(color, appearance.ghost),
  );
  base.name = 'piece-footprint';
  base.position.y = baseHeight / 2;
  base.castShadow = !appearance.ghost;
  base.receiveShadow = true;
  group.add(base);

  const insetX = Math.max(8, def.width * 0.12);
  const insetZ = Math.max(8, def.depth * 0.12);
  const bodyWidth = Math.max(4, def.width - insetX * 2);
  const bodyDepth = Math.max(4, def.depth - insetZ * 2);
  const bodyHeight = Math.max(4, visualHeight - baseHeight);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth),
    material(color, appearance.ghost),
  );
  body.name = 'piece-body';
  body.position.y = baseHeight + bodyHeight / 2;
  body.castShadow = !appearance.ghost;
  body.receiveShadow = true;
  group.add(body);

  // A small neutral front marker makes rotation legible even for square pieces.
  const markerWidth = Math.max(6, Math.min(def.width * 0.28, 34));
  const markerDepth = Math.max(2, Math.min(def.depth * 0.05, 5));
  const markerHeight = Math.max(2, Math.min(baseHeight * 0.45, 4));
  const ghost = Boolean(appearance.ghost);
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: ghost ? 0xcfe2ff : 0xf8fafc,
    roughness: 0.8,
    transparent: ghost,
    opacity: ghost ? 0.58 : 0.9,
    depthWrite: !ghost,
  });
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(markerWidth, markerHeight, markerDepth),
    markerMaterial,
  );
  marker.name = 'piece-front';
  marker.position.set(0, baseHeight + markerHeight / 2 + 0.5, -def.depth / 2 + markerDepth / 2 + 0.5);
  group.add(marker);

  return group;
}
