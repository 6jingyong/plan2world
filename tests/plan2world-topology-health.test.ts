import { describe, expect, it } from 'vitest';
import baselineJson from './fixtures/real-floorplans/wikimedia-two-bedroom.json';
import { parsePlan2WorldDraft } from '$lib/plan2world/draft';
import { inspectPlan2WorldDraftTopology } from '$lib/plan2world/topologyHealth';
import { summarizePlan2WorldDraft } from '$lib/plan2world/review';

function denseGridDraft() {
  const walls: Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number }; kind: 'interior' | 'exterior' }> = [];
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

describe('Plan2World topology health', () => {
  it('keeps the established real-floorplan baseline below over-segmentation thresholds', () => {
    const draft = parsePlan2WorldDraft(baselineJson);
    const health = inspectPlan2WorldDraftTopology(draft);
    expect(health.floors[0].regionCount).toBe(11);
    expect(health.issues.map(issue => issue.code)).not.toContain('many-enclosed-regions');
    expect(health.issues.map(issue => issue.code)).not.toContain('high-region-wall-ratio');
  });

  it('flags a geometrically legal but badly over-segmented face graph', () => {
    const draft = parsePlan2WorldDraft(denseGridDraft());
    const health = inspectPlan2WorldDraftTopology(draft);
    expect(health.floors[0]).toMatchObject({ regionCount: 25, tinyRegionCount: 25, wallCount: 12 });
    expect(health.issues.map(issue => issue.code)).toEqual([
      'many-enclosed-regions',
      'high-region-wall-ratio',
      'many-tiny-regions',
    ]);
  });

  it('surfaces topology warnings through the existing reconstruction review findings', () => {
    const summary = summarizePlan2WorldDraft(denseGridDraft());
    expect(summary.regionCount).toBe(25);
    expect(summary.tinyRegionCount).toBe(25);
    expect(summary.topologyWarningCount).toBe(3);
    expect(summary.geometryErrorCount).toBe(0);
    expect(summary.geometryWarningCount).toBeGreaterThanOrEqual(3);
    expect(summary.geometryIssues.some(issue => issue.code === 'high-region-wall-ratio')).toBe(true);
  });
});
