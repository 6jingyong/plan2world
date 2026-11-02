import { parseSourceFurnishing, type SourceArchitectureV1 } from './architecture';
import { compileRuntimeScene } from '../runtime/compileRuntimeScene';
import { furnitureSupportFindings } from '../runtime/placementSupport';
import { sourcePoints, type SourceDiagnostic } from './sourceDiagnostics';
import type { SourceCorrectionResult } from './correction';
import type { VisualFeedbackRequest } from './visualFeedback';

export interface FeedbackSupportReview {
  status: 'assessed' | 'not-assessed';
  findings: { path: string; entityId: string; floorId: string; position: {x:number;y:number}; sourceRecord: unknown }[];
  unmappedEntityIds: string[];
  error?: string;
}
export interface FeedbackFurnitureChange {
  path: `furniture[${number}]`;
  action: 'revise' | 'retract';
  evidence: string;
  value?: { sourceCategory: string; position: {x:number;y:number} };
}
const errorMessage=(e:unknown)=>e instanceof Error?e.message:String(e);
const indexOf=(path:string)=>/^furniture\[(0|[1-9]\d*)\]$/.exec(path);

/** Use actual compiler floor triangles and exact source-feature ownership, never
 * parse an exception or infer source indices from generated native entity IDs. */
export function inspectFeedbackSupport(result:SourceCorrectionResult,furnishing:unknown,architecture:SourceArchitectureV1,
  runtime = () => compileRuntimeScene(result.project)) {
  const review:FeedbackSupportReview={status:'not-assessed',findings:[],unmappedEntityIds:[]};
  const diagnostics:SourceDiagnostic[]=[];
  try {
    const parsed=parseSourceFurnishing(furnishing,architecture.scaleEvidence);
    for(const finding of furnitureSupportFindings(runtime())) {
      if(finding.code!=='source-marker-no-floor')continue;
      const matches=result.features.filter(f=>f.kind==='furniture'&&f.nativeIds.includes(finding.entityId));
      const match=matches.length===1?indexOf(matches[0].path):null;
      const row=match?parsed.furniture[Number(match[1])]:undefined;
      if(!match||!row){review.unmappedEntityIds.push(finding.entityId);continue;}
      const item={path:matches[0].path,entityId:finding.entityId,floorId:finding.floorId,position:structuredClone(row.position),sourceRecord:structuredClone(row)};
      review.findings.push(item);
      diagnostics.push({id:`support-review-${review.findings.length}`,code:'source-marker-no-floor',phase:'assembly',category:'root',
        message:'The compiler reports no floor under this observed source marker. Reinspect the object identity, source point and surrounding ground evidence; neither the object nor the missing floor is presumed correct.',
        sourcePaths:[item.path],blockedBy:[],position:item.position,sourceRecord:item.sourceRecord});
    }
    review.status='assessed';
  }catch(error){review.error=errorMessage(error);}
  return {review,diagnostics};
}

/** Furniture observation revisions are separate from the frozen first pass.
 * Only compiler-conflicted, pinned source records may change; other furniture
 * remains exactly as observed. Reprojection will rerun closure with new anchors. */
export function reviseFeedbackFurnishing(input:unknown,architecture:SourceArchitectureV1,changes:unknown,request:VisualFeedbackRequest) {
  const original=parseSourceFurnishing(input,architecture.scaleEvidence),rows=structuredClone(original.furniture);
  const indices=rows.map((_,i)=>i),retracted=new Set<number>(),seen=new Set<string>();
  if(changes===undefined)return {furnishing:original,indices,retractedPaths:[] as string[]};
  if(!['source-visual-feedback-v2','source-visual-feedback-v4'].includes(request.schemaVersion)||!Array.isArray(changes)||changes.length>8)throw new Error('Furniture revisions need the explicit support-review scope.');
  const local=(v:unknown)=>sourcePoints(v).every(p=>request.regions.some(g=>p.x>=g.contextBox[0]&&p.x<=g.contextBox[2]&&p.y>=g.contextBox[1]&&p.y<=g.contextBox[3]));
  for(const change of changes){
    if(!change||typeof change!=='object'||Array.isArray(change)||Object.keys(change).some(k=>!['path','action','evidence','value'].includes(k)))throw new Error('Invalid furniture source revision fields.');
    const match=typeof change.path==='string'?indexOf(change.path):null;
    if(!match||seen.has(change.path)||!request.records.some(r=>r.path===change.path)||!request.supportReview?.findings.some(f=>f.path===change.path))throw new Error('Furniture revision must target a unique pinned compiler conflict.');
    seen.add(change.path);const index=Number(match[1]);
    if(!rows[index]||!local(rows[index])||typeof change.evidence!=='string'||!change.evidence.trim())throw new Error('Furniture source revision needs local contrary or correcting visual evidence.');
    if(change.action==='retract'){
      if(change.value!==undefined)throw new Error('A retraction cannot replace the object.');
      retracted.add(index);
    }else if(change.action==='revise'){
      const parsed=parseSourceFurnishing({schemaVersion:'source-furnishing-v1',furniture:[change.value]},architecture.scaleEvidence).furniture[0];
      if(!local(parsed)||parsed.position.x<0||parsed.position.y<0||parsed.position.x>request.source.width||parsed.position.y>request.source.height)throw new Error('Furniture revision exceeds original source bounds or reviewed context.');
      rows[index]=parsed;
    }else throw new Error('Furniture source revision must revise or retract; unresolved evidence remains unknown.');
  }
  return {furnishing:{...original,furniture:rows.filter((_,i)=>!retracted.has(i))},indices:indices.filter(i=>!retracted.has(i)),retractedPaths:[...retracted].map(i=>`furniture[${i}]`)};
}

export function remapFeedbackFurniturePaths(result:SourceCorrectionResult,indices:number[],retractedPaths:string[]) {
  const remap=(path:string)=>{const match=indexOf(path);return match?`furniture[${indices[Number(match[1])]}]`:path;};
  const diagnostics=result.diagnostics.map(d=>({...d,sourcePaths:d.sourcePaths.map(remap)}));
  const features=[...result.features.map(f=>({...f,path:remap(f.path)})),...retractedPaths.map(path=>({path,kind:'furniture' as const,status:'rejected' as const,nativeIds:[],blockedBy:[]}))];
  const project=structuredClone(result.project);
  if(project.architectureReview)project.architectureReview.issues=project.architectureReview.issues.map(i=>({...i,...(i.sourcePaths?{sourcePaths:i.sourcePaths.map(remap)}:{})}));
  return {...result,project,diagnostics,features,audit:{...result.audit,correction:{...result.audit.correction,diagnostics,features}}};
}
