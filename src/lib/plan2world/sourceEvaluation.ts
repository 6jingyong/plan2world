import type { Project } from '../models/types';
import type { SourceDiagnostic, SourceFeatureOutcome } from './sourceDiagnostics';

export interface SourceEvaluationIdentity {
  sha256: string; width: number; height: number; resultSha256: string;
}
export interface SourceCorrectionReference {
  schemaVersion: 'plan2world-source-correction-reference-v1';
  source: SourceEvaluationIdentity;
  reviewer: { kind: 'human' | 'synthetic'; name: string };
  coverage: 'partial' | 'complete';
  findings: {
    id: string; kind: 'wall' | 'opening' | 'zone' | 'furniture' | 'connectivity';
    verdict: 'correct' | 'missing' | 'extra' | 'geometry-error' | 'connectivity-error' | 'uncertain';
    evidence: string; sourcePaths: string[];
  }[];
}
export interface SourceRuntimeCheck { status: 'not_run' | 'rejected' | 'compiled'; error?: string }

/** Post-hoc review is bound to a frozen result, never a reconstruction input.
 * Counts describe reviewed findings, not inferred human clicks or elapsed time. */
export function parseSourceCorrectionReference(value: unknown, source: SourceEvaluationIdentity): SourceCorrectionReference {
  const r = value as SourceCorrectionReference;
  const text = (s: unknown) => typeof s === 'string' && !!s.trim();
  if (!r || r.schemaVersion !== 'plan2world-source-correction-reference-v1'
    || r.source?.sha256 !== source.sha256 || r.source?.resultSha256 !== source.resultSha256 || r.source?.width !== source.width || r.source?.height !== source.height)
    throw new Error('Source reference does not match the frozen source and result.');
  if (!['human', 'synthetic'].includes(r.reviewer?.kind) || !text(r.reviewer?.name) || !['partial', 'complete'].includes(r.coverage) || !Array.isArray(r.findings)) throw new Error('Source reference requires reviewer, coverage and findings.');
  const seen = new Set<string>();
  for (const f of r.findings) {
    if (!f || !text(f.id) || seen.has(f.id) || !['wall', 'opening', 'zone', 'furniture', 'connectivity'].includes(f.kind)
      || !['correct', 'missing', 'extra', 'geometry-error', 'connectivity-error', 'uncertain'].includes(f.verdict)
      || !text(f.evidence) || !Array.isArray(f.sourcePaths) || f.sourcePaths.some(p => !text(p))) throw new Error('Source reference contains an invalid or duplicate finding.');
    seen.add(f.id);
  }
  return structuredClone(r);
}

export function evaluateSourceCorrection(input: {
  project: Project; source: SourceEvaluationIdentity; partialImport?: boolean;
  diagnostics?: SourceDiagnostic[]; features?: SourceFeatureOutcome[];
  runtime?: SourceRuntimeCheck; reference?: unknown;
}) {
  const { project, source, features } = input;
  if (!/^[a-f0-9]{64}$/.test(source.sha256) || !/^[a-f0-9]{64}$/.test(source.resultSha256) || ![source.width, source.height].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Evaluation requires frozen source/result identities and dimensions.');
  const issues = project.architectureReview?.issues.filter(i => !i.resolved) ?? [];
  const structured = input.diagnostics !== undefined || issues.every(i => i.code && i.category);
  const diagnostics = input.diagnostics ?? issues.map(i => ({ ...i, category: i.category ?? 'root', code: i.code ?? 'legacy-unclassified', sourcePaths: i.sourcePaths ?? [], blockedBy: i.blockedBy ?? [] }));
  const reference = input.reference === undefined ? undefined : parseSourceCorrectionReference(input.reference, source);
  const counts = project.floors.reduce((c, f) => ({ walls: c.walls + f.walls.length, doors: c.doors + f.doors.length, windows: c.windows + f.windows.length,
    rooms: c.rooms + f.rooms.length, furniture: c.furniture + f.furniture.length }), { walls: 0, doors: 0, windows: 0, rooms: 0, furniture: 0 });
  const byKind = Object.fromEntries(['wall', 'opening', 'zone', 'furniture'].map(kind => {
    const f = features?.filter(f => f.kind === kind);
    return [kind, f ? { observed: f.length, retained: f.filter(f => f.status === 'retained').length, invalid: f.filter(f => f.status === 'invalid').length,
      blocked: f.filter(f => f.status === 'blocked').length, uncertain: f.filter(f => f.status === 'uncertain').length,
      rejected: f.filter(f => f.status === 'rejected').length, notAssessed: f.filter(f => f.status === 'not-assessed').length,
      unresolvedHost: f.filter(f => f.status === 'unresolved-host').length } : null];
  }));
  const corrections = reference?.findings.filter(f => !['correct', 'uncertain'].includes(f.verdict));
  return {
    schemaVersion: 'plan2world-source-evaluation-v1' as const, source,
    scope: 'Program outcomes and post-hoc source review; not external-model extraction accuracy.',
    reviewStatus: issues.length || input.partialImport || reference?.findings.some(f => f.verdict !== 'correct') ? 'review_required' : 'unverified',
    partialImport: input.partialImport ?? null, counts,
    pipeline: { noteCount: issues.length, structuredDiagnosticsAvailable: structured,
      rootFindings: structured ? diagnostics.filter(d => d.category === 'root').length : null,
      blockedFindings: structured ? diagnostics.filter(d => d.category === 'blocked').length : null,
      uncertainFindings: structured ? diagnostics.filter(d => d.category === 'uncertain').length : null,
      blockedFeatures: features ? features.filter(f => f.status === 'blocked').length : null,
      hostAssessedOpenings: features ? features.filter(f => f.kind === 'opening' && f.hostAssessed).length : null,
      byKind },
    sourceReview: reference ? {
      status: 'reviewed' as const, reviewer: reference.reviewer, coverage: reference.coverage, reviewedFindings: reference.findings.length,
      correctionFindings: corrections!.length, uncertainFindings: reference.findings.filter(f => f.verdict === 'uncertain').length,
      byVerdict: Object.fromEntries(['correct', 'missing', 'extra', 'geometry-error', 'connectivity-error', 'uncertain'].map(v => [v, reference.findings.filter(f => f.verdict === v).length])),
      correctionsByKind: Object.fromEntries(['wall', 'opening', 'zone', 'furniture', 'connectivity'].map(k => [k, corrections!.filter(f => f.kind === k).length])),
      findings: reference.findings,
    } : { status: 'not_run' as const, reason: 'No independent post-hoc reference was supplied.' },
    humanEffort: { measuredActions: null, measuredSeconds: null, correctionFindingProxy: corrections?.length ?? null,
      note: 'Reviewed correction findings are a workload proxy, not measured user operations.' },
    runtime: input.runtime ?? { status: 'not_run' as const },
    walkthrough: { status: 'not_run' as const, note: 'Artifact compilation does not establish entrance selection, source accuracy or walkthrough acceptance.' },
    diagnostics,
  };
}
