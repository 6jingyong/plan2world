import { beforeEach, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { selectedElementId, selectedElementIds, selectElements, selectSingleElement } from '$lib/stores/selection';

beforeEach(() => selectSingleElement(null));

it('replaces a multi-selection when selecting one item, including its existing primary', () => {
  for (const id of ['wall-a', 'wall-c']) {
    selectElements(['wall-a', 'wall-b'], 'wall-a');
    selectSingleElement(id);
    expect(get(selectedElementId)).toBe(id);
    expect([...get(selectedElementIds)]).toEqual([]);
  }
});

it('clears both membership and primary when deselecting a multi-selection', () => {
  selectElements(['wall-a', 'wall-b'], 'wall-b');
  selectSingleElement(null);
  expect(get(selectedElementId)).toBeNull();
  expect([...get(selectedElementIds)]).toEqual([]);
});

it('keeps the requested primary inside the selected membership, falling back after removal', () => {
  selectElements(['wall-a', 'wall-b', 'wall-c'], 'wall-b');
  expect(get(selectedElementId)).toBe('wall-b');
  expect([...get(selectedElementIds)]).toEqual(['wall-a', 'wall-b', 'wall-c']);
  selectElements(['wall-a', 'wall-c'], 'wall-b');
  expect(get(selectedElementId)).toBe('wall-a');
  expect([...get(selectedElementIds)]).toEqual(['wall-a', 'wall-c']);
});

it('normalizes a one-item marquee, group or Select All to the same single selection', () => {
  selectElements(['wall-a', 'wall-a'], 'missing');
  expect(get(selectedElementId)).toBe('wall-a');
  expect([...get(selectedElementIds)]).toEqual([]);
  selectElements([], 'wall-a');
  expect(get(selectedElementId)).toBeNull();
  expect([...get(selectedElementIds)]).toEqual([]);
});

it('owns its membership rather than retaining a mutable caller set', () => {
  const ids = new Set(['wall-a', 'wall-b']);
  selectElements(ids, 'wall-b');
  ids.clear();
  expect(get(selectedElementId)).toBe('wall-b');
  expect([...get(selectedElementIds)]).toEqual(['wall-a', 'wall-b']);
});
