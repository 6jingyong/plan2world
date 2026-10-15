import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import type { Door, Floor, FurnitureItem, Wall, Window } from '../src/lib/models/types';
import {
  createWalkthroughCollisionWorld,
  resolveWalkthroughMove,
  type WalkthroughCollisionWorld,
} from '../src/lib/utils/walkthroughCollision';
import { WalkthroughMotion } from '../src/lib/utils/walkthroughMotion';

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

function move(world: WalkthroughCollisionWorld, start: { x: number; y: number }, delta: { x: number; y: number }, radius = 20) {
  return resolveWalkthroughMove(start, delta, world, radius);
}

describe('walkthrough collision', () => {
  it('preserves free movement when there are no plan obstacles', () => {
    expect(move({ obstacles: [] }, { x: 5, y: 7 }, { x: 20, y: -3 })).toEqual({ x: 25, y: 4 });
  });

  it('blocks a player from crossing a solid wall even with a large movement delta', () => {
    const world = createWalkthroughCollisionWorld(floorWith({ walls: [wall()] }));
    const result = move(world, { x: 0, y: -100 }, { x: 0, y: 220 });
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeLessThanOrEqual(-30 + 1e-4); // 10 cm half-wall + 20 cm player
  });

  it('slides along a wall instead of cancelling diagonal movement', () => {
    const world = createWalkthroughCollisionWorld(floorWith({ walls: [wall()] }));
    const result = move(world, { x: -120, y: -60 }, { x: 200, y: 80 });
    expect(result.x).toBeGreaterThan(60);
    expect(result.y).toBeCloseTo(-30, 3);
  });

  it('cuts door openings out of wall collision and lets a player pass through', () => {
    const world = createWalkthroughCollisionWorld(floorWith({ walls: [wall()], doors: [door(100)] }));
    const result = move(world, { x: 0, y: -100 }, { x: 0, y: 220 });
    expect(result.y).toBeGreaterThan(100);
  });

  it('keeps windows blocking because they are not walk-through openings', () => {
    const world = createWalkthroughCollisionWorld(floorWith({ walls: [wall()], windows: [windowOpening()] }));
    const result = move(world, { x: 0, y: -100 }, { x: 0, y: 220 });
    expect(result.y).toBeLessThan(0);
  });

  it('does not allow a circular player through a doorway narrower than its diameter', () => {
    const world = createWalkthroughCollisionWorld(floorWith({ walls: [wall()], doors: [door(30)] }));
    const result = move(world, { x: 0, y: -100 }, { x: 0, y: 220 });
    expect(result.y).toBeLessThan(0);
  });

  it('blocks against furniture footprint including rotation and item scale', () => {
    const furniture: FurnitureItem = {
      id: 'sofa', catalogId: 'sofa', position: { x: 0, y: 0 }, rotation: 90,
      scale: { x: 0.5, y: 1, z: 1 },
    };
    const world = createWalkthroughCollisionWorld(floorWith({ furniture: [furniture] }));
    const result = move(world, { x: -120, y: 0 }, { x: 240, y: 0 });
    // Rotated sofa has 90 cm along plan X; player centre must stay 20 cm outside it.
    expect(result.x).toBeLessThanOrEqual(-65 + 1e-3);
  });

  it('treats flat rugs and 2D symbols as non-blocking', () => {
    const furniture: FurnitureItem[] = [
      { id: 'rug', catalogId: 'rug', position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1, z: 1 } },
      { id: 'outlet', catalogId: 'sym_outlet', position: { x: 100, y: 0 }, rotation: 0, scale: { x: 1, y: 1, z: 1 } },
    ];
    const world = createWalkthroughCollisionWorld(floorWith({ furniture }));
    expect(world.obstacles.filter(item => item.kind === 'furniture')).toHaveLength(0);
    expect(move(world, { x: -200, y: 0 }, { x: 400, y: 0 }).x).toBe(200);
  });

  it('facets curved walls into collision obstacles', () => {
    const curved = { ...wall(), curvePoint: { x: 0, y: 120 } };
    const world = createWalkthroughCollisionWorld(floorWith({ walls: [curved] }));
    expect(world.obstacles.filter(item => item.kind === 'wall').length).toBeGreaterThan(8);
  });

  it('integrates collision into WalkthroughMotion without changing eye height', () => {
    const collisionWorld = createWalkthroughCollisionWorld(floorWith({
      walls: [wall('wall', { x: -200, y: -40 }, { x: 200, y: -40 })],
    }));
    const motion = new WalkthroughMotion();
    const camera = new PerspectiveCamera();
    camera.position.set(0, 0, 0);
    motion.setKey('ArrowUp', true);
    const settings = {
      moveSpeed: 800, sprintSpeed: 1600, eyeHeight: 160, floorElevation: 20,
      collisionWorld, playerRadius: 20,
    };
    motion.advance(0, camera, settings);
    for (let frame = 1; frame <= 120; frame++) motion.advance(frame * 1000 / 120, camera, settings);
    expect(camera.position.z).toBeGreaterThanOrEqual(-10 - 1e-3); // wall near face -30, player radius 20
    expect(camera.position.y).toBe(180);
  });
});
