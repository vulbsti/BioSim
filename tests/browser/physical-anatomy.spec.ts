import {test,expect} from '@playwright/test';
test.use({trace:{mode:'retain-on-failure',screenshots:false}});

test('anatomical pixels move, pause freezes them, and breathing has live air tracers',async({page})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');const scene=page.getByTestId('physical-scene');await expect(scene).toHaveAttribute('data-ready','true',{timeout:75000});
 await page.getByRole('button',{name:'Watch breathing',exact:true}).click();await page.getByRole('button',{name:'Expand anatomy',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Expanded physical anatomy'})).toBeVisible();
 await expect.poll(async()=>Number(await scene.getAttribute('data-air-tracers')),{timeout:20000}).toBeGreaterThan(0);
 const canvas=scene.locator('canvas'),first=await canvas.screenshot();await page.waitForTimeout(750);const second=await canvas.screenshot();expect(second.equals(first),'actual 3D pixels should move').toBe(false);
 await page.getByRole('button',{name:'Pause anatomical motion',exact:true}).click();await expect(scene).toHaveAttribute('data-motion','paused');await page.waitForTimeout(600);
 const still=await canvas.screenshot();await page.waitForTimeout(600);expect((await canvas.screenshot()).equals(still),'paused anatomy should stay still').toBe(true);
 await page.screenshot({path:'test-results/physical-breathing.png'});
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Expanded physical anatomy'})).toHaveCount(0);await expect(page.getByRole('button',{name:'Expand anatomy',exact:true})).toBeFocused();
 expect(errors).toEqual([]);
});

test('meal input starts swallowing and digestion, then portal absorption appears',async({page})=>{
 test.setTimeout(120000);await page.goto('/');const scene=page.getByTestId('physical-scene');await expect(scene).toHaveAttribute('data-ready','true',{timeout:75000});
 await page.getByRole('button',{name:'Watch digestion',exact:true}).click();await expect(scene).toHaveAttribute('data-food-tracers','0');await expect(scene).toHaveAttribute('data-portal-tracers','0');
 await page.getByRole('button',{name:'Introduce meal',exact:false}).click();
 await expect.poll(async()=>Number(await scene.getAttribute('data-food-tracers'))).toBeGreaterThan(0);
 await expect.poll(async()=>Number(await scene.getAttribute('data-mix-tracers'))).toBeGreaterThan(0);
 await expect(page.getByLabel('Live process connections')).toContainText('95.0 g');
 await page.getByRole('button',{name:'Advance five minutes'}).click();await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:05:00');
 await expect.poll(async()=>Number(await scene.getAttribute('data-portal-tracers'))).toBeGreaterThan(0);
 await page.getByRole('tab',{name:'Air & body'}).click();await page.getByLabel('Exercise workload',{exact:true}).fill('0.65');await page.getByRole('button',{name:'Apply conditions'}).click();
 await page.getByRole('button',{name:'Advance five minutes'}).click();await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:10:00');
 await expect.poll(async()=>Number(await scene.getAttribute('data-heart-hz'))).toBeGreaterThan(1.2);
 await expect.poll(async()=>Number(await scene.getAttribute('data-breath-hz'))).toBeGreaterThan(.2);
});

test('reduced motion, thyroid isolation, section controls and mobile expansion work',async({page})=>{
 test.setTimeout(120000);await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});await page.goto('/');
 const scene=page.getByTestId('physical-scene');await expect(scene).toHaveAttribute('data-ready','true',{timeout:75000});await expect(scene).toHaveAttribute('data-motion','paused');
 await page.getByRole('button',{name:'Expand anatomy',exact:true}).click();await page.getByLabel('Search physical anatomy').fill('thyroid gland');
 await page.locator('.physical-results').getByRole('button',{name:'thyroid gland 3 parts',exact:true}).click();await expect(scene).toHaveAttribute('data-visible-parts','3');
 await page.getByRole('button',{name:'In context',exact:true}).click();await page.getByRole('button',{name:'Dissect',exact:true}).click();await page.getByLabel('Anatomical section plane').selectOption('coronal');await expect(page.getByLabel('Anatomical section position')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'test-results/physical-mobile.png'});
});

test('catalogue failure produces a visible error instead of an endless loading state',async({page})=>{
 await page.route('**/models/expansion.json',r=>r.fulfill({status:503,body:'Unavailable'}));await page.goto('/');await expect(page.locator('.physical-load-error')).toContainText('catalogue could not be loaded');
});
