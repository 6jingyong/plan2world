<script lang="ts">
  import { compileRuntimeScene } from '$lib/runtime/compileRuntimeScene';
  import { readProject } from '$lib/utils/projectValidation';

  let inputName = $state('');
  let error = $state<string | null>(null);
  let runtime = $state<ReturnType<typeof compileRuntimeScene> | null>(null);

  async function onFile(event: Event) {
    error = null;
    runtime = null;
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    inputName = file.name;
    try {
      const native = readProject(JSON.parse(await file.text()));
      runtime = compileRuntimeScene(native);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Could not compile this project.';
    }
  }

  function downloadRuntime() {
    if (!runtime) return;
    const blob = new Blob([JSON.stringify(runtime, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      const base = inputName.replace(/\.json$/i, '') || 'plan2world';
      link.href = url;
      link.download = `${base}.runtime.json`;
      link.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
</script>

<svelte:head><title>Plan2World Runtime Export</title></svelte:head>

<main class="min-h-screen bg-slate-950 text-slate-100 p-8">
  <div class="mx-auto max-w-3xl space-y-6">
    <div>
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">runtime-v2 developer tool</p>
      <h1 class="mt-2 text-3xl font-bold">Compile native Project → plan2world-runtime-v1</h1>
      <p class="mt-3 text-sm leading-6 text-slate-300">
        This page is intentionally separate from the editor UI while the engine-neutral runtime contract is experimental.
        Upload an existing Plan2World JSON export; no AI or network service is involved.
      </p>
    </div>

    <label class="block rounded-xl border border-dashed border-slate-600 bg-slate-900 p-6 hover:border-blue-400">
      <span class="block text-sm font-semibold">Native Plan2World project JSON</span>
      <input class="mt-3 block w-full text-sm" type="file" accept=".json,application/json" onchange={onFile} />
    </label>

    {#if error}
      <div role="alert" class="rounded-xl border border-red-800 bg-red-950/60 p-4 text-sm text-red-200">{error}</div>
    {/if}

    {#if runtime}
      <section class="rounded-xl border border-emerald-800 bg-emerald-950/30 p-5 space-y-4">
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="rounded-lg bg-black/20 p-3"><div class="text-2xl font-bold">{runtime.floors.length}</div><div class="text-xs text-slate-400">floors</div></div>
          <div class="rounded-lg bg-black/20 p-3"><div class="text-2xl font-bold">{runtime.entities.length}</div><div class="text-xs text-slate-400">entities</div></div>
          <div class="rounded-lg bg-black/20 p-3"><div class="text-2xl font-bold">{runtime.colliders.length}</div><div class="text-xs text-slate-400">colliders</div></div>
        </div>
        <button class="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-emerald-950 hover:bg-emerald-400" onclick={downloadRuntime}>
          Download runtime JSON
        </button>
      </section>
    {/if}

    <div class="rounded-xl bg-slate-900 p-5 text-sm text-slate-300">
      Godot usage: <code class="text-blue-300">godot --path runtime/godot -- --scene "C:\\path\\project.runtime.json"</code>
    </div>
  </div>
</main>
