import {test,expect} from '@playwright/test';
test.use({trace:{mode:'retain-on-failure',screenshots:false}});

test('anatomical pixels move, pause freezes them, and breathing has live air tracers',async({page})=>{
 // Full-suite software-renderer captures measured 25.7s and 37.9s; the isolated test took 113s.
 test.setTimeout(240000);
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
 // Leave margin for the same software-renderer load after the preceding browser suites.
 test.setTimeout(240000);await page.goto('/');const scene=page.getByTestId('physical-scene');await expect(scene).toHaveAttribute('data-ready','true',{timeout:75000});
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

test('blood beads ride the vessel graph at simulated flow, and exercise speeds the leg artery',async({page})=>{
 test.setTimeout(240000);await page.goto('/');const scene=page.getByTestId('physical-scene');await expect(scene).toHaveAttribute('data-ready','true',{timeout:75000});
 await page.getByRole('button',{name:'Watch circulation',exact:true}).click();const read=async(name:string)=>Number(await scene.getAttribute(name));
 await expect.poll(()=>read('data-blood-tracers'),{timeout:30000}).toBeGreaterThan(1000);expect(await read('data-vessel-segments')).toBeGreaterThan(3000);
 // Every systemic bed, the brain included, is supplied through the aortic root.
 const output=await read('data-cardiac-output'),aorta=await read('data-aorta-flow'),restLeg=await read('data-femoral-speed');
 expect(aorta).toBeGreaterThan(output*.97);expect(aorta).toBeLessThan(output*1.01);expect(restLeg).toBeGreaterThan(0);
 await page.getByRole('tab',{name:'Air & body'}).click();await page.getByLabel('Exercise workload',{exact:true}).fill('0.65');await page.getByRole('button',{name:'Apply conditions'}).click();
 await page.getByRole('button',{name:'Advance five minutes'}).click();await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText('00:05:00');
 await expect.poll(()=>read('data-femoral-speed'),{timeout:30000}).toBeGreaterThan(restLeg*2);
 await expect.poll(()=>read('data-aorta-flow'),{timeout:30000}).toBeGreaterThan(aorta*1.5);
});

test('running the simulation changes the body: stores fill, and a meal colours blood and organs by glucose',async({page})=>{
 test.setTimeout(240000);await page.goto('/');const scene=page.getByTestId('physical-scene');await expect(scene).toHaveAttribute('data-ready','true',{timeout:75000});
 const read=async(name:string)=>Number(await scene.getAttribute(name)),callouts=page.locator('.physical-callouts');
 const hour=async(shown:string)=>{await page.getByRole('button',{name:'Advance one hour'}).click();await expect(page.getByLabel('Elapsed simulation time',{exact:true})).toHaveText(shown);};
 await expect(callouts).toContainText('BLADDER');await expect(callouts).toContainText('0 mL');const glycogen=await read('data-glycogen');
 // At rest nothing about the flows changes, but time passes: urine collects and glycogen is spent.
 await hour('01:00:00');
 await expect.poll(()=>read('data-simulated-time')).toBe(3600);await expect.poll(()=>read('data-bladder')).toBeGreaterThan(20);expect(await read('data-glycogen')).toBeLessThan(glycogen);
 await expect(page.locator('.physical-clock')).toHaveText('SIMULATED 01:00:00');
 await page.getByLabel('Colour the body by').selectOption('glucose');await expect(scene).toHaveAttribute('data-lens','glucose');
 await expect.poll(()=>read('data-level-portal')).toBeLessThan(1.05);
 await page.getByRole('button',{name:'Introduce meal',exact:false}).click();
 await hour('02:00:00');
 // Absorbed glucose reaches the portal vein first, the liver takes most of it, and arterial blood rises less.
 await expect.poll(()=>read('data-level-portal'),{timeout:30000}).toBeGreaterThan(1.4);
 const arterial=await read('data-level-arterial');expect(arterial).toBeGreaterThan(1.1);expect(arterial).toBeLessThan(await read('data-level-portal'));
 expect(await read('data-tint-liver')).toBeGreaterThan(0);await expect(callouts).toContainText(/LIVER\s*glycogen [\d.]+ g\s*takes up/);
 await page.getByLabel('Colour the body by').selectOption('oxygen');await expect.poll(()=>read('data-level-venous')).toBeLessThan(.85); // The meal lens colours only what came from the meal: the portal vein carries more of it than the arteries.
 await page.getByLabel('Colour the body by').selectOption('meal');await expect(scene).toHaveAttribute('data-lens','meal');
 await expect.poll(()=>read('data-level-portal')).toBeGreaterThan(.2);expect(await read('data-level-arterial')).toBeLessThan(await read('data-level-portal'));expect(await read('data-level-arterial')).toBeGreaterThan(.05);
 const fate=page.locator('.physical-meal-fate');await expect(fate).toContainText('EATEN 01:00:00 AGO');await expect(fate).toContainText(/Carbohydrate \d+ g/);
 const parts=await Promise.all(['Stomach','Intestine','Blood','Tissues','Stored','Burned','Excreted'].map(f=>read('data-meal-'+f.toLowerCase())));
 const eaten=Number((await fate.locator('[data-nutrient="glucose"] span').textContent())!.match(/(\d+) g/)![1]);expect(Math.abs(parts.reduce((a,b)=>a+b,0)-eaten)).toBeLessThan(.01);expect(parts[4]).toBeGreaterThan(1);
 await expect(callouts).toContainText(/LIVER\s*glycogen [\d.]+ g\s*[\d.]+ g of this meal/);
});

test('hormones colour the structures that release them by family, and one can be followed to where it acts',async({page})=>{
 test.setTimeout(240000);await page.goto('/');const scene=page.getByTestId('physical-scene');await expect(scene).toHaveAttribute('data-ready','true',{timeout:90000});
 await page.getByLabel('Colour the body by').selectOption('hormones');await expect(scene).toHaveAttribute('data-lens','hormones');
 const panel=scene.locator('.physical-hormones');await expect(panel).toBeVisible();await expect(panel.locator('button')).toHaveCount(32);await expect(panel.locator('section')).toHaveCount(8);
 // At rest nothing has left baseline far enough to be labelled.
 await expect(scene.locator('.physical-hormone-tags > div:not([hidden])')).toHaveCount(0);
 await page.getByRole('button',{name:'Introduce meal',exact:false}).click();await page.getByRole('button',{name:'Advance five minutes'}).click();await page.getByRole('button',{name:'Advance five minutes'}).click();
 await page.getByRole('button',{name:'Organs',exact:true}).click();await page.getByRole('button',{name:'Abdomen',exact:true}).click();
 // After a meal the pancreas shows insulin and the gut its own hormones, each named on the structure.
 await expect(scene).toHaveAttribute('data-site-pancreas','insulin',{timeout:60000});await expect(scene).toHaveAttribute('data-site-stomach','gastrin');
 expect(['cck','glp1','secretin']).toContain(await scene.getAttribute('data-site-intestine'));
 await expect(scene.locator('.physical-hormone-tags')).toContainText(/PANCREAS\s*Insulin [\d.]+×/);await expect(panel.locator('button[data-hormone="insulin"] em')).toHaveText(/[\d.]+×/);
 await expect(scene.locator('.physical-callouts')).toBeHidden();
 // Choosing insulin leaves only its source and its target coloured, and says which is which.
 await panel.locator('button[data-hormone="insulin"]').click();await expect(scene).toHaveAttribute('data-hormone-chosen','insulin',{timeout:30000});
 await expect(scene).toHaveAttribute('data-site-liver','insulin');expect(await scene.getAttribute('data-site-stomach')).toBeNull();
 await expect(scene.locator('.physical-hormone-tags')).toContainText(/LIVER\s*acts here · Insulin/);await expect(panel.locator('button[data-hormone="insulin"]')).toHaveAttribute('aria-pressed','true');
 await panel.locator('button[data-hormone=""]').click();await expect(scene).toHaveAttribute('data-site-stomach','gastrin',{timeout:30000});
 // Another colour option puts the store labels back.
 await page.getByLabel('Colour the body by').selectOption('flow');await expect(panel).toBeHidden();await expect(scene.locator('.physical-callouts')).toBeVisible();
});
test('each heart chamber follows its simulated volume through the phases of the beat',async({page})=>{
 // Samples a live animation under software rendering, so the limits are generous for a loaded machine.
 test.setTimeout(300000);await page.goto('/');const scene=page.getByTestId('physical-scene');await expect(scene).toHaveAttribute('data-ready','true',{timeout:90000});
 const number=async(name:string)=>Number(await scene.getAttribute(name));
 // The solved beat matches the resting body state and sits in textbook ranges.
 expect(await number('data-heart-ef')).toBeGreaterThan(.5);expect(await number('data-heart-ef')).toBeLessThan(.7);expect(await number('data-heart-lv-edv')).toBeGreaterThan(100);expect(await number('data-heart-systolic')).toBeGreaterThan(100);expect(await number('data-heart-diastolic')).toBeLessThan(85);
 const phases=new Set<string>(),stages=new Set<string>();let low=1,high=0,atrialLow=1,mitral=[1,0],aortic=[1,0],both=0;
 await expect.poll(async()=>{
  const d=await scene.evaluate((e:HTMLElement)=>({...e.dataset}));const lv=Number(d.fillLv),m=Number(d.valveMitral),a=Number(d.valveAortic);
  low=Math.min(low,lv);high=Math.max(high,lv);atrialLow=Math.min(atrialLow,Number(d.fillLa));phases.add(d.heartPhase!);for(const stage of (d.conduction??'').split(' '))if(stage)stages.add(stage);
  mitral=[Math.min(mitral[0],m),Math.max(mitral[1],m)];aortic=[Math.min(aortic[0],a),Math.max(aortic[1],a)];if(m>.6&&a>.6)both++;
  // Chambers empty and fill, the leaflets of both left valves swing fully, and the impulse is seen at several stages.
  return phases.size>=4&&low<.7&&high>.95&&atrialLow<.85&&mitral[0]<.2&&mitral[1]>.8&&aortic[0]<.2&&aortic[1]>.8&&stages.size>=3;
 },{timeout:150000,intervals:[110]}).toBe(true);
 expect(both).toBe(0);
 await expect(page.locator('.physical-cycle-readout')).toContainText(/(Ejection|Filling|Isovolumic contraction|Isovolumic relaxation|Atrial contraction) · LV \d+ mL/);
 // The modelled conduction system is part of the atlas and can be isolated by name.
 await page.getByLabel('Search physical anatomy').fill('cardiac conduction system');await page.locator('.physical-results').getByRole('button').first().click();await expect(scene).toHaveAttribute('data-visible-parts','10');
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
