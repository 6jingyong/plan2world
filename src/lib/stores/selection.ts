import { derived, writable } from 'svelte/store';

interface ElementSelection {
  primaryId: string | null;
  ids: Set<string>;
}

// One write updates both membership and primary. Components use the commands
// below rather than maintaining these two parts independently.
const selection = writable<ElementSelection>({ primaryId: null, ids: new Set() });

export const selectedElementId = derived(selection, value => value.primaryId);
/** Legacy multi-selection view: empty for zero/one item, all IDs for two or more. */
export const selectedElementIds = derived(selection, value =>
  value.ids.size > 1 ? new Set(value.ids) : new Set<string>());

export function selectElements(ids: Iterable<string>, primaryId?: string | null) {
  const members = new Set(ids);
  selection.set({
    ids: members,
    primaryId: primaryId && members.has(primaryId)
      ? primaryId
      : members.values().next().value ?? null,
  });
}

/** Explicit single selection (or deselection) always replaces old membership. */
export function selectSingleElement(id: string | null) {
  selectElements(id === null ? [] : [id], id);
}
