<script lang="ts">
  import { getCatalogItem } from '$lib/utils/furnitureCatalog';

  let { catalogId, name, color }: { catalogId: string; name: string; color: string } = $props();

  const item = $derived(getCatalogItem(catalogId));
  const width = $derived(Math.max(1, item?.width ?? 50));
  const depth = $derived(Math.max(1, item?.depth ?? 50));
  const longest = $derived(Math.max(width, depth));
  const footprintWidth = $derived(Math.max(34, Math.round((width / longest) * 78)));
  const footprintDepth = $derived(Math.max(34, Math.round((depth / longest) * 78)));
  const icon = $derived(item?.icon ?? '■');
</script>

<div
  class="flex h-full w-full items-center justify-center p-1"
  title={`${name} · ${width}×${depth} cm`}
  aria-hidden="true"
>
  <div
    class="relative flex items-center justify-center rounded-md border border-black/15 shadow-sm"
    style={`width:${footprintWidth}%;height:${footprintDepth}%;min-width:24px;min-height:24px;background:${color};`}
  >
    <span class="select-none leading-none drop-shadow-sm" style="font-size:clamp(10px,45%,18px)">{icon}</span>
    <span class="absolute right-0.5 bottom-0.5 h-1.5 w-1.5 rounded-full bg-white/70 border border-black/10"></span>
  </div>
</div>
