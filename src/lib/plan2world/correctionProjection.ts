import type { Point } from '../models/types';
import { createDefaultProject } from '../models/projectDefaults';
import { parseSourceArchitecture, parseSourceFurnishing, type SourceArchitectureV1 } from './architecture';
import { buildBareHouse, WallGeometryConflictError } from './bareHouse';
import { deriveSourceOpenings, resolveOpeningHost } from './sourceOpenings';
import { initialOpeningHeight } from './openingDefaults';
import type { SourceFloorPlanImage } from './sourceBackground';
import { sourceRecord, isSourcePoint, sourcePoints, sourceDiagnostic, type SourceDiagnostic, type SourceFeatureOutcome } from './sourceDiagnostics';

type Indexed<T> = { value: T; index: number; path: string; outcome: SourceFeatureOutcome };
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const collections = ['walls', 'openings', 'doorGaps', 'junctions', 'functionalZones'] as const;
const wallGeometry = (w: any) => ({ start: w.start, end: w.end, ...(w.curvePoint === undefined ? {} : { curvePoint: w.curvePoint }) });

/** Authoring-only salvage. No closure, raster fitting, invented hosts, or rooms.
 * Strict whole-observation APIs do not call this projection. */
export function projectSourceForCorrection(raw: unknown, furnishing: unknown, image: SourceFloorPlanImage, pipelineFailure: string) {
  const diagnostics: SourceDiagnostic[] = [], features: SourceFeatureOutcome[] = [];
  const project = createDefaultProject('Floor plan · correction'), floor = project.floors[0];
  const inside = (p: Point) => isSourcePoint(p) && p.x >= 0 && p.y >= 0 && p.x <= image.width && p.y <= image.height;
  const bounded = (v: unknown) => { if (sourcePoints(v).some(p => !inside(p))) throw new Error('Source evidence lies outside the original raster.'); };
  let base: SourceArchitectureV1 | undefined;
  if (sourceRecord(raw)) {
    try {
      if (!Array.isArray(raw.walls) || !Array.isArray(raw.openings)) throw new Error('Architecture requires walls and openings arrays');
      for (const key of collections) if (raw[key] !== undefined && !Array.isArray(raw[key])) throw new Error(`${key} must be an array`);
      const {structureEvidence: _advisory, ...envelope}=raw;
      base = parseSourceArchitecture({ ...envelope, walls: [], openings: [], doorGaps: [], junctions: [],
        ...(raw.functionalZones === undefined ? {} : { functionalZones: [] }) });
      bounded(base.scaleEvidence);
      const factor = base.scaleEvidence.realLengthCm / Math.hypot(base.scaleEvidence.endpoints[1].x - base.scaleEvidence.endpoints[0].x, base.scaleEvidence.endpoints[1].y - base.scaleEvidence.endpoints[0].y);
      if (!Number.isFinite(factor) || !Number.isFinite(factor * Math.max(image.width, image.height))) throw new Error('Source scale cannot produce finite native coordinates.');
    } catch (e) { base = undefined; sourceDiagnostic(diagnostics, 'invalid-envelope', 'observation', message(e), ['architecture'], raw); }
  } else sourceDiagnostic(diagnostics, 'invalid-envelope', 'observation', 'Architecture must be an observation object.', ['architecture'], raw);
  const scale = base?.scaleEvidence;
  const factor = scale ? scale.realLengthCm / Math.hypot(scale.endpoints[1].x - scale.endpoints[0].x, scale.endpoints[1].y - scale.endpoints[0].y) : 1;
  const convert = (p: Point) => ({ x: p.x * factor, y: p.y * factor });
  floor.backgroundImage = { dataUrl: image.dataUrl, position: convert({ x: image.width / 2, y: image.height / 2 }), scale: factor,
    rotation: 0, opacity: .5, locked: true, reconstructionSource: { width: image.width, height: image.height, registration: 'bounds', name: image.name } };
  const parsed = { walls: [], openings: [], functionalZones: [] } as {
    [K in 'walls' | 'openings' | 'functionalZones']: Indexed<NonNullable<SourceArchitectureV1[K]>[number]>[]
  };
  const invalidWalls: { path: string; record: unknown; diagnostic: string }[] = [];
  for (const key of collections) {
    const values = sourceRecord(raw) && Array.isArray(raw[key]) ? raw[key] : [];
    values.forEach((value: any, index: number) => {
      const path = `${key}[${index}]`;
      const outcome: SourceFeatureOutcome | undefined = ['walls', 'openings', 'functionalZones'].includes(key)
        ? { path, kind: key === 'walls' ? 'wall' : key === 'openings' ? 'opening' : 'zone', status: 'not-assessed', nativeIds: [], blockedBy: [] } : undefined;
      if (outcome) features.push(outcome);
      if (!base) { if (outcome) { outcome.status = 'blocked'; outcome.blockedBy = diagnostics.map(d => d.id); } return; }
      try {
        const item = parseSourceArchitecture({ ...base, [key]: [value] })[key]![0];
        bounded(item);
        if (key === 'walls') buildBareHouse({ schemaVersion: 'source-wall-trace-v1', walls: [wallGeometry(item)] });
        // Every record is parsed by the same strict contract, including rejected evidence.
        if (outcome) {
          (parsed[key as keyof typeof parsed] as Indexed<any>[]).push({ value: item, index, path, outcome });
          outcome.status = value.decision === 'reject' ? 'rejected' : value.decision === 'uncertain' ? 'uncertain' : 'not-assessed';
        }
      } catch (e) {
        const d = sourceDiagnostic(diagnostics, 'invalid-record', 'observation', `${path}: ${message(e).replaceAll(`${key}[0]`, path)}`, [path], value);
        if (outcome) { outcome.status = 'invalid'; outcome.blockedBy = [d.id]; }
        if (key === 'walls') invalidWalls.push({ path, record: value, diagnostic: d.id });
      }
    });
  }
  const walls = parsed.walls.filter(w => w.value.decision === 'accept');
  const disputed = new Map<string, string[]>();
  if (walls.length) try {
    buildBareHouse({ schemaVersion: 'source-wall-trace-v1', walls: walls.map(w => wallGeometry(w.value)) });
  } catch (e) {
    if (e instanceof WallGeometryConflictError) for (const c of e.conflicts) {
      const records = c.sourceWallIds.map(id => walls[Number(id.slice(1)) - 1]).filter(Boolean);
      const d = sourceDiagnostic(diagnostics, 'wall-overlap', 'preflight', 'Wall traces overlap. Select the highlighted wall segments and keep the intended boundary.', records.map(w => w.path), records.map(w => w.value));
      for (const w of records) disputed.set(w.path, [...(disputed.get(w.path) ?? []), d.id]);
    } else {
      const d = sourceDiagnostic(diagnostics, 'wall-preflight', 'preflight', message(e), walls.map(w => w.path));
      for (const w of walls) disputed.set(w.path, [d.id]);
    }
  }
  for (const w of walls) {
    const id = `observed-wall-${w.index + 1}`;
    floor.walls.push({ id, start: convert(w.value.start), end: convert(w.value.end), ...(w.value.curvePoint ? { curvePoint: convert(w.value.curvePoint) } : {}), thickness: 15, height: 280, color: '#444444' });
    w.outcome.status = 'retained'; w.outcome.nativeIds = [id]; w.outcome.blockedBy = disputed.get(w.path) ?? [];
  }
  const rootIds = () => diagnostics.filter(d => d.category === 'root').map(d => d.id);
  const relatedInvalid = (opening: unknown) => invalidWalls.filter(w => {
    const r = w.record;
    if (!sourceRecord(r) || !isSourcePoint(r.start) || !isSourcePoint(r.end) || r.curvePoint !== undefined && !isSourcePoint(r.curvePoint)) return true;
    // Dependency exclusion only: two existing 3px junction bounds. This does
    // not enlarge the 3px aperture acceptance tolerance or move any source point.
    const a = sourcePoints(r), b = sourcePoints(opening);
    return Math.max(...a.map(p => p.x)) + 6 >= Math.min(...b.map(p => p.x)) && Math.min(...a.map(p => p.x)) - 6 <= Math.max(...b.map(p => p.x))
      && Math.max(...a.map(p => p.y)) + 6 >= Math.min(...b.map(p => p.y)) && Math.min(...a.map(p => p.y)) - 6 <= Math.max(...b.map(p => p.y));
  });
  const hosts = walls.map(w => ({ ...w, house: buildBareHouse({ schemaVersion: 'source-wall-trace-v1', walls: [wallGeometry(w.value)] }) }));
  const openingWarnings: string[] = [];
  const intervals: { path: string; wallId: string; low: number; high: number; outcome: SourceFeatureOutcome }[] = [];
  for (const o of parsed.openings.filter(o => o.value.decision === 'accept')) {
    o.outcome.hostAssessed = false;
    const blockedBy = relatedInvalid(o.value).map(w => w.diagnostic);
    const candidates = hosts.filter(w => !!resolveOpeningHost(o.value.endpoints, new Map(w.house.walls.map(s => [s.id, s])), 3, undefined, o.value.kind));
    for (const c of candidates) blockedBy.push(...(disputed.get(c.path) ?? []));
    if (blockedBy.length) {
      const d = sourceDiagnostic(diagnostics, 'opening-blocked', 'opening-hosts', `${o.value.label}: wall-host matching is blocked by disputed source walls and has not been assessed.`, [o.path], o.value, 'blocked', [...new Set(blockedBy)]);
      o.outcome.status = 'blocked'; o.outcome.blockedBy = d.blockedBy; continue;
    }
    o.outcome.hostAssessed = true;
    if (candidates.length !== 1) {
      const d = sourceDiagnostic(diagnostics, candidates.length ? 'ambiguous-host' : 'unresolved-host', 'opening-hosts', `${o.value.label}: ${candidates.length ? 'multiple wall hosts; no automatic association' : 'needs a wall host; add or correct this opening in the plan editor'}.`, [o.path], o.value);
      o.outcome.status = 'unresolved-host'; o.outcome.blockedBy = [d.id]; continue;
    }
    const host = candidates[0], id = `observed-opening-${o.index + 1}`, wallId = host.outcome.nativeIds[0];
    const result = deriveSourceOpenings({ cmPerPixel: factor, bareHouse: host.house, openings: [{ ...o.value, id }] });
    openingWarnings.push(...result.warnings.map(w => `${o.value.label}: ${w.message}`));
    const aperture = result.doors[0] ?? result.windows[0];
    if (!aperture) {
      const d = sourceDiagnostic(diagnostics, 'invalid-aperture', 'opening-hosts', `${o.value.label}: ${result.warnings.map(w => w.message).join('; ')}`, [o.path], o.value);
      o.outcome.status = 'invalid'; o.outcome.blockedBy = [d.id]; continue;
    }
    const height = initialOpeningHeight(floor.walls.find(w => w.id === wallId));
    if (o.value.kind === 'door') floor.doors.push({ id, wallId, position: aperture.position, width: aperture.width, height, type: result.doors[0].type ?? 'single', swingDirection: 'left', flipSide: false });
    else floor.windows.push({ id, wallId, position: aperture.position, width: aperture.width, height, sillHeight: 0, type: 'standard' });
    o.outcome.status = 'retained'; o.outcome.nativeIds = [id];
    const span = result.sourceIntervals[0];
    const ends = span.endpointParameters as number[];
    intervals.push({ path: o.path, wallId, low: Math.min(...ends), high: Math.max(...ends), outcome: o.outcome });
  }
  // A successful individual host match does not authorize overlapping apertures.
  for (let i = 0; i < intervals.length; i++) for (let j = i + 1; j < intervals.length; j++) {
    const a = intervals[i], b = intervals[j];
    if (a.wallId !== b.wallId || Math.min(a.high, b.high) - Math.max(a.low, b.low) <= 1e-9) continue;
    const d = sourceDiagnostic(diagnostics, 'overlapping-apertures', 'opening-hosts', 'Source apertures overlap on the same host. Review both intervals.', [a.path, b.path]);
    for (const item of [a, b]) { item.outcome.status = 'blocked'; item.outcome.blockedBy.push(d.id); }
  }
  const blockedApertures = new Set(intervals.filter(i => i.outcome.status === 'blocked').flatMap(i => i.outcome.nativeIds));
  floor.doors = floor.doors.filter(d => !blockedApertures.has(d.id)); floor.windows = floor.windows.filter(w => !blockedApertures.has(w.id));
  for (const interval of intervals) if (interval.outcome.status === 'blocked') interval.outcome.nativeIds = [];
  if (scale) try {
    const fbase = parseSourceFurnishing(sourceRecord(furnishing) ? { ...furnishing, furniture: [] } : furnishing, scale);
    if (sourceRecord(furnishing) && furnishing.furniture !== undefined && !Array.isArray(furnishing.furniture)) throw new Error('furniture must be an array');
    for (const [i, item] of (sourceRecord(furnishing) ? furnishing.furniture ?? [] : []).entries()) {
      const path = `furniture[${i}]`, outcome: SourceFeatureOutcome = { path, kind: 'furniture', status: 'not-assessed', nativeIds: [], blockedBy: [] }; features.push(outcome);
      try {
        const value = parseSourceFurnishing({ ...fbase, furniture: [item] }, scale).furniture[0]; bounded(value);
        const id = `observed-furniture-${i + 1}`;
        floor.furniture.push({ id, catalogId: 'imported_object', sourceCategory: value.sourceCategory, position: convert(value.position), rotation: 0, scale: { x: 1, y: 1, z: 1 }, renderStyle: 'block' });
        outcome.status = 'retained'; outcome.nativeIds = [id];
      } catch (e) { const d = sourceDiagnostic(diagnostics, 'invalid-record', 'observation', `${path}: ${message(e)}`, [path], item); outcome.status = 'invalid'; outcome.blockedBy = [d.id]; }
    }
  } catch (e) { sourceDiagnostic(diagnostics, 'invalid-furnishing-envelope', 'observation', message(e), ['furnishing'], furnishing); }
  if (!diagnostics.some(d => d.category === 'root')) sourceDiagnostic(diagnostics, 'pipeline-failure', 'assembly', pipelineFailure, []);
  if (!scale) sourceDiagnostic(diagnostics, 'unknown-scale', 'observation', 'Scale could not be read. This correction canvas uses 1 cm per source pixel; establish real dimensions before walkthrough.', ['scaleEvidence'], undefined, 'blocked', rootIds());
  if (!features.some(f => f.kind === 'furniture') && sourceRecord(furnishing) && Array.isArray(furnishing.furniture)) {
    furnishing.furniture.forEach((_: unknown, i: number) => features.push({ path: `furniture[${i}]`, kind: 'furniture', status: 'blocked', nativeIds: [], blockedBy: rootIds() }));
  }
  for (const z of parsed.functionalZones.filter(z => z.value.decision === 'accept')) {
    z.outcome.status = 'blocked'; z.outcome.blockedBy = rootIds();
    sourceDiagnostic(diagnostics, 'zone-blocked', 'assembly', `${z.value.label}: source boundary needs review; complete zone closure has not been assessed.`, [z.path], z.value, 'blocked', rootIds());
  }
  project.reconstruction = { version: 1, scale: { mode: scale?.kind === 'provided_length' ? 'provided' : 'estimated', confidence: scale ? .5 : 0 },
    assumptions: ['Editable partial correction projection. Source errors have not been certified or silently repaired.',
      ...openingWarnings,
      ...(sourceRecord(raw) && Array.isArray(raw.assumptions) ? raw.assumptions.filter((v: unknown) => typeof v === 'string') : []),
      ...(sourceRecord(furnishing) && Array.isArray(furnishing.assumptions) ? furnishing.assumptions.filter((v: unknown) => typeof v === 'string') : [])],
    floors: [{ floorId: floor.id, walls: floor.walls.map(w => ({ id: w.id })), doors: floor.doors.map(d => ({ id: d.id })), windows: floor.windows.map(w => ({ id: w.id })) }] };
  if (image.preparation) project.reconstruction.inputPreparation = structuredClone(image.preparation);
  return { project, diagnostics, features };
}
