<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t } from '$lib/i18n';
  import {
    activeFloor,
    selectedElementId,
    removeElement,
    updateDoor,
    updateWindow,
    duplicateDoor,
    duplicateWindow,
    duplicateFurniture,
    duplicateWall,
    resizeWallLength,
  } from '$lib/stores/project';
  import { projectSettings, parseLengthInput } from '$lib/stores/settings';
  import { wallLength as calcWallLength, MIN_WALL_LENGTH, type WallEndpoint } from '$lib/utils/wallEditing';
  import type { Floor, Door } from '$lib/models/types';

  let { canvasRect = { x: 0, y: 0 }, worldToScreen = (x: number, y: number) => ({ x: 0, y: 0 }) }: {
    canvasRect: { x: number; y: number };
    worldToScreen: (x: number, y: number) => { x: number; y: number };
  } = $props();

  let floor: Floor | null = $state(null);
  let selId: string | null = $state(null);
  let settings = $state($projectSettings);
  let fixedEndpoint = $state<WallEndpoint>('start');

  onDestroy(activeFloor.subscribe((f) => { floor = f; }));
  onDestroy(selectedElementId.subscribe((id) => { selId = id; }));
  onDestroy(projectSettings.subscribe((value) => { settings = value; }));
  $effect(() => { void selId; fixedEndpoint = 'start'; });

  function displayValue(cm: number): number {
    return settings.units === 'imperial' ? Math.round(cm / 2.54 * 10) / 10 : Math.round(cm * 1000) / 1000;
  }

  function inputToCm(value: number): number {
    return settings.units === 'imperial' ? value * 2.54 : value;
  }

  function unitLabel(): string {
    return settings.units === 'imperial' ? 'in' : 'cm';
  }

  let elementInfo = $derived.by(() => {
    if (!floor || !selId) return null;
    const wall = floor.walls.find(w => w.id === selId);
    if (wall) {
      const cx = (wall.start.x + wall.end.x) / 2;
      const cy = (wall.start.y + wall.end.y) / 2;
      return { type: 'wall' as const, id: selId, cx, cy, wall };
    }
    const door = floor.doors.find(d => d.id === selId);
    if (door) {
      const w = floor.walls.find(w => w.id === door.wallId);
      if (w) {
        const cx = w.start.x + (w.end.x - w.start.x) * door.position;
        const cy = w.start.y + (w.end.y - w.start.y) * door.position;
        return { type: 'door' as const, id: selId, cx, cy, door, wall: w };
      }
    }
    const win = floor.windows.find(w => w.id === selId);
    if (win) {
      const w = floor.walls.find(w => w.id === win.wallId);
      if (w) {
        const cx = w.start.x + (w.end.x - w.start.x) * win.position;
        const cy = w.start.y + (w.end.y - w.start.y) * win.position;
        return { type: 'window' as const, id: selId, cx, cy, window: win, wall: w };
      }
    }
    const furn = floor.furniture.find(f => f.id === selId);
    if (furn) {
      return { type: 'furniture' as const, id: selId, cx: furn.position.x, cy: furn.position.y };
    }
    return null;
  });

  function restoreInput(input: HTMLInputElement, cm: number) {
    input.value = String(displayValue(cm));
  }

  function onQuickWallLength(e: Event) {
    if (!elementInfo || elementInfo.type !== 'wall') return;
    const input = e.currentTarget as HTMLInputElement;
    const current = calcWallLength(elementInfo.wall);
    const parsed = parseLengthInput(input.value, settings.units);
    if (parsed === null || parsed < MIN_WALL_LENGTH) {
      restoreInput(input, current);
      return;
    }
    const error = resizeWallLength(elementInfo.id, parsed, fixedEndpoint);
    if (error) restoreInput(input, current);
    else restoreInput(input, parsed);
  }

  function onQuickOpeningWidth(e: Event) {
    if (!elementInfo || (elementInfo.type !== 'door' && elementInfo.type !== 'window')) return;
    const input = e.currentTarget as HTMLInputElement;
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

  function onQuickOpeningDistanceA(e: Event) {
    if (!elementInfo || (elementInfo.type !== 'door' && elementInfo.type !== 'window')) return;
    const input = e.currentTarget as HTMLInputElement;
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

  function commitOnEnter(e: KeyboardEvent) {
    if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
  }

  function onDelete() {
    if (selId) {
      removeElement(selId);
      selectedElementId.set(null);
    }
  }

  function onDuplicate() {
    if (!elementInfo) return;
    let newId: string | null = null;
    if (elementInfo.type === 'door') newId = duplicateDoor(elementInfo.id);
    else if (elementInfo.type === 'window') newId = duplicateWindow(elementInfo.id);
    else if (elementInfo.type === 'furniture') newId = duplicateFurniture(elementInfo.id);
    else if (elementInfo.type === 'wall') newId = duplicateWall(elementInfo.id);
    if (newId) selectedElementId.set(newId);
  }

  function onFlipSwing() {
    if (!elementInfo || elementInfo.type !== 'door') return;
    const door = elementInfo.door as Door;
    updateDoor(door.id, { swingDirection: door.swingDirection === 'left' ? 'right' : 'left' });
  }

  function onFlipSide() {
    if (!elementInfo || elementInfo.type !== 'door') return;
    const door = elementInfo.door as Door;
    updateDoor(door.id, { flipSide: !door.flipSide });
  }
</script>

{#if elementInfo}
  {@const screenPos = worldToScreen(elementInfo.cx, elementInfo.cy)}

  {#if elementInfo.type !== 'furniture'}
    {@const endpointA = worldToScreen(elementInfo.wall.start.x, elementInfo.wall.start.y)}
    {@const endpointB = worldToScreen(elementInfo.wall.end.x, elementInfo.wall.end.y)}
    <span
      data-wall-endpoint-label="A"
      aria-hidden="true"
      class="absolute z-30 flex h-5 w-5 items-center justify-center rounded-full border border-blue-500 bg-white text-[10px] font-bold text-blue-700 shadow-sm pointer-events-none"
      style="left: {endpointA.x + canvasRect.x}px; top: {endpointA.y + canvasRect.y}px; transform: translate(-50%, -150%);"
    >A</span>
    <span
      data-wall-endpoint-label="B"
      aria-hidden="true"
      class="absolute z-30 flex h-5 w-5 items-center justify-center rounded-full border border-blue-500 bg-white text-[10px] font-bold text-blue-700 shadow-sm pointer-events-none"
      style="left: {endpointB.x + canvasRect.x}px; top: {endpointB.y + canvasRect.y}px; transform: translate(-50%, -150%);"
    >B</span>
  {/if}

  <div
    data-quick-geometry-toolbar
    class="absolute z-40 flex items-center gap-1 bg-white rounded-lg shadow-lg border border-gray-200 px-1.5 py-1"
    style="left: {screenPos.x + canvasRect.x}px; top: {screenPos.y + canvasRect.y - 12}px; transform: translate(-50%, -100%); pointer-events: auto;"
  >
    {#if elementInfo.type === 'wall'}
      <label class="flex items-center gap-1 border-r border-gray-200 pr-1.5" title={$t('wallProperties.length')}>
        <span class="text-[10px] font-semibold text-gray-500">L</span>
        <input
          data-quick-wall-length
          type="text"
          value={displayValue(calcWallLength(elementInfo.wall))}
          aria-label={`${$t('wallProperties.length')} (${unitLabel()})`}
          class="w-16 rounded border border-gray-200 px-1.5 py-1 text-xs tabular-nums"
          onblur={onQuickWallLength}
          onkeydown={commitOnEnter}
        />
        <span class="text-[10px] text-gray-400">{unitLabel()}</span>
        <span class="ml-0.5 text-[10px] text-gray-400" title={$t('wallProperties.fixed')}>⚓</span>
        <button
          data-quick-fixed-endpoint="start"
          class="h-6 min-w-6 rounded px-1 text-[10px] font-semibold transition-colors {fixedEndpoint === 'start' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}"
          aria-label={`${$t('wallProperties.fixed')}: A`}
          aria-pressed={fixedEndpoint === 'start'}
          onclick={() => { fixedEndpoint = 'start'; }}
        >A</button>
        <button
          data-quick-fixed-endpoint="end"
          class="h-6 min-w-6 rounded px-1 text-[10px] font-semibold transition-colors {fixedEndpoint === 'end' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:bg-gray-100'}"
          aria-label={`${$t('wallProperties.fixed')}: B`}
          aria-pressed={fixedEndpoint === 'end'}
          onclick={() => { fixedEndpoint = 'end'; }}
        >B</button>
      </label>
    {:else if elementInfo.type === 'door' || elementInfo.type === 'window'}
      {@const openingWidth = elementInfo.type === 'door' ? elementInfo.door.width : elementInfo.window.width}
      {@const openingPosition = elementInfo.type === 'door' ? elementInfo.door.position : elementInfo.window.position}
      {@const parentLength = calcWallLength(elementInfo.wall)}
      <label class="flex items-center gap-1" title={$t('openingProperties.width')}>
        <span class="text-[10px] font-semibold text-gray-500">W</span>
        <input
          data-quick-opening-width
          type="number"
          step="any"
          min="0"
          value={displayValue(openingWidth)}
          aria-label={`${$t('openingProperties.width')} (${unitLabel()})`}
          class="w-14 rounded border border-gray-200 px-1.5 py-1 text-xs tabular-nums"
          onblur={onQuickOpeningWidth}
          onkeydown={commitOnEnter}
        />
      </label>
      <label class="flex items-center gap-1 border-r border-gray-200 pr-1.5" title={$t('openingProperties.fromA')}>
        <span class="text-[10px] font-semibold text-blue-700">A→</span>
        <input
          data-quick-opening-offset-a
          type="number"
          step="any"
          min="0"
          max={displayValue(parentLength)}
          value={displayValue(parentLength * openingPosition)}
          aria-label={`${$t('openingProperties.fromA')} (${unitLabel()})`}
          class="w-14 rounded border border-gray-200 px-1.5 py-1 text-xs tabular-nums"
          onblur={onQuickOpeningDistanceA}
          onkeydown={commitOnEnter}
        />
        <span class="text-[10px] text-gray-400">{unitLabel()}</span>
      </label>
    {/if}

    <button
      class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"
      title={$t('contextMenu.duplicate')}
      aria-label={$t('contextMenu.duplicate')}
      onclick={onDuplicate}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
    </button>
    {#if elementInfo.type === 'door'}
      <button
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"
        title={$t('contextToolbar.flipSwing')}
        aria-label={$t('contextToolbar.swingLabel')}
        onclick={onFlipSwing}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
      </button>
      <button
        class="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"
        title={$t('contextToolbar.flipSide')}
        aria-label={$t('contextToolbar.sideLabel')}
        onclick={onFlipSide}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M12 3v18"/><path d="M8 8l-4 4 4 4M16 8l4 4-4 4"/></svg>
      </button>
    {/if}
    <div class="w-px h-5 bg-gray-200"></div>
    <button
      class="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-gray-500 hover:text-red-600 transition-colors"
      title={$t('contextMenu.delete')}
      aria-label={$t('contextMenu.delete')}
      onclick={onDelete}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14"/></svg>
    </button>
  </div>
{/if}
