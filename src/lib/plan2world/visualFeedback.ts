import { parseSourceArchitecture } from './architecture';
import { reprojectSourceObservations, type SourceCorrectionResult } from './correction';
import { imageSha256 } from './imagePreparation';
import { sourcePoints, type SourceDiagnostic } from './sourceDiagnostics';
import { projectOntoWall } from '$lib/utils/wallProjection';
import type { SourceFloorPlanImage } from './sourceBackground';
import type { SourceRasterPixels } from './rasterWallContinuation';
import type { ReconstructionOptions } from './reconstructionInstructions';
import guide from '../../../skills/reconstruct-plan2world/references/visual-feedback-pass.md?raw';

export const VISUAL_FEEDBACK_POLICY = 'source-visual-feedback-v1' as const;
type Box = [number, number, number, number];
type Interpretation = ReturnType<typeof parseSourceArchitecture>;
type Source = { image: SourceFloorPlanImage; sha256: string; raster?: SourceRasterPixels };
type Observations = { architecture: unknown; furnishing: unknown };
type Path = `walls[${number}]` | `openings[${number}]` | `functionalZones[${number}]` | `junctions[${number}]`;
export interface VisualFeedbackRequest {
  schemaVersion: typeof VISUAL_FEEDBACK_POLICY;
  requestId: string;
  mode: 'ordinary' | 'guided';
  source: { sha256: string; width: number; height: number };
  interpretationSha256: string;
  furnishingSha256: string;
  instructionSha256: string;
  regions: { id: string; focusBox: Box; contextBox: Box; questions: string[] }[];
  records: { path: Path; value: unknown }[];
  anchors: { kind: 'wall' | 'opening' | 'furnishing'; evidence: unknown }[];
  maxHypotheses: 3;
  maxReviews: 1;
}
interface Hypothesis {
  label: string;
  visualSupport: 'clear' | 'partial' | 'unclear';
  evidence: string;
  changes: { path: Path; value: unknown }[];
  additionalWalls?: unknown[];
  additionalOpenings?: unknown[];
}
export interface VisualFeedbackDecision {
  schemaVersion: 'source-visual-feedback-decision-v1';
  requestId: string;
  hypotheses: Hypothesis[];
  selected: number | null;
  unresolvedQuestions: string[];
}
export interface VisualFeedbackAudit {
  policy: typeof VISUAL_FEEDBACK_POLICY;
  status: 'not-needed' | 'not-reviewable' | 'pending' | 'invalid-response' | 'revised' | 'unchanged' | 'review-failed';
  reviews: number;
  actor: string;
  request?: VisualFeedbackRequest;
  answer?: unknown;
  deferredDiagnosticIds: string[];
  candidates: { index: number; label: string; visualSupport: string; status: 'validated' | 'invalid'; error?: string;
    interpretationSha256?: string; projectContentSha256?: string; partialImport?: boolean; issueCount?: number }[];
  selected?: number | null;
  reason?: string;
  originalObservationSha256: string;
  originalObservations: Observations;
  baselineProjectContentSha256: string;
  attribution: 'undetermined';
  limitation: string;
}
export interface VisualFeedbackOptions {
  mode?: VisualFeedbackRequest['mode'];
  actor?: string;
  review?: (request: VisualFeedbackRequest, source: Source) => Promise<unknown>;
  onAudit?: (audit: VisualFeedbackAudit) => void;
  onCandidate?: (index: number, architecture: Interpretation, result: SourceCorrectionResult) => void;
}
export class VisualFeedbackOperationalError extends Error {
  constructor(message: string, public audit: VisualFeedbackAudit, public baseline: SourceCorrectionResult) {
    super(message); this.name = 'VisualFeedbackOperationalError';
  }
}
const hash = (v: unknown) => imageSha256(new TextEncoder().encode(JSON.stringify(v)));
const message = (e: unknown) => e instanceof Error ? e.message : String(e);
const inside = (p: {x:number;y:number}, b: Box) => p.x >= b[0] && p.x <= b[2] && p.y >= b[1] && p.y <= b[3];
const intersects = (a: Box,b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const bounds = (v: unknown): Box | undefined => {
  const points = sourcePoints(v); return points.length ? [Math.min(...points.map(p=>p.x)),Math.min(...points.map(p=>p.y)),Math.max(...points.map(p=>p.x)),Math.max(...points.map(p=>p.y))] : undefined;
};
function at(architecture: Interpretation,path: string) {
  const match = /^(walls|openings|functionalZones|junctions)\[(0|[1-9]\d*)\]$/.exec(path);
  if (!match) throw new Error('Only pinned source record paths may change.');
  const rows = architecture[match[1] as 'walls'] as unknown[] | undefined, index = Number(match[2]);
  if (!rows || index >= rows.length) throw new Error('Source record does not exist.');
  return { rows,index,value:rows[index] };
}
const visualCodes = new Set(['wall-overlap','ambiguous-host','unresolved-host','uncertain-wall','uncertain-opening','uncertain-zone','unresolved-zone']);
const priority = (d: SourceDiagnostic) => d.code==='wall-overlap' ? 0 : d.code==='unresolved-host'||d.code==='ambiguous-host' ? 1 : 2;
function structuralQuestion(d:SourceDiagnostic) {
  const location=d.sourcePaths.join(', ');
  const question=d.code==='wall-overlap'
    ? 'Two source wall records overlap after normalization. Inspect duplication, alignment and distinct structural/furnishing roles; either source record or the program representation can be wrong.'
    : d.code==='unresolved-host'||d.code==='ambiguous-host'
    ? 'This observed aperture interval does not associate uniquely with a current baseline. Which visible framing, jambs or boundary support it, if any? Reconsider either the aperture or baseline interpretation.'
    : d.code==='unresolved-zone'
    ? 'The approximate functional outline does not match a closed logical boundary. Inspect its extent and thresholds; an open arrangement or incomplete source remains possible. Do not invent a divider.'
    : 'The existing interpretation is uncertain. Which visible cues distinguish the plausible architectural or furnishing roles? Unknown remains valid.';
  return `${location}: ${question} Structural consistency is not visual proof.`;
}

/** Locate questions, not desired corrections. Windows can supply nearby parallel
 * baseline CONTEXT; neither that context nor its acceptance proves a true host. */
export async function buildVisualFeedbackRequest(baseline: SourceCorrectionResult, observations: Observations, source: Source,
  mode: VisualFeedbackRequest['mode'] = 'guided'): Promise<{request?:VisualFeedbackRequest;deferredDiagnosticIds:string[];reason?:string}> {
  let architecture: Interpretation;
  try { architecture = parseSourceArchitecture(baseline.audit.programProjection); }
  catch { return { deferredDiagnosticIds:baseline.diagnostics.map(d=>d.id),reason:'Malformed source contract requires input correction, not a visual retry.' }; }
  const width=source.image.width,height=source.image.height;
  const padded = (b:Box,pad:number):Box => [Math.max(0,Math.floor(b[0]-pad)),Math.max(0,Math.floor(b[1]-pad)),Math.min(width,Math.ceil(b[2]+pad)),Math.min(height,Math.ceil(b[3]+pad))];
  const candidates=baseline.diagnostics.filter(d=>visualCodes.has(d.code)&&d.sourcePaths.length).sort((a,b)=>priority(a)-priority(b)||a.id.localeCompare(b.id));
  const groups: { focus:Box;diagnostics:SourceDiagnostic[] }[]=[];
  for(const diagnostic of candidates){
    const records=diagnostic.sourcePaths.flatMap(path=>{try{return[at(architecture,path).value];}catch{return[];}});
    const context=[...records];
    for(const record of records){
      const o=record as any;if(!['door','window'].includes(o?.kind)||!Array.isArray(o.endpoints))continue;
      const [a,b]=o.endpoints,dx=b.x-a.x,dy=b.y-a.y;
      const near=architecture.walls.filter(w=>w.decision!=='reject'&&!w.curvePoint).map(w=>{
        const wx=w.end.x-w.start.x,wy=w.end.y-w.start.y;
        const alignment=Math.abs(dx*wx+dy*wy)/Math.hypot(dx,dy)/Math.hypot(wx,wy);
        const distance=Math.max(...o.endpoints.map((p:any)=>projectOntoWall(p,w)?.distance??Infinity));
        return {w,distance,alignment};
      }).filter(n=>n.alignment>.95&&n.distance<=64).sort((a,b)=>a.distance-b.distance).slice(0,2);
      context.push(...near.map(n=>n.w));
    }
    const box=bounds(context);if(!box)continue;
    const focus=padded(box,12),existing=groups.find(g=>priority(g.diagnostics[0])===priority(diagnostic)&&intersects(g.focus,focus));
    if(existing){existing.focus=[Math.min(existing.focus[0],focus[0]),Math.min(existing.focus[1],focus[1]),Math.max(existing.focus[2],focus[2]),Math.max(existing.focus[3],focus[3])];existing.diagnostics.push(diagnostic);}
    else groups.push({focus,diagnostics:[diagnostic]});
  }
  const selected=groups.filter(g=>(g.focus[2]-g.focus[0])*(g.focus[3]-g.focus[1])<=width*height*.35).slice(0,3);
  const selectedIds=new Set(selected.flatMap(g=>g.diagnostics.map(d=>d.id)));
  const deferredDiagnosticIds=baseline.diagnostics.filter(d=>!selectedIds.has(d.id)).map(d=>d.id);
  if(!selected.length)return{deferredDiagnosticIds,reason:candidates.length?'The structural question exceeds the bounded local review scope.':'No localized visual contradiction; operational/native-motion issues do not trigger image retries.'};
  const regions=selected.map((g,i)=>({id:`region-${i+1}`,focusBox:g.focus,contextBox:padded(g.focus,Math.min(192,Math.max(64,Math.min(width,height)*.05))),
    questions:mode==='ordinary'?['Reinspect the visible architecture in this region. Keep unsupported interpretations uncertain.']:
      g.diagnostics.map(structuralQuestion)}));
  const pinned=selected.flatMap(g=>g.diagnostics.flatMap(d=>d.sourcePaths));
  const all=(['walls','openings','functionalZones','junctions'] as const).flatMap(kind=>(architecture[kind]??[]).map((value,index)=>({path:`${kind}[${index}]` as Path,value})));
  const recordPriority=(r:typeof all[number])=>{
    if(pinned.includes(r.path))return 0;
    const box=bounds(r.value)!;
    if(r.path.startsWith('walls[')&&regions.some(g=>intersects(box,g.focusBox)))return 1;
    if(r.path.startsWith('openings[')&&regions.some(g=>intersects(box,g.focusBox)))return 2;
    return r.path.startsWith('walls[')?3:4;
  };
  const records=all.filter(r=>{const b=bounds(r.value);return b&&regions.some(g=>intersects(b,g.contextBox));})
    .sort((a,b)=>recordPriority(a)-recordPriority(b)||a.path.localeCompare(b.path)).slice(0,24);
  const anchors:VisualFeedbackRequest['anchors']=[
    ...architecture.walls.filter(w=>w.decision==='accept').sort((a,b)=>Math.hypot(b.end.x-b.start.x,b.end.y-b.start.y)-Math.hypot(a.end.x-a.start.x,a.end.y-a.start.y)).slice(0,3).map(w=>({kind:'wall' as const,evidence:w})),
    ...architecture.openings.filter(o=>o.decision==='accept').slice(0,3).map(o=>({kind:'opening' as const,evidence:o})),
    ...((observations.furnishing as any)?.furniture??[]).filter((f:any)=>regions.some(g=>f.position&&inside(f.position,g.contextBox))).slice(0,8).map((f:any)=>({kind:'furnishing' as const,evidence:f})),
  ];
  const body={schemaVersion:VISUAL_FEEDBACK_POLICY,mode,source:{sha256:source.sha256,width,height},
    interpretationSha256:await hash(architecture),furnishingSha256:await hash(observations.furnishing),instructionSha256:await hash(guide),regions,records,anchors,maxHypotheses:3 as const,maxReviews:1 as const};
  return{request:{...body,requestId:await hash(body)},deferredDiagnosticIds};
}

export function buildVisualFeedbackInstructions(request: VisualFeedbackRequest) {
  return `${guide}\n\nSOURCE_VISUAL_REVIEW_REQUEST_JSON:\n${JSON.stringify(request)}`;
}

/** Lossless local pixels with explicit offsets. Adapters encode these as images;
 * every model view must still include the overview and context. */
export function cropFeedbackRaster(raster:SourceRasterPixels,box:Box) {
  if(raster.data.length!==raster.width*raster.height*4)throw new Error('Invalid source pixel buffer.');
  if(!box.every(Number.isInteger)||box[0]<0||box[1]<0||box[2]>raster.width||box[3]>raster.height||box[2]<=box[0]||box[3]<=box[1])throw new Error('Invalid source crop box.');
  const width=box[2]-box[0],height=box[3]-box[1],data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width*4;x++)data[y*width*4+x]=raster.data[((y+box[1])*raster.width+box[0])*4+x];
  return{width,height,data,sourceBox:[...box] as Box};
}

function exactObject(value:any,keys:string[]) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new Error('Unexpected review fields.');
}
function response(value:any,request:VisualFeedbackRequest):VisualFeedbackDecision {
  exactObject(value,['schemaVersion','requestId','hypotheses','selected','unresolvedQuestions']);
  if(value.schemaVersion!=='source-visual-feedback-decision-v1'||value.requestId!==request.requestId)throw new Error('Stale or mismatched visual-review answer.');
  if(!Array.isArray(value.hypotheses)||value.hypotheses.length>3||!Array.isArray(value.unresolvedQuestions)||value.unresolvedQuestions.some((q:any)=>typeof q!=='string'||!q.trim()))throw new Error('Invalid hypotheses/questions.');
  if(value.selected!==null&&(!Number.isInteger(value.selected)||value.selected<0||value.selected>=value.hypotheses.length))throw new Error('Selected hypothesis is invalid.');
  return value;
}

function revisedInterpretation(original:Interpretation,h:any,request:VisualFeedbackRequest) {
  exactObject(h,['label','visualSupport','evidence','changes','additionalWalls','additionalOpenings']);
  if(typeof h.label!=='string'||!h.label.trim()||typeof h.evidence!=='string'||!h.evidence.trim()||!['clear','partial','unclear'].includes(h.visualSupport)||!Array.isArray(h.changes)||h.changes.length>24)throw new Error('Hypothesis requires explicit visual support and bounded source changes.');
  const next=structuredClone(original),seen=new Set<string>();
  const local=(points:ReturnType<typeof sourcePoints>)=>points.every(p=>request.regions.some(g=>inside(p,g.contextBox)));
  for(const change of h.changes){
    exactObject(change,['path','value']);if(typeof change.path!=='string'||!request.records.some(r=>r.path===change.path)||seen.has(change.path))throw new Error('Unpinned or duplicate source change.');seen.add(change.path);
    const previous=at(next,change.path),old=previous.value as any,value=change.value;
    const oldPoints=sourcePoints(old),newPoints=sourcePoints(value);
    const unchanged=JSON.stringify(oldPoints)===JSON.stringify(newPoints);
    if(!unchanged){
      if(change.path.startsWith('walls[')&&old?.start&&old?.end&&value?.start&&value?.end){
        const oldLine=old as any;
        for(const key of ['start','end','curvePoint'])if(JSON.stringify(oldLine[key])!==JSON.stringify(value[key])){
          if(!oldLine[key]||!value[key]||!local([oldLine[key],value[key]]))throw new Error('Wall edit exceeds local source region.');
        }
        if(!local(oldPoints)&&[value.start,value.end].some(p=>{
          const dx=old.end.x-old.start.x,dy=old.end.y-old.start.y;
          return Math.abs(dx*(p.y-old.start.y)-dy*(p.x-old.start.x))>1e-6;
        }))throw new Error('A long wall cannot rotate outside the reviewed context.');
      }else if(!local([...oldPoints,...newPoints]))throw new Error('Source revision exceeds reviewed context.');
    }
    if(old?.decision==='accept'&&value?.decision!=='accept'&&!local(oldPoints))throw new Error('Cannot retract an accepted feature outside the reviewed context.');
    if(change.path.startsWith('functionalZones[')&&JSON.stringify(old?.position)!==JSON.stringify(value?.position))throw new Error('Functional seed changes need a separately scoped observation.');
    previous.rows[previous.index]=structuredClone(value);
  }
  for(const [field,kind] of [['additionalWalls','walls'],['additionalOpenings','openings']] as const){
    const additions=h[field]??[];if(!Array.isArray(additions)||additions.length>4)throw new Error('Too many additional observed records.');
    for(const record of additions){if(!sourcePoints(record).length||!local(sourcePoints(record)))throw new Error('Additional source feature must be visibly localized.');(next[kind] as unknown[]).push(structuredClone(record));}
  }
  const parsed=parseSourceArchitecture(next);
  if(sourcePoints(parsed).some(p=>p.x<0||p.y<0||p.x>request.source.width||p.y>request.source.height))throw new Error('Source revision leaves original raster bounds.');
  return parsed;
}

/** One optional feedback round. Each hypothesis is a NEW interpretation through
 * the normal core; no runtime/draft patching, score-based winner or model retry. */
export async function applyVisualFeedback(baseline:SourceCorrectionResult,observations:Observations,source:Source,
  options:ReconstructionOptions,feedback:VisualFeedbackOptions):Promise<SourceCorrectionResult&{visualFeedback:VisualFeedbackAudit}> {
  const packet=await buildVisualFeedbackRequest(baseline,observations,source,feedback.mode);
  const audit:VisualFeedbackAudit={policy:VISUAL_FEEDBACK_POLICY,status:packet.request?'pending':baseline.issueCount?'not-reviewable':'not-needed',reviews:0,actor:feedback.actor??'unspecified',
    ...(packet.request?{request:packet.request}:{}),deferredDiagnosticIds:packet.deferredDiagnosticIds,candidates:[],originalObservationSha256:await hash(observations.architecture),
    originalObservations:structuredClone(observations),baselineProjectContentSha256:baseline.audit.correction.projectContentSha256,attribution:'undetermined',
    limitation:'Interpretation versions and structural outcomes are not source ground truth. One failure does not distinguish model capability, context/prompt method, program limits or ambiguous source. No independent source verdict or automatic winner.'};
  const emit=()=>feedback.onAudit?.(structuredClone(audit));
  if(!packet.request){audit.reason=packet.reason;emit();return{...baseline,visualFeedback:audit};}
  emit();if(!feedback.review)return{...baseline,visualFeedback:audit};
  audit.reviews=1;emit();let raw:unknown;
  try{raw=await feedback.review(structuredClone(packet.request),structuredClone(source));}
  catch(e){audit.status='review-failed';audit.reason=message(e);emit();throw new VisualFeedbackOperationalError(message(e),structuredClone(audit),baseline);}
  audit.answer=structuredClone(raw);let decision:VisualFeedbackDecision;
  try{decision=response(raw,packet.request);}catch(e){audit.status='invalid-response';audit.reason=message(e);emit();return{...baseline,visualFeedback:audit};}
  audit.selected=decision.selected;
  const versions=new Map<number,{architecture:Interpretation;result:SourceCorrectionResult}>();
  for(const [index,h] of decision.hypotheses.entries()){
    let architecture:Interpretation,result:SourceCorrectionResult;
    try{
      architecture=revisedInterpretation(parseSourceArchitecture(baseline.audit.programProjection),h,packet.request);
      result=await reprojectSourceObservations({architecture,furnishing:observations.furnishing},source,options);
    }catch(e){audit.candidates.push({index,label:typeof h?.label==='string'?h.label:'invalid hypothesis',visualSupport:h?.visualSupport??'unknown',status:'invalid',error:message(e)});continue;}
    audit.candidates.push({index,label:h.label,visualSupport:h.visualSupport,status:'validated',interpretationSha256:await hash(architecture),projectContentSha256:result.audit.correction.projectContentSha256,partialImport:result.partialImport,issueCount:result.issueCount});
    versions.set(index,{architecture,result});
    try{feedback.onCandidate?.(index,structuredClone(architecture),structuredClone(result));}
    catch(e){audit.status='review-failed';audit.reason=message(e);emit();throw new VisualFeedbackOperationalError(message(e),structuredClone(audit),baseline);}
  }
  const selected=decision.selected===null?undefined:versions.get(decision.selected),hypothesis=decision.selected===null?undefined:decision.hypotheses[decision.selected];
  if(!selected||hypothesis?.visualSupport!=='clear'){
    audit.status='pending';audit.reason='No explicitly selected, clear, in-scope interpretation. Preserve alternatives and the current source.';emit();return{...baseline,visualFeedback:audit};
  }
  const changed=await hash(selected.architecture)!==packet.request.interpretationSha256;
  if(!changed){audit.status='unchanged';emit();return{...baseline,visualFeedback:audit};}
  // Evidence remains authoring-only and retains the FIRST architecture, even
  // when its initial accept/uncertain/reject interpretation is revised.
  const result=selected.result,project=structuredClone(result.project);
  project.architectureReview={...(project.architectureReview??{version:1 as const,issues:[]}),workingImageSha256:source.sha256,
    sourceObservations:JSON.stringify({...observations,visualFeedback:{policy:VISUAL_FEEDBACK_POLICY,requestId:packet.request.requestId,
      originalObservationSha256:audit.originalObservationSha256,interpretationSha256:await hash(selected.architecture),hypothesis}})};
  const projectContentSha256=await hash(project);audit.status='revised';emit();
  return{...result,project,audit:{...result.audit,correction:{...result.audit.correction,projectContentSha256}},visualFeedback:audit};
}
