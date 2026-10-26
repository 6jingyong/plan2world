<script lang="ts">
  import { FULL_IMAGE_QUAD, type ImageQuad } from '$lib/plan2world/imagePreparation';
  import { loadFloorPlanInput,prepareBrowserFloorPlan,type LoadedFloorPlanInput,type PreparedBrowserFloorPlan } from '$lib/plan2world/imagePreparationBrowser';

  let {file,disabled=false,onprepared}:{file:File;disabled?:boolean;onprepared:(value:PreparedBrowserFloorPlan|null)=>void}=$props();
  let input=$state<LoadedFloorPlanInput|null>(null),candidate=$state<PreparedBrowserFloorPlan|null>(null);
  let perspective=$state(false),corners=$state<ImageQuad>(structuredClone(FULL_IMAGE_QUAD));
  let ratioWidth=$state(0),ratioHeight=$state(0),outputWidth=$state(1600),turns=$state(0);
  let pending=$state(false),confirmed=$state(false),error=$state('');
  let dragging=-1,revision=0;
  const labels=['Top left','Top right','Bottom right','Bottom left'];

  $effect(()=>{
    const selected=file;const version=++revision;
    onprepared(null);input=null;candidate=null;perspective=false;corners=structuredClone(FULL_IMAGE_QUAD);turns=0;ratioWidth=0;ratioHeight=0;error='';pending=true;
    loadFloorPlanInput(selected).then(async loaded=>{
      if(version!==revision)return;
      input=loaded;outputWidth=Math.min(2048,loaded.raster.width);
      const value=await prepareBrowserFloorPlan(loaded,{mode:'identity',quarterTurns:0});
      if(version!==revision)return;
      candidate=value;confirmed=true;onprepared(value);
    }).catch(cause=>{if(version===revision)error=cause instanceof Error?cause.message:String(cause);})
      .finally(()=>{if(version===revision)pending=false;});
    return ()=>{revision++;};
  });
  function invalidate(){revision++;candidate=null;confirmed=false;error='';onprepared(null);}
  async function preview(){
    if(!input || pending || disabled)return;
    const version=++revision;pending=true;error='';confirmed=false;onprepared(null);
    try{
      const value=await prepareBrowserFloorPlan(input,{mode:perspective?'perspective':'identity',quarterTurns:turns as 0|1|2|3,
        ...(perspective?{corners:$state.snapshot(corners),aspectRatio:ratioWidth/ratioHeight,outputWidth}:{})});
      if(version===revision)candidate=value;
    }catch(cause){if(version===revision)error=cause instanceof Error?cause.message:String(cause);}
    finally{if(version===revision)pending=false;}
  }
  function confirm(){if(candidate){confirmed=true;onprepared(candidate);}}
  function move(event:PointerEvent){
    if(dragging<0 || disabled || pending)return;
    const rect=(event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const points=$state.snapshot(corners);points[dragging]={x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};
    corners=points;invalidate();
  }
  function nudge(event:KeyboardEvent,index:number){
    if(disabled || pending || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const points=$state.snapshot(corners),step=event.shiftKey?.01:.001;
    points[index]={x:Math.max(0,Math.min(1,points[index].x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0))),y:Math.max(0,Math.min(1,points[index].y+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)))};
    corners=points;invalidate();
  }
</script>

<section class="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Prepare floor-plan image">
  <label class="flex gap-2 items-center font-semibold text-sm"><input type="checkbox" bind:checked={perspective} disabled={disabled||pending} onchange={invalidate}/>Correct a photographed rectangle</label>
  <p class="text-xs text-slate-600 mt-1">Flat images can be used directly. For a photo, select the paper or a known rectangle; keep dimension labels. Do not square off the apartment outline.</p>
  {#if input && perspective}
    <svg class="mt-3 w-full touch-none select-none bg-white" style:aspect-ratio={`${input.raster.width}/${input.raster.height}`} viewBox="0 0 1000 1000" preserveAspectRatio="none" role="application" aria-label="Adjust paper corners" onpointermove={move} onpointerup={()=>dragging=-1} onpointercancel={()=>dragging=-1}>
      <image href={input.encoded.dataUrl} width="1000" height="1000" preserveAspectRatio="none"/>
      <polygon points={corners.map(p=>`${p.x*1000},${p.y*1000}`).join(' ')} fill="#397b6720" stroke="#397b67" stroke-width="4"/>
      {#each corners as point,index}
        <circle cx={point.x*1000} cy={point.y*1000} r="16" fill="white" stroke="#174e40" stroke-width="5" role="button" tabindex={disabled||pending?-1:0} aria-label={`${labels[index]} corner`} onkeydown={e=>nudge(e,index)} onpointerdown={event=>{if(disabled||pending)return;dragging=index;(event.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(event.pointerId);event.preventDefault();}}/>
      {/each}
    </svg>
    <p class="text-xs text-slate-600 mt-2">Drag four corners, or focus a corner and use arrow keys (Shift for a larger step). Clockwise order: top left, top right, bottom right, bottom left.</p>
    <label class="block text-xs mt-3">Known rectangle proportion
      <select class="block w-full border rounded p-2 bg-white" aria-label="Rectangle proportion" disabled={disabled||pending} onchange={event=>{const [w,h]=event.currentTarget.value.split(':').map(Number);ratioWidth=w;ratioHeight=h;invalidate();}}>
        <option value="0:0">Choose a known proportion…</option><option value="210:297">A4 portrait · 210:297</option><option value="297:210">A4 landscape · 297:210</option><option value="0:1">Custom width / height</option>
      </select>
    </label>
    <div class="grid grid-cols-3 gap-2 mt-2 text-xs">
      <label>Reference width<input class="block w-full border rounded p-2" type="number" min="0.01" step="any" aria-label="Reference rectangle width" bind:value={ratioWidth} disabled={disabled||pending} oninput={invalidate}/></label>
      <label>Reference height<input class="block w-full border rounded p-2" type="number" min="0.01" step="any" aria-label="Reference rectangle height" bind:value={ratioHeight} disabled={disabled||pending} oninput={invalidate}/></label>
      <label>Output width (px)<input class="block w-full border rounded p-2" type="number" min="2" max="6000" step="1" bind:value={outputWidth} disabled={disabled||pending} oninput={invalidate}/></label>
    </div>
    <p class="text-xs text-slate-600 mt-1">Use the same units for both sides. This proportion does not set the building's physical scale.</p>
  {/if}
  <div class="flex flex-wrap gap-2 mt-3 text-sm">
    <button type="button" class="border rounded-lg px-3 py-2 bg-white disabled:opacity-40" disabled={disabled||pending||!input} onclick={()=>{turns=(turns+1)%4;invalidate();}}>Rotate output 90° · {turns*90}°</button>
    <button type="button" class="border rounded-lg px-3 py-2 bg-white disabled:opacity-40" disabled={disabled||pending||!input} onclick={preview}>Preview prepared image</button>
    {#if candidate && !confirmed}<button type="button" class="rounded-lg px-3 py-2 bg-emerald-700 text-white disabled:opacity-40" disabled={disabled||pending} onclick={confirm}>Use prepared image</button>{/if}
  </div>
  {#if pending}<p class="text-sm mt-3" role="status">Preparing image locally…</p>{/if}
  {#if candidate}
    <img class="mt-3 max-h-80 w-full object-contain bg-white" src={candidate.image.dataUrl} alt="Prepared floor plan"/>
    <p class="text-xs mt-2 text-slate-600">{candidate.source.width} × {candidate.source.height} · {confirmed?'Ready for recognition':'Check orientation, proportions and dimension labels, then confirm.'} · Original image retained.</p>
  {/if}
  {#if error}<p class="text-sm text-red-700 mt-3" role="alert">{error}</p>{/if}
</section>
