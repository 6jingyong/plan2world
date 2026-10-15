<script lang="ts">
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import OpenAISettings from '$lib/components/ai/OpenAISettings.svelte';
  import { openAISettings } from '$lib/stores/aiKeys';
  import { openProject } from '$lib/services/projectOpening';
  import type { Plan2WorldDraft } from '$lib/plan2world/draft';
  import type { DraftGeometryIssue } from '$lib/plan2world/geometryHealth';
  import { buildReconstructionTrace, traceElementMatchesIssue } from '$lib/plan2world/reconstructionTrace';
  import {
    calibratePlan2WorldDraft,
    summarizePlan2WorldDraft,
  } from '$lib/plan2world/review';
  import {
    decodeSourceFloorPlanImage,
    draftToProjectWithSourceBackground,
    sourceImageDistanceInPlanCm,
    type NormalizedImagePoint,
    type SourceFloorPlanImage,
  } from '$lib/plan2world/sourceBackground';
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
  let showTrace = $state(true);
  let focusedIssueKey = $state('');
  let controller: AbortController | null = null;
  let draft = $state<Plan2WorldDraft | null>(null);
  let sourceImage = $state<SourceFloorPlanImage | null>(null);
  let calibrationPoints = $state<NormalizedImagePoint[]>([]);
  let actualReference = $state('');
  let calibrationMessage = $state('');

  const review = $derived(draft ? summarizePlan2WorldDraft(draft) : null);
  const focusedIssueElementIds = $derived.by(() => {
    if (!review || !focusedIssueKey) return [];
    return review.geometryIssues.find(issue => geometryIssueKey(issue) === focusedIssueKey)?.elementIds ?? [];
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

  function revokePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
  }

  function resetCalibration() {
    calibrationPoints = [];
    actualReference = '';
    calibrationMessage = '';
  }

  function resetReview() {
    draft = null;
    sourceImage = null;
    showTrace = true;
    focusedIssueKey = '';
    resetCalibration();
  }

  function geometryIssueKey(issue: DraftGeometryIssue) {
    return `${issue.code}:${issue.floorId}:${issue.elementIds.join('|')}`;
  }

  function toggleGeometryIssue(issue: DraftGeometryIssue) {
    const key = geometryIssueKey(issue);
    focusedIssueKey = focusedIssueKey === key ? '' : key;
    if (focusedIssueKey) showTrace = true;
  }

  function traceIsFocused(element: { id: string; wallId?: string }) {
    return Boolean(focusedIssueKey) && traceElementMatchesIssue(element, focusedIssueElementIds);
  }

  function traceOpacity(element: { id: string; wallId?: string }) {
    if (!focusedIssueKey) return 0.92;
    return traceIsFocused(element) ? 1 : 0.14;
  }

  function traceStroke(severity: 'warning' | 'error' | undefined, confidence: number | undefined) {
    if (severity === 'error') return '#dc2626';
    if (severity === 'warning') return '#f59e0b';
    if ((confidence ?? 1) < 0.65) return '#ca8a04';
    return '#059669';
  }

  function traceDash(severity: 'warning' | 'error' | undefined, confidence: number | undefined) {
    return !severity && (confidence ?? 1) < 0.65 ? '7 5' : undefined;
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
    resetReview();
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
    resetReview();
    status = 'Reading floor-plan image…';
    busy = true;
    controller = new AbortController();
    try {
      const image = await encodeFloorPlanImage(file);
      sourceImage = await decodeSourceFloorPlanImage(image.dataUrl);
      if (controller.signal.aborted) return;
      status = 'Reconstructing walls, doors, and windows…';
      draft = await reconstructFloorPlanImage(
        get(openAISettings),
        image,
        { scaleHint },
        fetch,
        controller.signal,
      );
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
      const candidate = draftToProjectWithSourceBackground(draft, sourceImage);
      const project = await openProject(() => candidate, 'import', controller.signal);
      if (!project) return;
      oncreated();
      await goto(`${base}/editor?id=${encodeURIComponent(project.id)}`);
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
    revokePreview();
  });
</script>

<div class="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto text-left">
  <div class="flex items-start justify-between gap-4 mb-5">
    <div>
      <h2 class="text-2xl font-bold text-gray-800">{draft ? 'Review reconstructed plan' : 'Create 3D home from floor plan'}</h2>
      <p class="text-sm text-gray-500 mt-1">
        {draft
          ? 'Compare the reconstructed trace with the source image, then check scale and assumptions before opening the editable home.'
          : 'Upload a normal floor-plan image. AI extracts the architecture; Plan2World turns it into the existing editable Three.js scene.'}
      </p>
    </div>
    <button type="button" onclick={close} disabled={busy} aria-label="Close"
      class="shrink-0 w-9 h-9 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40">✕</button>
  </div>

  <input bind:this={fileInput} class="hidden" type="file" accept="image/png,image/jpeg,image/webp" onchange={onFileSelected} />

  {#if draft && review}
    {#if previewUrl}
      <div class="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden mb-5">
        <div class="bg-white p-2 flex justify-center">
          <div class="relative inline-block max-w-full">
            <img src={previewUrl} alt="Source floor plan" draggable="false" class="block max-w-full max-h-96 w-auto h-auto select-none" />
            {#if showTrace && trace}
              <svg
                class="absolute inset-0 z-[5] w-full h-full pointer-events-none"
                viewBox={`0 0 ${trace.width} ${trace.height}`}
                aria-label="AI reconstruction trace"
              >
                {#each trace.walls as wall}
                  <path
                    d={wall.curvePoint
                      ? `M ${wall.start.x} ${wall.start.y} Q ${wall.curvePoint.x} ${wall.curvePoint.y} ${wall.end.x} ${wall.end.y}`
                      : `M ${wall.start.x} ${wall.start.y} L ${wall.end.x} ${wall.end.y}`}
                    fill="none"
                    stroke={traceStroke(wall.severity, wall.confidence)}
                    stroke-width={traceIsFocused(wall) ? (wall.severity === 'error' ? 6 : 5) : (wall.severity === 'error' ? 4 : 3)}
                    stroke-dasharray={traceDash(wall.severity, wall.confidence)}
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    vector-effect="non-scaling-stroke"
                    opacity={traceOpacity(wall)}
                  />
                {/each}
                {#each trace.openings as opening}
                  {#if opening.kind === 'door'}
                    <circle
                      cx={opening.point.x}
                      cy={opening.point.y}
                      r={traceIsFocused(opening) ? 7 : 5}
                      fill={opening.severity === 'error' ? '#dc2626' : opening.severity === 'warning' ? '#f59e0b' : '#a21caf'}
                      stroke="white"
                      stroke-width={traceIsFocused(opening) ? 3 : 2}
                      vector-effect="non-scaling-stroke"
                      opacity={traceOpacity(opening)}
                    />
                  {:else}
                    <rect
                      x={opening.point.x - (traceIsFocused(opening) ? 6 : 4)}
                      y={opening.point.y - (traceIsFocused(opening) ? 6 : 4)}
                      width={traceIsFocused(opening) ? 12 : 8}
                      height={traceIsFocused(opening) ? 12 : 8}
                      rx="1.5"
                      fill={opening.severity === 'error' ? '#dc2626' : opening.severity === 'warning' ? '#f59e0b' : '#0891b2'}
                      stroke="white"
                      stroke-width={traceIsFocused(opening) ? 3 : 2}
                      vector-effect="non-scaling-stroke"
                      opacity={traceOpacity(opening)}
                    />
                  {/if}
                {/each}
              </svg>
            {/if}
            <button type="button" onclick={pickCalibrationPoint} disabled={busy}
              aria-label="Pick two endpoints on the source image for scale calibration"
              title={calibrationPoints.length === 0 ? 'Pick first calibration point' : calibrationPoints.length === 1 ? 'Pick second calibration point' : 'Click to start a new measurement'}
              class="absolute inset-0 z-10 cursor-crosshair bg-transparent disabled:cursor-default disabled:opacity-40"></button>
            {#if calibrationPoints.length === 2}
              <svg class="absolute inset-0 z-20 w-full h-full pointer-events-none text-blue-600" aria-hidden="true">
                <line
                  x1={`${calibrationPoints[0].x * 100}%`}
                  y1={`${calibrationPoints[0].y * 100}%`}
                  x2={`${calibrationPoints[1].x * 100}%`}
                  y2={`${calibrationPoints[1].y * 100}%`}
                  stroke="currentColor" stroke-width="3" vector-effect="non-scaling-stroke" />
              </svg>
            {/if}
            {#each calibrationPoints as point, index}
              <span aria-hidden="true"
                class="absolute z-30 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-md text-[10px] leading-4 text-center font-bold text-white pointer-events-none"
                style={`left:${point.x * 100}%;top:${point.y * 100}%;`}>{index + 1}</span>
            {/each}
          </div>
        </div>
        <div class="px-3 py-2 text-xs text-gray-500">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="truncate">Source: {file?.name}</div>
            <div class="flex items-center gap-3 shrink-0">
              {#if trace}
                <button type="button" onclick={() => showTrace = !showTrace}
                  class="font-semibold text-emerald-700 hover:underline">
                  {showTrace ? 'Hide AI trace' : 'Show AI trace'}
                </button>
              {/if}
              <span class="font-medium text-blue-700">{calibrationPoints.length}/2 scale points</span>
            </div>
          </div>
          {#if trace && showTrace}
            <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
              <span class="text-emerald-700">━ wall</span>
              <span class="text-fuchsia-700">● door</span>
              <span class="text-cyan-700">■ window</span>
              <span class="text-amber-700">━ warning / low confidence</span>
              <span class="text-red-700">━ likely error</span>
            </div>
            {#if focusedIssueKey}
              <div role="status" class="mt-1 font-medium text-orange-700">Focused finding: matching geometry is emphasized; unrelated trace elements are dimmed.</div>
            {/if}
          {/if}
          <div class="mt-1 text-gray-400">The trace uses the exact same source-image registration as the editor underlay. Click two endpoints of any known feature to calibrate scale.</div>
        </div>
      </div>
    {/if}

    <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div class="text-xs uppercase tracking-wide font-semibold text-slate-500">Scale</div>
          <div class="mt-1 flex items-center gap-2">
            <span class="font-semibold text-slate-800 capitalize">{review.scaleMode}</span>
            <span class="text-xs rounded-full px-2 py-0.5 bg-white border border-slate-200 text-slate-600">{Math.round(review.scaleConfidence * 100)}% confidence</span>
          </div>
        </div>
        {#if review.primaryExtent}
          <div class="text-right">
            <div class="text-xs uppercase tracking-wide font-semibold text-slate-500">Approx. footprint</div>
            <div class="mt-1 font-semibold text-slate-800">{(review.primaryExtent.width / 100).toFixed(2)} × {(review.primaryExtent.depth / 100).toFixed(2)} m</div>
          </div>
        {/if}
      </div>

      {#if review.scaleBasis}
        <div class="mt-3 text-sm text-slate-600"><span class="font-medium text-slate-700">Basis:</span> {review.scaleBasis}</div>
      {/if}

      <div class="grid grid-cols-3 gap-2 mt-4">
        <div class="rounded-xl bg-white border border-slate-200 px-3 py-2 text-center">
          <div class="text-lg font-bold text-slate-800">{review.wallCount}</div>
          <div class="text-xs text-slate-500">walls</div>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 px-3 py-2 text-center">
          <div class="text-lg font-bold text-slate-800">{review.doorCount}</div>
          <div class="text-xs text-slate-500">doors</div>
        </div>
        <div class="rounded-xl bg-white border border-slate-200 px-3 py-2 text-center">
          <div class="text-lg font-bold text-slate-800">{review.windowCount}</div>
          <div class="text-xs text-slate-500">windows</div>
        </div>
      </div>
    </div>

    {#if review.assumptions.length}
      <div class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <div class="text-sm font-semibold text-amber-900">AI assumptions</div>
        <ul class="mt-2 space-y-1 text-sm text-amber-800 list-disc pl-5">
          {#each review.assumptions as assumption}
            <li>{assumption}</li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if review.geometryIssues.length}
      <div class="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="text-sm font-semibold text-orange-950">Geometry check</div>
          <div class="flex gap-2 text-xs">
            {#if review.geometryErrorCount}
              <span class="rounded-full bg-red-100 text-red-700 px-2 py-0.5 font-semibold">{review.geometryErrorCount} likely error{review.geometryErrorCount === 1 ? '' : 's'}</span>
            {/if}
            {#if review.geometryWarningCount}
              <span class="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 font-semibold">{review.geometryWarningCount} warning{review.geometryWarningCount === 1 ? '' : 's'}</span>
            {/if}
          </div>
        </div>
        <p class="mt-1 text-xs text-orange-800">Deterministic geometry checks, not another AI judgment. Select a finding to isolate its matching wall or opening in the source-image trace above.</p>
        <ul class="mt-2 space-y-1 text-sm text-orange-900">
          {#each review.geometryIssues.slice(0, 6) as issue}
            <li>
              <button
                type="button"
                onclick={() => toggleGeometryIssue(issue)}
                aria-pressed={focusedIssueKey === geometryIssueKey(issue)}
                class={`w-full rounded-lg px-2 py-1.5 text-left transition-colors ${focusedIssueKey === geometryIssueKey(issue) ? 'bg-white ring-1 ring-orange-300 shadow-sm' : 'hover:bg-white/70'}`}
              >
                <span class={issue.severity === 'error' ? 'font-semibold text-red-700' : ''}>{issue.message}</span>
                <span class="ml-2 text-xs font-semibold text-orange-700">{focusedIssueKey === geometryIssueKey(issue) ? 'Showing on source' : 'Show on source'}</span>
              </button>
            </li>
          {/each}
        </ul>
        {#if review.geometryIssues.length > 6}
          <div class="mt-2 text-xs text-orange-700">+ {review.geometryIssues.length - 6} more finding{review.geometryIssues.length - 6 === 1 ? '' : 's'}</div>
        {/if}
      </div>
    {/if}

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
      Furniture is intentionally not inferred in v1. Reconstruct the walls and openings first, then use the existing furniture catalog to furnish the editable plan.
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
        {busy ? 'Opening…' : 'Open editable home'}
      </button>
    {:else}
      <button type="button" onclick={generate} disabled={!file || busy}
        class="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500">
        {busy ? 'Generating…' : 'Generate reconstruction'}
      </button>
    {/if}
  </div>
</div>