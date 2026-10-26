<script lang="ts">
  import type { Door, DoorLeafConfiguration, SlidingDoorLeaf } from '$lib/models/types';
  import { doorLeafPresets, slidingDoorPreset, validateDoorLeaves, type DoorLeafPreset } from '$lib/utils/doorLeaves';
  let { door, onchange }: { door: Door; onchange: (value: DoorLeafConfiguration | undefined) => void } = $props();
  let draft = $state<DoorLeafConfiguration | undefined>();
  let error = $state('');
  let source = '';
  $effect(() => {
    const key = JSON.stringify([door.id,door.width,door.type,door.leafConfiguration]);
    if (key !== source) { source=key; draft=structuredClone($state.snapshot(door.leafConfiguration)); error=''; }
  });
  const paired = $derived(door.type === 'double' || door.type === 'french');
  function preset(event: Event) {
    const id=(event.target as HTMLSelectElement).value;
    draft=id ? slidingDoorPreset(door.width,id as DoorLeafPreset) : undefined; error='';
  }
  function leaf(index: number, field: keyof SlidingDoorLeaf, value: string | number) {
    if (draft?.kind !== 'sliding') return;
    const next=structuredClone($state.snapshot(draft)); Object.assign(next.leaves[index],{[field]:value});
    if (field==='motion') next.leaves[index].travel=value==='fixed'?0:-next.leaves[index].width;
    draft=next;
  }
  function addLeaf() {
    if(draft?.kind!=='sliding')return;
    let index=1;while(draft.leaves.some(l=>l.id===`panel-${index}`))index++;
    draft={...draft,leaves:[...draft.leaves,{id:`panel-${index}`,width:door.width/2,center:0,track:12,motion:'slide',travel:-door.width/2}]};
  }
  function apply() {
    try { validateDoorLeaves({...door,leafConfiguration:draft}); onchange(structuredClone($state.snapshot(draft))); error=''; }
    catch(e){error=e instanceof Error?e.message:String(e);}
  }
</script>

<fieldset class="border border-gray-200 rounded p-2 space-y-2">
  <legend class="text-sm">Door panels / 门叶配置</legend>
  {#if paired}
    <label class="block text-xs">First leaf width / A 端门叶比例 (%)
      <input class="w-full border rounded p-1" type="number" min="1" max="99" value={draft?.kind==='paired'?draft.firstLeafRatio*100:50}
        onchange={(e)=>{draft={kind:'paired',firstLeafRatio:Number(e.currentTarget.value)/100};}} />
    </label>
  {:else}
    <label class="block text-xs">Starting configuration / 起始配置
      <select class="w-full border rounded p-1" onchange={preset}>
        <option value="">Legacy single panel / 原单叶</option>
        {#each doorLeafPresets.filter(p=>door.type==='pocket'?p.id==='pocket':p.id!=='pocket') as p}<option value={p.id}>{p.label}</option>{/each}
      </select>
    </label>
    <p class="text-xs text-gray-500">cm · Along A→B; track toward wall left. / 沿墙 A→B，轨道正向为墙左侧。</p>
    {#if draft?.kind==='sliding'}
      {#each draft.leaves as panel,index (panel.id)}
        <div class="border rounded p-2 space-y-1">
          <div class="flex justify-between text-xs"><span>{panel.id}</span><button onclick={()=>{if(draft?.kind==='sliding')draft={...draft,leaves:draft.leaves.filter((_,i)=>i!==index)};}}>Remove / 移除</button></div>
          {#each [['width','Width / 宽'],['center','Closed centre / 关闭中心'],['track','Track offset / 轨道偏移'],['travel','Signed travel / 带符号行程']] as [field,label]}
            <label class="flex items-center justify-between text-xs">{label}
              <input class="w-20 border rounded p-1" aria-label={`${panel.id} ${label}`} type="number" step="any" disabled={field==='travel'&&panel.motion==='fixed'} value={panel[field as 'width'|'center'|'track'|'travel']}
                onchange={(e)=>leaf(index,field as keyof SlidingDoorLeaf,Number(e.currentTarget.value))} />
            </label>
          {/each}
          <label class="block text-xs">Motion / 运动
            <select class="border rounded p-1" value={panel.motion} onchange={(e)=>leaf(index,'motion',e.currentTarget.value)}><option value="fixed">Fixed / 固定</option><option value="slide">Sliding / 平移</option></select>
          </label>
        </div>
      {/each}
      <button class="text-xs border rounded p-1" disabled={draft.leaves.length>=16} onclick={addLeaf}>Add panel / 添加门叶</button>
    {/if}
  {/if}
  {#if error}<p role="alert" class="text-xs text-red-700">{error}</p>{/if}
  <div class="flex gap-2"><button class="text-xs border rounded p-2" onclick={apply}>Apply panels / 应用</button><button class="text-xs border rounded p-2" onclick={()=>{draft=undefined;apply();}}>Reset default / 恢复默认</button></div>
</fieldset>
