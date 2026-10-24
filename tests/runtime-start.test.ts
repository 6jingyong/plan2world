import { expect, it } from 'vitest';
import { get } from 'svelte/store';
import { PerspectiveCamera } from 'three';
import { activeFloor, createDefaultProject, loadProject, undo } from '$lib/stores/project';
import { clearRuntimeStart, setRuntimeStart } from '$lib/stores/runtimeStart';
import { setFloorCameraPose } from '$lib/utils/floorCamera';

it('keeps native runtime spawn editing and clearing undoable', () => {
  loadProject(createDefaultProject('Runtime spawn'));
  expect(setRuntimeStart({x:123,y:456})).toEqual({x:123,y:456});
  expect(get(activeFloor)?.walkthroughStart).toEqual({x:123,y:456});
  undo(); expect(get(activeFloor)?.walkthroughStart).toBeUndefined();
  setRuntimeStart({x:80,y:90}); clearRuntimeStart();
  expect(get(activeFloor)?.walkthroughStart).toBeUndefined();
  undo(); expect(get(activeFloor)?.walkthroughStart).toEqual({x:80,y:90});
});
it('does not substitute runtime spawn into review or photo camera poses', () => {
  loadProject(createDefaultProject('Review camera'));
  setRuntimeStart({x:123,y:456});
  const camera=new PerspectiveCamera();
  setFloorCameraPose(camera,300,{x:10,y:160,z:20},{x:10,y:160,z:-80});
  expect(camera.position.toArray()).toEqual([10,460,20]);
  expect(get(activeFloor)?.walkthroughStart).toEqual({x:123,y:456});
});
it('rejects invalid spawn edits without changing native Project', () => {
  loadProject(createDefaultProject('Invalid spawn'));
  expect(setRuntimeStart({x:NaN,y:0})).toBeUndefined();
  expect(get(activeFloor)?.walkthroughStart).toBeUndefined();
});
