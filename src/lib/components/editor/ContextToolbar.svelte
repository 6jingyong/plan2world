<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { t } from '$lib/i18n';
  import {
    activeFloor,
    selectedElementId,
    updateDoor,
    updateWindow,
    resizeWallLength,
    canvasZoom,
    canvasCamX,
    canvasCamY,
  } from '$lib/stores/project';
  import { projectSettings, parseLengthInput } from '$lib/stores/settings';
  import { wallLength as calcWallLength, MIN_WALL_LENGTH, type WallEndpoint } from '$lib/utils/wallEditing';
  import type { Floor } from '$lib/models/types';

  let floor: Floor | null = $state(null);
  let selId: string | null = $state(null);
  let settings = $state($projectSettings);
  let fixedEndpoint = $state<WallEndpoint>('start');
  let zoom = $state($canvasZoom);
  let camX = $state($canvasCamX);
  let camY = $state($canvasCamY);
  let viewport = $state({ left: 0, top: 0, width: 0, height: 0 });

  onDestroy(activeFloor.subscribe((value) => { floor = value; }));
  onDestroy(selectedElementId.subscribe((value) => { selId = value; }));
  onDestroy(projectSettings.subscribe((value) => { settings = value; }));
  onDestroy(canvasZoom.subscribe((value) => { zoom = value; }));
  onDestroy(canvasCamX.subscribe((value) => { camX = value; }));
  onDestroy(canvasCamY.subscribe((value) => { camY = value; }));

  $effect(() => {
    void selId;
    fixedEndpoint = 'start';
  });

  function readViewport() {
    if (typeof document === 'undefined') return viewport;
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[tabindex="0"]');
    if (!canvas?.isConnected) return viewport;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return viewport;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  onMount(() => {
    let frame = 0;
    let observer: ResizeObserver | undefined;
    let canvas: HTMLCanvasElement | null = null;

    const updateViewport = () => {
      const next = readViewport();
      if (next.width > 0 && next.height > 0) viewport = next;
    };

    const attach = () => {
      canvas = document.querySelector<HTMLCanvasElement>('canvas[tabindex="0"]');
      if (!canvas) {
        frame = requestAnimationFrame(attach);
        return;
      }
      observer = new ResizeObserver(updateViewport);
      observer.observe(canvas);
      window.addEventListener('resize', updateViewport);
      updateViewport();
    };

    attach();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', updateViewport);
    };
  });

  function worldToViewport(wx: number, wy: number) {
    const current = readViewport();
    return {
      x: current.left + (wx - camX) * zoom + current.width / 2,
      y: current.top + (wy - camY) * zoom + current.height / 2,
    };
  }

  function displayValue(cm: number): number {
    return settings.units === 'imperial'
      ? Math.round(cm / 2.54 * 10) / 10
      : Math.round(cm * 1000) / 1000;
  }

  function inputToCm(value: number): number {
    return settings.units === 'imperial' ? value * 2.54 : value;
  }

  function unitLabel(): string {
    return settings.units === 'imperial' ? 'in' : 'cm';
  }

  let elementInfo = $derived.by(() => {
    if (!floor || !selId) return null;

    const wall = floor.walls.find(item => item.id === selId);
    if (wall) {
      return {
        type: 'wall' as const,
        id: selId,
        cx: (wall.start.x + wall.end.x) / 2,
        cy: (wall.start.y + wall.end.y) / 2,
        wall,
      };
    }

    const door = floor.doors.find(item => item.id === selId);
    if (door) {
      const parent = floor.walls.find(item => item.id === door.wallId);
      if (parent) {
        return {
          type: 'door' as const,
          id: selId,
          cx: parent.start.x + (parent.end.x - parent.start.x) * door.position,
          cy: parent.start.y + (parent.end.y - parent.start.y) * door.position,
          door,
          wall: parent,
        };
      }
    }

    const win = floor.windows.find(item => item.id === selId);
    if (win) {
      const parent = floor.walls.find(item => item.id === win.wallId);
      if (parent) {
        return {
          type: 'window' as const,
          id: selId,
          cx: parent.start.x + (parent.end.x - parent.start.x) * win.position,
          cy: parent.start.y + (parent.end.y - parent.start.y) * win.position,
          window: win,
          wall: parent,
        };
      }
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
    const parsed = parseLengthInput(input.value, settings.units);
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
  {@const screenPos = worldToViewport(elementInfo.cx, elementInfo.cy)}
  {@const endpointA = worldToViewport(elementInfo.wall.start.x, elementInfo.wall.start.y)}
  {@const endpointB = worldToViewport(elementInfo.wall.end.x, elementInfo.wall.end.y)}
  {@const curvePoint = elementInfo.wall.curvePoint ? worldToViewport(elementInfo.wall.curvePoint.x, elementInfo.wall.curvePoint.y) : null}
  {@const wallTop = Math.min(endpointA.y, endpointB.y, curvePoint?.y ?? Number.POSITIVE_INFINITY)}
  {@const wallBottom = Math.max(endpointA.y, endpointB.y, curvePoint?.y ?? Number.NEGATIVE_INFINITY)}
  {@const liveViewport = readViewport()}
  {@const wallToolbarBelow = elementInfo.type === 'wall' && wallTop - liveViewport.top < 54}
  {@const toolbarTop = elementInfo.type === 'wall'
    ? (wallToolbarBelow ? wallBottom + 14 : wallTop - 14)
    : screenPos.y - 34}
  {@const toolbarTransform = wallToolbarBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)'}

  <span
    data-wall-endpoint-label="A"
    aria-hidden="true"
    class="fixed z-30 flex h-5 w-5 items-center justify-center rounded-full border border-blue-500 bg-white text-[10px] font-bold text-blue-700 shadow-sm pointer-events-none"
    style="left: {endpointA.x}px; top: {endpointA.y}px; transform: translate(-50%, -150%);"
  >A</span>
  <span
    data-wall-endpoint-label="B"
    aria-hidden="true"
    class="fixed z-30 flex h-5 w-5 items-center justify-center rounded-full border border-blue-500 bg-white text-[10px] font-bold text-blue-700 shadow-sm pointer-events-none"
    style="left: {endpointB.x}px; top: {endpointB.y}px; transform: translate(-50%, -150%);"
  >B</span>

  <div
    data-quick-geometry-toolbar
    class="fixed z-40 flex items-center gap-1 rounded-lg border border-blue-100 bg-white px-1.5 py-1 shadow-lg"
    style="left: {screenPos.x}px; top: {toolbarTop}px; transform: {toolbarTransform}; pointer-events: auto;"
  >
    {#if elementInfo.type === 'wall'}
      <label class="flex items-center gap-1" title={$t('wallProperties.length')}>
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
      </label>
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
    {:else}
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
      <label class="flex items-center gap-1" title={$t('openingProperties.fromA')}>
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
  </div>
{/if}
