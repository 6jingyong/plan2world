import { expect, it } from 'vitest';
import type { Wall, Door, Window } from '$lib/models/types';
import { drawDoorOnWall, drawWindowOnWall } from '$lib/utils/canvasRenderer';
import { wallPathProfile } from '$lib/utils/wallPath';
import { projectOntoWall } from '$lib/utils/wallProjection';
import { findDoorAt, findWindowAt } from '$lib/utils/hitTesting';
import { pathOpening } from '$lib/utils/wallProfiles';

const wall: Wall = { id: 'arc', start: { x: 0, y: 0 }, end: { x: 600, y: 0 }, curvePoint: { x: 0, y: 600 }, thickness: 20, height: 280, color: '#fff' };
const profile = wallPathProfile(wall);
const aperture = { id: 'a', wallId: wall.id, position: profile.positionAt(profile.length / 2), width: profile.length, height: 280 };
function recorder() {
  const points: { x: number; y: number }[] = [], arcs: { x: number; y: number; r: number }[] = [];
  const ctx = { beginPath() {}, closePath() {}, stroke() {}, fill() {}, setLineDash() {},
    moveTo(x: number, y: number) { points.push({ x, y }); }, lineTo(x: number, y: number) { points.push({ x, y }); },
    arc(x: number, y: number, r: number) { arcs.push({ x, y, r }); } } as unknown as CanvasRenderingContext2D;
  return { points, arcs, cs: { ctx, width: 0, height: 0, zoom: 1, camX: 0, camY: 0 } };
}

it.each(['standard', 'fixed', 'sliding', 'casement', 'bay'] as const)('draws the whole %s window along its curved host instead of the midpoint tangent', type => {
  const result = recorder(), before = JSON.stringify(wall);
  drawWindowOnWall(result.cs, wall, { ...aperture, type, sillHeight: 0 });
  expect(result.points.length).toBeGreaterThan(32);
  // Independent analytic projection: even the widest bay decoration stays near
  // the host; the old midpoint tangent missed the ends by over 100cm.
  const maxOffset = type === 'bay' ? 17 : type === 'casement' ? 15 : 13;
  for (const p of result.points) expect(projectOntoWall(p, wall)!.distance).toBeLessThan(maxOffset);
  expect(result.points.some(p => Math.hypot(p.x, p.y) < 12)).toBe(true);
  expect(result.points.some(p => Math.hypot(p.x - 600, p.y) < 12)).toBe(true);
  expect(JSON.stringify(wall)).toBe(before);
});

it('selects the bent aperture near both ends and rejects the empty space on the old tangent', () => {
  const win = { ...aperture, type: 'standard', sillHeight: 0 } as Window;
  const door = { ...aperture, type: 'opening', swingDirection: 'left' } as Door;
  for (const t of [.05, .2, .8, .95]) {
    // Explicit quadratic observation points, independent of the renderer.
    const p = { x: 600 * t * t, y: 1200 * t * (1 - t) };
    expect(findWindowAt(p, [win], [wall], 2)).toBe(win);
    expect(findDoorAt(p, [door], [wall], 2)).toBe(door);
  }
  expect(findWindowAt({ x: 300, y: 0 }, [win], [wall], 2)).toBeNull();
});

it('draws a curved leafless threshold but keeps a hinged leaf rigid between the true jambs', () => {
  const result = recorder();
  drawDoorOnWall(result.cs, wall, { ...aperture, type: 'opening', swingDirection: 'left', flipSide: false });
  for (const p of result.points) expect(projectOntoWall(p, wall)!.distance).toBeLessThan(13);
  const hinged = recorder();
  drawDoorOnWall(hinged.cs, wall, { ...aperture, type: 'single', swingDirection: 'left', flipSide: false });
  expect(hinged.arcs.some(a => Math.abs(a.x - 600) < 1e-8 && Math.abs(a.y) < 1e-8 && Math.abs(a.r - 600) < 1e-8)).toBe(true);
});

it('keeps a five-screen-pixel end margin without adding the wall half-thickness to it', () => {
  const win = { ...aperture, type: 'standard', sillHeight: 0 } as Window;
  const last = profile.spans.at(-1)!, dx = last.end.x - last.start.x, dy = last.end.y - last.start.y;
  for (const zoom of [.25, 1, 4]) {
    const past = (pixels: number) => ({ x: last.end.x + dx / last.length * pixels / zoom, y: last.end.y + dy / last.length * pixels / zoom });
    expect(findWindowAt(past(4), [win], [wall], zoom)).toBe(win);
    expect(findWindowAt(past(6), [win], [wall], zoom)).toBeNull();
  }
});

it('clips intervals at real wall ends and removes only floating-point slivers in 3D/collision', () => {
  const full = pathOpening(profile, profile.length / 2, profile.length - 1e-12, 0, 280)!;
  expect(full.left).toBe(0); expect(full.right).toBe(profile.length);
  const visibleGap = pathOpening(profile, profile.length / 2, profile.length - .002, 0, 280)!;
  expect(visibleGap.left).toBeCloseTo(.001, 8);
  expect(visibleGap.right).toBeCloseTo(profile.length - .001, 8);
});
