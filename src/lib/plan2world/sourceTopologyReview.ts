import type { BareHouseV1 } from './bareHouse';
import type { DraftPoint } from './draft';
import { projectOntoWall } from '$lib/utils/wallProjection';
import { wallPointAt } from '$lib/utils/wallPath';

export interface SourceJunctionEvidence {
  label: string;
  position: DraftPoint;
  evidence: string;
  sourceView?: string;
}

/** Read-only source-pixel diagnostics. A nearby line is not permission to join it. */
export function reviewSourceTopology(
  house: Pick<BareHouseV1, 'walls' | 'maxJunctionDistancePx'>,
  context: { sourceWidthPx?: number; sourceHeightPx?: number } = {},
  junctions: SourceJunctionEvidence[] = [],
) {
  const dimensions = [context.sourceWidthPx, context.sourceHeightPx];
  const sourceSize = dimensions.every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)
    ? Math.min(...dimensions as number[]) : undefined;
  // Wider than automatic snapping, independent of estimated physical scale.
  const warningRadiusPx = Math.max(house.maxJunctionDistancePx * 2, (sourceSize ?? 600) * 0.01);
  const walls = [...house.walls].sort((a, b) => a.id.localeCompare(b.id));
  const junctionEvidence = junctions.map(junction => {
    const nearbyWallIds = walls.filter(wall => (projectOntoWall(junction.position, wall)?.distance ?? Infinity) <= warningRadiusPx).map(wall => wall.id);
    return { ...junction, nearbyWallIds, programStatus: nearbyWallIds.length >= 2 ? 'nearby-candidates' : 'unresolved' };
  });
  const seen = new Set<string>();
  const nearMisses = walls.flatMap(wall => (['start', 'end'] as const).flatMap(endpoint => {
    const point = wall[endpoint];
    const candidates = walls.filter(other => other.id !== wall.id).flatMap(other => {
      const projected = projectOntoWall(point, other);
      return projected ? [{ wallId: other.id, distancePx: projected.distance, projection: wallPointAt(other, projected.position) }] : [];
    }).sort((a, b) => a.distancePx - b.distancePx || a.wallId.localeCompare(b.wallId));
    // Two partitions may already meet each other yet BOTH stop short of a third
    // boundary. Existing incident walls cannot hide that missing connection.
    const incidentWallIds = [wall.id, ...candidates.filter(candidate => candidate.distancePx <= 1e-6).map(candidate => candidate.wallId)].sort();
    const nearby = candidates.filter(candidate => candidate.distancePx > 1e-6 && candidate.distancePx <= warningRadiusPx);
    if (!nearby.length) return [];
    const nearest = nearby[0];
    const key = `${point.x.toFixed(6)},${point.y.toFixed(6)}:${nearest.wallId}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ code: 'source-endpoint-near-miss' as const, wallId: wall.id, endpoint,
      sourcePoint: { ...point }, targetWallId: nearest.wallId, distancePx: nearest.distancePx, projection: nearest.projection,
      incidentWallIds, candidateWallIds: nearby.map(candidate => candidate.wallId),
      supportingJunctions: junctionEvidence.flatMap((junction, index) =>
        Math.hypot(junction.position.x - point.x, junction.position.y - point.y) <= warningRadiusPx
        && junction.nearbyWallIds.includes(wall.id) && junction.nearbyWallIds.includes(nearest.wallId) ? [index] : []),
    }];
  }));
  return { automaticSnapTolerancePx: house.maxJunctionDistancePx, warningRadiusPx,
    radiusPolicy: 'max(2 × automatic snap tolerance, 1% of shorter original raster dimension); fallback dimension 600 px',
    geometryChanged: false as const, nearMisses, junctionEvidence,
    reviewRequired: nearMisses.length > 0 || junctionEvidence.some(junction => junction.programStatus === 'unresolved'),
    limitation: 'Candidates require original-image review. Legitimate gaps and isolated partitions are possible. No lines are extended, joined or added by this diagnostic.' };
}
