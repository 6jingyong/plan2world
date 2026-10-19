import { describe, expect, it } from 'vitest';
import { draftToProject } from '$lib/plan2world/draft';
import { deriveSourceOpenings } from '$lib/plan2world/sourceOpenings';
import { buildBareHouse, SOURCE_WALL_TRACE_VERSION } from '$lib/plan2world/bareHouse';
import { planOpening, planWallSpans } from '$lib/utils/planOpening';

// Declared geometry fixture. Model-facing evidence carries no application IDs.
function enclosedAnnex(curved: boolean) {
  const wallEvidence = [
    { start: { x: 0, y: 0 }, end: { x: 400, y: 0 } },
    { start: { x: 400, y: 0 }, end: { x: 400, y: 300 } },
    { start: { x: 400, y: 300 }, end: { x: 0, y: 300 } },
    { start: { x: 0, y: 300 }, end: { x: 0, y: 0 } },
    { start: { x: 400, y: 0 }, end: { x: 550, y: 0 } },
    { start: { x: 550, y: 0 }, end: { x: 550, y: 300 },
      ...(curved ? { curvePoint: { x: 650, y: 100 } } : {}) },
    { start: { x: 550, y: 300 }, end: { x: 400, y: 300 } },
  ];
  const bareHouse = buildBareHouse({ schemaVersion: SOURCE_WALL_TRACE_VERSION, walls: wallEvidence });
  const openings = wallEvidence.slice(4).map((wall, index) => ({
    id: `win${index + 1}`,
    kind: 'window' as const,
    endpoints: [wall.start, wall.end],
    evidence: 'Observed full-side glazing on the source boundary.',
  }));
  const windows = deriveSourceOpenings({ cmPerPixel: 1, bareHouse, openings }).windows;
  return {
    schemaVersion: 'plan2world-draft-v1', presentation: 'semantic-white-model',
    furnitureVocabulary: 'plan2world-furniture-v1', name: 'Declared annex enclosure', units: 'cm',
    scale: { mode: 'provided', confidence: 1, basis: 'Synthetic dimensions in cm' },
    assumptions: ['Synthetic fixture: three source-observed glazed sides.'],
    floors: [{
      id: 'f0', name: 'Floor', level: 0,
      walls: bareHouse.walls,
      windows,
      doors: [{ id: 'access', wallId: 'w2', position: .5, width: 90, type: 'single' }],
      furniture: [],
    }],
  };
}

describe('declared annex enclosure through existing draft conversion', () => {
  it.each([false, true])('keeps two rooms and full-path glazing (curved=%s)', curved => {
    const input = enclosedAnnex(curved), before = JSON.stringify(input);
    const floor = draftToProject(input).floors[0];
    expect(JSON.stringify(input)).toBe(before);
    expect(floor.walls).toHaveLength(7); // the house/annex separator is shared once
    expect(floor.rooms).toHaveLength(2);
    expect(floor.rooms.every(room => !room.boundary)).toBe(true);
    expect(floor.rooms.map(room => room.area)).toContain(12);
    expect(floor.doors[0]).toMatchObject({ wallId: 'w2', width: 90 });
    expect(floor.windows).toHaveLength(3);
    for (const window of floor.windows) {
      const wall = floor.walls.find(wall => wall.id === window.wallId)!;
      expect(window).toMatchObject({ sillHeight: 0, height: wall.height, type: 'fixed' });
      expect(wall.thickness).toBeGreaterThan(0);
      const aperture = planOpening(wall, window.position, window.width)!;
      expect(planWallSpans(wall, [window])).toEqual([]);
      expect(aperture.wall.start.x).toBeCloseTo(wall.start.x, 7);
      expect(aperture.wall.start.y).toBeCloseTo(wall.start.y, 7);
      expect(aperture.wall.end.x).toBeCloseTo(wall.end.x, 7);
      expect(aperture.wall.end.y).toBeCloseTo(wall.end.y, 7);
      if (wall.curvePoint) {
        expect(aperture.curve).toBeDefined();
        expect(window.width).toBeGreaterThan(300);
      }
    }
  });
});
