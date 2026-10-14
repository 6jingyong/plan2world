<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import OpenAISettings from '$lib/components/ai/OpenAISettings.svelte';
  import { openAISettings } from '$lib/stores/aiKeys';
  import { openProject } from '$lib/services/projectOpening';
  import {
    encodeFloorPlanImage,
    MAX_FLOOR_PLAN_IMAGE_BYTES,
    reconstructFloorPlanImage,
  } from '$lib/plan2world/vision';

  let { onclose, oncreated }: { onclose: () => void; oncreated: () => void } = $props();

  let fileInput: HTMLInputElement;
  let file = $state<File | null>(null);
  let previewUrl = $state('');
  let scaleHint = $state('');
  let busy = $state(false);
  let status = $state('');
  let error = $state('');
  let showProviderSettings = $state(false);
  let controller: AbortController | null = null;

  function revokePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }

  function selectFile(next: File | null) {
    error = '';
    status = '';
    if (!next) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(next.type)) {
      error = 'Choose a PNG, JPEG, or WebP floor-plan image.';
      return;
    }
    if (next.size > MAX_FLOOR_PLAN_IMAGE_BYTES) {
      error = 'The image is larger than 12 MB. Resize or compress it first.';
      return;
    }
    revokePreview();
    file = next;
    previewUrl = URL.createObjectURL(next);
  }

  function onFileSelected(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    selectFile(input.files?.[0] ?? null);
    input.value = '';
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    if (busy) return;
    selectFile(event.dataTransfer?.files?.[0] ?? null);
  }

  async function generate() {
    if (!file || busy) return;
    error = '';
    status = 'Reading floor-plan image…';
    busy = true;
    controller = new AbortController();
    try {
      const image = await encodeFloorPlanImage(file);
      status = 'Reconstructing walls, doors, and windows…';
      const draft = await reconstructFloorPlanImage(
        get(openAISettings),
        image,
        { scaleHint },
        fetch,
        controller.signal,
      );
      status = 'Opening editable 3D home…';
      const project = await openProject(() => draft, 'import', controller.signal);
      if (!project) return;
      oncreated();
      await goto(`${base}/editor?id=${encodeURIComponent(project.id)}`);
    } catch (cause) {
      if (!controller?.signal.aborted) {
        error = cause instanceof Error ? cause.message : 'The floor plan could not be reconstructed.';
        if (error.includes('API key') || error.includes('provider') || error.includes('model')) showProviderSettings = true;
      }
    } finally {
      busy = false;
      status = '';
      controller = null;
    }
  }

  function close() {
    controller?.abort();
    onclose();
  }

  onDestroy(() => {
    controller?.abort();
    revokePreview();
  });
</script>

<div class="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto text-left">
  <div class="flex items-start justify-between gap-4 mb-5">
    <div>
      <h2 class="text-2xl font-bold text-gray-800">Create 3D home from floor plan</h2>
      <p class="text-sm text-gray-500 mt-1">Upload a normal floor-plan image. AI extracts the architecture; Plan2World turns it into the existing editable Three.js scene.</p>
    </div>
    <button type="button" onclick={close} disabled={busy} aria-label="Close"
      class="shrink-0 w-9 h-9 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">✕</button>
  </div>

  <input bind:this={fileInput} class="hidden" type="file" accept="image/png,image/jpeg,image/webp" onchange={onFileSelected} />

  <button type="button" disabled={busy} onclick={() => fileInput.click()}
    ondragover={(event) => event.preventDefault()} ondrop={onDrop}
    class="w-full min-h-52 rounded-2xl border-2 border-dashed border-gray-300 hover:border-blue-400 bg-gray-50 hover:bg-blue-50/40 transition-colors overflow-hidden disabled:opacity-60">
    {#if previewUrl}
      <img src={previewUrl} alt="Selected floor plan" class="w-full max-h-80 object-contain bg-white" />
      <div class="px-4 py-3 text-sm text-gray-600 flex justify-between gap-3">
        <span class="truncate">{file?.name}</span>
        <span class="shrink-0">Click to replace</span>
      </div>
    {:else}
      <div class="p-8 text-center">
        <div class="text-4xl mb-3">🏠</div>
        <div class="font-semibold text-gray-700">Drop a floor-plan image here</div>
        <div class="text-sm text-gray-400 mt-1">or click to choose PNG / JPEG / WebP · max 12 MB</div>
      </div>
    {/if}
  </button>

  <div class="mt-5">
    <label class="block">
      <span class="text-sm font-medium text-gray-700">Known length <span class="font-normal text-gray-400">optional</span></span>
      <input bind:value={scaleHint} disabled={busy} type="text"
        placeholder="e.g. the bottom exterior wall is 360 cm, or the marked doorway is 900 mm"
        class="mt-1.5 w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" />
      <span class="block text-xs text-gray-400 mt-1">Leave this blank when the plan already contains readable dimensions. A bare ratio such as 1:100 is not enough to calibrate an arbitrary screenshot.</span>
    </label>
  </div>

  <div class="mt-5 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-xs uppercase tracking-wide font-semibold text-slate-500">AI provider</div>
        <div class="text-sm text-slate-700 mt-1 break-all">
          {$openAISettings.model
            ? `${$openAISettings.model} · ${$openAISettings.baseUrl || 'https://api.openai.com/v1'}`
            : 'Not configured yet'}
        </div>
      </div>
      <button type="button" disabled={busy} onclick={() => showProviderSettings = !showProviderSettings}
        aria-expanded={showProviderSettings}
        class="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40">
        {showProviderSettings ? 'Hide settings' : 'Configure'}
      </button>
    </div>
    <div class="text-xs text-slate-400 mt-1">The image is sent directly from your browser to the provider you configure. Plan2World does not proxy or store it.</div>
    {#if showProviderSettings}
      <div class="mt-4 pt-1">
        <OpenAISettings />
      </div>
    {/if}
  </div>

  <div class="mt-4 rounded-xl border border-gray-200 px-4 py-3 text-xs text-gray-500">
    Furniture is intentionally not inferred in v1. Reconstruct the walls and openings first, then use the existing furniture catalog to furnish the editable plan.
  </div>

  {#if status}
    <div role="status" class="mt-4 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">{status}</div>
  {/if}
  {#if error}
    <div role="alert" class="mt-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
  {/if}

  <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
    <button type="button" onclick={close} disabled={busy}
      class="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Cancel</button>
    <button type="button" onclick={generate} disabled={!file || busy}
      class="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500">
      {busy ? 'Generating…' : 'Generate editable 3D home'}
    </button>
  </div>
</div>
