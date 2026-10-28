import { describe, expect, it } from 'vitest';
import { reviewApertureWallBands } from '$lib/plan2world/apertureWallBands';
import { prepareArchitectureStage } from '$lib/plan2world/architecture';

function scene(options: { inverted?: boolean; angle?: number; style?: 'outlined' | 'filled'; missingRight?: boolean; frameOnly?: boolean; plainRectangle?: boolean; ambiguous?: boolean } = {}) {
  const width = 360, height = 240, data = new Uint8Array(width * height * 4);
  const angle = options.angle ?? 0, u = { x: Math.cos(angle), y: Math.sin(angle) }, n = { x: -u.y, y: u.x };
  const at = (t: number, d: number) => ({ x: 100 + u.x * t + n.x * d, y: 100 + u.y * t + n.y * d });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const t = (x - 100) * u.x + (y - 100) * u.y, d = (x - 100) * n.x + (y - 100) * n.y;
    const flanks = t >= -60 && t <= 180 && (!options.missingRight || t <= 80) && (!options.frameOnly || t >= 0 && t <= 80);
    let ink = options.style === 'filled' ? flanks && Math.abs(d) <= 12 && (t < 0 || t > 80)
      : flanks && (Math.abs(d - 12) <= 1 || Math.abs(d + 12) <= 1);
    if (!options.plainRectangle) ink ||= t >= 0 && t <= 80 && Math.abs(d) <= 1;
    ink ||= (Math.abs(t) <= 1 || Math.abs(t - 80) <= 1) && Math.abs(d) <= 12;
    if (options.ambiguous) ink ||= flanks && (Math.abs(d - 20) <= 1 || Math.abs(d + 20) <= 1)
      || (Math.abs(t) <= 1 || Math.abs(t - 80) <= 1) && Math.abs(d) <= 20;
    const value = options.inverted ? ink ? 255 : 0 : ink ? 0 : 255;
    data.set([value, value, value, 255], (y * width + x) * 4);
  }
  const decision = { decision: 'accept', evidence: 'Synthetic visible strokes.', decisionBasis: 'Known constructed source.' };
  const architecture: any = { schemaVersion: 'source-architecture-v1', scaleEvidence: { kind: 'provided_length', realLengthCm: 100, endpoints: [{ x: 0, y: 0 }, { x: 100, y: 0 }], evidence: 'Synthetic reference.' },
    walls: [-12, 12].map((d, i) => ({ ...decision, label: `face ${i}`, start: at(-60, d), end: at(180, d) })),
    openings: [{ ...decision, label: 'window', kind: 'window', endpoints: [at(0, 0), at(80, 0)] }], doorGaps: [] };
  const raster = { width, height, data };
  return { architecture, raster, at, run: () => reviewApertureWallBands(architecture, raster) };
}

describe('read-only joint aperture and wall-band evidence', () => {
  it.each([false, true])('detects a hollow outlined wall rather than two independent wall traces (inverted=%s)', inverted => {
    const s = scene({ inverted }), before = JSON.stringify(s.architecture), r = s.run(), audit = r.audits[0];
    expect(audit.status).toBe('unapproved-wall-band');expect(audit.existingHostStatus).toBe('unresolved');
    expect(audit.candidates).toHaveLength(1);expect(audit.candidates[0].interpretation).toBe('both-faces-recorded');
    expect(audit.candidates[0].midpointResidualPx).toBeLessThan(2);
    expect(audit.thresholds.every(t => t.bands.length > 0)).toBe(true);
    expect(r).toMatchObject({ geometryChanged: false, appliedWallChanges: 0, appliedOpeningChanges: 0, llmCalls: 0 });
    expect(JSON.stringify(s.architecture)).toBe(before);expect('normalizationInput' in r).toBe(false);expect('annotation' in r).toBe(false);
  });
  it.each([{ style: 'filled' as const }, { angle: Math.PI / 8 }])('works on filled walls and rotated polygon segments: %o', options => {
      const audit = scene(options).run().audits[0];expect(audit.status, JSON.stringify(audit.thresholds)).toBe('unapproved-wall-band');
      expect(audit.candidates[0].jambSupport.every(s => s >= .5)).toBe(true);
  });
  it.each([{ missingRight: true }, { frameOnly: true }, { plainRectangle: true }])('requires both flanks, both jambs and aperture-specific evidence: %o', options => {
    expect(scene(options).run().audits[0].status).toBe('insufficient-evidence');
  });
  it('keeps multiple supported wall bands ambiguous without choosing a nearest winner', () => {
    const r = scene({ ambiguous: true }).run();expect(r.audits[0].status).toBe('ambiguous-wall-bands');
    expect(r.audits[0].candidates.length).toBeGreaterThan(1);expect(r.wallBandGroups).toHaveLength(0);
  });
  it('locates pixel jambs independently when source endpoint hints lie inside the window', () => {
    const s = scene();s.architecture.openings[0].endpoints = [s.at(20, 0), s.at(70, 0)];
    const raw = JSON.stringify(s.architecture), audit = s.run().audits[0];
    expect(audit.status, JSON.stringify(audit.thresholds)).toBe('unapproved-wall-band');
    expect(audit.candidates[0].jambPositionsPx[0]).toBeLessThan(-10);
    expect(audit.candidates[0].jambPositionsPx[1]).toBeGreaterThan(50);
    expect(JSON.stringify(s.architecture)).toBe(raw);
  });
  it('recognizes an existing center baseline and groups only conflicting wall-face observations', () => {
    const s = scene();s.architecture.walls = [{ ...s.architecture.walls[0], start: s.at(-60, 0), end: s.at(180, 0) }];
    const r = s.run();expect(r.audits[0].status).toBe('baseline-consistent');expect(r.wallBandGroups).toHaveLength(0);
  });
  it('retains invalid kinds and undecided observations without reinterpreting them', () => {
    const s = scene();s.architecture.openings.push({ ...s.architecture.openings[0], kind: 'sliding-door' }, { ...s.architecture.openings[0], decision: 'uncertain' });
    expect(s.run().audits.map(a => a.status)).toEqual(['unapproved-wall-band', 'invalid-observation', 'not-reviewed']);
  });
  it('does not let locally plausible patterns certify source semantics or change production architecture', () => {
    const s = scene(), context = { sourceWidthPx: s.raster.width, sourceHeightPx: s.raster.height };
    const furniture = { schemaVersion: 'source-furnishing-v1', furniture: [] };
    const stage = prepareArchitectureStage(s.architecture, context, furniture, s.raster), frozen = JSON.stringify(stage);
    const r = s.run();expect(r.audits[0].status).toBe('unapproved-wall-band');
    expect(r.limitation).toContain('do not authorize');expect(JSON.stringify(stage)).toBe(frozen);
    expect(prepareArchitectureStage(s.architecture, context, furniture, s.raster)).toEqual(stage);
    expect(stage.centerlinePolicy).toBe('disabled');expect('apertureBandReview' in stage).toBe(false);
  });
});
