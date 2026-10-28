import{describe,it,expect}from'vitest';
import{compileWallDecorAsset}from'$lib/runtime/runtimeAssets';
import{compileRuntimeArtifacts}from'$lib/runtime/runtimeArtifacts';
import{applyFurnitureLayoutCommand,furnitureLayoutCatalog}from'$lib/runtime/furnitureLayout';
import{readProject}from'$lib/utils/projectValidation';
import{runtimeProductProject}from'../tooling/runtime-product-fixture.mjs';
import{createHash}from'node:crypto';

describe('generic authored wall decor assets',()=>{
  it.each(['wall_art','mirror'])('compiles a deterministic %s asset with independent mount/collision',async catalogId=>{
    const source=readProject(await runtimeProductProject()),before=JSON.stringify(source),base=await compileRuntimeArtifacts(source,async()=>null);
    const candidate=applyFurnitureLayoutCommand(source,{type:'add',floorId:'ground',position:{x:600,y:200},asset:{catalogId},wallMount:{wallId:'ground-w0',side:'left',elevation:110}});
    const a=await compileRuntimeArtifacts(candidate.project,async()=>null),b=await compileRuntimeArtifacts(candidate.project,async()=>null);
    expect(a).toEqual(b);expect(a.architectureGlb).toEqual(base.architectureGlb);expect(JSON.stringify(source)).toBe(before);
    const ref=`builtin:${catalogId}-v1`,descriptor=a.assets.manifest.assets.find(asset=>asset.id===ref)!;
    expect(descriptor).toBeDefined();expect(a.assets.diagnostics.some(d=>d.assetRef===ref)).toBe(false);
    const bytes=a.assets.files.get(descriptor.uri)!;expect(createHash('sha256').update(bytes).digest('hex')).toBe(descriptor.sha256);expect(bytes).toEqual(compileWallDecorAsset(catalogId));
    expect(a.runtime.entities.find(e=>e.id===candidate.selectedId)).toMatchObject({kind:'furniture',assetRef:ref,movement:{kind:'wall',wallId:'ground-w0'}});
    expect(a.runtime.colliders.some(c=>c.ownerId===candidate.selectedId)).toBe(true);
  });
  it('labels unsupported catalog presentation without turning semantic markers into product models',async()=>{
    const project=readProject(await runtimeProductProject()),catalog=furnitureLayoutCatalog(project);
    expect(catalog.find(c=>c.asset.catalogId==='wall_art')?.presentation).toBe('model');
    expect(catalog.find(c=>c.asset.catalogId==='fireplace')?.presentation).toBe('placeholder');
    expect(catalog.some(c=>c.asset.catalogId==='imported_object')).toBe(false);
    project.floors[0].furniture.push({id:'semantic',catalogId:'imported_object',sourceCategory:'bed',position:{x:650,y:750},rotation:0,scale:{x:1,y:1,z:1}});
    const artifacts=await compileRuntimeArtifacts(project,async()=>null);
    expect(artifacts.runtime.entities.find(e=>e.id==='semantic')).toMatchObject({assetRef:'catalog:imported_object',sourceCategory:'bed'});
    expect(artifacts.assets.diagnostics).toContainEqual({assetRef:'catalog:imported_object',reason:'no-model'});
  });
});
