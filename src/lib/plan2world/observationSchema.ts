import { PLAN2WORLD_FURNITURE_TYPES } from './furnitureVocabulary';

export type ObservationStage = 'architecture' | 'furnishing';
type Schema = Record<string, any>;
const string: Schema = { type: 'string' }, number: Schema = { type: 'number' };
const enumOf = (...values: string[]): Schema => ({ type: 'string', enum: values });
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = (items: Schema, bounds: Schema = {}): Schema => ({ type: 'array', items, ...bounds });
const point = object({ x: number, y: number });
const endpoints = array(point, { minItems: 2, maxItems: 2 });
const decision = { label: string, evidence: string, decision: enumOf('accept', 'uncertain', 'reject'), decisionBasis: string };
/** Strict providers require every declared property to be required. Explicit
 * variants retain optional evidence without nulls or a second wire contract. */
function evidenceVariants(properties: Record<string, Schema>): Schema[] {
  const variants: Record<string, Schema>[] = [{}, { uncertainty: string }, { sourceView: string }, { uncertainty: string, sourceView: string }];
  return variants
    .map(optional => object({ ...decision, ...properties, ...optional }));
}
const scale = object({ kind: enumOf('measured_dimension', 'scale_bar', 'provided_length', 'estimated_reference'), realLengthCm: { type: 'number', exclusiveMinimum: 0 }, endpoints, evidence: string });

/** Reuse repeated point/interval/boundary schemas instead of repeating their
 * text across optional evidence variants. $defs is supported by strict output. */
function compactSchema(root: Schema): Schema {
  const repeated = new Map<string, { schema: Schema; count: number; name?: string }>();
  const children = (s: Schema) => [...Object.values(s.properties ?? {}) as Schema[], ...(s.items ? [s.items] : []), ...(s.anyOf ?? [])];
  function count(s: Schema) {
    const key = JSON.stringify(s);
    if (key.length >= 80) { const entry = repeated.get(key); if (entry) entry.count++; else repeated.set(key, { schema: s, count: 1 }); }
    children(s).forEach(count);
  }
  count(root);
  const definitions = [...repeated.values()].filter(e => e.count > 1);
  definitions.forEach((e, i) => { e.name = `s${i}`; });
  function emit(s: Schema, own = false): Schema {
    const entry = repeated.get(JSON.stringify(s));
    if (!own && entry?.name) return { $ref: `#/$defs/${entry.name}` };
    return { ...s, ...(s.properties ? { properties: Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, emit(v as Schema)])) } : {}),
      ...(s.items ? { items: emit(s.items) } : {}), ...(s.anyOf ? { anyOf: s.anyOf.map((v: Schema) => emit(v)) } : {}) };
  }
  return { ...emit(root, true), ...(definitions.length ? { $defs: Object.fromEntries(definitions.map(e => [e.name!, emit(e.schema, true)])) } : {}) };
}

export function observationResponseSchema(stage: ObservationStage) {
  const schema = stage === 'furnishing'
    ? object({ schemaVersion: enumOf('source-furnishing-v1'), furniture: array(object({ sourceCategory: enumOf(...PLAN2WORLD_FURNITURE_TYPES), position: point })), assumptions: array(string) })
    : object({
      schemaVersion: enumOf('source-architecture-v1'), scaleEvidence: scale,
      walls: array({ anyOf: evidenceVariants({ start: point, end: point }) }),
      openings: array({ anyOf: [
        ...evidenceVariants({ kind: enumOf('door'), endpoints }),
        ...evidenceVariants({ kind: enumOf('door'), endpoints, doorType: enumOf('single', 'double', 'sliding', 'opening'), typeEvidence: string }),
        ...evidenceVariants({ kind: enumOf('window'), endpoints }),
      ] }),
      doorGaps: array(object({ from: point, to: point, evidence: string })),
      junctions: array({ anyOf: evidenceVariants({ position: point }) }),
      functionalZones: array({ anyOf: evidenceVariants({ category: string, environment: enumOf('indoor', 'balcony', 'outdoor'), position: point,
        boundary: array(object({ point, kind: enumOf('wall', 'window', 'passage', 'railing', 'air', 'unknown'), evidence: string }), { minItems: 3, maxItems: 128 }) }) }, { maxItems: 128 }),
      assumptions: array(string),
    });
  return { name: `plan2world_${stage}_v1`, strict: true, schema: compactSchema(schema) };
}
