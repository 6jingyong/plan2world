import type { Floor, Point } from '$lib/models/types';
import { getFurnitureSize, getCatalogItem } from './furnitureCatalog';
import { wallProfileSpans } from './wallProfiles';

/** Matches the viewer's minimum rendered wall thickness. */
export const WALKTHROUGH_MIN_WALL_THICKNESS = 15;
export const DEFAULT_WALKTHROUGH_PLAYER_RADIUS = 28;

export interface WalkthroughObstacle {
  id: string;
  center: Point;
  halfWidth: number;
  halfDepth: number;
  /** Clockwise degrees in plan coordinates (x right, y down). */
  rotation: number;
  kind: 'wall' | 'furniture';
}

export interface WalkthroughCollisionWorld {
  obstacles: WalkthroughObstacle[];
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function wallObstacles(floor: Floor): WalkthroughObstacle[] {
  const result: WalkthroughObstacle[] = [];
  for (const wall of floor.walls) {
    const doors = floor.doors.filter(door => door.wallId === wall.id);
    for (const span of wallProfileSpans(wall, doors, [])) {
      if (!finitePositive(span.length)) continue;
      const dx = span.end.x - span.start.x;
      const dy = span.end.y - span.start.y;
      const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
      const thickness = Math.max(WALKTHROUGH_MIN_WALL_THICKNESS, wall.thickness);

      // wallProfileSpans includes a header above each door opening. Only segments
      // that reach the floor should block a walking player.
      for (let index = 0; index < span.segments.length; index++) {
        const segment = span.segments[index];
        if (segment.bottomY > 1e-6 || !finitePositive(segment.width)) continue;
        const left = segment.offsetX - segment.width / 2;
        const right = segment.offsetX + segment.width / 2;
        const startT = Math.max(0, Math.min(1, left / span.length));
        const endT = Math.max(0, Math.min(1, right / span.length));
        const x1 = span.start.x + dx * startT;
        const y1 = span.start.y + dy * startT;
        const x2 = span.start.x + dx * endT;
        const y2 = span.start.y + dy * endT;
        const width = Math.hypot(x2 - x1, y2 - y1);
        if (!finitePositive(width)) continue;
        result.push({
          id: `wall:${wall.id}:${result.length}:${index}`,
          center: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
          halfWidth: width / 2,
          halfDepth: thickness / 2,
          rotation,
          kind: 'wall',
        });
      }
    }
  }
  return result;
}

function furnitureObstacles(floor: Floor): WalkthroughObstacle[] {
  return floor.furniture.flatMap(item => {
    const catalog = getCatalogItem(item.catalogId);
    if (catalog?.symbol) return [];
    const size = getFurnitureSize(item);
    // Rugs, floor finishes, recessed/ceiling tokens and similarly flat items are
    // visual surfaces rather than walking obstacles.
    if (!finitePositive(size.width) || !finitePositive(size.depth) || !Number.isFinite(size.height) || size.height < 20) return [];
    return [{
      id: `furniture:${item.id}`,
      center: { ...item.position },
      halfWidth: size.width / 2,
      halfDepth: size.depth / 2,
      rotation: Number.isFinite(item.rotation) ? item.rotation : 0,
      kind: 'furniture' as const,
    }];
  });
}

export function createWalkthroughCollisionWorld(floor: Floor): WalkthroughCollisionWorld {
  return { obstacles: [...wallObstacles(floor), ...furnitureObstacles(floor)] };
}

interface Correction { x: number; y: number; penetration: number }

/** Exact circle-vs-oriented-rectangle depenetration in plan coordinates. */
function circleObstacleCorrection(point: Point, radius: number, obstacle: WalkthroughObstacle): Correction | null {
  const angle = obstacle.rotation * Math.PI / 180;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = point.x - obstacle.center.x;
  const dy = point.y - obstacle.center.y;
  // Inverse of the plan-space clockwise rotation.
  const lx = cos * dx + sin * dy;
  const ly = -sin * dx + cos * dy;
  const nx = Math.max(-obstacle.halfWidth, Math.min(obstacle.halfWidth, lx));
  const ny = Math.max(-obstacle.halfDepth, Math.min(obstacle.halfDepth, ly));
  const ox = lx - nx, oy = ly - ny;
  const distSq = ox * ox + oy * oy;
  if (distSq >= radius * radius) return null;

  let localX: number, localY: number, penetration: number;
  if (distSq > 1e-12) {
    const distance = Math.sqrt(distSq);
    localX = ox / distance;
    localY = oy / distance;
    penetration = radius - distance;
  } else {
    // Circle centre lies inside the rectangle. Push toward the nearest face,
    // including the player's radius, rather than choosing an arbitrary diagonal.
    const toLeft = lx + obstacle.halfWidth;
    const toRight = obstacle.halfWidth - lx;
    const toTop = ly + obstacle.halfDepth;
    const toBottom = obstacle.halfDepth - ly;
    const nearest = Math.min(toLeft, toRight, toTop, toBottom);
    if (nearest === toLeft) { localX = -1; localY = 0; }
    else if (nearest === toRight) { localX = 1; localY = 0; }
    else if (nearest === toTop) { localX = 0; localY = -1; }
    else { localX = 0; localY = 1; }
    penetration = radius + nearest;
  }

  return {
    x: (cos * localX - sin * localY) * penetration,
    y: (sin * localX + cos * localY) * penetration,
    penetration,
  };
}

function depenetrate(point: Point, world: WalkthroughCollisionWorld, radius: number): Point {
  let next = { ...point };
  // Multiple passes handle corners and overlapping wall facets without a physics engine.
  for (let pass = 0; pass < 6; pass++) {
    let best: Correction | null = null;
    for (const obstacle of world.obstacles) {
      const correction = circleObstacleCorrection(next, radius, obstacle);
      if (correction && (!best || correction.penetration > best.penetration)) best = correction;
    }
    if (!best) break;
    next = {
      x: next.x + best.x + Math.sign(best.x) * 1e-6,
      y: next.y + best.y + Math.sign(best.y) * 1e-6,
    };
  }
  return next;
}

/** Place the player at the requested point, nudging it out of walls/furniture if necessary. */
export function resolveWalkthroughStart(
  point: Point,
  world: WalkthroughCollisionWorld,
  radius = DEFAULT_WALKTHROUGH_PLAYER_RADIUS,
): Point {
  if (![point.x, point.y, radius].every(Number.isFinite) || radius <= 0) return { ...point };
  if (!world.obstacles.length) return { ...point };
  return depenetrate(point, world, radius);
}

/**
 * Move a circular player through plan-space rectangles. Small deterministic
 * substeps prevent tunnelling; depenetration removes only the inward component,
 * so diagonal motion naturally continues along a wall.
 */
export function resolveWalkthroughMove(
  start: Point,
  delta: Point,
  world: WalkthroughCollisionWorld,
  radius = DEFAULT_WALKTHROUGH_PLAYER_RADIUS,
): Point {
  if (![start.x, start.y, delta.x, delta.y, radius].every(Number.isFinite) || radius <= 0) return { ...start };
  if (!world.obstacles.length || (!delta.x && !delta.y)) return { x: start.x + delta.x, y: start.y + delta.y };
  const distance = Math.hypot(delta.x, delta.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(4, Math.min(10, radius / 2))));
  const step = { x: delta.x / steps, y: delta.y / steps };
  let current = depenetrate(start, world, radius);
  for (let i = 0; i < steps; i++) {
    current = depenetrate({ x: current.x + step.x, y: current.y + step.y }, world, radius);
  }
  return current;
}
