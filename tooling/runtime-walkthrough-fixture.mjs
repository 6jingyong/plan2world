#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeAssetProject } from './runtime-asset-fixture.mjs';

export async function runtimeWalkthroughProject() {
  const project = /** @type {Record<string, any>} */ (await runtimeAssetProject());
  project.id = 'runtime-walkthrough';
  project.name = 'Native multi-floor runtime walkthrough';
  /**
   * @param {string} id
   * @param {number} level
   * @param {number} elevation
   * @returns {import('../src/lib/models/types').Floor}
   */
  function floor(id, level, elevation) {
    const points = [[0,0], [1200,0], [1200,1200], [0,1200]];
    /** @type {import('../src/lib/models/types').Wall[]} */
    const walls = points.map(([x,y], i) => ({ id: `${id}-w${i}`, start: {x,y},
      end: {x:points[(i+1)%4][0], y:points[(i+1)%4][1]}, thickness:20, height:300, color:'#ccc' }));
    walls[1].curvePoint = {x:1300, y:600};
    return { id, name:id, level, elevation, walls, doors:[], windows:[], furniture:[], stairs:[], columns:[],
      rooms:[{ id:`${id}-stairwell`, name:'Stairwell', walls:[], floorTexture:'concrete', area:0, floorOpening:true,
        boundary:[[800,300],[1000,300],[1000,900],[800,900]].map(([x,y])=>({point:{x,y}})) }],
      guides:[], measurements:[], annotations:[], textAnnotations:[], groups:[] };
  }
  const ground = floor('ground', 0, 40), upper = floor('upper', 1, 340);
  ground.walkthroughStart = {x:300,y:800};
  for (const [id,z,type] of /** @type {const} */ ([['swing',600,'single'],['slide',400,'sliding']])) {
    ground.walls.push({id, start:{x:0,y:z}, end:{x:500,y:z}, thickness:20, height:300,color:'#ccc'});
    ground.doors.push({id:`${id}-door`, wallId:id, position:0.6, width:100, height:220, type, swingDirection:'left', flipSide:false});
  }
  ground.furniture = [{id:'sofa',catalogId:'sofa',position:{x:500,y:200},rotation:0,scale:{x:1,y:1,z:1},width:100,depth:100,height:100},
    {id:'custom',catalogId:'imported_object',customModelId:'box',position:{x:700,y:200},rotation:30,scale:{x:1,y:1,z:1}}];
  ground.columns = [{id:'column',position:{x:700,y:700},rotation:0,shape:'round',diameter:50,height:300,color:'#aaa'}];
  ground.windows = [{id:'window',wallId:'ground-w3',position:0.5,width:120,height:140,sillHeight:90,type:'fixed'}];
  ground.stairs = [{id:'stairs',position:{x:900,y:600},rotation:0,width:100,depth:600,riserCount:18,direction:'up',stairType:'straight'}];
  for (const [id, y, type, flipSide] of /** @type {const} */ ([['double', 900, 'double', false], ['french', 1050, 'french', true]])) {
    ground.walls.push({ id: `${id}-wall`, start: {x:0,y}, end: {x:600,y}, thickness:20, height:300, color:'#ccc' });
    ground.doors.push({ id: `${id}-door`, wallId: `${id}-wall`, position:0.5, width:160, height:220, type, swingDirection:'left', flipSide });
  }
  ground.walls.push(
    {id:'railing', start:{x:700,y:1100}, end:{x:1100,y:1100}, thickness:15, height:110, color:'#ccc', boundaryType:'railing'},
    {id:'air', start:{x:700,y:1000}, end:{x:1100,y:1000}, thickness:15, height:300, color:'#ccc', boundaryType:'air'},
  );
  project.floors = [ground,upper]; project.activeFloorId = ground.id;
  return project;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2]);
  await mkdir(directory,{recursive:true});
  const input = path.join(directory,'walkthrough.project.json');
  await writeFile(input,JSON.stringify(await runtimeWalkthroughProject()));
  execFileSync(process.execPath,['tooling/runtime-export.mjs',input,path.join(directory,'walkthrough.runtime.json')],{stdio:'inherit'});
}
