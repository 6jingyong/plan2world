import { readFileSync, existsSync } from 'node:fs';
import { expect, it } from 'vitest';

it('keeps browser review free of the retired runtime controller and physics', () => {
  const viewer=readFileSync('src/lib/components/viewer3d/ThreeViewer.svelte','utf8');
  for(const retired of ['PointerLockControls','walkthroughMode','WalkthroughMotion','walkthroughCollision','requestPointerLock','sprintSpeed']) expect(viewer).not.toContain(retired);
  for(const retained of ['OrbitControls','sceneElementAt','assembleFloorStack','architecturalCutPlanes','cameraPreviewRenderer','createPlacedFurnitureModel']) expect(viewer).toContain(retained);
  expect(existsSync('src/lib/utils/walkthroughMotion.ts')).toBe(false);
  expect(existsSync('src/lib/utils/walkthroughCollision.ts')).toBe(false);
  const camera=readFileSync('src/lib/utils/floorCamera.ts','utf8');
  expect(camera).not.toContain('walkthroughStart');
});

it('keeps spawn derivation in compilation rather than inferring it in the engine', () => {
  const main=readFileSync('runtime/godot/scripts/main.gd','utf8');
  expect(main).not.toContain('centroid');
  expect(main).not.toContain('polygon');
  expect(main).toContain('walkthroughStart');
});
