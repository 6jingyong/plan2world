import { describe, expect, it } from 'vitest';
import type { Door, Wall } from '$lib/models/types';
import { draftToProject, parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { inspectPlan2WorldDraftGeometry } from '$lib/plan2world/geometryHealth';
import { calibratePlan2WorldDraft, summarizePlan2WorldDraft } from '$lib/plan2world/review';
import { doorPanelPose } from '$lib/utils/wallProfiles';

function curvedRoomDraft() {
  return {
    schemaVersion: 'plan2world-draft-v1',
    name: 'Curved room',
    units: 'cm',
    scale: { mode: 'measured', confidence: 1, basis: '400 cm top wall' },
    floors: [{
      id: 'floor-0',
      name: 'Ground Floor',
      level: 0,
      walls: [
        { id: 'top', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, kind: 'exterior' },
        { id: 'right', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, kind: 'exterior' },
        {
          id: 'curve',
          start: { x: 400, y: 300 },
          end: { x: 0, y: 300 },
          curvePoint: { x: 200, y: 500 },
          kind: 'exterior',
        },
        { id: 'left', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, kind: 'exterior' },
      ],
      doors: [],
      windows: [],
      furniture: [],
    }],
  };
}

describe('Plan2World curved draft walls', () => {
  it('parses curvePoint, preserves it in the native wall, and resolves the curved room', () => {
    const parsed = parsePlan2WorldDraft(curvedRoomDraft());
    expect(parsed.floors[0].walls[2].curvePoint).toEqual({ x: 200, y: 500 });

    const project = draftToProject(parsed, new Date('2026-10-15T00:00:00Z'));
    expect(project.floors[0].walls[2].curvePoint).toEqual({ x: 200, y: 500 });
    expect(project.floors[0].rooms).toHaveLength(1);
    expect(project.floors[0].rooms[0].area).toBeGreaterThan(12);
  });

  it('includes the quadratic bulge in review bounds and scales its control point during calibration', () => {
    const summary = summarizePlan2WorldDraft(curvedRoomDraft());
    expect(summary.primaryExtent).toEqual({ width: 400, depth: 400 });

    const calibrated = calibratePlan2WorldDraft(curvedRoomDraft(), 400, 200);
    expect(calibrated.floors[0].walls[2].curvePoint).toEqual({ x: 100, y: 250 });
    expect(summarizePlan2WorldDraft(calibrated).primaryExtent).toEqual({ width: 200, depth: 200 });
  });

  it('uses curved path distance when checking whether an opening fits near a wall end', () => {
    const input = {
      schemaVersion: 'plan2world-draft-v1',
      name: 'Curved opening',
      units: 'cm',
      scale: { mode: 'measured', confidence: 1 },
      floors: [{
        id: 'floor-0', name: 'Floor', level: 0,
        walls: [{ id: 'curve', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, curvePoint: { x: 200, y: 300 } }],
        doors: [{ id: 'd1', wallId: 'curve', position: 0.05, width: 50 }],
        windows: [], furniture: [],
      }],
    };
    const issues = inspectPlan2WorldDraftGeometry(input);
    expect(issues.some(issue => issue.code === 'opening-outside-wall')).toBe(false);
  });

  it('distinguishes different curves sharing endpoints but catches a reversed duplicate of the same curve', () => {
    const input = {
      schemaVersion: 'plan2world-draft-v1', name: 'Curves', units: 'cm',
      scale: { mode: 'measured', confidence: 1 },
      floors: [{ id: 'floor-0', name: 'Floor', level: 0, doors: [], windows: [], furniture: [], walls: [
        { id: 'a', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, curvePoint: { x: 200, y: 200 } },
        { id: 'different', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, curvePoint: { x: 200, y: -200 } },
        { id: 'same-reversed', start: { x: 400, y: 0 }, end: { x: 0, y: 0 }, curvePoint: { x: 200, y: 200 } },
      ] }],
    };
    const duplicates = inspectPlan2WorldDraftGeometry(input).filter(issue => issue.code === 'duplicate-wall');
    expect(duplicates.some(issue => issue.elementIds.includes('a') && issue.elementIds.includes('same-reversed'))).toBe(true);
    expect(duplicates.some(issue => issue.elementIds.includes('a') && issue.elementIds.includes('different'))).toBe(false);
  });

  it('places a curved-wall door leaf at the quadratic point and local tangent instead of the chord', () => {
    const wall: Wall = {
      id: 'curve', start: { x: 0, y: 0 }, end: { x: 800, y: 0 }, curvePoint: { x: 100, y: 600 },
      height: 280, thickness: 20, color: '#fff',
    };
    const door: Door = {
      id: 'door', wallId: 'curve', position: 0.25, width: 100, height: 210,
      type: 'single', swingDirection: 'left', flipSide: false,
    };
    const pose = doorPanelPose(wall, door);
    const point = { x: 87.5, y: 225 };
    const angle = Math.atan2(600, 500);
    expect(pose.x).toBeCloseTo(point.x + 50 * Math.cos(angle) - 2 * Math.sin(angle));
    expect(pose.z).toBeCloseTo(point.y + 50 * Math.sin(angle) + 2 * Math.cos(angle));
    expect(pose.yaw).toBeCloseTo(angle + Math.PI - 0.26);
    expect(pose.z).toBeGreaterThan(250);
  });
});
