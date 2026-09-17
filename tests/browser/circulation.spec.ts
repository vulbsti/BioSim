import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const ready=async(page:Page)=>expect(page.locator('.circ-run-status')).toContainText('Experiment ready');
test('circulation moves, freezes when paused, and preserves the physical run while inspecting the fiber',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#circulation');await ready(page);
 const map=page.getByRole('group',{name:'Closed circulation flow map'});await page.getByLabel('Circulation time',{exact:true}).fill('10');
 const initial=await map.screenshot();await page.getByRole('button',{name:'Play circulation',exact:true}).click();await page.waitForTimeout(400);expect((await map.screenshot()).equals(initial)).toBe(false);
 await page.getByRole('button',{name:'Pause circulation',exact:true}).click();const paused=await map.screenshot();await page.waitForTimeout(300);expect((await map.screenshot()).equals(paused)).toBe(true);
 await page.getByLabel('Circulation time',{exact:true}).fill('180');const time=await page.getByLabel('Circulation elapsed time').textContent(),glut4=await page.getByLabel('Circulation surface GLUT4').textContent();
 await page.getByRole('tab',{name:'Muscle fiber',exact:true}).click();await expect(page.getByTestId('tissue-scene')).toHaveAttribute('data-ready','true');await expect(page.getByLabel('Circulation elapsed time')).toHaveText(time!);await expect(page.getByLabel('Circulation surface GLUT4')).toHaveText(glut4!);
 await page.getByLabel('Circulation tissue structure').selectOption('pilot-myonuclei');await expect(page.getByTestId('tissue-scene')).toHaveAttribute('data-selected','pilot-myonuclei');
 await page.getByRole('tab',{name:'Flow map',exact:true}).click();await page.getByRole('button',{name:'Inspect Hepatic vascular bed',exact:true}).click();await expect(page.getByLabel('Inspect circulation compartment')).toHaveValue('liver');expect(errors).toEqual([]);
});
test('transport interventions recompute local exposure and saved experiments replay safely',async({page})=>{
 await page.goto('/#circulation');await ready(page);await page.getByLabel('Circulation time',{exact:true}).fill('300');const baseline=await page.getByLabel('Muscle interstitial insulin',{exact:true}).textContent();expect(parseFloat(baseline!)).toBeGreaterThan(0);
 await page.getByLabel('Muscle insulin exchange').fill('0');await page.getByRole('button',{name:'Run experiment',exact:true}).click();await ready(page);await page.getByLabel('Circulation time',{exact:true}).fill('300');await expect(page.getByLabel('Muscle interstitial insulin',{exact:true})).toHaveText('0.0 pM');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save circulation experiment',exact:true}).click();const file=await download,path=(await file.path())!;const data=JSON.parse(await readFile(path,'utf8'));expect(data.config.exchange).toBe(0);expect(data.time).toBe(300);
 await page.getByLabel('Muscle insulin exchange').fill('1');await page.getByRole('button',{name:'Run experiment',exact:true}).click();await ready(page);
 await page.getByLabel('Import circulation experiment').setInputFiles(path);await ready(page);await expect(page.getByLabel('Circulation elapsed time')).toHaveText('05:00');await expect(page.getByLabel('Muscle interstitial insulin',{exact:true})).toHaveText('0.0 pM');
 await page.getByLabel('Import circulation experiment').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"schema":1}')});await expect(page.getByRole('alert')).toContainText('not a compatible');await expect(page.getByLabel('Circulation elapsed time')).toHaveText('05:00');
});
for(const width of [320,390])test(`circulation controls and flow map fit ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/#circulation');await ready(page);await page.getByLabel('Insulin pulse route').selectOption('venous');await page.getByRole('button',{name:'Run experiment',exact:true}).click();await expect(page.locator('.circ-run-status')).toContainText('systemic vein');
 await page.getByLabel('Circulation time',{exact:true}).fill('120');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`test-results/circulation-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Whole-body physiology',exact:true}).click();await page.getByRole('button',{name:'Trace hormone circulation',exact:true}).click();await expect(page.getByRole('heading',{name:'A hormone, in circulation.'})).toBeVisible();
});
