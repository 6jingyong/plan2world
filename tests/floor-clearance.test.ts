import { describe, expect, it } from 'vitest';
import type { Door, Floor, FurnitureItem, Wall, Window } from '$lib/models/types';
import { buildFloorClearance, resolveClearancePoint, hasClearanceAlongSegment } from '$lib/utils/floorClearance';

function floorWith(options: {
  walls?: Wall[];
  doors?: Door[];
  windows?: Window[];
  furniture?: FurnitureItem[];
} = {}): Floor {
  return {
    id: 'floor', name: 'Ground Floor', level: 0,
    walls: options.walls ?? [], rooms: [], doors: options.doors ?? [], windows: options.windows ?? [],
    furniture: options.furniture ?? [], stairs: [], columns: [], guides: [], measurements: [],
    annotations: [], textAnnotations: [], groups: [],
  };
}

function wall(id = 'wall', start = { x: -200, y: 0 }, end = { x: 200, y: 0 }): Wall {
  return { id, start, end, thickness: 20, height: 280, color: '#444444' };
}

function door(width = 100): Door {
  return { id: 'door', wallId: 'wall', position: 0.5, width, height: 210, type: 'single', swingDirection: 'left', flipSide: false };
}

function windowOpening(width = 100): Window {
  return { id: 'window', wallId: 'wall', position: 0.5, width, height: 120, sillHeight: 90, type: 'standard' };
}


describe('offline floor-plan clearance', () => {
  it('preserves free authoring points and clear segments', () => {
    const world = buildFloorClearance(floorWith());
    expect(resolveClearancePoint({x:50,y:-100},world)).toEqual({x:50,y:-100});
    expect(hasClearanceAlongSegment({x:0,y:0},{x:200,y:100},world)).toBe(true);
  });
  it('resolves a point inside a wall by its requested probe radius', () => {
    const world = buildFloorClearance(floorWith({walls:[wall()]}));
    const point = resolveClearancePoint({x:0,y:0},world,20);
    expect(Math.abs(point.y)).toBeGreaterThanOrEqual(30);
    expect(hasClearanceAlongSegment({x:0,y:-100},{x:0,y:100},world,20)).toBe(false);
  });
  it('keeps door thresholds clear, narrow thresholds blocked and windows opaque to the connectivity audit', () => {
    const a={x:0,y:-100},b={x:0,y:100};
    expect(hasClearanceAlongSegment(a,b,buildFloorClearance(floorWith({walls:[wall()],doors:[door(100)]})))).toBe(true);
    expect(hasClearanceAlongSegment(a,b,buildFloorClearance(floorWith({walls:[wall()],doors:[door(30)]})))).toBe(false);
    expect(hasClearanceAlongSegment(a,b,buildFloorClearance(floorWith({walls:[wall()],windows:[windowOpening()]})))).toBe(false);
  });
  it('uses effective rotated/scaled furniture footprints without runtime motion', () => {
    const item: FurnitureItem={id:'sofa',catalogId:'sofa',position:{x:0,y:0},rotation:90,scale:{x:0.5,y:1,z:1}};
    const world=buildFloorClearance(floorWith({furniture:[item]}));
    expect(world.obstacles[0]).toMatchObject({halfWidth:50,halfDepth:45,rotation:90});
    const point=resolveClearancePoint({x:0,y:0},world,20);
    expect(point).not.toEqual({x:0,y:0});
    expect(hasClearanceAlongSegment({x:-120,y:0},{x:120,y:0},world)).toBe(false);
  });
  it('ignores flat furniture and 2D symbols but facets real curved boundaries', () => {
    const furniture: FurnitureItem[]=['rug','sym_outlet'].map(catalogId=>({id:catalogId,catalogId,position:{x:0,y:0},rotation:0,scale:{x:1,y:1,z:1}}));
    expect(buildFloorClearance(floorWith({furniture})).obstacles).toHaveLength(0);
    expect(buildFloorClearance(floorWith({walls:[{...wall(),curvePoint:{x:0,y:120}}]})).obstacles.length).toBeGreaterThan(8);
  });
});
