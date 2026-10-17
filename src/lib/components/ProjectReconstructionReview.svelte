<script lang="ts">
  import { modalDialog } from '$lib/utils/modalDialog';
  import { currentProject, projectFloorAnalysis } from '$lib/stores/project';
  import { focusReviewTarget } from '$lib/stores/editorFocus';
  import { resolveReviewFocus, reviewIssueFocusMode } from '$lib/plan2world/reviewFocus';
  import { geometryIssueKey } from '$lib/plan2world/geometryHealth';
  import { summarizeProjectReconstruction } from '$lib/plan2world/review';
  import { buildProjectReconstructionTrace } from '$lib/plan2world/reconstructionTrace';
  import ReconstructionReview from './ReconstructionReview.svelte';

  let { onclose }: { onclose: () => void } = $props();
  let focusedIssueKey = $state('');
  const review = $derived($currentProject ? summarizeProjectReconstruction($currentProject, $projectFloorAnalysis.floors.values()) : null);
  const issue = $derived(review?.geometryIssues.find(issue => geometryIssueKey(issue) === focusedIssueKey));
  const focusMode = $derived(issue ? reviewIssueFocusMode(issue) : 'edit');
  // A finding on another floor takes priority so its trace and editor handoff agree.
  const floor = $derived($currentProject?.floors.find(floor => floor.id === issue?.floorId)
    ?? $projectFloorAnalysis.active?.floor);
  const background = $derived(floor?.backgroundImage?.reconstructionSource ? floor.backgroundImage : null);
  const trace = $derived($currentProject && floor && review
    ? buildProjectReconstructionTrace($currentProject, floor.id, review.geometryIssues) : null);

  function editFinding() {
    const target = $currentProject && issue ? resolveReviewFocus($currentProject, issue.floorId, issue.elementIds, focusMode) : null;
    if (target && focusReviewTarget(target)) onclose();
  }
</script>

<dialog use:modalDialog aria-label="Review reconstruction" oncancel={(event) => { event.preventDefault(); onclose(); }}
  onclick={(event) => { if (event.target === event.currentTarget) onclose(); }}
  class="modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/40">
  <div class="bg-white rounded-2xl shadow-2xl p-5 sm:p-7 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto text-left">
    <div class="flex items-start justify-between gap-3 mb-4">
      <div>
        <h2 class="text-xl font-bold text-gray-800">Review reconstruction</h2>
        <p class="mt-1 text-sm text-gray-500">The trace and geometry checks reflect your current edits. Scale, assumptions and confidence describe the original import.</p>
      </div>
      <button type="button" aria-label="Close reconstruction review" onclick={onclose} class="shrink-0 rounded-lg border px-3 py-1.5 text-gray-600">✕</button>
    </div>
    {#if review}
      {#if !background}
        <p class="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-gray-600">The source image is not attached to this floor. Geometry checks and import assumptions remain available.</p>
      {/if}
      <ReconstructionReview {review} {trace} sourceUrl={background?.dataUrl} sourceName={background?.reconstructionSource?.name} live bind:focusedIssueKey />
      {#if issue}
        <button type="button" onclick={editFinding} class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{focusMode === 'inspect' ? 'Inspect finding in plan' : 'Edit finding in plan'}</button>
      {/if}
    {:else}
      <p class="text-sm text-gray-500">No reconstruction evidence is stored in this project.</p>
    {/if}
  </div>
</dialog>
