import type { Project } from '../models/types';
import type { SourceArchitectureV1 } from './architecture';
import { inspectStructureEvidence, structureQuestionDiagnostics } from './structureEvidence';
import { sourcePixelToPlanPoint } from './reconstructionTrace';
import type { SourceDiagnostic } from './sourceDiagnostics';

export interface StructureObservationSnapshot { architecture: unknown; furnishing: unknown; sourceSha256?: string }

/** Preserve first evidence when the strict browser flow rebuilds a native
 * Project from a calibrated draft. Metadata only; rooms/runtime stay derived
 * from the caller's Project, never from another geometry or a refitted image. */
export function attachStructureEvidence(project: Project, snapshot: StructureObservationSnapshot | undefined, source: {width:number;height:number}): Project {
  if (!snapshot) return project;
  const review=inspectStructureEvidence(snapshot.architecture as SourceArchitectureV1,source);
  if (review.status==='absent') return project;
  const next=structuredClone(project),floor=next.floors.find(f=>f.backgroundImage?.reconstructionSource?.width===source.width
    &&f.backgroundImage.reconstructionSource.height===source.height)??next.floors[0];
  const findings:SourceDiagnostic[]=review.evidence?structureQuestionDiagnostics(review.evidence):[{
    id:'invalid-structure-evidence',code:'invalid-structure-evidence',phase:'observation',category:'root',
    message:`Initial structural evidence needs correction: ${review.error}`,sourcePaths:['structureEvidence'],blockedBy:[],
  }];
  const previous=next.architectureReview??{version:1 as const,issues:[]};
  const ids=new Set(previous.issues.map(i=>i.id));
  next.architectureReview={...previous,issues:[...previous.issues,...findings.filter(d=>!ids.has(d.id)).map(d=>({
    id:d.id,floorId:floor.id,message:d.message,code:d.code,phase:d.phase,category:d.category,sourcePaths:d.sourcePaths,blockedBy:d.blockedBy,
    ...(d.position&&floor.backgroundImage?{position:sourcePixelToPlanPoint(d.position,source,floor.backgroundImage)}:{}),
    ...(d.sourceRecord?{sourceRecord:JSON.stringify(d.sourceRecord)}:{}),resolved:false,
  }))],sourceObservations:previous.sourceObservations??JSON.stringify({architecture:snapshot.architecture,furnishing:snapshot.furnishing}),
    ...(snapshot.sourceSha256?{workingImageSha256:snapshot.sourceSha256}:{})};
  return next;
}
