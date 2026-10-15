import { describe, expect, it } from 'vitest';
import baselineJson from './fixtures/real-floorplans/wikimedia-two-bedroom.json';
import { inspectPlan2WorldDraftGeometry } from '$lib/plan2world/geometryHealth';
import { summarizePlan2WorldDraft } from '$lib/plan2world/review';

function denseGridDraft() {
  const walls: Array<{
    id: string;
    start: { x: number; y: number };
    end: { x: number; y: number };
    kind: 'interior' | 'exterior';
  }> = [];

  for (let i = 0; i <= 5; i++) {
    const p = i * 80;
    walls.push({
      id: `h${i}`,
      start: { x: 0, y: p },
      end: { x: 400, y: p },
      kind: i === 0 || i === 5 ? 'exterior' : 'interior',
    });
    walls.push({
      id: `v${i}`,
      start: { x: p, y: 0 },
      end: { x: p, y: 400 },
      kind: i === 0 || i === 5 ? 'exterior' : 'interior',
    });
  }

  return {
    schemaVersion: 'plan2world-draft-v1',
    name: 'Over-segmented grid',
    units: 'cm',
    scale: { mode: 'measured', confidence: 1 },
    floors: [{ id: 'floor-0', name: 'Floor', level: 0, walls, doors: [], windows: [], furniture: [] }],
  };
}

const topologyCodes = new Set([
  'many-enclosed-regions',
  'high-region-wall-ratio',
  'many-tiny-regions',
]);

describe('Plan2World topology health', () => {
  it('keeps the established real-floorplan baseline below over-segmentation thresholds', () => {
    const issues = inspectPlan2WorldDraftGeometry(baselineJson);
    expect(issues.filter(issue => topologyCodes.has(issue.code))).toEqual([]);
  });

  it('flags a geometrically legal but badly over-segmented face graph', () => {
    const issues = inspectPlan2WorldDraftGeometry(denseGridDraft());
    const topology = issues.filter(issue => topologyCodes.has(issue.code));

    expect(topology.map(issue => issue.code)).toEqual([
      'many-enclosed-regions',
      'high-region-wall-ratio',
      'many-tiny-regions',
    ]);
    expect(topology.every(issue => issue.severity === 'warning')).toBe(true);
    expect(topology.every(issue => issue.elementIds.length === 12)).toBe(true);
    expect(issues.some(issue => issue.severity === 'error')).toBe(false);
  });

  it('surfaces topology warnings through the existing Review finding pipeline', () => {
    const summary = summarizePlan2WorldDraft(denseGridDraft());
    expect(summary.geometryErrorCount).toBe(0);
    expect(summary.geometryWarningCount).toBeGreaterThanOrEqual(3);
    expect(summary.geometryIssues.some(issue => issue.code === 'high-region-wall-ratio')).toBe(true);
  });
});
