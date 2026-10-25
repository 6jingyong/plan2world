import { expect, it } from 'vitest';
import { get } from 'svelte/store';
import { PerspectiveCamera } from 'three';
import { activeFloor, createDefaultProject, loadProject, undo } from '$lib/stores/project';
import { clearRuntimeStart, setRuntimeStart, setRuntimeEntrance } from '$lib/stores/runtimeStart';
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

it('persists an explicitly selected entrance and clears or overrides it through authoring', () => {
  const project=createDefaultProject('Entrance');
  project.floors[0].walls.push({id:'host',start:{x:0,y:0},end:{x:500,y:0},thickness:20,height:280,color:'#ccc'});
  project.floors[0].doors.push({id:'entry',wallId:'host',position:.5,width:100,height:210,type:'single',swingDirection:'left',flipSide:false});
  loadProject(project);
  setRuntimeEntrance('entry','right');
  expect(get(activeFloor)?.entrance).toEqual({doorId:'entry',side:'right'});
  clearRuntimeStart(); expect(get(activeFloor)?.entrance).toBeUndefined();
  undo(); expect(get(activeFloor)?.entrance?.doorId).toBe('entry');
  setRuntimeStart({x:100,y:100}); expect(get(activeFloor)?.entrance).toBeUndefined();
});
