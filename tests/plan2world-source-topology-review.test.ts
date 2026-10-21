import { describe, expect, it } from 'vitest';
import { buildBareHouse } from '$lib/plan2world/bareHouse';
import { reviewSourceTopology } from '$lib/plan2world/sourceTopologyReview';

describe('source-pixel topology diagnostics', () => {
  it('reports an unsnapped diagonal junction independently of physical scale without repairing it', () => {
    const house = buildBareHouse({ schemaVersion: 'source-wall-trace-v1', walls: [
      { start: { x: 0, y: 0 }, end: { x: 100, y: 100 } },
      { start: { x: 58, y: 50 }, end: { x: 150, y: 50 } },
    ] });
    const before = JSON.stringify(house);
    const review = reviewSourceTopology(house, { sourceWidthPx: 1000, sourceHeightPx: 1000 }, [
      { label: 'observed corner', position: { x: 51, y: 50 }, evidence: 'Visible T-shaped stroke junction.' },
    ]);
    expect(review.automaticSnapTolerancePx).toBe(3);
    expect(review.warningRadiusPx).toBe(10);
    expect(review.nearMisses).toHaveLength(1);
    expect(review.nearMisses[0]).toMatchObject({ wallId: 'w2', endpoint: 'start', targetWallId: 'w1', supportingJunctions: [0] });
    expect(review.nearMisses[0].distancePx).toBeCloseTo(Math.sqrt(32));
    expect(review.geometryChanged).toBe(false);
    expect(JSON.stringify(house)).toBe(before);
    expect(house.walls).toHaveLength(2);
    expect(house.walls[1].start).toEqual({ x: 58, y: 50 });
  });

  it('keeps candidate warnings deterministic and preserves legitimate parallel walls', () => {
    const house = buildBareHouse({ schemaVersion: 'source-wall-trace-v1', walls: [
      { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { start: { x: 0, y: 8 }, end: { x: 100, y: 8 } },
    ] });
    const context = { sourceWidthPx: 1000, sourceHeightPx: 1000 };
    const before = JSON.stringify(house);
    const result = reviewSourceTopology(house, context);
    expect(reviewSourceTopology({ ...house, walls: [...house.walls].reverse() }, context)).toEqual(result);
    expect(result.nearMisses).toHaveLength(4);
    expect(JSON.stringify(house)).toBe(before);
  });

  it('detects two mutually joined partitions that both stop short of a third boundary', () => {
    const house = buildBareHouse({ schemaVersion: 'source-wall-trace-v1', walls: [
      { start: { x: 0, y: 0 }, end: { x: 0, y: 200 } },
      { start: { x: 5, y: 100 }, end: { x: 100, y: 100 } },
      { start: { x: 5, y: 100 }, end: { x: 100, y: 0 } },
    ] });
    const before = JSON.stringify(house);
    const result = reviewSourceTopology(house, { sourceWidthPx: 1000, sourceHeightPx: 1000 });
    const corner = result.nearMisses.filter(item => item.sourcePoint.x === 5 && item.sourcePoint.y === 100);
    expect(corner).toHaveLength(1);
    expect(corner[0]).toMatchObject({ distancePx: 5, targetWallId: 'w1', incidentWallIds: ['w2', 'w3'] });
    expect(result.reviewRequired).toBe(true);
    expect(JSON.stringify(house)).toBe(before);
  });

  it('does not warn at already connected endpoints or distant open partition ends', () => {
    const house = buildBareHouse({ schemaVersion: 'source-wall-trace-v1', walls: [
      { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      { start: { x: 100, y: 0 }, end: { x: 100, y: 100 } },
      { start: { x: 300, y: 300 }, end: { x: 400, y: 300 } },
    ] });
    expect(reviewSourceTopology(house).nearMisses).toEqual([]);
  });

  it('uses analytic quadratic projection for a curved wall', () => {
    const house = buildBareHouse({ schemaVersion: 'source-wall-trace-v1', walls: [
      { start: { x: 0, y: 0 }, curvePoint: { x: 50, y: 100 }, end: { x: 100, y: 0 } },
      { start: { x: 50, y: 56 }, end: { x: 50, y: 100 } },
    ] });
    const review = reviewSourceTopology(house, { sourceWidthPx: 1000, sourceHeightPx: 1000 });
    expect(review.nearMisses[0]).toMatchObject({ wallId: 'w2', targetWallId: 'w1' });
    expect(review.nearMisses[0].distancePx).toBeCloseTo(6, 8);
    expect(review.nearMisses[0].projection.x).toBeCloseTo(50, 8);
    expect(review.nearMisses[0].projection.y).toBeCloseTo(50, 8);
  });
});
