import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { captureCanvas } from './canvas-pixels';

for (const width of [1440,390]) test(`native opening edits and undo stay live in 3D Review at ${width}px`, async ({page},testInfo) => {
  await page.setViewportSize({width,height:900});
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  const plan=JSON.parse(await readFile('tests/fixtures/connected-dimensions.openplan.json','utf8'));
  plan.id='review-opening'; plan.name='Native review opening';
  const floor=plan.floors[0]; floor.rooms=[]; floor.windows=[]; floor.elevation=300;
  floor.walkthroughStart={x:300,y:350};
  floor.walls.push({id:'divider',start:{x:0,y:200},end:{x:600,y:200},thickness:20,height:280,color:'#444444'});
  floor.doors=[{id:'passage',wallId:'divider',position:0.5,width:30,height:210,type:'opening',swingDirection:'left'}];
  await page.addInitScript(()=>{
    localStorage.setItem('o3d_locale','en');
    localStorage.setItem('o3d_tips_seen',JSON.stringify(['first-3d','first-door','first-export']));
  });
  await page.goto('/editor');
  await page.getByRole('button',{name:'Export',exact:true}).click();
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Import JSON',exact:true}).click();
  await (await chooser).setFiles({name:'native-review.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plan))});
  const canvas=page.getByRole('region',{name:'3D floor plan viewer'}).locator('canvas').first();
  const pixels=async()=>createHash('sha256').update(await captureCanvas(canvas)).digest('hex');
  async function review(){
    await page.getByRole('button',{name:'3D',exact:true}).click();
    await expect(canvas).toHaveAttribute('data-rendered','true');
    await page.getByRole('button',{name:/1\.20 m/}).click();
    await expect(canvas).toHaveAttribute('data-architectural-cut','120');
    await page.waitForTimeout(350);
    await expect(page.getByRole('button',{name:'Enter Walkthrough Mode',exact:true})).toHaveCount(0);
  }
  await review();
  const narrow=await pixels();
  await page.getByRole('button',{name:'2D',exact:true}).click();
  await page.getByRole('button',{name:'Save',exact:true}).press('l');
  await page.getByRole('button',{name:/opening door 1/i}).click();
  const openingWidth=page.locator('[data-quick-opening-width]');
  await expect(openingWidth).toHaveValue('30');
  await openingWidth.fill('90'); await openingWidth.press('Enter');
  await page.keyboard.press('Escape');
  await review();
  const wide=await pixels(); expect(wide).not.toBe(narrow);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  await expect.poll(pixels).not.toBe(wide);
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await testInfo.attach('native-opening-review',{body:await page.screenshot(),contentType:'image/png'});
  await page.getByRole('button',{name:'2D',exact:true}).click();
  await page.getByRole('button',{name:'Export',exact:true}).click();
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download JSON',exact:true}).click();
  const saved=JSON.parse(await readFile((await (await download).path())!,'utf8')).floors[0];
  expect(saved.walkthroughStart).toEqual(floor.walkthroughStart);
  expect(saved.elevation).toBe(300); expect(saved.walls).toEqual(floor.walls); expect(saved.doors[0].width).toBe(90);
  expect(errors).toEqual([]);
});
