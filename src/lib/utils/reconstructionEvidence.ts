/** Validate optional import evidence without treating its historical IDs as live references. */
export function validateReconstructionEvidence(value: unknown) {
  const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
  const text = (value: any) => typeof value === 'string' && value.length > 0;
  const confidence = (value: any) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  const evidence = value as any;
  const fail = (): never => { throw new Error('Invalid project: reconstruction evidence is malformed or has an unsupported version.'); };
  if (!object(evidence) || evidence.version !== 1 || !object(evidence.scale)
    || !['measured', 'provided', 'estimated'].includes(evidence.scale.mode) || !confidence(evidence.scale.confidence)
    || evidence.scale.basis !== undefined && typeof evidence.scale.basis !== 'string'
    || !Array.isArray(evidence.assumptions) || !evidence.assumptions.every((value: any) => typeof value === 'string')
    || !Array.isArray(evidence.floors)) fail();
  if (evidence.observationReview !== undefined) {
    const review = evidence.observationReview;
    if (!object(review) || review.version !== 1
      || !Number.isSafeInteger(review.acceptedZoneCount) || review.acceptedZoneCount < 0
      || !Number.isSafeInteger(review.supportedZoneCount) || review.supportedZoneCount < 0
      || review.supportedZoneCount > review.acceptedZoneCount
      || !Array.isArray(review.zoneFindings)
      || review.zoneFindings.length !== review.acceptedZoneCount - review.supportedZoneCount
      || !review.zoneFindings.every((finding: any) => object(finding) && text(finding.label) && text(finding.message))) fail();
  }
  const floors = new Set<string>();
  for (const floor of evidence.floors) {
    if (!object(floor) || !text(floor.floorId) || floors.has(floor.floorId)) fail();
    floors.add(floor.floorId);
    const ids = new Set<string>();
    for (const kind of ['walls', 'doors', 'windows', 'floorAreas']) {
      if (kind === 'floorAreas' && floor[kind] === undefined) continue;
      if (!Array.isArray(floor[kind])) fail();
      for (const item of floor[kind]) {
        if (!object(item) || !text(item.id) || ids.has(item.id)
          || item.confidence !== undefined && !confidence(item.confidence)
          || kind === 'walls' && item.kind !== undefined && !['interior', 'exterior', 'unknown'].includes(item.kind)) fail();
        ids.add(item.id);
      }
    }
  }
}
