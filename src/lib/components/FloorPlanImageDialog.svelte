<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import OpenAISettings from '$lib/components/ai/OpenAISettings.svelte';
  import { openAISettings } from '$lib/stores/aiKeys';
  import { openProject } from '$lib/services/projectOpening';
  import type { Plan2WorldDraft } from '$lib/plan2world/draft';
  import type { ReconstructionObservationReview } from '$lib/models/types';
  import { geometryIssueKey } from '$lib/plan2world/geometryHealth';
  import { reviewIssueFocusMode } from '$lib/plan2world/reviewFocus';
  import ReconstructionReview from './ReconstructionReview.svelte';
  import FloorPlanImagePreparation from './FloorPlanImagePreparation.svelte';
  import type { PreparedBrowserFloorPlan } from '$lib/plan2world/imagePreparationBrowser';
  import { buildReconstructionTrace } from '$lib/plan2world/reconstructionTrace';
  import {
    calibratePlan2WorldDraft,
    summarizePlan2WorldDraft,
  } from '$lib/plan2world/review';
  import {
    draftToProjectWithSourceBackground,
    sourceImageDistanceInPlanCm,
    type NormalizedImagePoint,
    type SourceFloorPlanImage,
  } from '$lib/plan2world/sourceBackground';
  import {
    MAX_FLOOR_PLAN_IMAGE_BYTES,
    reconstructFloorPlanImage,
  } from '$lib/plan2world/vision';

  let { onclose, oncreated }: { onclose: () => void; oncreated: () => void } = $props();

  let fileInput: HTMLInputElement;
  let file = $state<File | null>(null);
  let preparedImage = $state<PreparedBrowserFloorPlan | null>(null);
  let scaleHint = $state('');
  let busy = $state(false);
  let status = $state('');
  let error = $state('');
  let showProviderSettings = $state(false);
  let showTrace = $state(true);
  let focusedIssueKey = $state('');
  let controller: AbortController | null = null;
  let draft = $state<Plan2WorldDraft | null>(null);
  let observationReview = $state<ReconstructionObservationReview | null>(null);
  let sourceImage = $state<SourceFloorPlanImage | null>(null);
  let calibrationPoints = $state<NormalizedImagePoint[]>([]);
  let actualReference = $state('');
  let calibrationMessage = $state('');

  const review = $derived(draft ? summarizePlan2WorldDraft(draft) : null);
  const focusedIssue = $derived.by(() => {
    if (!review || !focusedIssueKey) return null;
    return review.geometryIssues.find(issue => geometryIssueKey(issue) === focusedIssueKey) ?? null;
  });
  const trace = $derived.by(() => {
    if (!draft || !sourceImage) return null;
    try {
      return buildReconstructionTrace(draft, sourceImage) ?? null;
    } catch {
      return null;
    }
  });
  const reconstructedReference = $derived.by(() => {
    if (!draft || !sourceImage || calibrationPoints.length !== 2) return null;
    try {
      return sourceImageDistanceInPlanCm(draft, sourceImage, calibrationPoints[0], calibrationPoints[1]);
    } catch {
      return null;
    }
  });

  function resetCalibration() {
    calibrationPoints = [];
    actualReference = '';
    calibrationMessage = '';
  }

  function resetReview() {
    draft = null;
    observationReview = null;
    sourceImage = null;
    showTrace = true;
    focusedIssueKey = '';
    resetCalibration();
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
    resetReview();
    preparedImage = null;
    file = next;
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
    if (!file || !preparedImage || busy) return;
    const prepared = preparedImage;
    error = '';
    resetReview();
    status = 'Reading floor-plan image…';
    busy = true;
    controller = new AbortController();
    try {
      const image = prepared.image;
      sourceImage = structuredClone($state.snapshot(prepared.source));
      if (controller.signal.aborted) return;
      status = 'Reconstructing walls, doors, and windows…';
      const result = await reconstructFloorPlanImage(
        get(openAISettings),
        image,
        { scaleHint },
        fetch,
        controller.signal,
      );
      draft = result.draft;
      observationReview = result.observationReview;
      status = 'Reconstruction ready for review.';
    } catch (cause) {
      if (!controller?.signal.aborted) {
        error = cause instanceof Error ? cause.message : 'The floor plan could not be reconstructed.';
        if (error.includes('API key') || error.includes('provider') || error.includes('model')) showProviderSettings = true;
      }
    } finally {
      busy = false;
      controller = null;
    }
  }

  function pickCalibrationPoint(event: MouseEvent) {
    if (busy) return;
    const target = event.currentTarget as HTMLButtonElement;
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const point = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
    calibrationPoints = calibrationPoints.length >= 2 ? [point] : [...calibrationPoints, point];
    calibrationMessage = '';
    error = '';
  }

  function applyCalibration() {
    if (!draft || !sourceImage || reconstructedReference === null) return;
    error = '';
    calibrationMessage = '';
    try {
      const actual = Number(actualReference);
      const reconstructed = reconstructedReference;
      draft = calibratePlan2WorldDraft(draft, reconstructed, actual);
      const factor = actual / reconstructed;
      calibrationMessage = `Scale corrected by ${factor.toFixed(4)}×. The selected line now represents ${actual.toFixed(1)} cm in plan space.`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'The scale correction could not be applied.';
    }
  }

  async function openDraft() {
    if (!draft || !sourceImage || busy) return;
    error = '';
    status = 'Opening editable 3D home…';
    busy = true;
    controller = new AbortController();
    try {
      const candidate = draftToProjectWithSourceBackground(draft, $state.snapshot(sourceImage));
      if (candidate.reconstruction && observationReview) {
        candidate.reconstruction.observationReview = structuredClone($state.snapshot(observationReview));
      }
      const project = await openProject(() => candidate, 'import', controller.signal);
      if (!project) return;
      oncreated();
      const params = new URLSearchParams({ id: project.id });
      if (focusedIssue) {
        params.set('focusFloor', focusedIssue.floorId);
        if (reviewIssueFocusMode(focusedIssue) === 'inspect') params.set('focusMode', 'inspect');
        for (const elementId of focusedIssue.elementIds) params.append('focus', elementId);
      }
      await goto(`${base}/editor?${params.toString()}`);
    } catch (cause) {
      if (!controller?.signal.aborted) {
        error = cause instanceof Error ? cause.message : 'The reconstructed plan could not be opened.';
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
  });
</script>

<div class="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto text-left">
  <div class="flex items-start justify-between gap-4 mb-5">
    <div>
      <h2 class="text-2xl font-bold text-gray-800">{draft ? 'Review reconstructed plan' : 'Create 3D home from floor plan'}</h2>
      <p class="text-sm text-gray-500 mt-1">
        {draft
          ? 'Compare the reconstructed trace with the source image, then check scale and assumptions before opening the editable home.'
          : 'Upload a floor-plan image. AI observes architecture and furnishing; Plan2World builds an editable home for review.'}
      </p>
    </div>
    <button type="button" onclick={close} disabled={busy} aria-label="Close"
      class="shrink-0 w-9 h-9 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">✕</button>
  </div>

  <input bind:this={fileInput} class="hidden" type="file" accept="image/png,image/jpeg,image/webp" onchange={onFileSelected} />

  {#if draft && review}
    <ReconstructionReview {review} {trace} {observationReview} sourceUrl={sourceImage?.dataUrl ?? ''} sourceName={file?.name}
      {calibrationPoints} onpick={pickCalibrationPoint} {busy} bind:showTrace bind:focusedIssueKey />

    <div class="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-blue-900">Scale calibration from image</div>
          <p class="text-xs text-blue-700 mt-1">Pick two endpoints directly on the source image above, then enter their real-world length. Plan2World calculates the current reconstructed length automatically and rescales horizontal geometry only.</p>
        </div>
        {#if calibrationPoints.length}
          <button type="button" onclick={resetCalibration} disabled={busy}
            class="shrink-0 text-xs font-semibold text-blue-700 hover:underline disabled:opacity-40">Clear</button>
        {/if}
      </div>

      <div class="mt-3 rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm">
        {#if reconstructedReference !== null}
          <div class="flex items-center justify-between gap-3">
            <span class="text-blue-700">Current reconstructed distance</span>
            <span class="font-semibold text-blue-950">{reconstructedReference.toFixed(1)} cm</span>
          </div>
        {:else}
          <div class="text-blue-500">{calibrationPoints.length === 0 ? 'Pick point 1 on the image.' : 'Now pick point 2 on the image.'}</div>
        {/if}
      </div>

      <label class="block mt-3">
        <span class="text-xs font-medium text-blue-900">Actual length (cm)</span>
        <input bind:value={actualReference} disabled={busy} type="number" min="0.01" step="0.01" placeholder="e.g. 360"
          class="mt-1 w-full px-3 py-2 border border-blue-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" />
      </label>
      <button type="button" onclick={applyCalibration} disabled={busy || reconstructedReference === null || !actualReference}
        class="mt-3 px-3 py-2 rounded-lg bg-white border border-blue-300 text-blue-700 text-sm font-semibold hover:bg-blue-100 disabled:opacity-40">
        Apply measured length
      </button>
      {#if calibrationMessage}
        <div role="status" class="mt-3 text-xs font-medium text-emerald-700">{calibrationMessage}</div>
      {/if}
    </div>
  {:else}
    <button type="button" disabled={busy} onclick={() => fileInput.click()}
      ondragover={(event) => event.preventDefault()} ondrop={onDrop}
      class="w-full {file ? '' : 'min-h-52'} rounded-2xl border-2 border-dashed border-gray-300 hover:border-blue-400 bg-gray-50 hover:bg-blue-50/40 transition-colors overflow-hidden disabled:opacity-60">
      {#if file}
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
    {#if file}<FloorPlanImagePreparation {file} disabled={busy} onprepared={value => preparedImage=value}/>{/if}

    <div class="mt-5">
      <label class="block">
        <span class="text-sm font-medium text-gray-700">Known length <span class="font-normal text-gray-400">optional</span></span>
        <input bind:value={scaleHint} disabled={busy} type="text"
          placeholder="e.g. the bottom exterior wall is 360 cm, or the marked doorway is 900 mm"
          class="mt-1.5 w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100" />
        <span class="block text-xs text-gray-400 mt-1">Leave this blank when the plan already contains readable dimensions. A bare ratio such as 1:100 is not enough to calibrate an arbitrary screenshot. You can also calibrate precisely by clicking two points after reconstruction.</span>
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
      <div class="text-xs text-slate-400 mt-1">The image is sent directly from your browser to the provider you configure; Plan2World does not proxy it. A local copy is kept inside the generated project as its 2D tracing background.</div>
      {#if showProviderSettings}
        <div class="mt-4 pt-1">
          <OpenAISettings />
        </div>
      {/if}
    </div>

    <div class="mt-4 rounded-xl border border-gray-200 px-4 py-3 text-xs text-gray-500">
      Furniture is imported as editable semantic placeholders. Use the catalog to choose models and adjust placement.
    </div>
  {/if}

  {#if status}
    <div role="status" class="mt-4 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">{status}</div>
  {/if}
  {#if error}
    <div role="alert" class="mt-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
  {/if}

  <div class="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
    <button type="button" onclick={close} disabled={busy}
      class="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-40">Cancel</button>
    {#if draft}
      <button type="button" onclick={generate} disabled={busy || !file}
        class="px-4 py-2.5 rounded-xl border border-blue-300 text-blue-700 font-semibold hover:bg-blue-50 disabled:opacity-40">
        Re-run AI
      </button>
      <button type="button" onclick={openDraft} disabled={busy || !sourceImage}
        class="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500">
        {busy ? 'Opening…' : focusedIssue ? 'Open editable home at finding' : 'Open editable home'}
      </button>
    {:else}
      <button type="button" onclick={generate} disabled={!preparedImage || busy}
        class="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500">
        {busy ? 'Generating…' : 'Generate reconstruction'}
      </button>
    {/if}
  </div>
</div>
