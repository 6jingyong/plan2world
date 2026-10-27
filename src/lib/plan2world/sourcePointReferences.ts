import { parseSourceArchitecture, SOURCE_ARCHITECTURE_VERSION } from './architecture';
import type { DraftPoint } from './draft';

export const SOURCE_POINT_REFERENCES_VERSION = 'source-architecture-pointrefs-v1' as const;

function object(value: unknown, path: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} requires an object`);
  return value as Record<string, any>;
}
function keys(value: Record<string, any>, allowed: string[], path: string) {
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length) throw new Error(`${path} contains unsupported fields: ${extra.join(', ')}`);
}
function array(value: unknown, path: string): any[] {
  if (!Array.isArray(value)) throw new Error(`${path} requires an array`);
  return value;
}

/** Opt-in observation transport only. Source names reuse literal pixel positions;
 * they never assign native IDs, choose hosts, snap, deduplicate or infer geometry.
 * Keep the raw source and returned audit alongside the expanded legacy input. */
export function expandSourcePointReferences(input: unknown, dimensions?: { width: number; height: number }) {
  const root = object(input, 'pointrefs');
  keys(root, ['schemaVersion', 'sourcePoints', 'scaleEvidence', 'walls', 'openings', 'doorGaps', 'junctions', 'assumptions', 'functionalZones'], 'pointrefs');
  if (root.schemaVersion !== SOURCE_POINT_REFERENCES_VERSION) throw new Error(`pointrefs requires ${SOURCE_POINT_REFERENCES_VERSION}`);
  if (dimensions && ![dimensions.width, dimensions.height].every(n => Number.isFinite(n) && n > 0)) throw new Error('Source dimensions must be positive and finite');
  const literal = (value: unknown, path: string): DraftPoint => {
    const p = object(value, path); keys(p, ['x', 'y'], path);
    if (![p.x, p.y].every(n => typeof n === 'number' && Number.isFinite(n))) throw new Error(`${path} requires finite source pixels`);
    if (dimensions && (p.x < 0 || p.y < 0 || p.x > dimensions.width || p.y > dimensions.height)) throw new Error(`${path} lies outside the source raster`);
    return { x: p.x, y: p.y };
  };
  const entries = array(root.sourcePoints, 'sourcePoints');
  if (entries.length > 4096) throw new Error('sourcePoints exceeds 4096 observations');
  const points = new Map<string, { position: DraftPoint; paths: string[] }>();
  for (const [index, entry] of entries.entries()) {
    if (!Array.isArray(entry) || entry.length !== 3 || typeof entry[0] !== 'string' || !entry[0].trim() || entry[0] !== entry[0].trim()) throw new Error(`sourcePoints[${index}] requires [source name, x, y]`);
    const [name, x, y] = entry;
    if (points.has(name)) throw new Error(`Duplicate source point name: ${name}`);
    points.set(name, { position: literal({ x, y }, `sourcePoints[${index}]`), paths: [] });
  }
  let inlinePointCount = 0, referenceCount = 0;
  const resolve = (value: unknown, path: string): DraftPoint => {
    if (typeof value !== 'string') { inlinePointCount++; return literal(value, path); }
    const source = points.get(value);
    if (!source) throw new Error(`Unknown source point "${value}" at ${path}`);
    source.paths.push(path); referenceCount++;
    return { ...source.position };
  };
  const scale = object(root.scaleEvidence, 'scaleEvidence');
  const expanded = {
    schemaVersion: SOURCE_ARCHITECTURE_VERSION,
    scaleEvidence: { ...scale, endpoints: array(scale.endpoints, 'scaleEvidence.endpoints').map((p, i) => resolve(p, `scaleEvidence.endpoints[${i}]`)) },
    walls: array(root.walls, 'walls').map((raw, i) => {
      const wall = object(raw, `walls[${i}]`);
      return { ...wall, start: resolve(wall.start, `walls[${i}].start`), end: resolve(wall.end, `walls[${i}].end`),
        ...(wall.curvePoint === undefined ? {} : { curvePoint: resolve(wall.curvePoint, `walls[${i}].curvePoint`) }) };
    }),
    openings: array(root.openings, 'openings').map((raw, i) => {
      const opening = object(raw, `openings[${i}]`);
      return { ...opening, endpoints: array(opening.endpoints, `openings[${i}].endpoints`).map((p, j) => resolve(p, `openings[${i}].endpoints[${j}]`)) };
    }),
    doorGaps: array(root.doorGaps ?? [], 'doorGaps').map((raw, i) => {
      const gap = object(raw, `doorGaps[${i}]`);
      return { ...gap, from: resolve(gap.from, `doorGaps[${i}].from`), to: resolve(gap.to, `doorGaps[${i}].to`) };
    }),
    junctions: array(root.junctions ?? [], 'junctions').map((raw, i) => {
      const junction = object(raw, `junctions[${i}]`);
      return { ...junction, position: resolve(junction.position, `junctions[${i}].position`) };
    }),
    assumptions: root.assumptions ?? [],
    ...(root.functionalZones === undefined ? {} : {
      functionalZones: array(root.functionalZones, 'functionalZones').map((raw, i) => {
        const zone = object(raw, `functionalZones[${i}]`);
        return { ...zone, position: resolve(zone.position, `functionalZones[${i}].position`),
          boundary: array(zone.boundary, `functionalZones[${i}].boundary`).map((raw, j) => {
            const edge = object(raw, `functionalZones[${i}].boundary[${j}]`), path = `functionalZones[${i}].boundary[${j}]`;
            return { ...edge, point: resolve(edge.point, `${path}.point`),
              ...(edge.curvePoint === undefined ? {} : { curvePoint: resolve(edge.curvePoint, `${path}.curvePoint`) }) };
          }) };
      }),
    }),
  };
  const used = [...points.values()].filter(point => point.paths.length).length;
  return { architecture: parseSourceArchitecture(expanded), audit: {
    schemaVersion: 'source-point-reference-audit-v1' as const,
    sourceSchemaVersion: SOURCE_POINT_REFERENCES_VERSION,
    topologyComputed: false, coordinatesChanged: false, nativeIdsAssigned: false,
    declaredPointCount: points.size, usedPointCount: used, inlinePointCount, referenceCount,
    coordinatePairsAuthored: points.size + inlinePointCount,
    coordinateOccurrencesExpanded: referenceCount + inlinePointCount,
    avoidedRepeatedCoordinatePairs: referenceCount - used,
    points: [...points].map(([label, { position, paths }]) => ({ label, position, paths })),
    unusedPointNames: [...points].filter(([, point]) => !point.paths.length).map(([name]) => name),
  } };
}
