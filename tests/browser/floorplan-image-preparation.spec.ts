import { expect,test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createFloorPlanAIProvider,type FloorPlanProviderRequest } from '../fixtures/floorplan-ai-provider';
import { listenTestProvider } from '../fixtures/ai-provider';

test('phone JPEG direction is normalized once before local preview without a provider',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:/Generate from floor-plan image/}).click();
  const jpeg=Buffer.from(await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=96;canvas.height=64;const c=canvas.getContext('2d')!;
    c.fillStyle='#f00';c.fillRect(0,0,48,64);c.fillStyle='#00f';c.fillRect(48,0,48,64);return canvas.toDataURL('image/jpeg',.95).split(',')[1];
  }),'base64');
  const exif=Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');
  await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({name:'phone-exif6.jpg',mimeType:'image/jpeg',buffer:Buffer.concat([jpeg.subarray(0,2),exif,jpeg.subarray(2)])});
  const preview=page.getByRole('img',{name:'Prepared floor plan',exact:true});await expect(preview).toBeVisible();
  const pixels=await preview.evaluate(async(element:HTMLImageElement)=>{
    await element.decode();const canvas=document.createElement('canvas');canvas.width=element.naturalWidth;canvas.height=element.naturalHeight;const c=canvas.getContext('2d')!;c.drawImage(element,0,0);
    return {width:canvas.width,height:canvas.height,top:[...c.getImageData(32,10,1,1).data],bottom:[...c.getImageData(32,85,1,1).data]};
  });
  expect([pixels.width,pixels.height]).toEqual([64,96]);expect(pixels.top[0]).toBeGreaterThan(230);expect(pixels.bottom[2]).toBeGreaterThan(230);
});

for(const width of [1440,390])test(`photo correction is confirmed before two observations and survives native save at ${width}px`,async({page})=>{
  test.setTimeout(90_000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const requests:FloorPlanProviderRequest[]=[],provider=createFloorPlanAIProvider(request=>requests.push(request)),url=await listenTestProvider(provider);
  try{
    await page.setViewportSize({width,height:1000});
    await page.addInitScript(()=>localStorage.setItem('o3d_tips_seen',JSON.stringify(['first-3d','first-export','first-door'])));
    await page.goto('/');await page.getByRole('button',{name:/Generate from floor-plan image/}).click();
    await page.getByRole('button',{name:'Configure',exact:true}).click();
    await page.getByLabel('Provider base URL',{exact:true}).fill(url+'/v1');await page.getByLabel('OpenAI model',{exact:true}).fill('synthetic-photo-transport');
    await page.getByRole('button',{name:'Save OpenAI settings',exact:true}).click();
    const original=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=800;canvas.height=600;const c=canvas.getContext('2d')!;
      c.fillStyle='#b4a185';c.fillRect(0,0,800,600);c.fillStyle='#fff';c.beginPath();c.moveTo(80,60);c.lineTo(720,120);c.lineTo(680,540);c.lineTo(120,510);c.closePath();c.fill();
      c.strokeStyle='#111';c.lineWidth=5;c.strokeRect(180,180,400,240);c.fillStyle='#d33';c.fillRect(250,150,100,15);return canvas.toDataURL();
    });
    await page.locator('input[type="file"][accept="image/png,image/jpeg,image/webp"]').setInputFiles({name:'synthetic-phone.png',mimeType:'image/png',buffer:Buffer.from(original.split(',')[1],'base64')});
    await expect(page.getByRole('button',{name:'Generate reconstruction',exact:true})).toBeEnabled();
    await page.getByLabel('Correct a photographed rectangle',{exact:true}).check();
    await expect(page.getByRole('button',{name:'Generate reconstruction',exact:true})).toBeDisabled();
    await page.getByLabel('Rectangle proportion',{exact:true}).selectOption('0:1');
    await page.getByLabel('Reference rectangle width',{exact:true}).fill('4');await page.getByLabel('Reference rectangle height',{exact:true}).fill('3');await page.getByLabel('Output width (px)',{exact:true}).fill('400');
    const svg=page.getByRole('application',{name:'Adjust paper corners'});await svg.scrollIntoViewIfNeeded();
    const target=[[.1,.1],[.9,.2],[.85,.9],[.15,.85]],names=['Top left','Top right','Bottom right','Bottom left'];
    for(let i=0;i<4;i++){
      const handle=page.getByRole('button',{name:names[i]+' corner',exact:true}),box=(await handle.boundingBox())!,rect=(await svg.boundingBox())!;
      await page.mouse.move(Math.max(rect.x+2,Math.min(rect.x+rect.width-2,box.x+box.width/2)),Math.max(rect.y+2,Math.min(rect.y+rect.height-2,box.y+box.height/2)));
      await page.mouse.down();await page.mouse.move(rect.x+target[i][0]*rect.width,rect.y+target[i][1]*rect.height,{steps:3});await page.mouse.up();
    }
    await page.getByRole('button',{name:'Preview prepared image',exact:true}).click();
    const prepared=page.getByRole('img',{name:'Prepared floor plan',exact:true});await expect(prepared).toBeVisible();
    await expect(page.getByRole('button',{name:'Generate reconstruction',exact:true})).toBeDisabled();expect(requests).toEqual([]);
    const working=await prepared.getAttribute('src');expect(working).not.toBe(original);
    await page.getByRole('button',{name:'Use prepared image',exact:true}).click();
    await page.getByRole('button',{name:'Generate reconstruction',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Review reconstructed plan',exact:true})).toBeVisible();
    expect(requests).toHaveLength(2);
    for(const request of requests)expect(request.body.input[0].content[0].image_url).toBe(working);
    await expect(page.getByRole('img',{name:'Source floor plan',exact:true})).toHaveAttribute('src',working!);
    await page.getByRole('button',{name:'Open editable home',exact:true}).click();await expect(page).toHaveURL(/\/editor\?id=/);
    await page.getByRole('button',{name:'Save',exact:true}).click();await page.reload();
    await page.getByRole('button',{name:'Export',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download JSON',exact:true}).click();
    const project=JSON.parse(await readFile((await (await pending).path())!,'utf8')),evidence=project.reconstruction.inputPreparation;
    expect(project.floors[0].backgroundImage.dataUrl).toBe(working);expect(evidence.originalDataUrl).toBe(original);expect(evidence.manifest.width).toBe(400);expect(evidence.manifest.height).toBe(300);
    for(let i=0;i<4;i++){expect(evidence.manifest.recipe.corners[i].x).toBeCloseTo(target[i][0],2);expect(evidence.manifest.recipe.corners[i].y).toBeCloseTo(target[i][1],2);}
    expect(errors).toEqual([]);
  }finally{provider.closeAllConnections();await new Promise<void>(resolve=>provider.close(()=>resolve()));}
});
