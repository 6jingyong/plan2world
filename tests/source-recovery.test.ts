import { describe, expect, it, vi } from 'vitest';
import { SourceRecoverySession, SourceRecoveryRequired, type SourceRecoveryRequest } from '$lib/plan2world/sourceRecovery';
import { preflightArchitectureObservation, assembleFrozenArchitecture } from '$lib/plan2world/architecture';
import { reconstructFloorPlanWithObserver } from '$lib/plan2world/vision';

const context = { sourceWidthPx: 100, sourceHeightPx: 100, sourceImageSha256: 'a'.repeat(64) };
const evidence = { decision: 'accept' as const, evidence: 'Synthetic source stroke/jamb.', decisionBasis: 'Explicit synthetic evidence.' };
const p = (x: number, y: number) => ({ x, y });
function input(): any {
  return { schemaVersion: 'source-architecture-v1', scaleEvidence: { kind: 'provided_length', realLengthCm: 100, endpoints: [p(0, 0), p(100, 0)], evidence: 'Synthetic scale.' },
    walls: [[0, 0, 100, 0], [100, 0, 100, 100], [100, 100, 0, 100], [0, 100, 0, 0]].map(([x, y, a, b], i) => ({ ...evidence, label: `stroke ${i}`, start: p(x, y), end: p(a, b) })),
    openings: [{ ...evidence, label: 'entry', kind: 'door', endpoints: [p(20, 100), p(60, 100)] }], doorGaps: [], junctions: [], assumptions: [] };
}
const furnishing = { schemaVersion: 'source-furnishing-v1', furniture: [{ sourceCategory: 'chair', position: p(50, 50) }] };
function zone(points = [p(0, 0), p(100, 0), p(100, 100), p(0, 100)]): any {
  return { ...evidence, label: 'space', category: 'room', environment: 'indoor', position: p(45, 25),
    boundary: points.map(point => ({ point, kind: 'wall', evidence: 'Synthetic source outline.' })) };
}
const confirm = (request: SourceRecoveryRequest) => ({ schemaVersion: 'source-architecture-review-decision-v1', requestId: request.requestId,
  choice: 'confirm-aperture-host', evidence: 'Synthetic source confirms exactly these two door jambs.' });
const missingHost = () => { const a = input(); a.walls.shift(); a.openings[0].endpoints = [p(20, 0), p(60, 0)]; return a; };

describe('optional source recovery, strict validation retained', () => {
  it('leaves valid observations and the normal two-observation workflow unchanged', async () => {
    const a = input(), before = JSON.stringify(a), observe = vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(furnishing);
    const normal = await reconstructFloorPlanWithObserver(observe, { context });
    const review = vi.fn(), second = vi.fn().mockResolvedValueOnce(a).mockResolvedValueOnce(furnishing);
    const recovered = await reconstructFloorPlanWithObserver(second, { context }, {}, { review });
    expect(recovered.draft).toEqual(normal.draft);
    expect(observe).toHaveBeenCalledTimes(2); expect(second).toHaveBeenCalledTimes(2); expect(review).not.toHaveBeenCalled();
    expect(recovered.recoveryAudit).toMatchObject({ status: 'ready', changes: [], reviewCount: 0, automaticReviewCount: 0 });
    expect(JSON.stringify(a)).toBe(before);
  });

  it('unions transitive exact collinear overlaps without changing coverage or input evidence', async () => {
    const a = input(); a.walls[0].end = p(40, 0);
    a.walls.push({ ...evidence, label: 'middle overlap', start: p(30, 0), end: p(80, 0) }, { ...evidence, label: 'east overlap reversed', start: p(100, 0), end: p(70, 0) });
    const before = JSON.stringify(a);
    expect(() => preflightArchitectureObservation(a, context)).toThrow(/[Oo]verlapping|Duplicate/);
    const s = await SourceRecoverySession.create(a, context), projection = await s.preflight();
    expect(projection.walls).toHaveLength(4); expect(projection.walls[0]).toMatchObject({ start: p(0, 0), end: p(100, 0) });
    expect(s.audit.changes[0]).toMatchObject({ kind: 'coincident-wall-union', paths: ['walls[0]', 'walls[4]', 'walls[5]'] });
    expect(s.audit.originalObservation).toEqual(a); expect(JSON.stringify(a)).toBe(before);
    const stage = await s.prepare(furnishing); expect(assembleFrozenArchitecture(stage, furnishing).draft.floors[0].doors).toHaveLength(1);
  });

  it('does not merge merely adjacent, gapped or near-parallel source lines', async () => {
    const a = input(); a.walls[0].end = p(40, 0); a.walls.push({ ...evidence, label: 'other half', start: p(60, 0), end: p(100, 0) });
    const s = await SourceRecoverySession.create(a, context);
    expect((await s.preflight()).walls).toHaveLength(5); expect(s.audit.changes).toEqual([]);
    const near = input(); near.walls.push({ ...near.walls[0], start: p(0, 1), end: p(100, 1) });
    const n = await SourceRecoverySession.create(near, context);
    await expect(n.preflight()).rejects.toBeInstanceOf(SourceRecoveryRequired);
    expect(n.audit.changes.some(c => c.kind === 'coincident-wall-union')).toBe(false);
  });

  it('offers bounded source records for ambiguous normalized overlaps, without exposing native host IDs', async () => {
    const a = input(); a.walls.push({ ...a.walls[0], label: 'nearby trace', start: p(0, 1), end: p(100, 1) });
    const review = vi.fn(async (request: SourceRecoveryRequest) => ({ schemaVersion: 'source-architecture-review-decision-v1', requestId: request.requestId,
      choice: 'revise-local-source', evidence: 'Synthetic source confirms both records refer to the same boundary.',
      replacements: [{ path: 'walls[4]', value: { ...a.walls[4], start: p(0, 0), end: p(100, 0) } }] }));
    const s = await SourceRecoverySession.create(a, context, { review });
    expect((await s.preflight()).walls).toHaveLength(4);
    const packet = review.mock.calls[0][0]; expect(packet.issue.code).toBe('ambiguous-wall-overlap');
    expect(packet.allowedReplacements).toEqual(['walls[0]', 'walls[4]']); expect(packet.issue.message).not.toContain('w1');
    expect(s.audit.changes.some(c => c.kind === 'reviewed-source-revision')).toBe(true); expect(a.walls[4].start.y).toBe(1);
  });

  it('deduplicates the exact same quadratic path reversed, retaining different curves', async () => {
    const a = input(); a.walls[0].curvePoint = p(50, 20); a.walls.push({ ...a.walls[0], label: 'same reverse', start: p(100, 0), end: p(0, 0) });
    const s = await SourceRecoverySession.create(a, context); expect((await s.preflight()).walls).toHaveLength(4);
    const b = input(); b.walls[0].curvePoint = p(50, 20); b.walls.push({ ...b.walls[0], label: 'different curve', curvePoint: p(50, 30) });
    const t = await SourceRecoverySession.create(b, context); const next = await t.preflight();
    expect(next.walls.filter(w => w.curvePoint)).toHaveLength(2); expect(t.audit.changes).toEqual([]);
  });

  it('cancels a zero-area collinear wall excursion without moving the seed or inventing wall geometry', async () => {
    const a = input(); a.functionalZones = [zone([p(0, 0), p(100, 0), p(90, 0), p(90, 100), p(0, 100)])];
    const before = JSON.stringify(a); expect(() => preflightArchitectureObservation(a, context)).toThrow(/simple source outline/);
    const s = await SourceRecoverySession.create(a, context), projection = await s.preflight();
    expect(projection.functionalZones![0].boundary.map(b => b.point)).toEqual([p(0, 0), p(90, 0), p(90, 100), p(0, 100)]);
    expect(projection.functionalZones![0].position).toEqual(a.functionalZones[0].position);
    expect(projection.walls).toEqual(a.walls); expect(s.audit.changes[0].kind).toBe('zero-area-outline-spur'); expect(JSON.stringify(a)).toBe(before);
  });

  it('does not erase a passage excursion or an out-of-raster vertex to obtain a valid polygon', async () => {
    const a = input(); a.functionalZones = [zone([p(0, 0), p(100, 0), p(90, 0), p(90, 100), p(0, 100)])];
    a.functionalZones[0].boundary[1].kind = 'passage';
    const s = await SourceRecoverySession.create(a, context); await expect(s.preflight()).rejects.toMatchObject({ request: { issue: { code: 'invalid-outline' } } });
    expect(s.audit.changes).toEqual([]);
    const b = input(); b.functionalZones = [zone([p(0, 0), p(110, 0), p(100, 0), p(100, 100), p(0, 100)])];
    const t = await SourceRecoverySession.create(b, context); await expect(t.preflight()).rejects.toThrow(/outside/); expect(t.audit.changes).toEqual([]);
  });

  it('does not erase malformed or unsupported boundary fields while cancelling an otherwise redundant spur', async () => {
    for (const invalid of [{ wallId: 'invented-native-id' }, { evidence: '' }, { kind: 'invented' }, { point: { x: 100, y: 0, z: 1 } }]) {
      const a = input(); a.functionalZones = [zone([p(0, 0), p(100, 0), p(90, 0), p(90, 100), p(0, 100)])];
      Object.assign(a.functionalZones[0].boundary[1], invalid);
      const review = vi.fn(), s = await SourceRecoverySession.create(a, context, { review });
      await expect(s.preflight()).rejects.toBeInstanceOf(SourceRecoveryRequired);
      expect(s.audit.changes).toEqual([]); expect(review).not.toHaveBeenCalled();
    }
  });

  it('canonicalizes only the unambiguous sliding kind alias, preserving every other source field', async () => {
    const a = input(); Object.assign(a.openings[0], { kind: 'slidingDoor', doorType: 'sliding', typeEvidence: 'Synthetic parallel tracks.' });
    const s = await SourceRecoverySession.create(a, context); const next = await s.preflight();
    expect(next.openings[0]).toEqual({ ...a.openings[0], kind: 'door' }); expect(a.openings[0].kind).toBe('slidingDoor');
    const b = input(); Object.assign(b.openings[0], { kind: 'slidingDoor', doorType: 'single', typeEvidence: 'Conflicting leaf.' });
    const review = vi.fn(), t = await SourceRecoverySession.create(b, context, { review });
    await expect(t.preflight()).rejects.toThrow(/kind/); expect(review).not.toHaveBeenCalled();
  });

  it('bridges an accepted aperture only with exact unique opposing jamb flanks', async () => {
    const a = input(); a.walls[0].end = p(30, 0); a.walls.push({ ...evidence, label: 'other jamb flank', start: p(70, 0), end: p(100, 0) });
    a.openings[0].endpoints = [p(30, 0), p(70, 0)]; const before = JSON.stringify(a), review = vi.fn();
    const s = await SourceRecoverySession.create(a, context, { review }); await s.preflight(); const stage = await s.prepare(furnishing);
    expect(stage.openingAudit[0].programStatus).toBe('assembled'); expect(stage.architecture.doorGaps).toHaveLength(1);
    expect(stage.architecture.doorGaps[0]).toMatchObject({ from: p(30, 0), to: p(70, 0) });
    expect(stage.architecture.walls).toEqual(a.walls); expect(review).not.toHaveBeenCalled(); expect(s.audit.changes[0].kind).toBe('observed-jamb-gap');
    expect(s.audit.failures[0].phase).toBe('opening-hosts-before-recovery'); expect(JSON.stringify(a)).toBe(before);
  });

  it('does not bridge a nearly aligned pair or a gap crossed by another physical wall', async () => {
    for (const kind of ['near', 'crossing']) {
      const a = input(); a.walls[0].end = p(30, 0); a.walls.push({ ...evidence, label: 'right', start: p(70, kind === 'near' ? 1 : 0), end: p(100, kind === 'near' ? 1 : 0) });
      if (kind === 'crossing') a.walls.push({ ...evidence, label: 'crossing partition', start: p(50, 0), end: p(50, 30) });
      a.openings[0].endpoints = [p(30, 0), p(70, 0)];
      const s = await SourceRecoverySession.create(a, context); await s.preflight(); await expect(s.prepare(furnishing)).rejects.toBeInstanceOf(SourceRecoveryRequired);
      expect(s.audit.changes.some(c => c.kind === 'observed-jamb-gap')).toBe(false);
    }
  });

  it('offers a source-pinned choice without guessing a missing host, then permits one confirmed aperture-only host', async () => {
    const a = missingHost(), before = JSON.stringify(a), review = vi.fn(async request => confirm(request));
    const s = await SourceRecoverySession.create(a, context, { review }); await s.preflight(); const stage = await s.prepare(furnishing);
    expect(review).toHaveBeenCalledTimes(1); const request = review.mock.calls[0][0] as SourceRecoveryRequest;
    expect(request.choices).toEqual(['confirm-aperture-host', 'revise-local-source', 'unconfirmed']);
    expect(request.allowedReplacements).toEqual(['openings[0]']); expect(request.apertureHostCandidates).toEqual([{ openingPath: 'openings[0]', start: p(20, 0), end: p(60, 0) }]);
    expect(stage.architecture.walls.at(-1)).toMatchObject({ start: p(20, 0), end: p(60, 0) });
    expect(stage.furnishingEvidence!.furniture).toEqual(furnishing.furniture);
    expect(assembleFrozenArchitecture(stage, furnishing).draft.floors[0].doors).toHaveLength(1);
    expect(s.audit).toMatchObject({ reviewCount: 1, automaticReviewCount: 1, status: 'ready' }); expect(JSON.stringify(a)).toBe(before);
  });

  it('keeps unconfirmed or stale answers pending without silently dropping the accepted door', async () => {
    for (const choice of ['unconfirmed', 'stale']) {
      const a = missingHost(), review = vi.fn(async (request: SourceRecoveryRequest) => choice === 'stale' ? { ...confirm(request), requestId: 'wrong' }
        : { ...confirm(request), choice: 'unconfirmed' });
      const s = await SourceRecoverySession.create(a, context, { review }); await s.preflight();
      await expect(s.prepare(furnishing)).rejects.toBeInstanceOf(SourceRecoveryRequired);
      expect(review).toHaveBeenCalledTimes(1); expect((s.audit.originalObservation as any).openings[0].decision).toBe('accept');
    }
  });

  it('rejects changes outside scope, accepted-feature downgrades, native IDs and invented extra answer fields', async () => {
    for (const bad of ['outside-path', 'discard', 'native-id', 'extra-field']) {
      const a = missingHost(), review = vi.fn(async (request: SourceRecoveryRequest) => {
        if (bad === 'extra-field') return { ...confirm(request), wallId: 'w999' };
        return { ...confirm(request), choice: 'revise-local-source', replacements: [{ path: bad === 'outside-path' ? 'scaleEvidence' : 'openings[0]',
          value: { ...a.openings[0], ...(bad === 'discard' ? { decision: 'uncertain' } : {}), ...(bad === 'native-id' ? { wallId: 'w1' } : {}) } }] };
      });
      const s = await SourceRecoverySession.create(a, context, { review }); await s.preflight();
      await expect(s.prepare(furnishing)).rejects.toBeInstanceOf(SourceRecoveryRequired); expect(review).toHaveBeenCalledTimes(1);
    }
  });

  it('shares one review budget across early outline and later host failures', async () => {
    const a = missingHost(); a.functionalZones = [zone([p(0, 0), p(100, 100), p(100, 0), p(0, 100)])];
    const review = vi.fn(async (request: SourceRecoveryRequest) => ({ schemaVersion: 'source-architecture-review-decision-v1', requestId: request.requestId,
      choice: 'revise-local-source', evidence: 'Synthetic corner order verified.', replacements: [{ path: 'functionalZones[0]', value: zone() }] }));
    const s = await SourceRecoverySession.create(a, context, { review }); await s.preflight();
    await expect(s.prepare(furnishing)).rejects.toMatchObject({ request: { phase: 'opening-hosts' } }); expect(review).toHaveBeenCalledTimes(1);
  });

  it('records human confirmation separately from an extra model request', async () => {
    const s = await SourceRecoverySession.create(missingHost(), context, { review: async request => confirm(request), reviewActor: 'human' });
    await s.preflight(); await s.prepare(furnishing); expect(s.audit).toMatchObject({ reviewCount: 1, automaticReviewCount: 0 }); expect(s.audit.reviews[0].actor).toBe('human');
  });

  it('prevents furniture preparation before observation preflight or reuse after completion', async () => {
    const premature = await SourceRecoverySession.create(input(), context);
    await expect(premature.prepare(furnishing)).rejects.toBeInstanceOf(SourceRecoveryRequired);
    const s = await SourceRecoverySession.create(input(), context); await s.preflight(); await s.prepare(furnishing);
    await expect(s.prepare(furnishing)).rejects.toBeInstanceOf(SourceRecoveryRequired);
  });

  it('keeps callback copies from changing the pinned request or a frozen stage', async () => {
    const a = missingHost();
    const review = vi.fn(async (request: SourceRecoveryRequest) => {
      request.allowedReplacements.push('walls[0]');
      return { ...confirm(request), choice: 'revise-local-source', replacements: [{ path: 'walls[0]', value: a.walls[0] }] };
    });
    const s = await SourceRecoverySession.create(a, context, { review }); await s.preflight();
    await expect(s.prepare(furnishing)).rejects.toThrow(/outside/);
    const callbacks = vi.fn(stage => { stage.architectureDraft.floors[0].doors = []; });
    const t = await SourceRecoverySession.create(input(), context, { onStage: callbacks }); await t.preflight();
    const stage = await t.prepare(furnishing); expect(assembleFrozenArchitecture(stage, furnishing).draft.floors[0].doors).toHaveLength(1);
    expect(callbacks).toHaveBeenCalledTimes(1);
  });

  it('preserves raw reference observations while validating and recovering their literal projection', async () => {
    const a = input(); a.schemaVersion = 'source-architecture-pointrefs-v1'; a.sourcePoints = [['northwest', 0, 0]]; a.walls[0].start = 'northwest';
    a.walls.push({ ...a.walls[0], label: 'duplicate' });
    const s = await SourceRecoverySession.create(a, context); expect((await s.preflight()).walls).toHaveLength(4);
    expect(s.audit.pointReferenceAudit).toMatchObject({ referenceCount: 2, coordinatesChanged: false }); expect((s.audit.originalObservation as any).walls[0].start).toBe('northwest');
  });
});
