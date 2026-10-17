<script lang="ts">
  import type { DraftReviewSummary } from '$lib/plan2world/review';
  import type { NormalizedImagePoint } from '$lib/plan2world/sourceBackground';
  import { geometryIssueKey, type DraftGeometryIssue } from '$lib/plan2world/geometryHealth';
  import { traceElementMatchesIssue, type ReconstructionTrace } from '$lib/plan2world/reconstructionTrace';

  let { review, trace = null, sourceUrl = '', sourceName = '', live = false, calibrationPoints = [], onpick, busy = false,
    showTrace = $bindable(true), focusedIssueKey = $bindable('') }: {
    review: DraftReviewSummary; trace?: ReconstructionTrace | null; sourceUrl?: string; sourceName?: string;
    live?: boolean; calibrationPoints?: NormalizedImagePoint[]; onpick?: (event: MouseEvent) => void; busy?: boolean;
    showTrace?: boolean; focusedIssueKey?: string;
  } = $props();
  let showAllFindings = $state(false);
  const visibleIssues = $derived(showAllFindings ? review.geometryIssues : review.geometryIssues.slice(0, 6));
  function toggleAllFindings() {
    showAllFindings = !showAllFindings;
    if (!showAllFindings && !review.geometryIssues.slice(0, 6).some(issue => geometryIssueKey(issue) === focusedIssueKey)) {
      focusedIssueKey = '';
    }
  }
  const focusedIssueElementIds = $derived(review.geometryIssues.find(issue => geometryIssueKey(issue) === focusedIssueKey)?.elementIds ?? []);
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

</script>


{#if sourceUrl}
  <div class="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden mb-5">
    <div class="bg-white p-2 flex justify-center">
      <div class="relative inline-block max-w-full">
        <img src={sourceUrl} alt="Source floor plan" draggable="false" class="block max-w-full max-h-96 w-auto h-auto select-none" />
        {#if showTrace && trace}
          <svg
            class="absolute inset-0 z-[5] w-full h-full pointer-events-none"
            viewBox={`0 0 ${trace.width} ${trace.height}`}
            aria-label={live ? 'Current geometry trace' : 'AI reconstruction trace'}
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
        {#if onpick}
        <button type="button" onclick={onpick} disabled={busy}
          aria-label="Pick two endpoints on the source image for scale calibration"
          title={calibrationPoints.length === 0 ? 'Pick first calibration point' : calibrationPoints.length === 1 ? 'Pick second calibration point' : 'Click to start a new measurement'}
          class="absolute inset-0 z-10 cursor-crosshair bg-transparent disabled:cursor-default disabled:opacity-40"></button>
        {/if}
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
        <div class="truncate">Source: {sourceName}</div>
        <div class="flex items-center gap-3 shrink-0">
          {#if trace}
            <button type="button" onclick={() => showTrace = !showTrace}
              class="font-semibold text-emerald-700 hover:underline">
              {showTrace ? live ? 'Hide trace' : 'Hide AI trace' : live ? 'Show trace' : 'Show AI trace'}
            </button>
          {/if}
          {#if onpick}<span class="font-medium text-blue-700">{calibrationPoints.length}/2 scale points</span>{/if}
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
      <div class="mt-1 text-gray-400">{onpick ? 'The trace uses the exact same source-image registration as the editor underlay. Click two endpoints of any known feature to calibrate scale.' : 'The trace follows current editor geometry using the saved source-image alignment.'}</div>
    </div>
  </div>
{/if}

<div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <div>
      <div class="text-xs uppercase tracking-wide font-semibold text-slate-500">{live ? 'Import scale' : 'Scale'}</div>
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
    <div class="text-sm font-semibold text-amber-900">{live ? 'Import assumptions' : 'AI assumptions'}</div>
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
      {#each visibleIssues as issue}
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
      <button type="button" onclick={toggleAllFindings} aria-expanded={showAllFindings}
        class="mt-2 rounded-lg border border-orange-300 bg-white px-3 py-2 text-xs font-semibold text-orange-800 hover:bg-orange-100">
        {showAllFindings ? 'Show fewer findings' : `Show all ${review.geometryIssues.length} findings`}
      </button>
    {/if}
  </div>
{/if}
