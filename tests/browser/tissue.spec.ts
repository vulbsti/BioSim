import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const ready=async(page:Page,entities:number)=>{await expect(page.getByTestId('tissue-scene')).toHaveAttribute('data-entities',String(entities));await expect(page.getByTestId('tissue-scene')).toHaveAttribute('data-ready','true');};
test('tissue scales and geometry detail preserve entity selection, signaling time and saved view',async({page})=>{
 const errors:string[]=[],assets:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('.glb'))assets.push(r.url());});
 await page.goto('/#tissue');await ready(page,3);expect(assets.every(url=>url.includes('muscle-detail'))).toBe(true);
 await page.getByLabel('Tissue mechanism time').fill('900');await expect(page.getByLabel('Tissue surface GLUT4')).toHaveText('39.3 % pool');
 await page.getByRole('button',{name:'Explore fascicle',exact:true}).click();await ready(page,39);await page.getByLabel('Inspect tissue structure').selectOption('pilot-fiber-12');
 await page.getByRole('button',{name:'Enter muscle fiber',exact:true}).click();await ready(page,7);await expect(page.getByLabel('Tissue mechanism elapsed time')).toHaveText('15:00');await page.getByLabel('Inspect tissue structure').selectOption('pilot-myonuclei');
 await page.getByLabel('Tissue geometry detail').selectOption('context');await ready(page,7);await expect(page.getByLabel('Inspect tissue structure')).toHaveValue('pilot-myonuclei');await expect(page.getByTestId('tissue-scene')).toHaveAttribute('data-selected','pilot-myonuclei');
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Save tissue view',exact:true}).click();const file=await downloadPromise;const data=JSON.parse(await readFile((await file.path())!,'utf8'));expect(data.format).toBe('human-atlas/tissue-view');expect(data.experiment.time).toBe(900);
 await page.getByRole('navigation',{name:'Anatomical scale'}).getByRole('button').nth(1).click();await ready(page,39);await expect(page.getByLabel('Inspect tissue structure')).toHaveValue('pilot-fiber-12');
 await page.getByLabel('Tissue mechanism time').fill('300');await page.getByLabel('Import tissue view').setInputFiles((await file.path())!);await ready(page,7);await expect(page.getByLabel('Tissue geometry detail')).toHaveValue('context');await expect(page.getByLabel('Tissue mechanism elapsed time')).toHaveText('15:00');
 expect(errors).toEqual([]);
});
test('3D picking, exposed interiors and cross sections change rendered anatomy',async({page})=>{
 await page.goto('/#tissue');await ready(page,3);await page.getByRole('navigation',{name:'Anatomical scale'}).getByRole('button').nth(2).click();await ready(page,7);
 await page.getByLabel('Inspect tissue structure').selectOption('pilot-fiber-capillary');
 const canvas=page.getByTestId('tissue-scene').locator('canvas');const box=await canvas.boundingBox();await canvas.click({position:{x:box!.width/2,y:box!.height/2}});await expect(page.getByLabel('Inspect tissue structure')).not.toHaveValue('pilot-fiber-capillary');
 const uncut=await canvas.screenshot();await page.getByLabel('Tissue section plane').selectOption('cross');await page.getByLabel('Tissue section position').fill('0.5');await expect(page.getByTestId('tissue-scene')).toHaveAttribute('data-section','cross');expect((await canvas.screenshot()).equals(uncut)).toBe(false);
 await page.getByLabel('Tissue section plane').selectOption('none');await page.getByRole('button',{name:'View cut end',exact:true}).click();await expect(page.getByRole('button',{name:'View cut end',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByLabel('Show outer sheath',{exact:true}).uncheck();await page.screenshot({path:'test-results/tissue-cut-end.png',fullPage:true});
});
test('signaling overlay moves through time, pauses, and rejects invalid replay without replacing the view',async({page})=>{
 await page.goto('/#tissue');await ready(page,3);await page.getByRole('navigation',{name:'Anatomical scale'}).getByRole('button').nth(2).click();await ready(page,7);
 await page.getByLabel('Show signaling overlay').check();await page.getByLabel('Tissue mechanism time').fill('900');const canvas=page.getByTestId('tissue-scene').locator('canvas'),activated=await canvas.screenshot();
 await page.getByLabel('Tissue mechanism time').fill('3600');expect((await canvas.screenshot()).equals(activated)).toBe(false);await expect(page.getByLabel('Tissue surface GLUT4')).toHaveText('4.4 % pool');
 await page.getByLabel('Tissue mechanism time').fill('300');await page.getByRole('button',{name:'Play tissue signaling',exact:true}).click();await expect(page.getByLabel('Tissue mechanism elapsed time')).not.toHaveText('05:00');await page.getByRole('button',{name:'Pause tissue signaling',exact:true}).click();await page.waitForTimeout(300);
 const time=await page.getByLabel('Tissue mechanism elapsed time').textContent(),still=await canvas.screenshot();await page.waitForTimeout(200);expect((await canvas.screenshot()).equals(still)).toBe(true);
 await page.getByLabel('Import tissue view').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from('{"schema":1,"format":"human-atlas/mechanism-experiment"}')});await expect(page.locator('.tissue-notice')).toContainText('not a compatible');await expect(page.getByLabel('Tissue mechanism elapsed time')).toHaveText(time!);await expect(page.getByRole('heading',{name:'Inside a muscle fiber',exact:true})).toBeVisible();
});
for(const width of [320,390])test(`tissue inspection and controls fit ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/#tissue');await ready(page,3);await page.getByRole('navigation',{name:'Anatomical scale'}).getByRole('button').nth(2).click();await ready(page,7);
 await page.getByLabel('Inspect tissue structure').selectOption('pilot-mitochondria');await page.getByLabel('Tissue section plane').selectOption('longitudinal');await page.getByLabel('Tissue section position').fill('0.6');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`test-results/tissue-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Whole-body physiology',exact:true}).click();await expect(page.getByRole('heading',{name:'A body in balance.'})).toBeVisible();await page.getByRole('button',{name:'Explore tissue in 3D',exact:true}).click();await expect(page.getByRole('heading',{name:'A muscle, from the inside.'})).toBeVisible();
});
test('failed tissue asset produces a visible error with usable navigation',async({page})=>{
 await page.route('**/muscle-detail.glb',r=>r.fulfill({status:503,body:'Unavailable'}));await page.goto('/#tissue');await expect(page.getByRole('alert')).toContainText('specimen could not be loaded');await expect(page.getByRole('button',{name:'Whole-body physiology',exact:true})).toBeEnabled();
});
