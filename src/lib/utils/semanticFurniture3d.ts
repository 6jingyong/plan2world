import * as THREE from 'three';
import type { FurnitureDef } from './furnitureCatalog';
import { ownTexture } from './furnitureModelResources';

/** A source-derived occupancy block. Styling never defines its footprint. */
export function createSemanticFurnitureBlock(def: FurnitureDef, category: string): THREE.Group {
  const group = new THREE.Group();
  group.name = 'semantic-furniture';
  group.userData.sourceCategory = category;
  const body = new THREE.Mesh(new THREE.BoxGeometry(def.width, def.height, def.depth),
    new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.8 }));
  body.name = 'semantic-block';
  body.position.y = def.height / 2;
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = 'rgba(15,23,42,0.85)'; context.fillRect(0, 0, 512, 96);
      context.fillStyle = '#ffffff'; context.font = '36px sans-serif';
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(category, 256, 48, 480);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: ownTexture(new THREE.CanvasTexture(canvas)), transparent: true }));
      label.name = 'semantic-label';
      const width = Math.min(160, Math.max(60, def.width)); label.scale.set(width, width * 96 / 512, 1);
      label.position.y = def.height + 16;
      group.add(label);
    }
  }
  return group;
}
