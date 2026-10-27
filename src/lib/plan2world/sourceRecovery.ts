import { parseSourceArchitecture, preflightArchitectureObservation, prepareArchitectureStage, assertArchitectureHostsResolved, type SourceArchitectureV1 } from './architecture';
import type { DraftPoint } from './draft';
import type { ReconstructionAssemblyContext } from './reconstructionAssembly';
import type { SourceRasterInput } from './rasterWallContinuation';
import { resolveSourcePointReferenceTransport, SOURCE_POINT_REFERENCES_VERSION } from './sourcePointReferences';
import { floorBoundaryProblem, floorBoundaryPolygon } from '$lib/utils/floorBoundary';
import { pointInPolygon } from '$lib/utils/hitTesting';
import { imageSha256 } from './imagePreparation';
import { projectOntoWall } from '$lib/utils/wallProjection';

type Wall = SourceArchitectureV1['walls'][number];
type Stage = ReturnType<typeof prepareArchitectureStage>;
type SourcePath = `walls[${number}]` | `openings[${number}]` | `functionalZones[${number}]`;
export interface SourceRecoveryChange {
  kind: 'sliding-kind-alias' | 'zero-area-outline-spur' | 'coincident-wall-union' | 'observed-jamb-gap' | 'reviewed-source-revision';
  paths: string[];
  before: unknown;
  after: unknown;
}
export interface SourceRecoveryRequest {
  schemaVersion: 'source-architecture-review-request-v1';
  requestId: string;
  phase: 'observation' | 'opening-hosts';
  stageSha256?: string;
  source: { sha256: string; width: number; height: number };
  issue: { code: 'invalid-outline' | 'invalid-observation' | 'ambiguous-wall-overlap' | 'unresolved-host'; message: string };
  focusBox: [number, number, number, number];
  contextBox: [number, number, number, number];
  localObservations: { path: SourcePath; value: unknown }[];
  allowedReplacements: SourcePath[];
  allowAdditionalWalls: boolean;
  apertureHostCandidates: { openingPath: SourcePath; start: DraftPoint; end: DraftPoint }[];
  choices: ('confirm-aperture-host' | 'revise-local-source' | 'unconfirmed')[];
  instruction: string;
}
export interface SourceRecoveryDecision {
  schemaVersion: 'source-architecture-review-decision-v1';
  requestId: string;
  choice: 'confirm-aperture-host' | 'revise-local-source' | 'unconfirmed';
  evidence: string;
  replacements?: { path: SourcePath; value: unknown }[];
  additionalWalls?: unknown[];
}
export interface SourceRecoveryAudit {
  schemaVersion: 'source-architecture-recovery-audit-v1';
  originalObservation: unknown;
  programProjection: unknown;
  originalSha256: string;
  pointReferenceAudit?: ReturnType<typeof resolveSourcePointReferenceTransport>['audit'];
  source: SourceRecoveryRequest['source'];
  changes: SourceRecoveryChange[];
  failures: { phase: string; message: string }[];
  projections: { phase: string; sha256: string }[];
  reviews: { actor: 'model' | 'human'; request: SourceRecoveryRequest; decision: unknown }[];
  reviewCount: number;
  automaticReviewCount: number;
  status: 'pending' | 'preflight-ready' | 'ready' | 'review-required';
}
export interface SourceRecoveryOptions {
  /** An explicit callback is the authorization for at most ONE additional local
   * review. Default callers/desktop paid observers do not supply this callback. */
  review?: (request: SourceRecoveryRequest) => Promise<unknown>;
  reviewActor?: 'model' | 'human';
  onAudit?: (audit: SourceRecoveryAudit) => void;
  onStage?: (stage: Stage, phase: 'initial' | 'automatic' | 'reviewed') => void;
}
export class SourceRecoveryRequired extends Error {
  constructor(message: string, public audit: SourceRecoveryAudit, public request?: SourceRecoveryRequest) {
    super(message); this.name = 'SourceRecoveryRequired';
  }
}
const obj = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const pt = (x: unknown): x is DraftPoint => obj(x) && typeof x.x === 'number' && typeof x.y === 'number' && Number.isFinite(x.x) && Number.isFinite(x.y);
const same = (a: DraftPoint, b: DraftPoint) => a.x === b.x && a.y === b.y;
const cross = (a: DraftPoint, b: DraftPoint, c: DraftPoint) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const hash = (x: unknown) => imageSha256(new TextEncoder().encode(JSON.stringify(x)));
const geometry = (w: Wall) => ({ start: w.start, end: w.end, ...(w.curvePoint ? { curvePoint: w.curvePoint } : {}) });
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const signedArea = (edges: any[]) => edges.reduce((sum, b, i) => {
  const p = b.point, q = edges[(i + 1) % edges.length].point; return sum + p.x * q.y - q.x * p.y;
}, 0);

/** Program projection only: cancel zero-area straight WALL excursions. Never
 * reorder vertices, simplify corners, delete a passage or infer a new outline. */
function normalizeOutlines(input: Record<string, any>, changes: SourceRecoveryChange[]) {
  if (!Array.isArray(input.functionalZones)) return;
  input.functionalZones.forEach((zone: any, zi: number) => {
    const exactPoint = (p: unknown) => pt(p) && Object.keys(p).every(k => k === 'x' || k === 'y');
    if (!obj(zone) || !Array.isArray(zone.boundary) || zone.boundary.length > 128
      || zone.boundary.some((b: any) => !obj(b) || Object.keys(b).some(k => !['point', 'kind', 'evidence', 'curvePoint'].includes(k))
        || !exactPoint(b.point) || typeof b.evidence !== 'string' || !b.evidence.trim()
        || !['wall', 'window', 'passage', 'railing', 'air', 'unknown'].includes(b.kind)
        || b.curvePoint !== undefined && !exactPoint(b.curvePoint))) return;
    const original = zone.boundary, result = structuredClone(original);
    let removed = true;
    while (removed && result.length > 3) {
      removed = false;
      for (let n = 1; n <= result.length; n++) {
        const i = n % result.length, a = result[(i + result.length - 1) % result.length], b = result[i], c = result[(i + 1) % result.length];
        if (a.kind !== 'wall' || b.kind !== 'wall' || a.curvePoint || b.curvePoint) continue;
        const dot = (b.point.x - a.point.x) * (c.point.x - b.point.x) + (b.point.y - a.point.y) * (c.point.y - b.point.y);
        if (same(a.point, b.point) || same(b.point, c.point) || cross(a.point, b.point, c.point) === 0 && dot < 0) {
          result.splice(i, 1); removed = true; break;
        }
      }
    }
    if (result.length === original.length || signedArea(original) !== signedArea(result) || !pt(zone.position)
      || floorBoundaryProblem(result, []) || !pointInPolygon(zone.position, floorBoundaryPolygon(result, []))) return;
    changes.push({ kind: 'zero-area-outline-spur', paths: [`functionalZones[${zi}].boundary`], before: structuredClone(original), after: structuredClone(result) });
    zone.boundary = result;
  });
}

/** Exact source-coordinate union. Close parallel lines, gapped runs, differing
 * curve controls and uncertain/rejected candidates are never merged. */
function coalesceWalls(architecture: SourceArchitectureV1, changes: SourceRecoveryChange[]) {
  const walls = architecture.walls;
  if (walls.length > 2048) throw new Error('Source recovery supports at most 2048 wall observations.');
  const parents = walls.map((_, i) => i);
  const find = (i: number): number => parents[i] === i ? i : parents[i] = find(parents[i]);
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
    const a = walls[i], b = walls[j];
    if (a.decision !== 'accept' || b.decision !== 'accept') continue;
    let match = false;
    if (a.curvePoint || b.curvePoint) {
      match = !!a.curvePoint && !!b.curvePoint && same(a.curvePoint, b.curvePoint)
        && (same(a.start, b.start) && same(a.end, b.end) || same(a.start, b.end) && same(a.end, b.start));
    } else if (!same(a.start, a.end) && cross(a.start, a.end, b.start) === 0 && cross(a.start, a.end, b.end) === 0) {
      const along = (p: DraftPoint) => (p.x - a.start.x) * (a.end.x - a.start.x) + (p.y - a.start.y) * (a.end.y - a.start.y);
      match = Math.min(along(a.end), Math.max(along(b.start), along(b.end))) > Math.max(0, Math.min(along(b.start), along(b.end)));
    }
    if (match) { const x = find(i), y = find(j); parents[Math.max(x, y)] = Math.min(x, y); }
  }
  const groups = new Map<number, number[]>();
  walls.forEach((_, i) => { const key = find(i); groups.set(key, [...(groups.get(key) ?? []), i]); });
  const omitted = new Set<number>();
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const first = walls[indices[0]], before = indices.map(i => geometry(walls[i]));
    if (!first.curvePoint) {
      const dx = first.end.x - first.start.x, dy = first.end.y - first.start.y;
      const points = indices.flatMap(i => [walls[i].start, walls[i].end]).sort((a, b) => a.x * dx + a.y * dy - b.x * dx - b.y * dy);
      first.start = structuredClone(points[0]); first.end = structuredClone(points[points.length - 1]);
    }
    indices.slice(1).forEach(i => omitted.add(i));
    changes.push({ kind: 'coincident-wall-union', paths: indices.map(i => `walls[${i}]`), before, after: geometry(first) });
  }
  architecture.walls = walls.filter((_, i) => !omitted.has(i));
}

/** Only bridge an accepted DOOR between unique, exactly collinear opposing
 * source wall endpoints. No snapping, nearest-wall choice or extra solid span. */
function observedDoorGaps(architecture: SourceArchitectureV1, stage: Stage, changes: SourceRecoveryChange[]) {
  const walls = architecture.walls.filter(w => w.decision === 'accept');
  for (const failure of stage.openingAudit.filter(o => o.programStatus === 'unresolved-host' && o.kind === 'door')) {
    const [a, b] = failure.endpoints, dx = b.x - a.x, dy = b.y - a.y, size = dx * dx + dy * dy;
    if (!size) continue;
    const along = (p: DraftPoint) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / size;
    const flank = (end: DraftPoint, side: 'left' | 'right') => walls.filter(w => {
      if (w.curvePoint || cross(a, b, w.start) !== 0 || cross(a, b, w.end) !== 0) return false;
      const other = same(w.start, end) ? w.end : same(w.end, end) ? w.start : undefined;
      return other && (side === 'left' ? along(other) < 0 : along(other) > 1);
    });
    if (flank(a, 'left').length !== 1 || flank(b, 'right').length !== 1) continue;
    const obstruction = walls.some(w => {
      if (w.curvePoint) return [a, b, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }].some(p => (projectOntoWall(p, w)?.distance ?? Infinity) <= 3);
      if (cross(a, b, w.start) === 0 && cross(a, b, w.end) === 0) return Math.min(1, Math.max(along(w.start), along(w.end))) > Math.max(0, Math.min(along(w.start), along(w.end)));
      const sx = w.end.x - w.start.x, sy = w.end.y - w.start.y, det = dx * sy - dy * sx;
      if (!det) return false;
      const ox = w.start.x - a.x, oy = w.start.y - a.y, t = (ox * sy - oy * sx) / det, u = (ox * dy - oy * dx) / det;
      return t > 0 && t < 1 && u >= 0 && u <= 1;
    });
    const competing = architecture.openings.some((o, i) => i !== failure.candidate - 1 && o.decision === 'accept'
      && o.endpoints.every(p => cross(a, b, p) === 0)
      && Math.min(1, Math.max(...o.endpoints.map(along))) > Math.max(0, Math.min(...o.endpoints.map(along))));
    if (obstruction || competing || architecture.doorGaps.some(g => same(g.from, a) && same(g.to, b) || same(g.from, b) && same(g.to, a))) continue;
    const gap = { from: structuredClone(a), to: structuredClone(b), evidence: `Program-derived gap for accepted openings[${failure.candidate - 1}]; both jambs meet unique exact collinear source flanks.` };
    architecture.doorGaps.push(gap);
    changes.push({ kind: 'observed-jamb-gap', paths: [`openings[${failure.candidate - 1}]`, `doorGaps[${architecture.doorGaps.length - 1}]`], before: null, after: gap });
  }
}

function pointsIn(value: unknown): DraftPoint[] {
  if (pt(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(pointsIn);
  return obj(value) ? Object.values(value).flatMap(pointsIn) : [];
}
function readPath(root: any, path: SourcePath) {
  const m = /^(walls|openings|functionalZones)\[(\d+)\]$/.exec(path);
  if (!m || !Array.isArray(root[m[1]]) || Number(m[2]) >= root[m[1]].length) throw new Error('Review path is not an existing source observation.');
  return { array: root[m[1]] as any[], index: Number(m[2]) };
}

export class SourceRecoverySession {
  private current: any;
  private ledger: SourceRecoveryAudit;
  private preparationStarted = false;
  private constructor(input: unknown, private context: ReconstructionAssemblyContext, private options: SourceRecoveryOptions, originalSha256: string) {
    this.current = structuredClone(input);
    this.ledger = { schemaVersion: 'source-architecture-recovery-audit-v1', originalObservation: structuredClone(input), programProjection: structuredClone(input), originalSha256,
      source: { sha256: context.sourceImageSha256!, width: context.sourceWidthPx!, height: context.sourceHeightPx! },
      changes: [], failures: [], projections: [], reviews: [], reviewCount: 0, automaticReviewCount: 0, status: 'pending' };
  }
  static async create(input: unknown, context: ReconstructionAssemblyContext, options: SourceRecoveryOptions = {}) {
    if (![context.sourceWidthPx, context.sourceHeightPx].every(n => Number.isSafeInteger(n) && n! > 0)
      || context.sourceWidthPx! * context.sourceHeightPx! > 24_000_000
      || !/^[a-f0-9]{64}$/.test(context.sourceImageSha256 ?? '')) throw new Error('Source recovery requires the confirmed raster dimensions and SHA-256.');
    return new SourceRecoverySession(input, { ...context }, options, await hash(input));
  }
  get audit() { return structuredClone(this.ledger); }
  get architecture(): SourceArchitectureV1 {
    if (!['preflight-ready', 'ready'].includes(this.ledger.status)) throw new Error('Source recovery has not produced a validated projection.');
    return structuredClone(this.current);
  }
  private emit() { this.ledger.programProjection = structuredClone(this.current); this.options.onAudit?.(this.audit); }
  private stop(error: unknown, request?: SourceRecoveryRequest): never {
    this.ledger.status = 'review-required'; this.emit();
    throw new SourceRecoveryRequired(message(error), this.audit, request);
  }
  private async project() {
    let input = structuredClone(this.current);
    if (obj(input) && input.schemaVersion === SOURCE_POINT_REFERENCES_VERSION) {
      const expanded = resolveSourcePointReferenceTransport(input, { width: this.ledger.source.width, height: this.ledger.source.height });
      input = expanded.architectureInput; this.ledger.pointReferenceAudit = expanded.audit;
    }
    if (pointsIn(input).some(p => p.x < 0 || p.y < 0 || p.x > this.ledger.source.width || p.y > this.ledger.source.height)) {
      throw new Error('Architecture evidence lies outside the original source raster.');
    }
    if (obj(input) && Array.isArray(input.openings)) input.openings.forEach((o: any, i: number) => {
      if (obj(o) && o.kind === 'slidingDoor' && o.doorType === 'sliding') {
        this.ledger.changes.push({ kind: 'sliding-kind-alias', paths: [`openings[${i}].kind`], before: 'slidingDoor', after: 'door' }); o.kind = 'door';
      }
    });
    if (obj(input)) normalizeOutlines(input, this.ledger.changes);
    this.current = input;
    const architecture = parseSourceArchitecture(input);
    coalesceWalls(architecture, this.ledger.changes);
    this.current = architecture;
    return preflightArchitectureObservation(architecture, this.context);
  }
  private async packet(phase: SourceRecoveryRequest['phase'], error: unknown, paths: SourcePath[], stage?: Stage): Promise<SourceRecoveryRequest> {
    const width = this.ledger.source.width, height = this.ledger.source.height;
    const localObservations = paths.map(path => { const p = readPath(this.current, path); return { path, value: structuredClone(p.array[p.index]) }; });
    const points = localObservations.flatMap(x => pointsIn(x.value));
    const box = (padding: number): SourceRecoveryRequest['focusBox'] => points.length ? [
      Math.max(0, Math.floor(Math.min(...points.map(p => p.x))) - padding), Math.max(0, Math.floor(Math.min(...points.map(p => p.y))) - padding),
      Math.min(width, Math.ceil(Math.max(...points.map(p => p.x))) + padding + 1), Math.min(height, Math.ceil(Math.max(...points.map(p => p.y))) + padding + 1),
    ] : [0, 0, width, height];
    const code = phase === 'opening-hosts' ? 'unresolved-host' : paths.some(p => p.startsWith('functionalZones')) ? 'invalid-outline'
      : paths.every(p => p.startsWith('walls')) ? 'ambiguous-wall-overlap' : 'invalid-observation';
    // Hypotheses only. The reviewer must confirm actual jambs in the image.
    // Their eventual hosts span exactly the existing aperture, never flanking
    // solid wall, and must still pass the original host/geometry checks.
    let apertureHostCandidates = phase !== 'opening-hosts' ? [] : localObservations.map(({ path, value }) => {
      const opening = value as SourceArchitectureV1['openings'][number];
      return { openingPath: path, start: structuredClone(opening.endpoints[0]), end: structuredClone(opening.endpoints[1]) };
    });
    if (apertureHostCandidates.some(c => this.current.walls.some((w: Wall) => w.decision === 'accept' && w.curvePoint
      && [c.start, c.end, { x: (c.start.x + c.end.x) / 2, y: (c.start.y + c.end.y) / 2 }].some(p => (projectOntoWall(p, w)?.distance ?? Infinity) <= 3)))) apertureHostCandidates = [];
    const body = { schemaVersion: 'source-architecture-review-request-v1' as const, phase, ...(stage ? { stageSha256: await hash(stage) } : {}), source: this.ledger.source,
      issue: { code, message: code === 'ambiguous-wall-overlap' ? 'These source wall paths become overlapping after ordinary normalization. Confirm whether they describe one physical boundary, or revise the local source paths.' : message(error) }, focusBox: box(8), contextBox: box(64), localObservations,
      allowedReplacements: paths, allowAdditionalWalls: phase === 'opening-hosts', apertureHostCandidates,
      choices: [...(apertureHostCandidates.length ? ['confirm-aperture-host' as const] : []), 'revise-local-source' as const, 'unconfirmed' as const],
      instruction: 'Choose a source interpretation using the original overview and local context. Confirm only straight apertures; curved, obscured or inconsistent framing requires revision or unconfirmed. If confirmed, provide only the listed local source records and necessary wall evidence. A wall host and aperture must agree. Unknown or neither interpretation is valid means unconfirmed. No native IDs, inferred access, scale/furniture changes or closure-score optimization.' };
    return { ...body, issue: body.issue as SourceRecoveryRequest['issue'], requestId: await hash({ original: this.ledger.originalSha256, current: this.current, body }) };
  }
  private async review(request: SourceRecoveryRequest) {
    if (!this.options.review || this.ledger.reviewCount >= 1) this.stop('Local source confirmation is required; no further automatic review is authorized.', request);
    this.ledger.reviewCount++;
    if (this.options.reviewActor !== 'human') this.ledger.automaticReviewCount++;
    this.emit();
    let raw: unknown;
    try { raw = await this.options.review(structuredClone(request)); }
    catch (e) { this.stop(e, request); }
    this.ledger.reviews.push({ actor: this.options.reviewActor ?? 'model', request: structuredClone(request), decision: structuredClone(raw) });
    if (!obj(raw) || Object.keys(raw).some(k => !['schemaVersion', 'requestId', 'choice', 'evidence', 'replacements', 'additionalWalls'].includes(k))
      || raw.schemaVersion !== 'source-architecture-review-decision-v1' || raw.requestId !== request.requestId
      || !request.choices.includes(raw.choice) || typeof raw.evidence !== 'string' || !raw.evidence.trim()) this.stop('Malformed or stale source-review decision.', request);
    if (raw.choice === 'unconfirmed') this.stop('Source review remains unconfirmed; preserve the failure for manual review.', request);
    let replacements = raw.replacements ?? [], added = raw.additionalWalls ?? [];
    if (raw.choice === 'confirm-aperture-host') {
      if (raw.replacements !== undefined || raw.additionalWalls !== undefined || !request.apertureHostCandidates.length) this.stop('An aperture confirmation must select only the pinned program candidates.', request);
      replacements = [];
      added = request.apertureHostCandidates.map((candidate, i) => ({ label: `Reviewed aperture-only host ${i + 1}`,
        start: structuredClone(candidate.start), end: structuredClone(candidate.end), decision: 'accept',
        evidence: raw.evidence, decisionBasis: `Source reviewer confirmed both jambs of ${candidate.openingPath}. Host spans only that aperture.` }));
    }
    if (!Array.isArray(replacements) || replacements.length > request.allowedReplacements.length || !Array.isArray(added) || added.length > 8
      || !request.allowAdditionalWalls && added.length || !replacements.length && !added.length) this.stop('Source review must contain a bounded local revision.', request);
    const next = structuredClone(this.current), used = new Set<string>();
    const inside = (value: unknown) => pointsIn(value).every(p => p.x >= request.contextBox[0] && p.x <= request.contextBox[2] && p.y >= request.contextBox[1] && p.y <= request.contextBox[3]);
    for (const r of replacements) {
      if (!obj(r) || Object.keys(r).some(k => !['path', 'value'].includes(k)) || !request.allowedReplacements.includes(r.path) || used.has(r.path) || !inside(r.value)) this.stop('Source review tried to change evidence outside the requested region.', request);
      used.add(r.path); const target = readPath(next, r.path), previous = target.array[target.index];
      if (!obj(r.value) || r.value.decision !== previous.decision
        || r.path.startsWith('openings') && r.value.kind !== previous.kind
        || r.path.startsWith('functionalZones') && (r.value.category !== previous.category || r.value.environment !== previous.environment
          || JSON.stringify(r.value.position) !== JSON.stringify(previous.position))) {
        this.stop('A local review cannot discard accepted features, change their kind or move a zone seed. Preserve this case for manual re-observation.', request);
      }
      target.array[target.index] = structuredClone(r.value);
    }
    if (added.some(w => !inside(w))) this.stop('Additional reviewed walls exceed the local context.', request);
    next.walls.push(...structuredClone(added));
    this.ledger.changes.push({ kind: 'reviewed-source-revision', paths: [...used, ...added.map((_, i) => `walls[${this.current.walls.length + i}]`)],
      before: structuredClone(request.localObservations), after: { evidence: raw.evidence, replacements: structuredClone(replacements), additionalWalls: structuredClone(added) } });
    this.current = next;
  }
  async preflight(): Promise<SourceArchitectureV1> {
    try { await this.project(); }
    catch (e) {
      this.ledger.failures.push({ phase: 'observation', message: message(e) });
      // A failed outline has a concrete local source record; malformed root/
      // contract data stays an actionable caller error, not an image retry.
      const match = /^functionalZones\[(\d+)\] (?:requires a simple source outline containing its seed|contains a collapsed edge)/.exec(message(e));
      let paths: SourcePath[] = [];
      if (match && obj(this.current) && Array.isArray(this.current.functionalZones)) paths = [`functionalZones[${Number(match[1])}]`];
      else if (/^(?:Duplicate|Overlapping) normalized wall geometry:/.test(message(e)) && Array.isArray(this.current?.walls)) {
        const indices = this.current.walls.flatMap((w: Wall, i: number) => w.decision === 'accept' ? [i] : []);
        const ids = [...new Set([...message(e).matchAll(/\bw(\d+)(?:~\d+)?/g)].map(m => Number(m[1]) - 1))];
        if (ids.length === 2 && ids.every(i => indices[i] !== undefined)) paths = ids.map(i => `walls[${indices[i]}]` as SourcePath);
      }
      if (!paths.length) this.stop(e);
      const request = await this.packet('observation', e, paths);
      await this.review(request);
      try { await this.project(); } catch (again) { this.ledger.failures.push({ phase: 'review-validation', message: message(again) }); this.stop(again, request); }
    }
    this.ledger.status = 'preflight-ready'; this.ledger.projections.push({ phase: 'preflight', sha256: await hash(this.current) }); this.emit();
    return this.architecture;
  }
  async prepare(furnishing: unknown, raster?: SourceRasterInput): Promise<Stage> {
    if (this.ledger.status !== 'preflight-ready' || this.preparationStarted) this.stop('Run observation preflight once before furnishing; a completed or failed session cannot be reused.');
    this.preparationStarted = true;
    let stage: Stage;
    try { stage = prepareArchitectureStage(this.current, this.context, furnishing, raster); }
    catch (e) { this.ledger.failures.push({ phase: 'preparation', message: message(e) }); this.stop(e); }
    this.options.onStage?.(structuredClone(stage!), 'initial');
    try { assertArchitectureHostsResolved(stage!); }
    catch (e) { this.ledger.failures.push({ phase: 'opening-hosts-before-recovery', message: message(e) }); }
    const automatic = structuredClone(this.current), before = this.ledger.changes.length;
    observedDoorGaps(automatic, stage!, this.ledger.changes);
    if (this.ledger.changes.length > before) {
      try {
        this.current = preflightArchitectureObservation(automatic, this.context);
        stage = prepareArchitectureStage(this.current, this.context, furnishing, raster);
        this.options.onStage?.(structuredClone(stage), 'automatic');
      } catch (e) { this.ledger.failures.push({ phase: 'program-gap-validation', message: message(e) }); this.stop(e); }
    }
    try { assertArchitectureHostsResolved(stage!); }
    catch (e) {
      this.ledger.failures.push({ phase: 'opening-hosts', message: message(e) });
      const paths = stage!.openingAudit.filter(o => o.programStatus === 'unresolved-host').map(o => `openings[${o.candidate - 1}]` as SourcePath);
      if (!paths.length || paths.length > 8) this.stop(e);
      const request = await this.packet('opening-hosts', e, paths, stage!);
      await this.review(request);
      try { await this.project(); stage = prepareArchitectureStage(this.current, this.context, furnishing, raster); this.options.onStage?.(structuredClone(stage), 'reviewed'); assertArchitectureHostsResolved(stage); }
      catch (again) { this.ledger.failures.push({ phase: 'review-validation', message: message(again) }); this.stop(again, request); }
    }
    this.ledger.status = 'ready'; this.ledger.projections.push({ phase: 'final-architecture', sha256: await hash(this.current) }); this.emit();
    return stage!;
  }
}
