import type { DraftPoint } from './draft';
import type { SourceWallTraceV1 } from './bareHouse';
import type { SourceAnnotationV1 } from './reconstructionAssembly';
import type { SourceFunctionalZone } from './functionalZones';
import { wallPathSpans } from '$lib/utils/wallPath';
import { floorBoundaryPolygon } from '$lib/utils/floorBoundary';
import { pointInPolygon } from '$lib/utils/hitTesting';

export const WALL_ENVELOPE_USE_POLICY = 'functional-use-before-wall-abstraction-v1' as const;
export interface WallEnvelopeUse {
  kind: 'furniture' | 'functional-zone' | 'passage' | 'door' | 'door-gap';
  /** Relative to the supplied annotation, zones or trace respectively; door
   * indices refer to accepted program annotations, not raw mixed decisions. */
  sourcePath: string;
  reason: 'position-in-strip' | 'marked-space-between-faces' | 'functional-passage-crosses-strip' | 'transverse-access';
  /** A pending zone protects evidence without becoming accepted geometry. */
  decision?: SourceFunctionalZone['decision'];
}
interface Strip {
  from: number; to: number; faces: number[];
  along(p: DraftPoint): number; across(p: DraftPoint): number;
  at(t: number, d: number): DraftPoint;
}

/** Positive evidence of use takes precedence over compression. No inference of
 * storage/structural/pipe semantics, room creation or changed source decisions. */
export function reviewWallEnvelopeUse(annotation: SourceAnnotationV1, zones: SourceFunctionalZone[],
  doorGaps: SourceWallTraceV1['doorGaps'], strip: Strip): WallEnvelopeUse[] {
  const low = Math.min(...strip.faces), high = Math.max(...strip.faces), evidence: WallEnvelopeUse[] = [];
  // A mark on the face itself is not an interior-space mark. Points strictly
  // between faces remain protected even when native thickness already covers them.
  const inside = (p: DraftPoint) => strip.along(p) >= strip.from - 1e-6 && strip.along(p) <= strip.to + 1e-6
    && strip.across(p) > low + 1e-6 && strip.across(p) < high - 1e-6;
  const intersects = (a: DraftPoint, b: DraftPoint) => {
    let begin = 0, end = 1;
    for (const [x, y, min, max] of [[strip.along(a), strip.along(b), strip.from, strip.to], [strip.across(a), strip.across(b), low, high]]) {
      const d = y - x;
      if (Math.abs(d) < 1e-9) { if (x < min || x > max) return false; continue; }
      const ts = [(min - x) / d, (max - x) / d].sort((a, b) => a - b);
      begin = Math.max(begin, ts[0]); end = Math.min(end, ts[1]);
    }
    return begin <= end + 1e-9;
  };
  annotation.furniture?.forEach((item, i) => {
    if (inside(item.position)) evidence.push({ kind: 'furniture', sourcePath: `furniture[${i}]`, reason: 'position-in-strip' });
  });
  zones.forEach((zone, zi) => {
    if (zone.decision === 'reject') return;
    if (inside(zone.position)) evidence.push({ kind: 'functional-zone', sourcePath: `functionalZones[${zi}]`, reason: 'position-in-strip', decision: zone.decision });
    // Preserve an unoccupied functional threshold, including legacy curved
    // paths, without flattening or changing their canonical source geometry.
    zone.boundary.forEach((edge, ei) => {
      if (edge.kind !== 'passage') return;
      const end = zone.boundary[(ei + 1) % zone.boundary.length].point;
      if (wallPathSpans({ start: edge.point, end, ...(edge.curvePoint ? { curvePoint: edge.curvePoint } : {}) }).some(s => intersects(s.start, s.end))) {
        evidence.push({ kind: 'passage', sourcePath: `functionalZones[${zi}].boundary[${ei}]`, reason: 'functional-passage-crosses-strip', decision: zone.decision });
      }
    });
    // A labelled L-shaped space can extend into the strip while its seed lies
    // elsewhere. Opposing functional-boundary runs on two observed faces mark
    // that arm. A normal room sharing only one facade face is not such an arm.
    const sides = zone.boundary.flatMap((edge, i) => {
      if (edge.curvePoint) return [];
      const end = zone.boundary[(i + 1) % zone.boundary.length].point;
      const a = strip.across(edge.point), b = strip.across(end);
      const face = strip.faces.map((d, index) => ({ index, d, residual: Math.max(Math.abs(a - d), Math.abs(b - d)) }))
        .sort((a, b) => a.residual - b.residual)[0];
      if (face.residual > Math.min(3, (high - low) * .25)) return [];
      const from = Math.max(strip.from, Math.min(strip.along(edge.point), strip.along(end)));
      const to = Math.min(strip.to, Math.max(strip.along(edge.point), strip.along(end)));
      return to - from > 1e-6 ? [{ face: face.index, offset: face.d, from, to }] : [];
    });
    const polygon = floorBoundaryPolygon(zone.boundary, []);
    if (sides.some((a, i) => sides.slice(i + 1).some(b => {
      const from = Math.max(a.from, b.from), to = Math.min(a.to, b.to);
      return a.face !== b.face && Math.abs(a.offset - b.offset) > 3 && to - from > 1e-6
        && [.25, .5, .75].some(t => pointInPolygon(strip.at(from + (to - from) * t, (a.offset + b.offset) / 2), polygon));
    }))) {
      evidence.push({ kind: 'functional-zone', sourcePath: `functionalZones[${zi}]`, reason: 'marked-space-between-faces', decision: zone.decision });
    }
  });
  const transverseAccess = (a: DraftPoint, b: DraftPoint) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return length > 1e-6 && Math.abs(strip.across(b) - strip.across(a)) / length > Math.sin(Math.PI / 12)
      && inside({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  };
  annotation.openings?.forEach((opening, i) => {
    if (opening.kind === 'door' && transverseAccess(...opening.endpoints)) evidence.push({ kind: 'door', sourcePath: `openings[${i}]`, reason: 'transverse-access' });
  });
  doorGaps?.forEach((gap, i) => {
    if (transverseAccess(gap.from, gap.to)) evidence.push({ kind: 'door-gap', sourcePath: `doorGaps[${i}]`, reason: 'transverse-access' });
  });
  return evidence;
}
