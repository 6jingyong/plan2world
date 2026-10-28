import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('explicit door panels apply atomically, survive save/reopen and use browser Undo',async({page})=>{
  await page.goto('/editor');
  await page.getByRole('button',{name:/^Draw Wall W/}).click();
  const canvas=page.getByLabel('Floor plan editor canvas',{exact:true});
  await canvas.click({position:{x:100,y:250}});await canvas.click({position:{x:700,y:250}});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'⊞ Fit',exact:true}).click();
  const bounds=(await canvas.boundingBox())!;
  await page.getByRole('button',{name:'Sliding 180cm slide',exact:true}).click();
  await canvas.click({position:{x:bounds.width*.5,y:bounds.height*.5}});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Toggle Layers Panel',exact:true}).click();
  await page.getByRole('button',{name:/🚪.*sliding.*1/i}).click();
  const fields=page.getByRole('group',{name:'Door panels / 门叶配置'});
  await fields.getByRole('combobox',{name:'Starting configuration / 起始配置'}).selectOption('three-track');
  const saved=async()=>{
    await page.getByRole('button',{name:'Export',exact:true}).click();const pending=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download JSON',exact:true}).click();return JSON.parse(await readFile((await(await pending).path())!,'utf8'));
  };
  expect((await saved()).floors[0].doors[0].leafConfiguration).toBeUndefined();
  await fields.getByRole('button',{name:'Apply panels / 应用',exact:true}).click();
  const accepted=await saved();expect(accepted.floors[0].doors[0].leafConfiguration.leaves).toHaveLength(3);
  await fields.getByRole('spinbutton',{name:'panel-2 Width / 宽',exact:true}).fill('0');
  await fields.getByRole('button',{name:'Apply panels / 应用',exact:true}).click();await expect(fields.getByRole('alert')).toBeVisible();
  expect((await saved()).floors[0].doors).toEqual(accepted.floors[0].doors);
  await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await saved()).floors[0].doors[0].leafConfiguration).toBeUndefined();
  await page.getByRole('button',{name:'Redo',exact:true}).click();expect((await saved()).floors[0].doors).toEqual(accepted.floors[0].doors);
  await page.getByRole('button',{name:'Export',exact:true}).click();const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Import JSON',exact:true}).click();await(await chooser).setFiles({name:'panels.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(accepted))});
  expect((await saved()).floors[0].doors).toEqual(accepted.floors[0].doors);
});
