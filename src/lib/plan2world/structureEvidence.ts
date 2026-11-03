import type { SourceArchitectureV1 } from './architecture';
import type { SourceDiagnostic } from './sourceDiagnostics';

export type StructurePath = `walls[${number}]` | `openings[${number}]` | `functionalZones[${number}]` | `junctions[${number}]`;
export interface StructureEvidence {
  schemaVersion: 'source-structure-evidence-v1';
  anchors: { path: StructurePath; role: 'outline'|'long-wall'|'opening'|'feature'; evidence: string }[];
  questions: { paths: StructurePath[]; region: [number,number,number,number]; conflict: string;
    alternatives: { label: string; evidence: string }[] }[];
}
type Dimensions = {width?:number;height?:number};
const object = (v: unknown, keys: string[]) => {
  if (!v || typeof v!=='object' || Array.isArray(v) || Object.keys(v).some(k=>!keys.includes(k))) throw new Error('Unexpected structure-evidence fields.');
  return v as Record<string,any>;
};
const text = (v: unknown) => {
  if (typeof v!=='string' || !v.trim() || v.length>320) throw new Error('Structure evidence needs concise nonempty text (at most 320 characters).');
  return v;
};
function recordAt(architecture: SourceArchitectureV1, path: unknown) {
  const match = typeof path==='string' && /^(walls|openings|functionalZones|junctions)\[(0|[1-9]\d*)\]$/.exec(path);
  const rows=match&&architecture[match[1] as 'walls'];
  const record = Array.isArray(rows) && match && rows[Number(match[2])];
  if (!record) throw new Error('Structure evidence must reference an existing architectural source record.');
  return record;
}

/** Advisory source evidence only. It cannot provide geometry, units, matching,
 * object IDs or a selected winner. Malformed hints are handled independently
 * of the strict architectural geometry contract by the annotated handoff. */
export function parseStructureEvidence(input: unknown, architecture: SourceArchitectureV1, source: Dimensions = {}): StructureEvidence {
  const root = object(input,['schemaVersion','anchors','questions']);
  if (root.schemaVersion!=='source-structure-evidence-v1') throw new Error('Unsupported structure-evidence schema.');
  if (!Array.isArray(root.anchors)||root.anchors.length>6||!Array.isArray(root.questions)||root.questions.length>3) throw new Error('Structure evidence supports at most six anchors and three questions.');
  const anchors = root.anchors.map(value=>{
    const anchor=object(value,['path','role','evidence']);recordAt(architecture,anchor.path);
    if (!['outline','long-wall','opening','feature'].includes(anchor.role)
      || ['outline','long-wall'].includes(anchor.role)&&!anchor.path.startsWith('walls[')
      || anchor.role==='opening'&&!anchor.path.startsWith('openings[')
      || anchor.role==='feature'&&!/^(functionalZones|junctions)\[/.test(anchor.path)) throw new Error('Structure anchor role does not match its source record.');
    return {path:anchor.path as StructurePath,role:anchor.role as StructureEvidence['anchors'][number]['role'],evidence:text(anchor.evidence)};
  });
  const questions = root.questions.map(value=>{
    const question=object(value,['paths','region','conflict','alternatives']);
    if (!Array.isArray(question.paths)||!question.paths.length||question.paths.length>4||new Set(question.paths).size!==question.paths.length) throw new Error('A structure question needs one to four unique source paths.');
    question.paths.forEach(path=>recordAt(architecture,path));
    const box=question.region;
    if (!Array.isArray(box)||box.length!==4||!box.every(n=>typeof n==='number'&&Number.isFinite(n))
      ||box[0]<0||box[1]<0||box[2]<=box[0]||box[3]<=box[1]
      ||source.width!==undefined&&box[2]>source.width||source.height!==undefined&&box[3]>source.height) throw new Error('Structure question region must be a bounded box in the same source pixels.');
    if (!Array.isArray(question.alternatives)||question.alternatives.length<2||question.alternatives.length>3) throw new Error('Retain two or three alternatives; no automatic winner.');
    const alternatives=question.alternatives.map(value=>{
      const alternative=object(value,['label','evidence']);return {label:text(alternative.label),evidence:text(alternative.evidence)};
    });
    if (new Set(alternatives.map(a=>a.label.trim().toLowerCase())).size!==alternatives.length) throw new Error('Structure alternatives must be distinct.');
    return {paths:question.paths as StructurePath[],region:[...box] as [number,number,number,number],conflict:text(question.conflict),alternatives};
  });
  return {schemaVersion:'source-structure-evidence-v1',anchors,questions};
}

export function inspectStructureEvidence(architecture: SourceArchitectureV1, source: Dimensions = {}): {
  status: 'absent'|'valid'|'invalid'; evidence?:StructureEvidence; error?:string;
} {
  if (!architecture || typeof architecture!=='object' || architecture.structureEvidence===undefined) return {status:'absent'};
  try { return {status:'valid',evidence:parseStructureEvidence(architecture.structureEvidence,architecture,source)}; }
  catch(error) { return {status:'invalid',error:error instanceof Error?error.message:String(error)}; }
}

export function structureQuestionDiagnostics(evidence: StructureEvidence): SourceDiagnostic[] {
  return evidence.questions.map((q,i)=>({id:`structure-question-${i+1}`,code:'structure-question',phase:'observation',category:'uncertain',
    message:`Unresolved first-observation alternatives: ${q.conflict}`,sourcePaths:[...q.paths],blockedBy:[],
    position:{x:(q.region[0]+q.region[2])/2,y:(q.region[1]+q.region[3])/2},
    sourceRecord:{...q,regionCorners:[{x:q.region[0],y:q.region[1]},{x:q.region[2],y:q.region[3]}]}}));
}

/** Exact index bookkeeping after existing coincident-wall union. This changes
 * references only; original evidence stays in the recovery audit. */
export function remapStructureEvidence(evidence: StructureEvidence, wallIndices: number[]) {
  const path=(value:StructurePath):StructurePath=>{
    const match=/^walls\[(\d+)\]$/.exec(value);
    return match?`walls[${wallIndices[Number(match[1])]}]`:value;
  };
  return {...evidence,anchors:evidence.anchors.map(a=>({...a,path:path(a.path)})),
    questions:evidence.questions.map(q=>({...q,paths:[...new Set(q.paths.map(path))]}))};
}
