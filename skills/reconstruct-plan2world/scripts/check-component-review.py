#!/usr/bin/env python3
"""Read-only component evidence/reference validation, not source recognition or geometry generation."""
import argparse
import json
import math
from pathlib import Path


def check(review, draft):
    vocabulary = json.loads((Path(__file__).resolve().parents[1] / 'references/component-vocabulary.json').read_text())
    types = {item['id']: item for item in vocabulary['types']}
    if not isinstance(review, dict) or not isinstance(draft, dict):
        raise ValueError('review and draft must be objects')
    if review.get('schemaVersion') != vocabulary['reviewSchema'] or review.get('vocabularyVersion') != vocabulary['version']:
        raise ValueError('Unsupported component review schema/vocabulary version')
    items = review.get('components')
    if not isinstance(items, list):
        raise ValueError('components must be an array')
    floors = {f['id']: f for f in draft['floors']}
    ids, unmapped, unmodeled, unresolved_vertical, evidence_only = set(), [], [], [], []
    arrays = {'wall':'walls', 'door':'doors', 'window':'windows', 'floorArea':'floorAreas'}
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Each component must be an object')
        identifier = item.get('id')
        if not isinstance(identifier, str) or not identifier.strip() or identifier in ids:
            raise ValueError('Component IDs must be nonempty and unique')
        ids.add(identifier)
        kind = item.get('type')
        if kind not in types:
            raise ValueError(f'{identifier}: unsupported architectural type {kind}')
        floor = floors.get(item.get('floorId'))
        if floor is None:
            raise ValueError(f'{identifier}: unknown floorId')
        image = item.get('image', {})
        if not isinstance(image, dict) or not all(isinstance(image.get(k), (int, float)) and not isinstance(image.get(k), bool)
                   and math.isfinite(image[k]) and 0 <= image[k] <= 1 for k in ('x', 'y')):
            raise ValueError(f'{identifier}: image must be a normalized point on the original raster')
        if not isinstance(item.get('evidence'), str) or not item['evidence'].strip():
            raise ValueError(f'{identifier}: source evidence is required')
        refs = item.get('geometryRefs', [])
        if not isinstance(refs, list):
            raise ValueError(f'{identifier}: geometryRefs must be an array')
        seen = set()
        for ref in refs:
            if not isinstance(ref, dict):
                raise ValueError(f'{identifier}: each geometry reference must be an object')
            role = ref.get('kind')
            key = (role, ref.get('id'))
            if role not in arrays or key in seen or not any(v['id'] == ref.get('id') for v in floor.get(arrays[role], [])):
                raise ValueError(f'{identifier}: duplicate or invalid same-floor geometry reference')
            seen.add(key)
        definition = types[kind]
        if not set(definition['geometryKinds']).issubset({r['kind'] for r in refs}):
            unmapped.append(identifier)
        if definition.get('requiresNativeSupport'):
            unmodeled.append(identifier)
        elif not definition['geometryKinds']:
            evidence_only.append(identifier)
        vertical = item.get('vertical')
        if vertical is not None:
            if kind != 'stair' or not isinstance(vertical, dict):
                raise ValueError(f'{identifier}: vertical is only valid for stairs')
            if vertical.get('direction') is not None and vertical['direction'] not in ('up', 'down'):
                raise ValueError(f'{identifier}: unsupported stair direction')
            target = vertical.get('toFloorId')
            if target is not None and (target not in floors or target == floor['id']):
                raise ValueError(f'{identifier}: stair target must be another supplied floor')
        if kind == 'stair' and not (vertical or {}).get('toFloorId'):
            unresolved_vertical.append(identifier)
    return {'componentCount':len(items), 'unmappedComponents':unmapped,
            'unmodeledComponents':unmodeled, 'evidenceOnlyComponents':evidence_only,
            'unresolvedStairTargets':unresolved_vertical,
            'limitation':'Reference validity does not prove source classification, source completeness, 3D modeling or walkability.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review', type=Path, required=True)
    parser.add_argument('--draft', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(check(json.loads(args.review.read_text()), json.loads(args.draft.read_text())), indent=2))
    except (ValueError, KeyError, TypeError) as error:
        parser.exit(1, f'{error}\n')
