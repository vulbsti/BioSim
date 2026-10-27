import {test,expect} from '@playwright/test';
test.use({trace:{mode:'retain-on-failure',screenshots:false}});

test('the brain opens from the body, its areas are named in plain words, and choosing one changes what you see',async({page})=>{
 test.setTimeout(240000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');await expect(page.getByTestId('physical-scene')).toHaveAttribute('data-ready','true',{timeout:75000});
 await page.getByRole('button',{name:'Brain',exact:true}).click();
 const scene=page.getByTestId('brain-scene');await expect(scene).toHaveAttribute('data-ready','true',{timeout:75000});
 expect(Number(await scene.getAttribute('data-regions'))).toBeGreaterThanOrEqual(15);
 // Body-only panels step aside so nothing covers the brain.
 await expect(page.getByRole('complementary',{name:'Try something'})).toBeHidden();
 const canvas=scene.locator('canvas'),whole=await canvas.screenshot();
 await page.getByRole('button',{name:'Memory',exact:true}).click();await expect(scene).toHaveAttribute('data-selected','memory');
 await expect(page.getByRole('complementary',{name:'Selected brain area'})).toContainText('Stores new memories');
 await page.waitForTimeout(500);expect((await canvas.screenshot()).equals(whole),'choosing an area must change the picture').toBe(false);
 // The brainstem is the area the body model drives: its card reads the live heart rate and it flickers with each beat.
 await page.getByRole('button',{name:'Heartbeat and breathing',exact:true}).click();
 await expect(page.getByRole('complementary',{name:'Selected brain area'})).toContainText('beats/min');
 const beats=new Set<string>();for(let i=0;i<8;i++){beats.add((await scene.getAttribute('data-beat'))!);await page.waitForTimeout(120);}expect(beats.size).toBeGreaterThan(1);
 await page.getByRole('button',{name:'Cut in half'}).click();await expect(scene).toHaveAttribute('data-cut','true');
 await expect(page.getByRole('button',{name:'Side',exact:true}).last()).toHaveAttribute('aria-pressed','true');
 await page.screenshot({path:'test-results/brain.png'});
 await page.getByRole('button',{name:'Back to the body'}).click();await expect(page.getByTestId('brain-view')).toHaveCount(0);
 await expect(page.getByRole('complementary',{name:'Try something'})).toBeVisible();
 expect(errors).toEqual([]);
});
