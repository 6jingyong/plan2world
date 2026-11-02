import type { Point } from '../models/types';

export type SourceDiagnosticPhase = 'observation' | 'preflight' | 'opening-hosts' | 'assembly';
export interface SourceDiagnostic {
  id: string;
  code: string;
  phase: SourceDiagnosticPhase;
  category: 'root' | 'blocked' | 'uncertain';
  message: string;
  sourcePaths: string[];
  blockedBy: string[];
  position?: Point;
  sourceRecord?: unknown;
}
export interface SourceFeatureOutcome {
  path: string;
  kind: 'wall' | 'opening' | 'zone' | 'furniture';
  status: 'retained' | 'rejected' | 'uncertain' | 'invalid' | 'blocked' | 'unresolved-host' | 'not-assessed';
  nativeIds: string[];
  blockedBy: string[];
  hostAssessed?: boolean;
}
export const sourceRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
export const isSourcePoint = (p: any): p is Point => sourceRecord(p) && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y);
export function sourcePoints(value: unknown): Point[] {
  if (isSourcePoint(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(sourcePoints);
  return sourceRecord(value) ? Object.values(value).flatMap(sourcePoints) : [];
}
export function sourceRecordPosition(value: unknown): Point | undefined {
  const points = sourcePoints(value);
  if (!points.length) return undefined;
  return { x: points.reduce((sum, p) => sum + p.x / points.length, 0), y: points.reduce((sum, p) => sum + p.y / points.length, 0) };
}
export function sourceDiagnostic(
  diagnostics: SourceDiagnostic[], code: string, phase: SourceDiagnosticPhase, message: string, sourcePaths: string[],
  sourceRecord?: unknown, category: SourceDiagnostic['category'] = 'root', blockedBy: string[] = [],
) {
  const position = sourceRecordPosition(sourceRecord);
  const item: SourceDiagnostic = { id: `source-diagnostic-${diagnostics.length + 1}`, code, phase, category, message, sourcePaths, blockedBy,
    ...(sourceRecord === undefined ? {} : { sourceRecord: structuredClone(sourceRecord) }),
    ...(position ? { position } : {}) };
  diagnostics.push(item);
  return item;
}
