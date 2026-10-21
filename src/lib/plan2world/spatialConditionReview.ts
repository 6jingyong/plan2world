import type { Point, Wall } from '$lib/models/types';
import { analyzeFloor } from '$lib/utils/floorAnalysis';
import { pointInPolygon } from '$lib/utils/hitTesting';
import { wallPathSpans, wallPointAt, wallTangentAt } from '$lib/utils/wallPath';
import { draftToProject, type Plan2WorldDraft } from './draft';
import type { prepareArchitectureStage } from './architecture';

type FrozenStage = ReturnType<typeof prepareArchitectureStage>;
type Status = 'consistent' | 'conflict' | 'review' | 'not-evaluable';
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
// The native face graph matches vertices within 5 cm on each axis. This review
// permits that existing representation tolerance; it never snaps any geometry.
export const NATIVE_BOUNDARY_TOLERANCE_CM = Math.SQRT2 * 5 + 1e-6;

/** Check the whole edge by an interval union, not sparse point sampling. */
export function reviewBoundaryCoverage(polygon: readonly Point[], walls: readonly Pick<Wall, 'start' | 'end' | 'curvePoint'>[], toleranceCm = NATIVE_BOUNDARY_TOLERANCE_CM) {
  if (!Number.isFinite(toleranceCm) || toleranceCm < 0) throw new Error('Invalid coverage tolerance.');
  const spans = walls.flatMap(wall => wallPathSpans(wall));
  return polygon.flatMap((start, index) => {
    const end = polygon[(index + 1) % polygon.length], length = distance(start, end);
    if (length <= 1e-8) return [];
    const dx = (end.x - start.x) / length, dy = (end.y - start.y) / length;
    const along = (p: Point) => (p.x - start.x) * dx + (p.y - start.y) * dy;
    const across = (p: Point) => Math.abs((p.x - start.x) * dy - (p.y - start.y) * dx);
    const intervals = spans.filter(span => across(span.start) <= toleranceCm && across(span.end) <= toleranceCm)
      .map(span => [Math.max(0, Math.min(along(span.start), along(span.end))), Math.min(length, Math.max(along(span.start), along(span.end)))])
      .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
    let coveredTo = 0;
    for (const [a, b] of intervals) {
      if (a > coveredTo + toleranceCm) break;
      coveredTo = Math.max(coveredTo, b);
    }
    return coveredTo + toleranceCm >= length ? [] : [{ edge: index, start, end, unsupportedFromCm: coveredTo, lengthCm: length }];
  });
}

/** Source-pixel pairs are deduplicated without widening any snap threshold. */
export function groupNearMisses(nearMisses: FrozenStage['sourceTopologyReview']['nearMisses']) {
  const groups = new Map<string, { sourcePoints: Point[]; distancePx: number; records: typeof nearMisses }>();
  for (const item of nearMisses) {
    const points = [item.sourcePoint, item.projection].sort((a, b) => a.x - b.x || a.y - b.y);
    const key = points.map(p => `${p.x.toFixed(5)},${p.y.toFixed(5)}`).join(':');
    const group = groups.get(key) ?? { sourcePoints: points, distancePx: item.distancePx, records: [] };
    group.records.push(item); groups.set(key, group);
  }
  return [...groups.values()];
}

/** A diagnostic layer over the existing native model. No geometry or profile-
 * specific coordinates enter the solver, and there is no additional AI call. */
export function reviewSpatialConditions(stage: FrozenStage, draft: Plan2WorldDraft) {
  // The converter accepts a clock for project/room IDs. A fixed diagnostic
  // clock makes reports reproducible; this ephemeral project is never saved.
  const project = draftToProject(draft, new Date(0)), floors = project.floors.map(floor => analyzeFloor(floor));
  const reference = stage.architecture.scaleEvidence;
  const cmPerPixel = reference.realLengthCm / distance(reference.endpoints[0], reference.endpoints[1]);
  const sourcePoints = stage.bareHouse.walls.flatMap(w => [w.start, w.end, ...(w.curvePoint ? [w.curvePoint] : [])]);
  const origin = { x: Math.min(...sourcePoints.map(p => p.x)), y: Math.min(...sourcePoints.map(p => p.y)) };
  const convert = (p: Point) => ({ x: (p.x - origin.x) * cmPerPixel, y: (p.y - origin.y) * cmPerPixel });
  const contains = (analysis: typeof floors[number], roomId: string, p: Point) =>
    pointInPolygon(p, analysis.polygons.get(roomId) ?? []) && !(analysis.holes.get(roomId) ?? []).some(hole => pointInPolygon(p, hole));
  const boundaryProblems = floors.flatMap(analysis => analysis.geometry.flatMap(({ room, polygon }) => room.boundary
    ? [] // Explicit source-supported floor areas need not be surrounded by walls.
    : reviewBoundaryCoverage(polygon, analysis.floor.walls).map(problem => ({ floorId: analysis.floor.id, roomId: room.id, ...problem }))));
  const apertureRelations = floors.flatMap(analysis => [
    ...analysis.floor.doors.map(aperture => ({ ...aperture, kind: 'door' as const })),
    ...analysis.floor.windows.map(aperture => ({ ...aperture, kind: 'window' as const })),
  ].map(aperture => {
    const host = analysis.floor.walls.find(wall => wall.id === aperture.wallId)!;
    const center = wallPointAt(host, aperture.position), tangent = wallTangentAt(host, aperture.position);
    // A local topological probe, in source-relative units. Not a human body,
    // navigability test or evidence of the opening's correctness in the image.
    const offset = 2 * cmPerPixel;
    const ids = (sign: number) => analysis.rooms.filter(room => !room.floorOpening && contains(analysis, room.id,
      { x: center.x - sign * tangent.y * offset, y: center.y + sign * tangent.x * offset })).map(room => room.id);
    const left = ids(1), right = ids(-1);
    return { floorId: analysis.floor.id, id: aperture.id, kind: aperture.kind, wallId: host.id, center,
      sourcePosition: { x: center.x / cmPerPixel + origin.x, y: center.y / cmPerPixel + origin.y },
      leftRegionIds: left, rightRegionIds: right, sameRegionIds: left.filter(id => right.includes(id)),
      boundaryRegionIds: analysis.rooms.filter(room => room.walls.includes(host.id)).map(room => room.id),
      traversalPolicy: aperture.kind === 'window' ? 'blocked-even-when-full-height' : aperture.type === 'opening' ? 'leafless-passage' : 'depends-on-door-state' };
  }));
  const furnitureRelations = (stage.furnishingEvidence?.furniture ?? []).map((item, index) => ({ index: index + 1,
    sourceCategory: item.sourceCategory, sourcePosition: item.position,
    regions: floors.flatMap(analysis => analysis.rooms.filter(room => !room.floorOpening && contains(analysis, room.id, convert(item.position)))
      .map(room => ({ floorId: analysis.floor.id, roomId: room.id }))) }));
  const regions = floors.flatMap(analysis => analysis.geometry.map(({ room, polygon }) => ({ floorId: analysis.floor.id, roomId: room.id,
    areaM2Provisional: room.area, explicitFloorArea: !!room.boundary, polygon,
    furnitureIndices: furnitureRelations.filter(item => item.regions.some(r => r.floorId === analysis.floor.id && r.roomId === room.id)).map(item => item.index),
    doorIds: apertureRelations.filter(item => item.floorId === analysis.floor.id && item.kind === 'door' && item.boundaryRegionIds.includes(room.id)).map(item => item.id) })));
  const structures = (value: Plan2WorldDraft) => value.floors.map(({ id, walls, doors, windows }) => ({ id, walls, doors, windows }));
  const structurePreserved = JSON.stringify(structures(draft)) === JSON.stringify(structures(stage.architectureDraft));
  const target = draft.floors[0], sourceById = new Map(stage.bareHouse.walls.map(w => [w.id, w]));
  const scaleConflicts = target.walls.flatMap(w => {
    const source = sourceById.get(w.id);
    return (['start', 'end', 'curvePoint'] as const).flatMap(key => {
      const a = source?.[key], b = w[key];
      return !a && !b || a && b && distance(convert(a), b) <= 1e-6 ? [] : [{ wallId: w.id, field: key }];
    });
  });
  const relative = stage.relativeGeometry;
  const relativeConsistent = relative && sourcePoints.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))
    && relative.divisorPx === Math.max(stage.sourceContext.sourceWidthPx!, stage.sourceContext.sourceHeightPx!)
    && relative.width === stage.sourceContext.sourceWidthPx! / relative.divisorPx
    && relative.height === stage.sourceContext.sourceHeightPx! / relative.divisorPx
    && JSON.stringify(relative.walls) === JSON.stringify(stage.bareHouse.walls.map(w => ({ id: w.id,
      start: { x: w.start.x / relative.divisorPx, y: w.start.y / relative.divisorPx },
      end: { x: w.end.x / relative.divisorPx, y: w.end.y / relative.divisorPx },
      ...(w.curvePoint ? { curvePoint: { x: w.curvePoint.x / relative.divisorPx, y: w.curvePoint.y / relative.divisorPx } } : {}) })));
  const frozenAnchors = stage.furnishingEvidence?.furniture;
  const anchorsPreserved = frozenAnchors && (target.furniture ?? []).length === frozenAnchors.length
    && frozenAnchors.every((item, i) => item.sourceCategory === target.furniture![i].sourceCategory && distance(convert(item.position), target.furniture![i].position) <= 1e-6);
  const unresolved = stage.openingAudit.filter(item => item.decision === 'accept' && item.programStatus !== 'assembled');
  const invalidIntervals = stage.openingAudit.filter(item => item.programInterval &&
    (!sourceById.has(item.programInterval.wallId) || !Number.isFinite(item.programInterval.widthPx) || item.programInterval.widthPx <= 0));
  const uncertainWalls = stage.architecture.walls.filter(item => item.decision === 'uncertain');
  const uncertainOpenings = stage.architecture.openings.filter(item => item.decision === 'uncertain');
  const missingEntrances = regions.filter(region => region.furnitureIndices.length && !region.doorIds.length);
  const sameFaceDoors = apertureRelations.filter(item => item.kind === 'door' && item.sameRegionIds.length);
  const sameFaceStatefulDoors = sameFaceDoors.filter(item => item.traversalPolicy === 'depends-on-door-state');
  const sameFacePassages = sameFaceDoors.filter(item => item.traversalPolicy === 'leafless-passage');
  const outsideFurniture = furnitureRelations.filter(item => !item.regions.length);
  const nearMissGroups = groupNearMisses(stage.sourceTopologyReview.nearMisses);
  const rule = (id: string, strength: 'invariant' | 'prior' | 'evidence', status: Status, details: unknown) => ({ id, strength, status, details });
  const rules = [
    rule('H01', 'invariant', structurePreserved ? 'consistent' : 'conflict', { structurePreserved }),
    rule('H02', 'invariant', boundaryProblems.length ? 'conflict' : regions.some(r => !r.explicitFloorArea) ? 'consistent' : 'not-evaluable', { toleranceCm: NATIVE_BOUNDARY_TOLERANCE_CM, boundaryProblems, explicitFloorAreasExcluded: regions.filter(r => r.explicitFloorArea).length }),
    rule('H03', 'invariant', unresolved.length || invalidIntervals.length ? 'conflict' : 'consistent', { accepted: stage.openingAudit.filter(item => item.decision === 'accept').length, unresolved, invalidIntervals }),
    rule('H04', 'invariant', scaleConflicts.length || relativeConsistent === false ? 'conflict' : !relative ? 'not-evaluable' : 'consistent', { cmPerPixel, scaleConflicts, relativeConsistent: relativeConsistent ?? null }),
    rule('H05', 'invariant', anchorsPreserved === undefined ? 'not-evaluable' : anchorsPreserved ? 'consistent' : 'conflict', { anchorsPreserved: anchorsPreserved ?? null }),
    rule('P01', 'prior', !furnitureRelations.length ? 'not-evaluable' : outsideFurniture.length ? 'review' : 'consistent', { anchorCount: furnitureRelations.length, contained: furnitureRelations.length - outsideFurniture.length, outsideFurniture, exceptions: 'Outdoor placement, incorrect observation, open source-supported floor area; never infer a missing wall from an anchor alone.' }),
    rule('P02', 'prior', missingEntrances.length ? 'review' : furnitureRelations.length ? 'consistent' : 'not-evaluable', { regions: missingEntrances.map(({ polygon: _, ...region }) => region), exceptions: 'Storage, shaft, furniture drawn as a compartment, concealed access or missed source door; no invented entrance.' }),
    rule('P03', 'prior', sameFaceStatefulDoors.length ? 'review' : apertureRelations.some(item => item.kind === 'door') ? 'consistent' : 'not-evaluable', { doors: sameFaceStatefulDoors,
      leaflessPassagesForContext: sameFacePassages,
      leaflessPassageCount: sameFacePassages.length,
      statefulDoorCount: sameFaceStatefulDoors.length,
      exceptions: 'A door in a legitimate freestanding screen can have the same surrounding region. A leafless passage can be part of an open-plan arrangement. These relations are not missing-wall verdicts.' }),
    rule('P04', 'prior', nearMissGroups.length ? 'review' : 'consistent', { rawRecords: stage.sourceTopologyReview.nearMisses.length, groups: nearMissGroups, exceptions: 'Near misses may be intentional openings or freestanding wall ends; no auto join.' }),
    rule('E01', 'evidence', uncertainWalls.length || uncertainOpenings.length ? 'review' : 'consistent', { uncertainWalls, uncertainOpenings }),
    rule('E02', 'evidence', reference.kind === 'estimated_reference' ? 'review' : 'consistent', { kind: reference.kind, draftScale: draft.scale, externalAccuracyVerified: false }),
    rule('U01', 'evidence', 'not-evaluable', 'No independently frozen room-label/area ground truth. Closed regions do not establish correct room separation.'),
    rule('U02', 'evidence', 'not-evaluable', 'Raster linework does not establish wall bearing, height, railing height or window sill. Full-height apertures remain editable product defaults.'),
    rule('U03', 'evidence', 'not-evaluable', 'No independent full source-geometry reference. Consistency findings do not certify source-image accuracy or traversal.'),
  ];
  return { schemaVersion: 'spatial-condition-review-v1', mode: 'read-only-post-hoc' as const, geometryChanged: false, llmCalls: 0,
    centerlinePolicy: stage.centerlinePolicy, nativeRegionCount: regions.length,
    rules, regions, furnitureRelations, apertureRelations,
    invariantConflictCount: rules.filter(item => item.strength === 'invariant' && item.status === 'conflict').length,
    reviewRuleIds: rules.filter(item => item.status === 'review').map(item => item.id),
    sourceAcceptance: 'pending-independent-review', limitation: 'No composite success score. Soft priors identify contradictions; they never authorize geometry changes.' };
}
