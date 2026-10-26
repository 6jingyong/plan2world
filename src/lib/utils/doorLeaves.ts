import type { Door, DoorLeafConfiguration, SlidingDoorLeaf } from '../models/types';

export const SLIDING_LEAF_THICKNESS_CM = 4;
export const doorLeafPresets = [
  { id: 'two-track', label: '2 panels · one fixed' },
  { id: 'three-track', label: '3 panels · telescoping' },
  { id: 'four-split', label: '4 panels · centre opening' },
  { id: 'pocket', label: 'Single pocket panel' },
] as const;
export type DoorLeafPreset = typeof doorLeafPresets[number]['id'];

/** Explicit authoring action; never applied automatically on import/observation. */
export function slidingDoorPreset(width: number, preset: DoorLeafPreset): DoorLeafConfiguration {
  const count = preset === 'pocket' ? 1 : preset === 'three-track' ? 3 : preset === 'four-split' ? 4 : 2;
  const panel = width / count;
  const leaves: SlidingDoorLeaf[] = Array.from({ length: count }, (_, index) => {
    const fixed = preset !== 'pocket' && (index === 0 || (preset === 'four-split' && index === 3));
    return { id: `panel-${index + 1}`, width: panel, center: -width / 2 + panel * (index + .5),
      track: preset === 'four-split' ? (index === 1 || index === 2 ? 3 : -3) : (index - (count - 1) / 2) * 6,
      motion: fixed ? 'fixed' : 'slide', travel: fixed ? 0 : preset === 'pocket' ? width : preset === 'four-split' ? (index === 1 ? -panel : panel) : -index * panel };
  });
  return { kind: 'sliding', leaves };
}

export function validateDoorLeaves(door: Door): void {
  const config = door.leafConfiguration;
  if (config === undefined) return;
  const fail = (why: string): never => { throw new Error(`Door "${door.id}" leaf configuration: ${why}.`); };
  if (!config || typeof config !== 'object') fail('must be an object');
  if (config.kind === 'paired') {
    if (!['double', 'french'].includes(door.type)) fail('paired widths require a double or French door');
    if (typeof config.firstLeafRatio !== 'number' || !Number.isFinite(config.firstLeafRatio) || config.firstLeafRatio <= 0 || config.firstLeafRatio >= 1) fail('first leaf ratio must be between 0 and 1');
    return;
  }
  if (config.kind !== 'sliding' || !['sliding', 'pocket'].includes(door.type)) fail('sliding leaves require a sliding or pocket door');
  if (!Array.isArray(config.leaves) || config.leaves.length < 1 || config.leaves.length > 16) fail('choose between 1 and 16 panels');
  const ids = new Set<string>();
  for (const leaf of config.leaves) {
    if (!leaf || typeof leaf !== 'object' || typeof leaf.id !== 'string' || !leaf.id.trim() || ids.has(leaf.id)) fail('panel identities must be nonempty and unique');
    ids.add(leaf.id);
    if (![leaf.width, leaf.center, leaf.track, leaf.travel].every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1_000_000) || leaf.width <= 0) fail('panel dimensions and motion must be finite native centimetres');
    if (leaf.motion !== 'fixed' && leaf.motion !== 'slide') fail('choose fixed or sliding motion');
    if ((leaf.motion === 'fixed' && leaf.travel !== 0) || (leaf.motion === 'slide' && leaf.travel === 0)) fail('fixed panels need zero travel; sliding panels need nonzero travel');
    if (Math.abs(leaf.center) + leaf.width / 2 > door.width / 2 + 1e-6) fail('closed panels must fit inside the aperture');
  }
  if (!config.leaves.some(leaf => leaf.motion === 'slide')) fail('at least one panel must move');
  // Closed panels must cover the aperture without guessing missing infill.
  const intervals = config.leaves.map(leaf => [leaf.center-leaf.width/2, leaf.center+leaf.width/2]).sort((a,b) => a[0]-b[0]);
  let end = -door.width/2;
  for (const interval of intervals) { if (interval[0] > end+1e-6) fail('closed panels leave an uncovered gap'); end = Math.max(end,interval[1]); }
  if (end < door.width/2-1e-6) fail('closed panels leave an uncovered gap');
  for (let i=0;i<config.leaves.length;i++) for (let j=0;j<i;j++) {
    const a=config.leaves[i],b=config.leaves[j];
    if (Math.abs(a.center-b.center)<(a.width+b.width)/2-1e-6 && Math.abs(a.track-b.track)<SLIDING_LEAF_THICKNESS_CM-1e-6) fail('closed panels overlap on the same track');
  }
}

/** Reversing a host preserves the physical configuration, including stable IDs. */
export function reverseDoorLeaves(config: DoorLeafConfiguration): DoorLeafConfiguration {
  return config.kind === 'paired' ? { kind: 'paired', firstLeafRatio: 1-config.firstLeafRatio } :
    { kind: 'sliding', leaves: config.leaves.map(leaf => ({ ...leaf, center: -leaf.center, track: -leaf.track, travel: -leaf.travel })) };
}

export function resizeDoorLeaves(config: DoorLeafConfiguration, ratio: number): DoorLeafConfiguration {
  return config.kind === 'paired' ? { ...config } : { kind:'sliding', leaves:config.leaves.map(leaf=>({ ...leaf,width:leaf.width*ratio,center:leaf.center*ratio,travel:leaf.travel*ratio })) };
}
