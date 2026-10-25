<script lang="ts">
  import {
    activeFloor,
    canvasCamX,
    canvasCamY,
    canvasZoom,
    panMode,
    placingFurnitureId,
    selectedTool,
  } from '$lib/stores/project';
  import { clearRuntimeStart, setRuntimeStart, setRuntimeEntrance } from '$lib/stores/runtimeStart';

  import { wallPointAt } from '$lib/utils/wallPath';

  let width = $state(0);
  let height = $state(0);
  let armed = $state(false);

  const marker = $derived.by(() => {
    const entrance = $activeFloor?.entrance;
    const door = $activeFloor?.doors.find(item => item.id === entrance?.doorId);
    const wall = $activeFloor?.walls.find(item => item.id === door?.wallId);
    const point = door && wall ? wallPointAt(wall, door.position) : $activeFloor?.walkthroughStart;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y) || width <= 0 || height <= 0) return null;
    return {
      left: (point.x - $canvasCamX) * $canvasZoom + width / 2,
      top: (point.y - $canvasCamY) * $canvasZoom + height / 2,
    };
  });

  $effect(() => {
    if (armed && $selectedTool !== 'select') armed = false;
  });

  function arm() {
    selectedTool.set('select');
    placingFurnitureId.set(null);
    panMode.set(false);
    armed = true;
  }

  function place(event: MouseEvent) {
    if (!armed || !$activeFloor || width <= 0 || height <= 0) return;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const requested = {
      x: (sx - width / 2) / $canvasZoom + $canvasCamX,
      y: (sy - height / 2) / $canvasZoom + $canvasCamY,
    };
    setRuntimeStart(requested);
    armed = false;
  }

  function clear() {
    clearRuntimeStart();
    armed = false;
  }
</script>

<div class="absolute inset-0 pointer-events-none" bind:clientWidth={width} bind:clientHeight={height} aria-hidden="false">
  {#if armed}
    <button
      type="button"
      class="absolute inset-0 z-20 pointer-events-auto cursor-crosshair bg-transparent"
      aria-label="Place first-person walkthrough start"
      onclick={place}
    ></button>
    <div class="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-full bg-slate-900/90 text-white text-xs font-medium px-3 py-1.5 shadow-lg pointer-events-none">
      Click where first-person walkthrough should begin
    </div>
  {/if}

  {#if marker}
    <div
      class="absolute z-20 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center"
      style={`left:${marker.left}px;top:${marker.top}px;`}
      aria-hidden="true"
    >
      <div class="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center text-white">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>
        </svg>
      </div>
      <span class="mt-1 rounded bg-emerald-600 text-white text-[10px] font-semibold leading-none px-1.5 py-1 shadow">ENTER</span>
    </div>
  {/if}

  <div class="absolute top-3 right-3 z-30 flex flex-wrap justify-end items-center gap-1.5 pointer-events-auto" style="max-width:calc(100% - 1.5rem)">
    {#if $activeFloor?.doors.length}
      <select aria-label="Main entrance door" class="h-9 rounded-lg border bg-white/95 text-xs px-2 max-w-36" value={$activeFloor.entrance?.doorId ?? ''}
        onchange={(event) => { if (event.currentTarget.value) setRuntimeEntrance(event.currentTarget.value, $activeFloor?.entrance?.side ?? 'left'); }}>
        <option value="" disabled>Main entrance…</option>
        {#each $activeFloor.doors as door}<option value={door.id}>{door.id}</option>{/each}
      </select>
      {#if $activeFloor.entrance}
        <select aria-label="Entrance inward side" class="h-9 rounded-lg border bg-white/95 text-xs px-2" value={$activeFloor.entrance.side}
          onchange={(event) => setRuntimeEntrance($activeFloor!.entrance!.doorId, event.currentTarget.value as 'left' | 'right')}>
          <option value="left">Interior: left of wall</option><option value="right">Interior: right of wall</option>
        </select>
      {/if}
    {/if}
    <button
      type="button"
      onclick={arm}
      class="h-9 rounded-lg border border-emerald-200 bg-white/95 px-3 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-emerald-50"
      class:ring-2={armed}
      class:ring-emerald-400={armed}
      aria-pressed={armed}
      title="Choose where first-person walkthrough begins"
    >
      {$activeFloor?.walkthroughStart ? 'Move first-person start' : 'Set first-person start'}
    </button>
    {#if $activeFloor?.walkthroughStart || $activeFloor?.entrance}
      <button
        type="button"
        onclick={clear}
        class="h-9 rounded-lg border border-slate-200 bg-white/95 px-2.5 text-xs font-medium text-slate-500 shadow-sm hover:bg-slate-50 hover:text-slate-700"
        title="Return to automatic walkthrough start"
        aria-label="Clear first-person walkthrough start"
      >
        Clear
      </button>
    {/if}
  </div>
</div>
