import type { DraftPoint } from './draft';
import { parseSourceArchitecture } from './architecture';
import { freezeRasterEvidence, decodeInkRuns, type SourceRasterInput } from './rasterWallContinuation';
import { isSourcePoint, sourcePoints, sourceRecord } from './sourceDiagnostics';
import { resolveOpeningHost } from './sourceOpenings';

interface BandEvidence {
  low: number; high: number; style: 'outlined' | 'filled';
  faceRanges: [number, number][];
  jambPositionsPx: [number, number];
  faceSupport: number[]; jambSupport: number[]; openingSignature: number;
}
interface ThresholdAudit { contrast: number; faceRuns: [number, number][]; bands: BandEvidence[]; rejectedBands: (BandEvidence & { reasons: string[] })[]; truncated: boolean }
interface WallRelation { sourcePath: string; relation: 'lower-face' | 'upper-face' | 'middle' }
export interface ApertureBandCandidate extends BandEvidence {
  /** Only a bounded diagnostic region, never a generated wall/host baseline. */
  polygon: DraftPoint[];
  midpointResidualPx: number;
  wallRelations: WallRelation[];
  interpretation: 'baseline-consistent' | 'both-faces-recorded' | 'one-face-recorded' | 'no-corresponding-wall';
}
export interface ApertureBandAudit {
  sourcePath: string; label: string;
  status: 'unapproved-wall-band' | 'baseline-consistent' | 'ambiguous-wall-bands' | 'insufficient-evidence' | 'invalid-observation' | 'not-reviewed';
  reason?: string; endpoints?: DraftPoint[];
  /** Raw observed lines only, before normalization; not a native host verdict. */
  existingHostStatus?: 'matched' | 'unresolved' | 'ambiguous';
  thresholds: ThresholdAudit[]; candidates: ApertureBandCandidate[];
}
const distance = (a: DraftPoint, b: DraftPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const average = (a: number[]) => a.length ? a.reduce((s, n) => s + n, 0) / a.length : 0;
const range = (a: number, b: number, count: number) => Array.from({ length: count }, (_, i) => a + (b - a) * i / Math.max(1, count - 1));
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

/** Joint local evidence for an ALREADY OBSERVED aperture: paired wall faces on
 * both flanks, two jambs, and aperture-specific strokes/interruption. This is
 * deliberately not a centerline fitter or a reconstruction input. */
export function reviewApertureWallBands(input: unknown, raster: SourceRasterInput) {
  if (!sourceRecord(input) || !Array.isArray(input.walls) || !Array.isArray(input.openings)
    || input.walls.length > 2048 || input.openings.length > 512) throw new Error('Expected bounded architectural observations.');
  const base = parseSourceArchitecture({ ...input, walls: [], openings: [], doorGaps: [], junctions: [],
    ...(input.functionalZones === undefined ? {} : { functionalZones: [] }) });
  // Page polarity must not be estimated from a narrow, mostly filled wall
  // strip. This local diagnostic uses global image background; generation's
  // frozen masks and its separate sampling policy remain unchanged.
  const evidence = freezeRasterEvidence(raster);
  const inside = (p: DraftPoint) => isSourcePoint(p) && p.x >= 0 && p.y >= 0 && p.x <= evidence.width - 1 && p.y <= evidence.height - 1;
  const bounded = (value: unknown) => { if (sourcePoints(value).some(p => !isSourcePoint(p) || p.x < 0 || p.y < 0 || p.x > evidence.width || p.y > evidence.height)) throw new Error('Observation lies outside the source raster.'); };
  bounded(base.scaleEvidence);
  const invalidWalls: { sourcePath: string; reason: string }[] = [];
  const walls = input.walls.flatMap((raw: unknown, i: number) => {
    try {
      const wall = parseSourceArchitecture({ ...base, walls: [raw] }).walls[0]; bounded(wall);
      if (distance(wall.start, wall.end) <= 1e-6) throw new Error('Collapsed source wall.');
      return wall.decision === 'accept' ? [{ ...wall, sourcePath: `walls[${i}]`, id: `observed-${i}` }] : [];
    } catch (e) { invalidWalls.push({ sourcePath: `walls[${i}]`, reason: String(e) }); return []; }
  });
  const layers = [...(evidence.layers ?? []), { contrast: 95, runs: evidence.runs }].sort((a, b) => a.contrast - b.contrast);
  const masks = layers.map(layer => ({ contrast: layer.contrast, mask: decodeInkRuns(layer.runs, evidence.width, evidence.height) }));
  const audits: ApertureBandAudit[] = [];
  for (const [index, raw] of input.openings.entries()) {
    const audit: ApertureBandAudit = { sourcePath: `openings[${index}]`, label: typeof raw?.label === 'string' ? raw.label : `Opening ${index + 1}`,
      status: 'insufficient-evidence', thresholds: [], candidates: [] }; audits.push(audit);
    let opening;
    try { opening = parseSourceArchitecture({ ...base, openings: [raw] }).openings[0]; bounded(opening); }
    catch (e) { audit.status = 'invalid-observation'; audit.reason = String(e).replaceAll('openings[0]', audit.sourcePath); continue; }
    audit.endpoints = structuredClone(opening.endpoints);
    if (opening.decision !== 'accept') { audit.status = 'not-reviewed'; audit.reason = 'Only accepted source apertures are investigated.'; continue; }
    const [a, b] = opening.endpoints, length = distance(a, b);
    if (length < 12) { audit.reason = 'Aperture is too short for independent flank and jamb measurements.'; continue; }
    if (evidence.backgroundEstimate?.status !== 'resolved' || masks.length !== 3) { audit.reason = 'Resolved background and all three contrast masks are required.'; continue; }
    try { audit.existingHostStatus = resolveOpeningHost(opening.endpoints, new Map(walls.map(w => [w.id, w])), 3, undefined, opening.kind) ? 'matched' : 'unresolved'; }
    catch { audit.existingHostStatus = 'ambiguous'; }
    const u = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }, n = { x: -u.y, y: u.x };
    const at = (t: number, offset: number) => ({ x: a.x + u.x * t + n.x * offset, y: a.y + u.y * t + n.y * offset });
    const flankLength = clamp(length * .18, 8, 28), radius = Math.ceil(clamp(length * .5, 12, 64));
    const flanks = [range(-flankLength, -3, 8), range(length + 3, length + flankLength, 8)];
    for (const { contrast, mask } of masks) {
      const ink = (t: number, offset: number, alongSlack = 0, normalSlack = 0): number => {
        for (let ds = -alongSlack; ds <= alongSlack; ds++) for (let dn = -normalSlack; dn <= normalSlack; dn++) {
          const p = at(t + ds, offset + dn);
          if (!inside(p)) continue;
          if (mask[Math.round(p.y) * evidence.width + Math.round(p.x)]) return 1;
        }
        return 0;
      };
      const validOffsets = range(-radius, radius, radius * 2 + 1).filter(offset => flanks.flat().every(t => inside(at(t, offset))));
      if (validOffsets.length < 8) { audit.thresholds.push({ contrast, faceRuns: [], bands: [], rejectedBands: [], truncated: false }); continue; }
      const lo = validOffsets[0], hi = validOffsets.at(-1)!;
      const support = (offset: number) => flanks.map(side => average(side.map(t => ink(t, offset, 0, 1))));
      const faceRuns: [number, number][] = []; let start: number | undefined;
      for (let d = lo; d <= hi + 1; d++) {
        const strong = d <= hi && support(d).every(s => s >= .75);
        if (strong && start === undefined) start = d;
        if (!strong && start !== undefined) { if (start > lo && d - 1 < hi) faceRuns.push([start, d - 1]); start = undefined; }
      }
      const seeds: { low: number; high: number; style: BandEvidence['style']; faceRanges: [number, number][] }[] = [];
      for (const r of faceRuns) if (r[0] < 0 && r[1] > 0 && r[1] - r[0] >= 4) seeds.push({ low: r[0] + .5, high: r[1] - .5, style: 'filled', faceRanges: [[r[0], r[0] + 1], [r[1] - 1, r[1]]] });
      for (let i = 0; i < faceRuns.length; i++) for (let j = i + 1; j < faceRuns.length; j++) {
        const low = average(faceRuns[i]), high = average(faceRuns[j]);
        if (low < -1 && high > 1 && high - low >= 6 && high - low <= Math.min(64, length * .5)) seeds.push({ low, high, style: 'outlined', faceRanges: [faceRuns[i], faceRuns[j]] });
      }
      const bands: BandEvidence[] = [], rejectedBands: (BandEvidence & { reasons: string[] })[] = [], truncated = seeds.length > 32;
      for (const seed of truncated ? [] : seeds) {
        const { low, high } = seed;
        if (high - low > Math.min(64, length * .5)) continue;
        const across = range(low + 2, high - 2, Math.max(4, Math.floor(high - low - 3)));
        // The source endpoints are approximate hints. Search for actual short
        // cross-band jambs locally, then independently recheck their two piers.
        // These offsets are diagnostic measurements, never replacement openings.
        const searchRadius = Math.ceil(Math.min(64, length * .6));
        const capSupport = (t: number) => average(across.map(offset => ink(t, offset, 1)));
        const caps = (near: number, side: 'left' | 'right') => {
          const result: number[] = []; let from: number | undefined;
          for (let t = near - searchRadius; t <= near + searchRadius + 1; t++) {
            const strong = t <= near + searchRadius && across.every(offset => inside(at(t, offset))) && capSupport(t) >= .8;
            if (strong && from === undefined) from = t;
            if (!strong && from !== undefined) {
              const to = t - 1, clippedLeft = from === near - searchRadius, clippedRight = to === near + searchRadius;
              if (seed.style === 'filled') {
                if (side === 'left' && !clippedRight) result.push(to);
                if (side === 'right' && !clippedLeft) result.push(from);
              } else if (!clippedLeft && !clippedRight && to - from <= Math.max(8, length * .2)) result.push((from + to) / 2);
              from = undefined;
            }
          }
          return result;
        };
        const pairs = caps(0, 'left').flatMap(left => caps(length, 'right').flatMap(right =>
          right - left >= length * .5 && right - left <= length * 2.2 ? [[left, right] as [number, number]] : []));
        if (!pairs.length || pairs.length > 16) {
          rejectedBands.push({ ...seed, jambPositionsPx: [0, length], jambSupport: [], faceSupport: [], openingSignature: 0,
            reasons: [pairs.length ? 'ambiguous-jamb-search-limit' : 'missing-jamb-evidence'] }); continue;
        }
        for (const jambPositionsPx of pairs) {
          const [left, right] = jambPositionsPx, sides = [range(left - flankLength, left - 3, 8), range(right + 3, right + flankLength, 8)];
          const faceSupport = [low, high].flatMap(offset => sides.map(side => average(side.map(t => ink(t, offset, 0, 1)))));
          const jambSupport = jambPositionsPx.map(capSupport), interior = range(left + (right - left) * .2, right - (right - left) * .2, 16);
          let openingSignature = 0;
          if (opening.kind === 'window' && seed.style === 'outlined') {
            openingSignature = Math.max(...across.map(offset => average(interior.map(t => ink(t, offset)))
              - Math.max(...sides.map(side => average(side.map(t => ink(t, offset)))))));
          } else {
            const offsets = seed.style === 'filled' ? across : [low, high];
            openingSignature = Math.max(...offsets.map(offset => Math.min(...sides.map(side => average(side.map(t => ink(t, offset)))))
              - average(interior.map(t => ink(t, offset)))));
          }
          const measured = { ...seed, jambPositionsPx, faceSupport, jambSupport, openingSignature }, reasons: string[] = [];
          if (!sides.flat().every(t => inside(at(t, low)) && inside(at(t, high)))) reasons.push('incomplete-local-context');
          if (faceSupport.some(s => s < .75)) reasons.push('incomplete-flanking-faces');
          if (jambSupport.some(s => s < .8)) reasons.push('missing-jamb-evidence');
          if (openingSignature < .45) reasons.push('no-aperture-specific-pattern');
          if (reasons.length) rejectedBands.push({ ...measured, reasons }); else bands.push(measured);
        }
      }
      audit.thresholds.push({ contrast, faceRuns, bands, rejectedBands, truncated });
    }
    const middle = audit.thresholds.find(t => t.contrast === 95)!;
    for (const seed of middle.bands) {
      if (!audit.thresholds.every(t => !t.truncated && t.bands.some(b => b.style === seed.style && Math.abs(b.low - seed.low) <= 2 && Math.abs(b.high - seed.high) <= 2 && b.jambPositionsPx.every((p, i) => Math.abs(p - seed.jambPositionsPx[i]) <= 3)))) continue;
      const midpoint = (seed.low + seed.high) / 2;
      const wallRelations: WallRelation[] = walls.flatMap(w => {
        if (w.curvePoint) return [];
        const wx = w.end.x - w.start.x, wy = w.end.y - w.start.y, wallLength = Math.hypot(wx, wy);
        if (!wallLength || Math.abs((wx * u.x + wy * u.y) / wallLength) < Math.cos(Math.PI / 36)) return [];
        const along = [w.start, w.end].map(p => (p.x - a.x) * u.x + (p.y - a.y) * u.y);
        if (Math.min(...along) > 3 || Math.max(...along) < length - 3) return [];
        const offset = average([w.start, w.end].map(p => (p.x - a.x) * n.x + (p.y - a.y) * n.y));
        const nearFace = (r: [number, number]) => offset >= r[0] - 3 && offset <= r[1] + 3;
        const relation = Math.abs(offset - midpoint) <= 3 ? 'middle' : nearFace(seed.faceRanges[0]) ? 'lower-face' : nearFace(seed.faceRanges[1]) ? 'upper-face' : undefined;
        return relation ? [{ sourcePath: w.sourcePath, relation }] : [];
      });
      const faces = new Set(wallRelations.map(r => r.relation));
      const interpretation = faces.has('middle') ? 'baseline-consistent' : faces.has('lower-face') && faces.has('upper-face') ? 'both-faces-recorded'
        : faces.has('lower-face') || faces.has('upper-face') ? 'one-face-recorded' : 'no-corresponding-wall';
      audit.candidates.push({ ...seed, midpointResidualPx: Math.abs(midpoint), wallRelations, interpretation,
        polygon: [at(seed.jambPositionsPx[0] - flankLength, seed.low), at(seed.jambPositionsPx[1] + flankLength, seed.low), at(seed.jambPositionsPx[1] + flankLength, seed.high), at(seed.jambPositionsPx[0] - flankLength, seed.high)] });
    }
    audit.status = audit.candidates.length > 1 ? 'ambiguous-wall-bands' : audit.candidates.length === 1
      ? audit.candidates[0].interpretation === 'baseline-consistent' ? 'baseline-consistent' : 'unapproved-wall-band' : 'insufficient-evidence';
  }
  const groups = new Map<string, { sourceWallPaths: string[]; openingPaths: string[] }>();
  for (const audit of audits.filter(a => a.status === 'unapproved-wall-band')) {
    const paths = audit.candidates[0].wallRelations.map(r => r.sourcePath).sort();
    if (!paths.length) continue;
    const key = paths.join(','); const group = groups.get(key) ?? { sourceWallPaths: paths, openingPaths: [] };
    group.openingPaths.push(audit.sourcePath); groups.set(key, group);
  }
  return { schemaVersion: 'source-aperture-wall-band-review-v1' as const, method: 'local-paired-faces-and-pixel-jambs-v2', mode: 'read-only' as const,
    geometryChanged: false as const, appliedWallChanges: 0, appliedOpeningChanges: 0, llmCalls: 0,
    sourceSize: { width: evidence.width, height: evidence.height },
    background: evidence.backgroundEstimate, thresholds: masks.map(m => m.contrast), invalidWalls, audits, wallBandGroups: [...groups.values()],
    limitation: 'Local paired-face and aperture-symbol hypotheses only. They do not authorize merging walls, choosing hosts, changing geometry or accepting source accuracy.' };
}
