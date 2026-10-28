import { describe, expect, it } from 'vitest';
import { createDefaultProject } from '$lib/models/projectDefaults';
import { evaluateSourceCorrection, parseSourceCorrectionReference, type SourceCorrectionReference } from '$lib/plan2world/sourceEvaluation';
import { sourceEvaluationHtml } from '../tooling/source-evaluation-html.mjs';

const source = { sha256: 'a'.repeat(64), width: 100, height: 100, resultSha256: 'b'.repeat(64) };
const project = () => {
  const p = createDefaultProject('Evaluation');
  p.architectureReview = { version: 1, issues: [
    { id: 'root', floorId: p.floors[0].id, message: 'Bad opening kind', resolved: false, code: 'invalid-record', category: 'root', sourcePaths: ['openings[0]'] },
    { id: 'blocked', floorId: p.floors[0].id, message: 'Dependent feature', resolved: false, code: 'zone-blocked', category: 'blocked', blockedBy: ['root'] },
  ] };
  return p;
};
const reference = (): SourceCorrectionReference => ({ schemaVersion: 'plan2world-source-correction-reference-v1', source, reviewer: { kind: 'synthetic', name: 'Known synthetic test' }, coverage: 'partial', findings: [
  { id: 'one', kind: 'opening', verdict: 'missing', evidence: 'Synthetic aperture exists in reference.', sourcePaths: [] },
  { id: 'two', kind: 'wall', verdict: 'geometry-error', evidence: 'Synthetic junction differs.', sourcePaths: ['walls[0]'] },
] });
describe('source correction evaluation without invented accuracy', () => {
  it('separates root failures, blocked work, host checks and runtime rejection', () => {
    const p = project(), before = JSON.stringify(p);
    const report = evaluateSourceCorrection({ project: p, source, partialImport: true, runtime: { status: 'rejected', error: 'Missing safe entry' }, features: [
      { path: 'openings[0]', kind: 'opening', status: 'invalid', nativeIds: [], blockedBy: ['root'], hostAssessed: false },
      { path: 'openings[1]', kind: 'opening', status: 'retained', nativeIds: ['door'], blockedBy: [], hostAssessed: true },
      { path: 'functionalZones[0]', kind: 'zone', status: 'blocked', nativeIds: [], blockedBy: ['root'] },
    ] });
    expect(report.pipeline).toMatchObject({ noteCount: 2, rootFindings: 1, blockedFindings: 1, blockedFeatures: 1, hostAssessedOpenings: 1 });
    expect(report.pipeline.byKind.opening).toMatchObject({ observed: 2, invalid: 1, retained: 1 });
    expect(report.runtime.status).toBe('rejected');expect(report.sourceReview.status).toBe('not_run');
    expect(report.humanEffort).toMatchObject({ measuredActions: null, measuredSeconds: null, correctionFindingProxy: null });
    expect(JSON.stringify(p)).toBe(before);
  });
  it('keeps legacy classification unknown and never turns clean geometry into source acceptance', () => {
    const p = project();for (const i of p.architectureReview!.issues) { delete i.code; delete i.category; }
    const report = evaluateSourceCorrection({ project: p, source });
    expect(report.pipeline.rootFindings).toBeNull();expect(report.pipeline.hostAssessedOpenings).toBeNull();expect(report.pipeline.blockedFeatures).toBeNull();
    expect(evaluateSourceCorrection({ project: createDefaultProject(), source }).reviewStatus).toBe('unverified');
  });
  it('binds reviewed findings to source and result and labels effort as a proxy', () => {
    const report = evaluateSourceCorrection({ project: project(), source, reference: reference() });
    expect(report.sourceReview).toMatchObject({ status: 'reviewed', coverage: 'partial', correctionFindings: 2, correctionsByKind: { wall: 1, opening: 1 } });
    expect(report.humanEffort).toMatchObject({ correctionFindingProxy: 2, measuredActions: null });
    expect(() => parseSourceCorrectionReference(reference(), { ...source, resultSha256: 'c'.repeat(64) })).toThrow('frozen source and result');
    expect(() => parseSourceCorrectionReference({ ...reference(), findings: [reference().findings[0], reference().findings[0]] }, source)).toThrow('duplicate');
    expect(() => evaluateSourceCorrection({ project: project(), source: { ...source, sha256: 'bad' } })).toThrow('identities');
  });
  it('escapes untrusted report content and supplies before/source/after controls', () => {
    const p = project();p.name = '</script><script>alert(1)</script>';
    const report = evaluateSourceCorrection({ project: p, source });
    const html = sourceEvaluationHtml({ source: { dataUrl: 'data:image/png;base64,aA==', width: 100, height: 100 }, after: { project: p, report } });
    expect(html).not.toContain(p.name);expect(html).toContain('\\u003c/script>');
    expect(html).toContain('data-view="source"');expect(html).toContain('data-view="before"');expect(html).toContain('data-view="after"');
  });
});
