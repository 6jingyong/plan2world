import { describe, expect, it } from 'vitest';
import referenceJson from './fixtures/real-floorplans/wikimedia-two-bedroom.json';
import { parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { scoreReconstructionAgainstReference } from '$lib/plan2world/reconstructionQuality';

const SOURCE = {
  dataUrl: 'data:image/png;base64,AA==',
  width: 535,
  height: 526,
};

describe('Plan2World reconstruction quality scorecard', () => {
  it('scores an identical registered reconstruction perfectly', () => {
    const report = scoreReconstructionAgainstReference(referenceJson, referenceJson, SOURCE);
    expect(report.walls.precision).toBe(1);
    expect(report.walls.recall).toBe(1);
    expect(report.walls.f1).toBe(1);
    expect(report.walls.referenceToCandidate.meanErrorPx).toBeCloseTo(0, 8);
    expect(report.walls.candidateToReference.p95ErrorPx).toBeCloseTo(0, 8);
    expect(report.doors.f1).toBe(1);
    expect(report.windows.f1).toBe(1);
    expect(report.topology.roomCountDelta).toBe(0);
  });

  it('detects a spatially wrong interior wall even when the draft remains parseable', () => {
    const candidate = parsePlan2WorldDraft(referenceJson);
    const wall = candidate.floors[0].walls.find(item => item.id === 'w10-toilet-split');
    expect(wall).toBeDefined();
    wall!.start.y += 100;
    wall!.end.y += 100;

    const report = scoreReconstructionAgainstReference(referenceJson, candidate, SOURCE);
    expect(report.walls.f1).toBeLessThan(1);
    expect(report.walls.referenceToCandidate.meanErrorPx).toBeGreaterThan(0);
    expect(report.walls.candidateToReference.meanErrorPx).toBeGreaterThan(0);
  });

  it('reports missing openings without depending on a historical model snapshot', () => {
    const candidate = parsePlan2WorldDraft(referenceJson);
    candidate.floors[0].doors = candidate.floors[0].doors.slice(0, -1);
    candidate.floors[0].windows = candidate.floors[0].windows.slice(0, -1);

    const report = scoreReconstructionAgainstReference(referenceJson, candidate, SOURCE);
    expect(report.doors.referenceCount).toBe(10);
    expect(report.doors.candidateCount).toBe(9);
    expect(report.doors.recall).toBeLessThan(1);
    expect(report.windows.referenceCount).toBe(7);
    expect(report.windows.candidateCount).toBe(6);
    expect(report.windows.recall).toBeLessThan(1);
  });

  it('refuses bounds-fallback alignment when explicit source registration is missing', () => {
    const candidate = parsePlan2WorldDraft(referenceJson);
    delete candidate.sourceRegistration;
    expect(() => scoreReconstructionAgainstReference(referenceJson, candidate, SOURCE))
      .toThrow(/explicit source registration/i);
  });
});
