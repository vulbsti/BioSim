import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const setup=async(page:Page)=>{
 await page.goto('/#tissue');await page.getByRole('navigation',{name:'Anatomical scale'}).getByRole('button').nth(3).click();
 await expect(page.getByTestId('tissue-scene')).toHaveAttribute('data-entities','6');
 await page.getByLabel('Enable excitation experiment').check();
 await expect(page.getByRole('region',{name:'Muscle excitation experiment'})).toHaveAttribute('data-result','single:1',{timeout:30000});
};
test('source excitation changes calcium and bridge overlays at fixed length; playback freezes and saves across scales',async({page})=>{
 test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
 const scene=page.getByTestId('tissue-scene'),canvas=scene.locator('canvas');
 await expect(page.getByLabel('Sarcomere length',{exact:true})).toBeDisabled();await expect(page.getByLabel('Sarcomere length value')).toHaveText('2.50 µm');
 await page.getByLabel('Excitation playhead').fill('5');await scene.scrollIntoViewIfNeeded();await expect(scene).not.toHaveAttribute('data-excitation','off');
 const activated=await canvas.screenshot();const early=await page.getByLabel('Excitation free calcium').textContent();
 await page.getByLabel('Excitation playhead').fill('250');await scene.scrollIntoViewIfNeeded();expect((await canvas.screenshot()).equals(activated)).toBe(false);await expect(page.getByLabel('Excitation free calcium')).not.toHaveText(early!);
 await page.getByLabel('Excitation playhead').fill('20');await page.getByRole('button',{name:'Play activation in scene',exact:true}).click();await expect(page.getByLabel('Excitation time')).not.toHaveText('20.0 ms');await page.getByRole('button',{name:'Pause activation in scene',exact:true}).click();
 const frozen=await page.getByLabel('Excitation time').textContent();await page.waitForTimeout(150);await expect(page.getByLabel('Excitation time')).toHaveText(frozen!);
 await page.getByLabel('Excitation playhead').fill('17.5');const value=await page.getByLabel('Excitation post stroke').textContent();
 await page.getByRole('navigation',{name:'Anatomical scale'}).getByRole('button').nth(2).click();await expect(scene).toHaveAttribute('data-entities','7');await expect(page.getByLabel('Excitation post stroke')).toHaveText(value!);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save tissue view',exact:true}).click();const file=await download,path=(await file.path())!,data=JSON.parse(await readFile(path,'utf8'));
 expect(data.excitation.timeMs).toBe(17.5);expect(data.excitationModel).toContain('shorten2007');
 await page.getByLabel('Enable excitation experiment').uncheck();await page.getByLabel('Import tissue view').setInputFiles(path);
 await expect(page.getByRole('region',{name:'Muscle excitation experiment'})).toHaveAttribute('data-result','single:1',{timeout:30000});await expect(page.getByLabel('Excitation time')).toHaveText('17.5 ms');await expect(page.getByLabel('Excitation post stroke')).toHaveText(value!);await expect(page.getByRole('button',{name:'Play excitation',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
test('blocking SR release retains the action potential but suppresses calcium activation',async({page})=>{
 test.setTimeout(90000);const reference=JSON.parse(await readFile('validation/p5/excitation-reference.json','utf8'));
 const expected=(name:string)=>reference.results.find((r:{name:string})=>r.name===name).samples.find((s:{timeMs:number})=>s.timeMs===5).state[30];
 await setup(page);await page.getByLabel('Excitation playhead').fill('5');const baseline=parseFloat((await page.getByLabel('Excitation free calcium').textContent())!);expect(baseline).toBeCloseTo(expected('single'),3);
 await page.getByLabel('SR calcium release').selectOption('0');await expect(page.getByRole('region',{name:'Muscle excitation experiment'})).toHaveAttribute('data-result','single:0',{timeout:30000});
 await page.getByLabel('Excitation playhead').fill('5');const blocked=parseFloat((await page.getByLabel('Excitation free calcium').textContent())!);expect(blocked).toBeCloseTo(expected('blocked-release'),3);expect(blocked).toBeLessThan(baseline);
 await page.getByLabel('Excitation playhead').fill('1');expect(parseFloat((await page.getByLabel('Excitation membrane voltage').textContent())!)).toBeGreaterThan(-40);
 await page.getByLabel('Excitation stimulus').selectOption('none');await expect(page.getByRole('region',{name:'Muscle excitation experiment'})).toHaveAttribute('data-result','none:0',{timeout:30000});await page.getByLabel('Excitation playhead').fill('1');expect(parseFloat((await page.getByLabel('Excitation membrane voltage').textContent())!)).toBeLessThan(-70);
});
test('activation controls and traces fit a narrow phone',async({page})=>{
 await page.setViewportSize({width:320,height:844});await setup(page);await page.getByLabel('Excitation playhead').fill('10');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page.getByRole('img',{name:'Myoplasmic calcium over 500 milliseconds'})).toBeVisible();
});
