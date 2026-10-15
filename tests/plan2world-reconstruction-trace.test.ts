import { describe, expect, it } from 'vitest';
import { calibratePlan2WorldDraft } from '$lib/plan2world/review';
import { buildReconstructionTrace, planPointToSourcePixel } from '$lib/plan2world/reconstructionTrace';
import { sourceBackgroundForDraft } from '$lib/plan2world/sourceBackground';

const source = {
  dataUrl: 'data:image/png;base64,AA==',
  width: 1000,
  height: 800,
};

function registeredDraft() {
  return {
    schemaVersion: 'plan2world-draft-v1',
    name: 'Trace test',
    units: 'cm',
    scale: { mode: 'measured', confidence: 0.95 },
    sourceRegistration: {
      floorId: 'floor-0',
      confidence: 0.95,
      anchors: [
        { wallId: 'top', endpoint: 'start', image: { x: 0.1, y: 0.125 } },
        { wallId: 'top', endpoint: 'end', image: { x: 0.9, y: 0.125 } },
        { wallId: 'bottom', endpoint: 'start', image: { x: 0.9, y: 0.875 } },
        { wallId: 'bottom', endpoint: 'end', image: { x: 0.1, y: 0.875 } },
      ],
    },
    floors: [{
      id: 'floor-0', name: 'Ground Floor', level: 0,
      walls: [
        { id: 'top', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, kind: 'exterior', confidence: 0.96 },
        { id: 'right', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, kind: 'exterior' },
        { id: 'bottom', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, kind: 'exterior' },
        { id: 'left', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, kind: 'exterior' },
      ],
      doors: [{ id: 'door', wallId: 'top', position: 0.5, width: 90, confidence: 0.8 }],
      windows: [{ id: 'bad-window', wallId: 'right', position: 0.5, width: 400, confidence: 0.4 }],
      furniture: [],
    }],
  };
}

describe('Plan2World reconstruction trace', () => {
  it('inverts source registration back into original raster pixels', () => {
    const draft = registeredDraft();
    const background = sourceBackgroundForDraft(draft, source)!;
    expect(planPointToSourcePixel({ x: 0, y: 0 }, source, background)).toEqual({ x: 100, y: 100 });
    expect(planPointToSourcePixel({ x: 400, y: 300 }, source, background)).toEqual({ x: 900, y: 700 });
  });

  it('projects walls and opening centers onto the source image', () => {
    const trace = buildReconstructionTrace(registeredDraft(), source)!;
    expect(trace.width).toBe(1000);
    expect(trace.height).toBe(800);
    expect(trace.walls.find(wall => wall.id === 'top')).toMatchObject({
      start: { x: 100, y: 100 },
      end: { x: 900, y: 100 },
      kind: 'exterior',
      confidence: 0.96,
    });
    expect(trace.openings.find(opening => opening.id === 'door')?.point).toEqual({ x: 500, y: 100 });
    expect(trace.openings.find(opening => opening.id === 'bad-window')).toMatchObject({
      kind: 'window',
      point: { x: 900, y: 400 },
      severity: 'error',
    });
  });

  it('preserves quadratic curve control points for SVG trace rendering', () => {
    const draft: any = registeredDraft();
    draft.floors[0].walls[0].curvePoint = { x: 200, y: 100 };
    const trace = buildReconstructionTrace(draft, source)!;
    expect(trace.walls[0].curvePoint).toEqual({ x: 500, y: 300 });
  });

  it('keeps the trace on the same raster pixels after horizontal scale calibration', () => {
    const before = buildReconstructionTrace(registeredDraft(), source)!;
    const calibrated = calibratePlan2WorldDraft(registeredDraft(), 400, 800);
    const after = buildReconstructionTrace(calibrated, source)!;
    expect(after.walls.map(wall => [wall.start, wall.end])).toEqual(before.walls.map(wall => [wall.start, wall.end]));
    expect(after.openings.map(opening => opening.point)).toEqual(before.openings.map(opening => opening.point));
  });

  it('uses the deterministic wall-bounds fallback when registration is absent', () => {
    const draft = registeredDraft();
    delete (draft as any).sourceRegistration;
    const trace = buildReconstructionTrace(draft, { ...source, height: 500 })!;
    const top = trace.walls.find(wall => wall.id === 'top')!;
    expect(top.start.x).toBeCloseTo(166.6666667, 5);
    expect(top.start.y).toBeCloseTo(0, 5);
    expect(top.end.x).toBeCloseTo(833.3333333, 5);
    expect(top.end.y).toBeCloseTo(0, 5);
  });
});
