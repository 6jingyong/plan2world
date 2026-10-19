import { describe, expect, it } from 'vitest';
import { calibratePlan2WorldDraft } from '$lib/plan2world/review';
import { parsePlan2WorldDraft } from '$lib/plan2world/draft';
import {
  draftToProjectWithSourceBackground,
  sourceBackgroundForRegistration,
  sourceImageDistanceInPlanCm,
} from '$lib/plan2world/sourceBackground';

const source = {
  dataUrl: 'data:image/png;base64,AA==',
  width: 1000,
  height: 800,
};

function rectangleDraft() {
  return {
    schemaVersion: 'plan2world-draft-v1',
    name: 'Registered apartment',
    units: 'cm',
    scale: { mode: 'measured', confidence: 0.95, basis: '400 cm printed dimension' },
    assumptions: [],
    sourceRegistration: {
      floorId: 'floor-0',
      confidence: 0.9,
      anchors: [
        { wallId: 'w1', endpoint: 'start', image: { x: 0.1, y: 0.125 } },
        { wallId: 'w1', endpoint: 'end', image: { x: 0.9, y: 0.125 } },
        { wallId: 'w3', endpoint: 'start', image: { x: 0.9, y: 0.875 } },
        { wallId: 'w3', endpoint: 'end', image: { x: 0.1, y: 0.875 } },
      ],
    },
    floors: [{
      id: 'floor-0', name: 'Ground Floor', level: 0,
      walls: [
        { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, kind: 'exterior' },
        { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, kind: 'exterior' },
        { id: 'w3', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, kind: 'exterior' },
        { id: 'w4', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, kind: 'exterior' },
      ],
      doors: [], windows: [], furniture: [],
    }],
  };
}

describe('Plan2World source registration', () => {
  it('preserves valid wall-endpoint anchors while parsing draft v1', () => {
    const parsed = parsePlan2WorldDraft(rectangleDraft());
    expect(parsed.sourceRegistration?.floorId).toBe('floor-0');
    expect(parsed.sourceRegistration?.anchors).toHaveLength(4);
    expect(parsed.sourceRegistration?.anchors[0]).toEqual({
      wallId: 'w1', endpoint: 'start', image: { x: 0.1, y: 0.125 },
    });
  });

  it('rejects malformed source registration instead of silently discarding it', () => {
    const raw = rectangleDraft();
    raw.sourceRegistration.anchors[0].image.x = 1.5;
    expect(() => parsePlan2WorldDraft(raw)).toThrow(/between 0 and 1/i);
  });

  it('uses source anchors to remove screenshot margins instead of stretching the plan to the full raster', () => {
    const parsed = parsePlan2WorldDraft(rectangleDraft());
    const background = sourceBackgroundForRegistration(parsed, source);
    expect(background).toBeDefined();
    expect(background?.scale).toBeCloseTo(0.5, 8);
    expect(background?.position.x).toBeCloseTo(200, 8);
    expect(background?.position.y).toBeCloseTo(150, 8);
    expect(background?.rotation).toBeCloseTo(0, 8);
    expect(background?.locked).toBe(true);
  });

  it('maps a clicked source-image line to the reconstructed plan distance', () => {
    const parsed = parsePlan2WorldDraft(rectangleDraft());
    expect(sourceImageDistanceInPlanCm(
      parsed,
      source,
      { x: 0.1, y: 0.125 },
      { x: 0.9, y: 0.125 },
    )).toBeCloseTo(400, 8);
    expect(sourceImageDistanceInPlanCm(
      parsed,
      source,
      { x: 0.1, y: 0.125 },
      { x: 0.1, y: 0.875 },
    )).toBeCloseTo(300, 8);
  });

  it('solves rotation as well as scale and translation from endpoint anchors', () => {
    const draft = parsePlan2WorldDraft({
      schemaVersion: 'plan2world-draft-v1',
      name: 'Rotated source', units: 'cm',
      scale: { mode: 'estimated', confidence: 0.5 },
      sourceRegistration: {
        floorId: 'floor-0', confidence: 0.8,
        anchors: [
          { wallId: 'w1', endpoint: 'start', image: { x: 0.25, y: 0.5 } },
          { wallId: 'w1', endpoint: 'end', image: { x: 0.75, y: 0.5 } },
        ],
      },
      floors: [{
        id: 'floor-0', name: 'Ground Floor', level: 0,
        walls: [{ id: 'w1', start: { x: 100, y: 100 }, end: { x: 100, y: 200 } }],
        doors: [], windows: [], furniture: [],
      }],
    });
    const background = sourceBackgroundForRegistration(draft, { ...source, width: 100, height: 100 });
    expect(background?.scale).toBeCloseTo(2, 8);
    expect(background?.rotation).toBeCloseTo(90, 8);
    expect(background?.position.x).toBeCloseTo(100, 8);
    expect(background?.position.y).toBeCloseTo(150, 8);
  });

  it('keeps endpoint registration valid after user scale calibration', () => {
    const calibrated = calibratePlan2WorldDraft(rectangleDraft(), 400, 800);
    expect(calibrated.sourceRegistration?.anchors).toHaveLength(4);
    const background = sourceBackgroundForRegistration(calibrated, source);
    expect(background?.scale).toBeCloseTo(1, 8);
    expect(background?.position.x).toBeCloseTo(400, 8);
    expect(background?.position.y).toBeCloseTo(300, 8);
    expect(sourceImageDistanceInPlanCm(
      calibrated,
      source,
      { x: 0.1, y: 0.125 },
      { x: 0.9, y: 0.125 },
    )).toBeCloseTo(800, 8);
  });

  it('rejects inconsistent registration instead of hiding it with wall-bounds fitting', () => {
    const raw = rectangleDraft();
    raw.sourceRegistration.anchors = [
      { wallId: 'w1', endpoint: 'start', image: { x: 0.1, y: 0.125 } },
      { wallId: 'w1', endpoint: 'end', image: { x: 0.9, y: 0.125 } },
      { wallId: 'w3', endpoint: 'start', image: { x: 0.2, y: 0.2 } },
    ];
    expect(() => draftToProjectWithSourceBackground(
      raw,
      source,
      new Date('2026-10-15T00:00:00Z'),
    )).toThrow(/registration anchors are inconsistent/i);
  });
});
