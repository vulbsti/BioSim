import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test.use({reducedMotion:'reduce'});

test('meal, worker time, chart, hormone inspection, comparison and export are connected',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'A body in balance.'})).toBeVisible();
 await page.getByRole('checkbox',{name:'Fork a comparison'}).click();await expect(page.getByRole('checkbox',{name:'Fork a comparison'})).toBeChecked();
 await page.getByRole('button',{name:'Introduce meal',exact:false}).click();
 await page.getByRole('button',{name:'Advance five minutes'}).click();
 await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:05:00');
 await page.getByRole('button',{name:'Advance one hour'}).click();await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('01:05:00');
 await page.getByRole('tab',{name:'Hormones',exact:true}).click();await page.locator('.hormone-cards').getByRole('button',{name:/^Insulin/}).click();
 await expect(page.locator('.sim-inspector h2')).toHaveText('Insulin');await expect(page.getByText('Secretion rate',{exact:true})).toBeVisible();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export run'}).click();const download=await downloadPromise;
 const run=JSON.parse(await readFile((await download.path())!,'utf8'));
 expect(run.state.time).toBe(3900);expect(run.state.carbIn).toBe(60);expect(run.reference.carbIn).toBe(0);expect(run.state.hormones.insulin).toBeGreaterThan(run.reference.hormones.insulin);
 expect(run.state.receipts.some((e:{title:string})=>e.title==='Custom meal')).toBe(true);
 await page.getByRole('button',{name:'Reset entire simulation'}).click();await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:00:00');
 await page.getByLabel('Import simulation recording').setInputFiles((await download.path())!);await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('01:05:00');
 expect(errors).toEqual([]);
});

test('scheduled input can be cancelled and playback pauses',async({page})=>{
 await page.goto('/');await page.getByLabel('Input timing').selectOption('5');await page.getByRole('button',{name:'Introduce meal',exact:false}).click();
 await expect(page.getByRole('button',{name:'Cancel Custom meal'})).toBeVisible();await page.getByRole('button',{name:'Cancel Custom meal'}).click();await expect(page.getByRole('button',{name:'Cancel Custom meal'})).toHaveCount(0);
 await page.getByLabel('Simulation speed').selectOption('600');await page.getByRole('button',{name:'Run',exact:true}).click();await expect(page.getByRole('button',{name:'Pause',exact:true})).toBeVisible();
 await expect(page.getByLabel('Elapsed simulation time',{exact:true})).not.toHaveText('00:00:00');await page.getByRole('button',{name:'Pause',exact:true}).click();const time=await page.getByLabel('Elapsed simulation time',{exact:true}).textContent();
 await page.getByRole('tab',{name:'Event ledger'}).click();await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText(time!);
 await page.getByRole('button',{name:'Reset entire simulation'}).click();await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:00:00');
});

test('brain connections, anatomy link and model disclosure work',async({page})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('tab',{name:'Brain vessels'}).click();await page.getByRole('button',{name:'Inspect L PCA',exact:true}).click();await expect(page.locator('.sim-inspector h2')).toHaveText('L PCA');
 await expect(page.locator('.brain-connections button')).toHaveCount(4);
 await page.locator('.sim-inspector .anatomy-link').first().click();await expect(page).toHaveURL(/#anatomy/);await expect(page.locator('.structure-title').first()).toContainText(/posterior cerebral/i);
 await expect(page.locator('.loading')).toHaveCount(0,{timeout:75000});await expect(page.locator('.scene canvas')).toBeVisible();
 await page.getByRole('button',{name:'Back to physiology lab',exact:false}).click();await expect(page).not.toHaveURL(/#anatomy/);
 await page.getByRole('button',{name:'Model & sources'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);expect(errors).toEqual([]);
});

for(const viewport of [{width:390,height:844},{width:320,height:568},{width:844,height:390}])test(`responsive controls and no page overflow at ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');
 await expect(page.getByRole('button',{name:'Run',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('button',{name:'Inspect Kidneys',exact:true}).click();await expect(page.locator('.sim-inspector h2')).toHaveText('Kidneys');
 await page.getByRole('tab',{name:'Air & body'}).click();await page.getByLabel('Inspired oxygen',{exact:true}).fill('0.15');await page.getByRole('button',{name:'Apply conditions'}).click();
 await page.getByRole('button',{name:'Advance five minutes'}).click();await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:05:00');
 await page.getByRole('tab',{name:'Brain vessels'}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`test-results/simulation-${viewport.width}.png`,fullPage:true});
});


test('transport inventory, local gradients, oxygen rates and cumulative exports agree',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Introduce meal',exact:false}).click();
 await page.getByRole('button',{name:'Advance five minutes'}).click();await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:05:00');
 await page.getByRole('tab',{name:'Transport',exact:true}).click();
 await page.locator('.transport-table').getByRole('button',{name:/Hepatic portal blood/}).click();await expect(page.locator('.sim-inspector h2')).toHaveText('Hepatic portal blood');
 await expect(page.locator('.flux-list')).toContainText('Liver blood');await expect(page.locator('.flux-list')).toContainText('intestinal lumen');
 await page.getByLabel('Transport substance').selectOption('oxygen');await expect(page.locator('.transport-table tbody tr')).toHaveCount(13);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export run'}).click();const download=await downloadPromise;const run=JSON.parse(await readFile((await download.path())!,'utf8'));
 expect(Object.keys(run.state.transport.compartments)).toHaveLength(23);
 expect(run.state.transport.cumulativeFluxes.some((f:{from:string;to:string;substance:string;amount:number})=>f.from==='intestinal lumen'&&f.to==='portal'&&f.substance==='glucose'&&f.amount>0)).toBe(true);
 expect(run.state.transport.oxygenConsumed).toBeGreaterThan(0);
});

test('brain vessel coverage exposes unresolved meshes and filters by source name',async({page})=>{
 await page.goto('/');await page.getByRole('tab',{name:'Brain vessels'}).click();await page.locator('.brain-coverage summary').click();
 await expect(page.locator('.coverage-counts')).toContainText('31unresolved');
 await page.getByLabel('Vessel coverage status').selectOption('unresolved');await expect(page.locator('.coverage-list article')).toHaveCount(31);
 await page.getByLabel('Find a source brain vessel').fill('central sulcus');await expect(page.locator('.coverage-list article')).toHaveCount(4);
 await expect(page.getByRole('button',{name:/Inspect all 178 source vessel candidates in 3D/})).toBeVisible();
});
