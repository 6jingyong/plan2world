import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { PerspectiveCamera, Vector3 } from 'three';
import { activeFloor, createDefaultProject, loadProject, undo } from '$lib/stores/project';
import { clearWalkthroughStart, setWalkthroughStart } from '$lib/stores/walkthroughStart';
import { setFloorCameraPose } from '$lib/utils/floorCamera';

function expectDirection(camera: PerspectiveCamera, expected: { x: number; y: number; z: number }) {
  const direction = camera.getWorldDirection(new Vector3());
  expect(direction.x).toBeCloseTo(expected.x, 8);
  expect(direction.y).toBeCloseTo(expected.y, 8);
  expect(direction.z).toBeCloseTo(expected.z, 8);
}

describe('walkthrough start', () => {
  it('persists one floor-local point and makes the edit undoable', () => {
    loadProject(createDefaultProject('Start test'));
    expect(get(activeFloor)?.walkthroughStart).toBeUndefined();

    expect(setWalkthroughStart({ x: 123, y: 456 })).toEqual({ x: 123, y: 456 });
    expect(get(activeFloor)?.walkthroughStart).toEqual({ x: 123, y: 456 });

    undo();
    expect(get(activeFloor)?.walkthroughStart).toBeUndefined();
  });

  it('substitutes the saved point only for the existing first-person entry pose', () => {
    loadProject(createDefaultProject('Camera start test'));
    setWalkthroughStart({ x: 123, y: 456 });
    const camera = new PerspectiveCamera();

    // ThreeViewer enters walkthrough looking exactly 100 cm along local -Z.
    setFloorCameraPose(camera, 300,
      { x: 0, y: 160, z: 0 },
      { x: 0, y: 160, z: -100 });
    expect(camera.position.x).toBeCloseTo(123, 8);
    expect(camera.position.y).toBeCloseTo(460, 8);
    expect(camera.position.z).toBeCloseTo(456, 8);
    expectDirection(camera, { x: 0, y: 0, z: -1 });

    // Interior photo cameras use a 500 cm look vector and must stay untouched.
    setFloorCameraPose(camera, 300,
      { x: 10, y: 160, z: 20 },
      { x: 10, y: 160, z: -480 });
    expect(camera.position.x).toBeCloseTo(10, 8);
    expect(camera.position.y).toBeCloseTo(460, 8);
    expect(camera.position.z).toBeCloseTo(20, 8);
    expectDirection(camera, { x: 0, y: 0, z: -1 });
  });

  it('clearing the saved point restores automatic caller-provided placement', () => {
    loadProject(createDefaultProject('Clear start test'));
    setWalkthroughStart({ x: 80, y: 90 });
    clearWalkthroughStart();
    expect(get(activeFloor)?.walkthroughStart).toBeUndefined();

    const camera = new PerspectiveCamera();
    setFloorCameraPose(camera, 0,
      { x: 20, y: 160, z: 30 },
      { x: 20, y: 160, z: -70 });
    expect(camera.position.x).toBeCloseTo(20, 8);
    expect(camera.position.y).toBeCloseTo(160, 8);
    expect(camera.position.z).toBeCloseTo(30, 8);
  });
});
