import {test,expect} from '@playwright/test';
test.use({trace:{mode:'retain-on-failure',screenshots:false}});

test('a vessel can be dived into, down to molecules at true counts that follow the simulation',async({page})=>{
 // Software-rendered anatomy needs the same margin as the other physical scene tests.
 test.setTimeout(240000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');const scene=page.getByTestId('physical-scene');await expect(scene).toHaveAttribute('data-ready','true',{timeout:75000});
 await expect(scene).toHaveAttribute('data-dive-species','47',{timeout:30000});
 await page.getByRole('button',{name:'Watch circulation',exact:true}).click();
 await expect.poll(async()=>Number(await scene.getAttribute('data-tracers')),{timeout:20000}).toBeGreaterThan(1000);
 const view=async()=>new Map(((await scene.getAttribute('data-dive-view'))||'').split(',').filter(Boolean).map(x=>{const [id,n]=x.split(':');return [id,Number(n)] as const;}));
 const span=async()=>Number(await scene.getAttribute('data-dive-span'));
 // Find the aorta by its hover label, then double-click it.
 await scene.scrollIntoViewIfNeeded();
 const canvas=scene.locator('canvas'),box=(await canvas.boundingBox())!,hover=scene.locator('.physical-hover').first();let at=0;
 for(const y of [.5,.45,.55,.6,.4]){await page.mouse.move(box.x+box.width/2+2,box.y+box.height*y);await page.mouse.move(box.x+box.width/2,box.y+box.height*y);await page.waitForTimeout(250);if(/aorta/i.test(await hover.textContent()??'')){at=y;break;}}
 expect(at,'the aorta should be under the pointer somewhere down the midline').toBeGreaterThan(0);
 await page.mouse.dblclick(box.x+box.width/2,box.y+box.height*at);
 await expect(scene).toHaveAttribute('data-dive',/aorta/i,{timeout:20000});
 const dive=scene.locator('.physical-dive');await expect(dive.locator('header strong')).toHaveText(/aorta/i);
 // At the width of the vessel nothing in blood is large enough to tell apart.
 expect(await span()).toBeGreaterThan(.005);expect((await view()).size).toBe(0);
 // Cells: red cells far outnumber platelets, as they do in blood.
 // The view eases to each stop; counts are read once it has arrived.
 await dive.getByRole('button',{name:'Blood cells',exact:true}).click();await expect.poll(span,{timeout:30000}).toBeLessThan(4.6e-5);
 await expect.poll(async()=>(await view()).get('redCell')??0,{timeout:30000}).toBeGreaterThan(300);
 const cells=await view();expect(cells.get('redCell')!/(cells.get('platelet')??1)).toBeGreaterThan(8);expect(cells.has('glucose')).toBe(false);
 await expect(dive.locator('.physical-dive-bar span')).toHaveText(/µm$/);
 // Molecules: sodium and chloride crowd the view, glucose is common, and no hormone is in sight.
 await dive.getByRole('button',{name:'Molecules',exact:true}).click();await expect.poll(span,{timeout:30000}).toBeLessThan(1.23e-8);
 await expect.poll(async()=>(await view()).get('sodium')??0,{timeout:30000}).toBeGreaterThan(100);
 const molecules=await view();expect(molecules.get('sodium')!).toBeGreaterThan(molecules.get('chloride')!);expect(molecules.get('chloride')!).toBeGreaterThan(molecules.get('glucose')!*5);
 expect(molecules.has('insulin')).toBe(false);expect(molecules.has('redCell')).toBe(false);
 await expect(dive.locator('.physical-dive-bar span')).toHaveText(/nm$/);
 // The nearest insulin molecule is micrometres away; going to it puts one in view.
 const away=Number(await scene.getAttribute('data-dive-nearest-insulin'));expect(away).toBeGreaterThan(3e-7);expect(away).toBeLessThan(8e-6);
 await dive.getByRole('button',{name:'Insulin',exact:true}).click();
 await expect.poll(async()=>(await view()).get('insulin')??0,{timeout:30000}).toBe(1);
 await page.screenshot({path:'test-results/dive-insulin.png'});
 // The simulation drives the counts: a meal raises the glucose in view.
 await dive.getByRole('button',{name:'Molecules',exact:true}).click();await expect.poll(span,{timeout:30000}).toBeLessThan(1.23e-8);await expect.poll(span,{timeout:30000}).toBeGreaterThan(1.17e-8);await page.waitForTimeout(600);
 const before=(await view()).get('glucose')!;
 await page.getByRole('button',{name:'Introduce meal',exact:false}).click();for(let i=0;i<6;i++)await page.getByRole('button',{name:'Advance five minutes'}).click();
 await expect.poll(async()=>(await view()).get('glucose')??0,{timeout:30000}).toBeGreaterThan(before*1.15);
 // Scrolling out past the vessel returns to the body.
 await dive.getByRole('button',{name:'Vessel',exact:true}).click();await expect.poll(span,{timeout:20000}).toBeGreaterThan(.005);
 await canvas.evaluate((node,[x,y])=>{for(let i=0;i<3;i++)node.dispatchEvent(new WheelEvent('wheel',{deltaY:240,clientX:x,clientY:y,bubbles:true,cancelable:true}));},[box.x+box.width/2,box.y+box.height/2]);
 await expect(scene).not.toHaveAttribute('data-dive');await expect(dive).toBeHidden();
 await expect.poll(async()=>Number(await scene.getAttribute('data-tracers')),{timeout:20000}).toBeGreaterThan(1000);
 expect(errors).toEqual([]);
});
