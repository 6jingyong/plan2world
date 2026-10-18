import { describe, expect, it } from 'vitest';
import { renderPlan2WorldDraftSvg } from '$lib/plan2world/draftSvg';

const source = {width:1000,height:800,dataUrl:'data:image/png;base64,AA=='};
function draft(): any {
  return {schemaVersion:'plan2world-draft-v1',presentation:'semantic-white-model',name:'SVG review',units:'cm',scale:{mode:'estimated',confidence:.6},
    sourceRegistration:{floorId:'f0',confidence:.9,anchors:[
      {wallId:'top',endpoint:'start',image:{x:.1,y:.125}},
      {wallId:'top',endpoint:'end',image:{x:.9,y:.125}},
    ]},floors:[{id:'f0',name:'Ground',level:0,walls:[
      {id:'top',start:{x:0,y:0},end:{x:400,y:0}},
      {id:'right',start:{x:400,y:0},end:{x:400,y:300}},
      {id:'bottom',start:{x:400,y:300},end:{x:0,y:300}},
      {id:'left',start:{x:0,y:300},end:{x:0,y:0}},
    ],doors:[{id:'d1',wallId:'top',position:.5,width:90}],windows:[{id:'n1',wallId:'right',position:.5,width:120}],
    furniture:[{id:'b1',catalogId:'imported_object',sourceCategory:'sofa',position:{x:200,y:200},rotation:90,width:100,depth:40,height:80}]}]};
}

describe('read-only draft SVG',()=>{
  it('renders separate layers with exact hosted widths and rotated furniture, without mutating JSON',()=>{
    const input=draft(),before=JSON.stringify(input),svg=renderPlan2WorldDraftSvg(input);
    for(const layer of ['walls','doors','windows','furniture','labels'])expect(svg).toContain(`id="${layer}"`);
    expect(svg).toContain('data-element-id="d1" data-wall-id="top" d="M 155 0 L 245 0"');
    expect(svg).toContain('data-element-id="n1" data-wall-id="right" d="M 400 90 L 400 210"');
    expect(svg).toContain('points="220 150 220 250 180 250 180 150"');
    expect(JSON.stringify(input)).toBe(before);
  });

  it('uses original raster registration for every layer rather than refitting bounds',()=>{
    const svg=renderPlan2WorldDraftSvg(draft(),{source});
    expect(svg).toContain('viewBox="0 0 1000 800"');
    expect(svg).toContain('data-element-id="top" d="M 100 100 L 900 100"');
    expect(svg).toContain('data-element-id="d1" data-wall-id="top" d="M 410 100 L 590 100"');
    expect(svg).toContain('points="540 400 540 600 460 600 460 400"');
  });

  it('retains an exact quadratic wall while measuring curved openings along the shared path metric',()=>{
    const input=draft();input.floors[0].walls[0].curvePoint={x:200,y:100};
    input.floors[0].doors[0].position=.25;input.floors[0].doors[0].width=90;
    const svg=renderPlan2WorldDraftSvg(input);
    expect(svg).toContain('d="M 0 0 Q 200 100 400 0"');
    const d=svg.match(/data-element-id="d1" data-wall-id="top" d="([^"]+)"/)![1];
    const values=d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    let length=0;for(let i=2;i<values.length;i+=2)length+=Math.hypot(values[i]-values[i-2],values[i+1]-values[i-1]);
    expect(length).toBeCloseTo(90,2);
    expect(values[1]).toBeGreaterThan(0);
  });

  it('draws source-explicit ground boundaries and includes their extents',()=>{
    const input=draft();input.floors[0].floorAreas=[{id:'balcony',name:'Balcony',boundary:[{wallId:'bottom'},{point:{x:0,y:450}},{point:{x:400,y:450}}]}];
    const svg=renderPlan2WorldDraftSvg(input);
    expect(svg).toContain('data-element-id="balcony" points="400 300 0 300 0 450 400 450"');
  });

  it('rejects missing registration for overlays but allows standalone JSON rendering',()=>{
    const input=draft();delete input.sourceRegistration;
    expect(()=>renderPlan2WorldDraftSvg(input)).not.toThrow();
    expect(()=>renderPlan2WorldDraftSvg(input,{source})).toThrow('accepted sourceRegistration');
    input.sourceRegistration=draft().sourceRegistration;
    input.sourceRegistration.anchors.push({wallId:'bottom',endpoint:'start',image:{x:0,y:0}});
    expect(()=>renderPlan2WorldDraftSvg(input,{source})).toThrow('accepted sourceRegistration');
  });

  it('reports invalid references and overflowing openings rather than repairing them',()=>{
    const input=draft();input.floors[0].doors[0].wallId='absent';
    expect(()=>renderPlan2WorldDraftSvg(input)).toThrow();
    input.floors[0].doors[0].wallId='top';input.floors[0].doors[0].width=600;
    expect(()=>renderPlan2WorldDraftSvg(input)).toThrow('extends beyond host');
  });

  it('projects semantic-only coordinates without claiming a footprint or changing the fixed JSON',()=>{
    const input=draft();
    input.floors[0].furniture=[{id:'chair',catalogId:'imported_object',sourceCategory:'chair',position:{x:150,y:225}}];
    const before=JSON.stringify(input);
    const svg=renderPlan2WorldDraftSvg(input);
    expect(svg).toContain('<circle data-element-id="chair" data-geometry="position" cx="150" cy="225"');
    expect(svg).toContain('chair (position only; size and direction deferred)');
    expect(svg).toContain('chair chair</text>');
    expect(svg).not.toContain('<polygon');
    const overlay=renderPlan2WorldDraftSvg(input,{source});
    expect(overlay).toContain('data-element-id="chair" data-geometry="position" cx="400" cy="550"');
    expect(JSON.stringify(input)).toBe(before);
    // Partial/legacy hints are still positions, never invented rectangles.
    delete input.presentation;input.floors[0].furniture[0].width=60;
    expect(renderPlan2WorldDraftSvg(input)).toContain('data-geometry="position"');
  });

  it('escapes labels and identifiers and rejects external or SVG image sources',()=>{
    const input=draft();input.name='<script>alert(1)</script>';input.floors[0].furniture[0].sourceCategory='sofa & "chair"';
    const svg=renderPlan2WorldDraftSvg(input);
    expect(svg).not.toContain('<script>');expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('sofa &amp; &quot;chair&quot;');
    expect(()=>renderPlan2WorldDraftSvg(input,{source:{...source,dataUrl:'https://example.com/source.svg'}})).toThrow('embedded PNG');
  });

  it('does not guess a floor or its source registration',()=>{
    expect(()=>renderPlan2WorldDraftSvg(draft(),{floorId:'missing'})).toThrow('Unknown floor');
    expect(renderPlan2WorldDraftSvg(draft(),{labels:false})).not.toContain('<text ');
  });
});
