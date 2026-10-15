import { expect, it } from 'vitest';
import { calibratePlan2WorldDraft, summarizePlan2WorldDraft } from '$lib/plan2world/review';

function reviewDraft() {
  return {
    schemaVersion: 'plan2world-draft-v1',
    name: 'Review apartment',
    units: 'cm',
    scale: { mode: 'estimated', confidence: 0.55, basis: 'Assumed 90 cm single door' },
    assumptions: ['Door width estimated from convention.'],
    floors: [{
      id: 'floor-0',
      name: 'Ground Floor',
      level: 0,
      elevation: 300,
      walls: [
        { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 20, height: 280, kind: 'exterior' },
        { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, thickness: 12, height: 280, kind: 'interior' },
      ],
      doors: [{ id: 'd1', wallId: 'w1', position: 0.5, width: 90, height: 210 }],
      windows: [{ id: 'win1', wallId: 'w2', position: 0.5, width: 120, height: 120, sillHeight: 90 }],
      furniture: [{ id: 'f1', catalogId: 'chair', position: { x: 200, y: 100 }, rotation: 90 }],
    }],
  };
}

it('summarizes scale confidence, assumptions, counts, footprint, and geometry health', () => {
  const summary = summarizePlan2WorldDraft(reviewDraft());
  expect(summary).toMatchObject({
    floorCount: 1,
    wallCount: 2,
    doorCount: 1,
    windowCount: 1,
    scaleMode: 'estimated',
    scaleConfidence: 0.55,
    scaleBasis: 'Assumed 90 cm single door',
    primaryExtent: { width: 400, depth: 300 },
    geometryErrorCount: 0,
    geometryWarningCount: 0,
  });
  expect(summary.assumptions).toEqual(['Door width estimated from convention.']);
  expect(summary.geometryIssues).toEqual([]);
});

it('surfaces deterministic geometry findings in the review summary', () => {
  const broken = reviewDraft();
  broken.floors[0].doors[0].position = 0.02;
  broken.floors[0].doors[0].width = 120;
  const summary = summarizePlan2WorldDraft(broken);
  expect(summary.geometryErrorCount).toBe(1);
  expect(summary.geometryWarningCount).toBe(0);
  expect(summary.geometryIssues[0]).toMatchObject({
    code: 'opening-outside-wall',
    severity: 'error',
    elementIds: ['d1', 'w1'],
  });
});

it('calibrates horizontal plan geometry without scaling vertical dimensions', () => {
  const calibrated = calibratePlan2WorldDraft(reviewDraft(), 400, 360);
  const floor = calibrated.floors[0];

  expect(calibrated.scale.mode).toBe('provided');
  expect(calibrated.scale.confidence).toBe(1);
  expect(calibrated.scale.basis).toContain('400 cm reconstructed = 360 cm actual');

  expect(floor.walls[0].end.x).toBe(360);
  expect(floor.walls[1].end.y).toBe(270);
  expect(floor.walls[0].thickness).toBe(18);
  expect(floor.doors?.[0].width).toBe(81);
  expect(floor.windows?.[0].width).toBe(108);
  expect(floor.furniture?.[0].position).toEqual({ x: 180, y: 90 });

  expect(floor.elevation).toBe(300);
  expect(floor.walls[0].height).toBe(280);
  expect(floor.doors?.[0].height).toBe(210);
  expect(floor.windows?.[0].height).toBe(120);
  expect(floor.windows?.[0].sillHeight).toBe(90);
});

it('rejects invalid calibration references', () => {
  expect(() => calibratePlan2WorldDraft(reviewDraft(), 0, 360)).toThrow(/greater than zero/);
  expect(() => calibratePlan2WorldDraft(reviewDraft(), 400, Number.NaN)).toThrow(/greater than zero/);
});
