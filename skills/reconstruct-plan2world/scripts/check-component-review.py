#!/usr/bin/env python3
"""Read-only component evidence/reference validation, not source recognition or geometry generation."""
import argparse
import json
import math
from pathlib import Path


def finite_point(value):
    return isinstance(value, dict) and all(
        isinstance(value.get(k), (int, float)) and not isinstance(value.get(k), bool) and math.isfinite(value[k])
        for k in ('x', 'y')
    )


def check(review, draft):
    vocabulary = json.loads((Path(__file__).resolve().parents[1] / 'references/component-vocabulary.json').read_text())
    types = {item['id']: item for item in vocabulary['types']}
    if not isinstance(review, dict) or not isinstance(draft, dict):
        raise ValueError('review and draft must be objects')
    if review.get('schemaVersion') != vocabulary['reviewSchema'] or review.get('vocabularyVersion') != vocabulary['version']:
        raise ValueError('Unsupported component review schema/vocabulary version')
    if not isinstance(draft.get('floors'), list):
        raise ValueError('draft floors must be an array')

    floors = {f.get('id'): f for f in draft['floors'] if isinstance(f, dict)}
    draft_components = {}
    arrays = {'wall':'walls', 'door':'doors', 'window':'windows', 'floorArea':'floorAreas'}
    forbidden_policy_keys = {'render', 'visible', 'sceneEffect', 'sceneSupport', 'requiresNativeSupport'}

    for floor_id, floor in floors.items():
        components = floor.get('components', [])
        if not isinstance(components, list):
            raise ValueError(f'{floor_id}: components must be an array')
        for component in components:
            if not isinstance(component, dict):
                raise ValueError('Each draft component must be an object')
            identifier = component.get('id')
            if not isinstance(identifier, str) or not identifier.strip() or identifier in draft_components:
                raise ValueError('Draft component IDs must be nonempty and unique')
            if forbidden_policy_keys.intersection(component):
                raise ValueError(f'{identifier}: scene policy is registry-owned, not draft-authored')
            kind = component.get('type')
            if kind not in types:
                raise ValueError(f'{identifier}: unsupported architectural type {kind}')
            if not finite_point(component.get('position')):
                raise ValueError(f'{identifier}: position must be a finite plan-space point')
            refs = component.get('geometryRefs', [])
            if not isinstance(refs, list):
                raise ValueError(f'{identifier}: geometryRefs must be an array')
            seen = set()
            for ref in refs:
                if not isinstance(ref, dict):
                    raise ValueError(f'{identifier}: each geometry reference must be an object')
                role = ref.get('kind')
                key = (role, ref.get('id'))
                if role not in arrays or key in seen or not any(
                    isinstance(v, dict) and v.get('id') == ref.get('id') for v in floor.get(arrays[role], [])
                ):
                    raise ValueError(f'{identifier}: duplicate or invalid same-floor geometry reference')
                seen.add(key)
            vertical = component.get('vertical')
            if vertical is not None:
                if kind != 'stair' or not isinstance(vertical, dict):
                    raise ValueError(f'{identifier}: vertical is only valid for stairs')
                if vertical.get('direction') is not None and vertical['direction'] not in ('up', 'down'):
                    raise ValueError(f'{identifier}: unsupported stair direction')
                target = vertical.get('toFloorId')
                if target is not None and (target not in floors or target == floor_id):
                    raise ValueError(f'{identifier}: stair target must be another supplied floor')
            draft_components[identifier] = (floor_id, component)

    if draft_components and draft.get('componentVocabulary') != vocabulary['version']:
        raise ValueError(f'Draft components require componentVocabulary {vocabulary["version"]}')

    review_items = review.get('components')
    if not isinstance(review_items, list):
        raise ValueError('review components must be an array')
    review_ids = set()
    for item in review_items:
        if not isinstance(item, dict):
            raise ValueError('Each review component must be an object')
        identifier = item.get('id')
        if not isinstance(identifier, str) or not identifier.strip() or identifier in review_ids:
            raise ValueError('Review component IDs must be nonempty and unique')
        if identifier not in draft_components:
            raise ValueError(f'{identifier}: review evidence has no matching draft component')
        review_ids.add(identifier)
        image = item.get('image')
        if not finite_point(image) or not 0 <= image['x'] <= 1 or not 0 <= image['y'] <= 1:
            raise ValueError(f'{identifier}: image must be a normalized point on the original raster')
        if not isinstance(item.get('evidence'), str) or not item['evidence'].strip():
            raise ValueError(f'{identifier}: source evidence is required')
        extra = set(item) - {'id', 'image', 'evidence'}
        if extra:
            raise ValueError(f'{identifier}: review sidecar may only contain id, image and evidence')
    missing_evidence = sorted(set(draft_components) - review_ids)
    if missing_evidence:
        raise ValueError(f'Missing review evidence for draft components: {", ".join(missing_evidence)}')

    unmapped, unmodeled, ignored, unresolved_vertical, policies = [], [], [], [], []
    for identifier, (floor_id, component) in draft_components.items():
        definition = types[component['type']]
        ref_kinds = {ref['kind'] for ref in component.get('geometryRefs', [])}
        if not set(definition['geometryKinds']).issubset(ref_kinds):
            unmapped.append(identifier)
        support = definition['sceneSupport']
        if support == 'unsupported':
            unmodeled.append(identifier)
        elif support == 'ignore':
            ignored.append(identifier)
        if component['type'] == 'stair' and not (component.get('vertical') or {}).get('toFloorId'):
            unresolved_vertical.append(identifier)
        policies.append({
            'id': identifier,
            'type': component['type'],
            'sceneEffect': definition['sceneEffect'],
            'sceneSupport': support,
        })

    return {
        'componentCount': len(draft_components),
        'unmappedComponents': unmapped,
        'unmodeledComponents': unmodeled,
        'ignoredSceneComponents': ignored,
        'unresolvedStairTargets': unresolved_vertical,
        'scenePolicies': policies,
        'limitation': 'Registry policy is deterministic, but reference validity does not prove source classification or source-overlay alignment.'
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review', type=Path, required=True)
    parser.add_argument('--draft', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(check(json.loads(args.review.read_text()), json.loads(args.draft.read_text())), indent=2))
    except (ValueError, KeyError, TypeError) as error:
        parser.exit(1, f'{error}\n')
