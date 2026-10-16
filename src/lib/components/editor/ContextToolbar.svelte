<script lang="ts">
  import { t } from '$lib/i18n';
  import {
    activeFloor,
    selectedElementId,
    selectedElementIds,
    updateDoor,
    updateWindow,
    resizeWallLength,
  } from '$lib/stores/project';
  import { projectSettings, parseLengthInput } from '$lib/stores/settings';
  import { wallLength as calcWallLength, MIN_WALL_LENGTH, type WallEndpoint } from '$lib/utils/wallEditing';

  let fixedEndpoint = $state<WallEndpoint>('start');

  $effect(() => {
    void $selectedElementId;
    fixedEndpoint = 'start';
  });

  function displayValue(cm: number): number {
    return $projectSettings.units === 'imperial'
      ? Math.round(cm / 2.54 * 10) / 10
      : Math.round(cm * 1000) / 1000;
  }

  function inputToCm(value: number): number {
    return $projectSettings.units === 'imperial' ? value * 2.54 : value;
  }

  function unitLabel(): string {
    return $projectSettings.units === 'imperial' ? 'in' : 'cm';
  }

  let elementInfo = $derived.by(() => {
    const floor = $activeFloor;
    const id = $selectedElementId;
    if (!floor || !id || $selectedElementIds.size >= 2) return null;

    const wall = floor.walls.find(item => item.id === id);
    if (wall) return { type: 'wall' as const, id, wall };

    const door = floor.doors.find(item => item.id === id);
    if (door) {
      const wall = floor.walls.find(item => item.id === door.wallId);
      if (wall) return { type: 'door' as const, id, door, wall };
    }

    const window = floor.windows.find(item => item.id === id);
    if (window) {
      const wall = floor.walls.find(item => item.id === window.wallId);
      if (wall) return { type: 'window' as const, id, window, wall };
    }

    return null;
  });

  function restoreInput(input: HTMLInputElement, cm: number) {
    input.value = String(displayValue(cm));
  }

  function onQuickWallLength(event: Event) {
    if (!elementInfo || elementInfo.type !== 'wall') return;
    const input = event.currentTarget as HTMLInputElement;
    const current = calcWallLength(elementInfo.wall);
    const parsed = parseLengthInput(input.value, $projectSettings.units);
    if (parsed === null || parsed < MIN_WALL_LENGTH) {
      restoreInput(input, current);
      return;
    }
    const error = resizeWallLength(elementInfo.id, parsed, fixedEndpoint);
    restoreInput(input, error ? current : parsed);
  }

  function onQuickOpeningWidth(event: Event) {
    if (!elementInfo || (elementInfo.type !== 'door' && elementInfo.type !== 'window')) return;
    const input = event.currentTarget as HTMLInputElement;
    const current = elementInfo.type === 'door' ? elementInfo.door.width : elementInfo.window.width;
    const value = inputToCm(input.valueAsNumber);
    if (!input.value.trim() || !input.validity.valid || !Number.isFinite(value) || value <= 0) {
      restoreInput(input, current);
      return;
    }
    if (elementInfo.type === 'door') updateDoor(elementInfo.id, { width: value });
    else updateWindow(elementInfo.id, { width: value });
    restoreInput(input, value);
  }

  function onQuickOpeningDistanceA(event: Event) {
    if (!elementInfo || (elementInfo.type !== 'door' && elementInfo.type !== 'window')) return;
    const input = event.currentTarget as HTMLInputElement;
    const length = calcWallLength(elementInfo.wall);
    const position = elementInfo.type === 'door' ? elementInfo.door.position : elementInfo.window.position;
    const current = length * position;
    const value = inputToCm(input.valueAsNumber);
    if (!input.value.trim() || !input.validity.valid || !Number.isFinite(value) || value < 0 || value > length || length <= 0) {
      restoreInput(input, current);
      return;
    }
    if (elementInfo.type === 'door') updateDoor(elementInfo.id, { position: value / length });
    else updateWindow(elementInfo.id, { position: value / length });
    restoreInput(input, value);
  }

  function commitOnEnter(event: KeyboardEvent) {
    if (event.key === 'Enter') (event.currentTarget as HTMLInputElement).blur();
  }
</script>

{#if elementInfo}
  <div
    data-quick-geometry-toolbar
    class="fixed top-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-lg border border-blue-100 bg-white px-2 py-1 shadow-lg"
  >
    {#if elementInfo.type === 'wall'}
      <span data-wall-endpoint-label="A" class="flex h-5 w-5 items-center justify-center rounded-full border border-blue-500 text-[10px] font-bold text-blue-700">A</span>
      <span class="text-[10px] text-gray-400">—</span>
      <span data-wall-endpoint-label="B" class="flex h-5 w-5 items-center justify-center rounded-full border border-blue-500 text-[10px] font-bold text-blue-700">B</span>
      <span class="mx-1 h-5 w-px bg-gray-200"></span>
      <label class="flex items-center gap-1" title={$t('wallProperties.length')}>
        <span class="text-[10px] font-semibold text-gray-500">L</span>
        <input
          data-quick-wall-length
          type="text"
          value={displayValue(calcWallLength(elementInfo.wall))}
          aria-label={`L · ${$t('wallProperties.length')} (${unitLabel()})`}
          class="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs tabular-nums"
          onblur={onQuickWallLength}
          onkeydown={commitOnEnter}
        />
        <span class="text-[10px] text-gray-400">{unitLabel()}</span>
      </label>
      <span class="ml-1 text-[10px] text-gray-400" title={$t('wallProperties.fixed')}>⚓</span>
      <button
        data-quick-fixed-endpoint="start"
        class="h-6 min-w-6 rounded px-1 text-[10px] font-semibold {fixedEndpoint === 'start' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}"
        aria-label={`${$t('wallProperties.fixed')}: A`}
        aria-pressed={fixedEndpoint === 'start'}
        onclick={() => { fixedEndpoint = 'start'; }}
      >A</button>
      <button
        data-quick-fixed-endpoint="end"
        class="h-6 min-w-6 rounded px-1 text-[10px] font-semibold {fixedEndpoint === 'end' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}"
        aria-label={`${$t('wallProperties.fixed')}: B`}
        aria-pressed={fixedEndpoint === 'end'}
        onclick={() => { fixedEndpoint = 'end'; }}
      >B</button>
    {:else}
      {@const openingWidth = elementInfo.type === 'door' ? elementInfo.door.width : elementInfo.window.width}
      {@const openingPosition = elementInfo.type === 'door' ? elementInfo.door.position : elementInfo.window.position}
      {@const parentLength = calcWallLength(elementInfo.wall)}
      <span data-wall-endpoint-label="A" class="flex h-5 w-5 items-center justify-center rounded-full border border-blue-500 text-[10px] font-bold text-blue-700">A</span>
      <span class="text-[10px] text-gray-400">→</span>
      <span data-wall-endpoint-label="B" class="flex h-5 w-5 items-center justify-center rounded-full border border-blue-500 text-[10px] font-bold text-blue-700">B</span>
      <span class="mx-1 h-5 w-px bg-gray-200"></span>
      <label class="flex items-center gap-1" title={$t('openingProperties.width')}>
        <span class="text-[10px] font-semibold text-gray-500">W</span>
        <input
          data-quick-opening-width
          type="number"
          step="any"
          min="0"
          value={displayValue(openingWidth)}
          aria-label={`W · ${$t('openingProperties.width')} (${unitLabel()})`}
          class="w-14 rounded border border-gray-200 px-1.5 py-1 text-xs tabular-nums"
          onblur={onQuickOpeningWidth}
          onkeydown={commitOnEnter}
        />
      </label>
      <label class="flex items-center gap-1" title={$t('openingProperties.fromA')}>
        <span class="text-[10px] font-semibold text-blue-700">A→</span>
        <input
          data-quick-opening-offset-a
          type="number"
          step="any"
          min="0"
          max={displayValue(parentLength)}
          value={displayValue(parentLength * openingPosition)}
          aria-label={`A→ · ${$t('openingProperties.fromA')} (${unitLabel()})`}
          class="w-14 rounded border border-gray-200 px-1.5 py-1 text-xs tabular-nums"
          onblur={onQuickOpeningDistanceA}
          onkeydown={commitOnEnter}
        />
        <span class="text-[10px] text-gray-400">{unitLabel()}</span>
      </label>
    {/if}
  </div>
{/if}
