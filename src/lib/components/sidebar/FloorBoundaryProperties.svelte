<script lang="ts">
  import type { FloorBoundaryPart, Room, Wall } from '$lib/models/types';
  import { updateRoom } from '$lib/stores/project';
  import { projectSettings, parseLengthInput } from '$lib/stores/settings';
  import { t } from '$lib/i18n';
  import { floorBoundaryPolygon, floorBoundaryProblem } from '$lib/utils/floorBoundary';

  let { room, walls }: { room: Room; walls: Wall[] } = $props();
  const parts = $derived(room.boundary ?? []);
  const unit = $derived($projectSettings.units === 'imperial' ? 'in' : 'cm');
  const problem = $derived(floorBoundaryProblem(parts, walls));
  const display = (cm: number) => Math.round(cm / (unit === 'in' ? 2.54 : 1) * 1000) / 1000;
  function replace(index: number, part: FloorBoundaryPart) {
    updateRoom(room.id, { boundary: parts.map((previous, i) => i === index ? part : previous) });
  }
  function coordinate(index: number, field: 'point' | 'curvePoint', axis: 'x' | 'y', event: Event) {
    const part = parts[index]; if (!('point' in part)) return;
    const value = parseLengthInput((event.target as HTMLInputElement).value, $projectSettings.units);
    if (value === null) return;
    replace(index, { ...part, [field]: { ...(part[field] ?? part.point), [axis]: value } });
  }
  function appendPoint() {
    const first = floorBoundaryPolygon([parts[0]], walls)[0] ?? { x: 0, y: 0 };
    const last = floorBoundaryPolygon([parts[parts.length - 1]], walls).at(-1) ?? first;
    updateRoom(room.id, { boundary: [...parts, { point: { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 } }] });
  }
  function toggleCurve(index: number, checked: boolean) {
    const part = parts[index]; if (!('point' in part)) return;
    const next = floorBoundaryPolygon([parts[(index + 1) % parts.length]], walls)[0] ?? part.point;
    replace(index, checked ? { ...part, curvePoint: { x: (part.point.x + next.x) / 2, y: (part.point.y + next.y) / 2 } } : { point: part.point });
  }
</script>

<fieldset class="space-y-2 border-t border-gray-200 pt-3" data-floor-boundary>
  <legend class="text-xs font-semibold text-gray-600">{$t('floorBoundary.title')}</legend>
  <p class="text-xs text-gray-500">{$t('floorBoundary.help')}</p>
  {#if problem}<p role="alert" class="text-xs text-red-700">{$t('floorBoundary.invalid')}</p>{/if}
  {#each parts as part, index}
    <div class="rounded border border-gray-200 p-2 space-y-1">
      <div class="flex justify-between items-center text-xs text-gray-600">
        <span>{$t('floorBoundary.part', { number: index + 1 })}</span>
        <button class="text-red-600 disabled:opacity-40" disabled={parts.length < 2}
          aria-label={$t('floorBoundary.remove', { number: index + 1 })}
          onclick={() => updateRoom(room.id, { boundary: parts.filter((_, i) => i !== index) })}>×</button>
      </div>
      {#if 'wallId' in part}
        <label class="block text-xs">
          <span>{$t('floorBoundary.wall')}</span>
          <select class="w-full border border-gray-200 rounded p-1" value={part.wallId}
            onchange={event => replace(index, { ...part, wallId: event.currentTarget.value })}>
            {#if !walls.some(wall => wall.id === part.wallId)}<option value={part.wallId}>{part.wallId}</option>{/if}
            {#each walls as wall, i}<option value={wall.id}>{$t('layers.wall', { number: i + 1 })}</option>{/each}
          </select>
        </label>
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" checked={part.reverse ?? false}
          onchange={event => replace(index, { ...part, reverse: event.currentTarget.checked })} />{$t('floorBoundary.reverse')}</label>
      {:else}
        {#each (['point', ...(part.curvePoint ? ['curvePoint'] : [])] as ('point' | 'curvePoint')[]) as field}
          <div class="grid grid-cols-2 gap-1">
            {#each (['x', 'y'] as const) as axis}
              <label class="text-xs text-gray-500">
                <span>{field === 'curvePoint' ? $t('floorBoundary.control') : $t('floorBoundary.point')} {axis.toUpperCase()} ({unit})</span>
                <input type="number" step="any" class="w-full border border-gray-200 rounded p-1 text-gray-700"
                  data-boundary-coordinate={`${index}-${field}-${axis}`} value={display(part[field]![axis])}
                  onchange={event => coordinate(index, field, axis, event)} />
              </label>
            {/each}
          </div>
        {/each}
        <label class="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!part.curvePoint}
          onchange={event => toggleCurve(index, event.currentTarget.checked)} />{$t('floorBoundary.curve')}</label>
      {/if}
    </div>
  {/each}
  <div class="flex gap-2 text-xs">
    <button class="border rounded px-2 py-1" onclick={appendPoint}>{$t('floorBoundary.addPoint')}</button>
    <button class="border rounded px-2 py-1 disabled:opacity-40" disabled={!walls.length}
      onclick={() => walls[0] && updateRoom(room.id, { boundary: [...parts, { wallId: walls[0].id }] })}>{$t('floorBoundary.addWall')}</button>
  </div>
</fieldset>
