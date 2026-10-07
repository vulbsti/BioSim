import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test.use({reducedMotion:'reduce'});
async function recording(page:Page,label:string){
 const pending=page.waitForEvent('download');
 await page.getByRole('button',{name:label,exact:true}).click();
 const download=await pending,path=(await download.path())!;
 return {path,data:JSON.parse(await readFile(path,'utf8'))};
}

test('body pathway survives tissue inspection and resumes its exact committed state',async({page})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.getByLabel('Physical insulin sensitivity').selectOption('1');
 await expect(page.getByLabel('Physical insulin sensitivity')).toHaveValue('1');
 await page.getByRole('button',{name:'Introduce meal',exact:false}).click();
 await page.getByRole('button',{name:'Advance five minutes'}).click();
 await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:05:00',{timeout:60000});
 const before=await recording(page,'Export run');
 expect(before.data.state.multiscaleMeal.enabled).toBe(true);
 expect(before.data.state.multiscaleMeal.muscleUptakeG).toBeGreaterThan(0);
 expect(before.data.state.transport.cumulativeFluxes.some((f:{from:string;to:string;amount:number})=>f.from==='muscle-tissue'&&f.to==='muscle-cell'&&f.amount>0)).toBe(true);
 await page.getByRole('button',{name:/Explore tissue in 3D/}).click();
 await expect(page.getByRole('region',{name:'Linked body experiment'})).toBeVisible();
 await expect(page.getByLabel('Linked body elapsed time')).toHaveText('05:00');
 await expect(page.getByLabel('Tissue surface GLUT4')).toContainText(before.data.state.multiscaleMeal.circulation[45].toFixed(2));
 await expect(page.getByRole('button',{name:'Play tissue signaling',exact:true})).toHaveCount(0);
 await expect(page.getByLabel('Enable excitation experiment')).toHaveCount(0);
 await page.getByRole('button',{name:'03 Muscle fiber',exact:false}).click();
 await expect(page.locator('.tissue-ready')).toContainText('Specimen ready');
 await page.getByLabel('Tissue geometry detail').selectOption('context');
 await page.getByLabel('Tissue section plane').selectOption('cross');
 await page.getByRole('button',{name:'View cut end',exact:true}).click();
 await expect(page.locator('.tissue-ready')).toContainText('Specimen ready');
 await expect(page.getByLabel('Linked body elapsed time')).toHaveText('05:00');
 const after=await recording(page,'Save body run');
 expect(after.data.state).toEqual(before.data.state);
 await page.getByRole('button',{name:'Play linked body run',exact:true}).click();
 await expect(page.getByLabel('Linked body elapsed time')).not.toHaveText('05:00');
 await page.getByRole('button',{name:'Pause linked body run',exact:true}).click();
 await expect(page.getByRole('button',{name:'Play linked body run',exact:true})).toBeVisible();
 const paused=await recording(page,'Save body run');
 expect(paused.data.state.time).toBeGreaterThan(before.data.state.time);
 // Observe multiple 250 ms worker ticks to prove linked pause freezes body state.
 await page.waitForTimeout(750);
 expect((await recording(page,'Save body run')).data.state).toEqual(paused.data.state);
 await page.getByRole('button',{name:'Whole-body physiology',exact:true}).click();
 await page.getByRole('button',{name:'Reset entire simulation'}).click();
 await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:00:00');
 await page.getByLabel('Import simulation recording').setInputFiles(after.path);
 await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:05:00');
 expect((await recording(page,'Export run')).data.state).toEqual(before.data.state);
 await page.getByRole('button',{name:'Advance five minutes'}).click();
 await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:10:00',{timeout:60000});
 expect((await recording(page,'Export run')).data.state.multiscaleMeal.muscleUptakeG).toBeGreaterThan(before.data.state.multiscaleMeal.muscleUptakeG);
 // This controlled checkbox acknowledges the worker reply, not the click's DOM event.
 await page.getByRole('checkbox',{name:'Fork a comparison'}).click();
 await expect(page.getByRole('checkbox',{name:'Fork a comparison'})).toBeChecked();
 await page.getByLabel('Physical insulin sensitivity').selectOption('0.35');
 await expect(page.getByLabel('Physical insulin sensitivity')).toHaveValue('0.35');
 await expect(page.getByRole('checkbox',{name:'Fork a comparison'})).toBeChecked();
 const comparison=(await recording(page,'Export run')).data;
 expect(comparison.state.multiscaleMeal.sensitivity).toBe(.35);
 expect(comparison.reference.multiscaleMeal.sensitivity).toBe(1);
 expect(comparison.state.multiscaleMeal.circulation).toEqual(comparison.reference.multiscaleMeal.circulation);
 expect(errors).toEqual([]);
});

for(const width of [320,390])test(`linked body observations fit ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/');
 await page.getByLabel('Physical insulin sensitivity').selectOption('0.35');
 await expect(page.getByLabel('Physical insulin sensitivity')).toHaveValue('0.35');
 await page.getByRole('button',{name:/Explore tissue in 3D/}).click();
 await expect(page.getByRole('region',{name:'Linked body experiment'})).toBeVisible();
 await expect(page.getByLabel('Linked body elapsed time')).toHaveText('00:00');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('region',{name:'Linked body experiment'}).screenshot({path:`test-results/p4-linked-${width}.png`});
});

test('a refined muscle patch runs in the body worker and exports conserved shell state',async({page})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.getByLabel('Physical insulin sensitivity').selectOption('1');
 await page.getByLabel('Refined muscle patch').selectOption('0.05');
 await expect(page.getByLabel('Refined muscle patch')).toHaveValue('0.05');
 await page.getByRole('button',{name:'Introduce meal',exact:false}).click();
 await page.getByRole('button',{name:'Advance five minutes'}).click();
 await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:05:00',{timeout:60000});
 const run=await recording(page,'Export run'),m=run.data.state.multiscaleMeal;
 expect(m.patchFraction).toBe(0.05);
 expect(m.patchInsulinMol).toHaveLength(4);
 expect(m.patchUptakeG).toBeGreaterThan(0);
 expect(m.patchInsulinMol[0]/1).toBeGreaterThan(m.patchInsulinMol[3]/7*1);
 await page.getByLabel('Refined muscle patch').selectOption('0');
 await expect(page.getByLabel('Refined muscle patch')).toHaveValue('0');
 const coarse=await recording(page,'Export run');
 expect(coarse.data.state.multiscaleMeal.patchFraction).toBe(0);
 expect(coarse.data.state.multiscaleMeal.muscleUptakeG).toBeCloseTo(m.muscleUptakeG+m.patchUptakeG,12);
 expect(errors).toEqual([]);
});
