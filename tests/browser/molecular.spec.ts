import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('molecular lab runs local binding, changes visible state and preserves a replay package',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#molecular');
  await expect(page.getByRole('heading',{name:'From signal to response.'})).toBeVisible();
  await expect(page.getByText('Response ready',{exact:true})).toBeVisible();
  const scene=page.locator('.mol-scene svg'),initial=await scene.screenshot();
  await page.getByLabel('Experiment time',{exact:true}).fill('300');
  await expect(page.getByLabel('Mechanism elapsed time')).toHaveText('05:00');
  expect((await scene.screenshot()).equals(initial)).toBe(false);
  await page.locator('.mol-stages button').nth(2).click();await expect(page.locator('.mol-detail h3')).toHaveText('Receptor occupancy');
  const occupied=Number(await page.locator('.mol-stages button').nth(2).locator('strong').textContent());expect(occupied).toBeGreaterThan(0);
  await page.getByLabel('Mechanism playback speed').selectOption('120');await page.getByRole('button',{name:'Play mechanism'}).click();
  await expect(page.getByLabel('Mechanism elapsed time')).not.toHaveText('05:00');await page.getByRole('button',{name:'Pause mechanism'}).click();
  const pausedTime=await page.getByLabel('Mechanism elapsed time').textContent(),paused=await scene.screenshot();
  await page.waitForTimeout(200);
  expect((await scene.screenshot()).equals(paused)).toBe(true);await expect(page.getByLabel('Mechanism elapsed time')).toHaveText(pausedTime!);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export experiment',exact:true}).click();const download=await downloadPromise;
  const recording=JSON.parse(await readFile((await download.path())!,'utf8'));expect(recording.format).toBe('human-atlas/mechanism-experiment');expect(recording.config.parameters.receptorPmol).toBe(20);
  await page.getByRole('button',{name:'Rewind mechanism'}).click();await expect(page.getByLabel('Mechanism elapsed time')).toHaveText('00:00');
  await page.getByLabel('Import molecular experiment').setInputFiles((await download.path())!);await expect(page.getByLabel('Mechanism elapsed time')).toHaveText(pausedTime!);
  await page.locator('.mol-ledger summary').click();await expect(page.locator('.mol-ledger')).toContainText('100.000000 pmol');
  expect(errors).toEqual([]);
});
test('changing receptor availability recomputes the model and invalid imports preserve the current experiment',async({page})=>{
  await page.goto('/#molecular');await expect(page.getByText('Response ready',{exact:true})).toBeVisible();
  await page.getByLabel('Receptor capacity',{exact:true}).fill('0');await page.getByRole('button',{name:'Calculate response'}).click();await expect(page.getByText('Response ready',{exact:true})).toBeVisible();
  await page.getByLabel('Experiment time',{exact:true}).fill('600');await expect(page.locator('.mol-stages button').nth(2).locator('strong')).toHaveText('0.0');
  await expect(page.locator('[data-receptor-symbol]')).toHaveCount(0);
  await page.getByLabel('Import molecular experiment').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"model":"atlas-physiology-0.2.0","state":{}}')});
  await expect(page.getByRole('alert')).toContainText('not a compatible');await expect(page.getByLabel('Mechanism elapsed time')).toHaveText('10:00');
  await expect(page.getByLabel('Receptor capacity',{exact:true})).toHaveValue('0');
});
test('published insulin pulse drives GLUT4 and its withdrawal precedes recovery',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#molecular');await expect(page.getByText('Response ready',{exact:true})).toBeVisible();
  await page.getByRole('tab',{name:/Insulin signaling/}).click();await expect(page.getByRole('heading',{name:'A signal crosses the membrane.'})).toBeVisible();
  await expect(page.getByText('Response ready',{exact:true})).toBeVisible();
  await page.getByLabel('Experiment time',{exact:true}).fill('900');
  await expect(page.locator('.mol-stages button').last().locator('strong')).toHaveText('39.3');await expect(page.locator('.mol-stages button').first().locator('strong')).toHaveText('0.0');
  await page.getByLabel('Experiment time',{exact:true}).fill('3600');await expect(page.locator('.mol-stages button').last().locator('strong')).toHaveText('4.4');
  await page.getByLabel('Insulin concentration',{exact:true}).selectOption('1');await page.getByRole('button',{name:'Calculate response'}).click();await expect(page.getByText('Response ready',{exact:true})).toBeVisible();
  await page.getByLabel('Experiment time',{exact:true}).fill('900');const low=Number(await page.locator('.mol-stages button').last().locator('strong').textContent());expect(low).toBeLessThan(39.3);expect(low).toBeGreaterThan(4);
  await page.locator('.mol-ledger summary').click();await expect(page.locator('.mol-ledger')).toContainText('not yet connected');expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/molecular-insulin-desktop.png',fullPage:true});
});
for(const viewport of [{width:390,height:844},{width:320,height:568}])test(`molecular controls fit ${viewport.width}px and return to the physiology lab`,async({page})=>{
  await page.setViewportSize(viewport);await page.goto('/#molecular');await expect(page.getByText('Response ready',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByLabel('Experiment time',{exact:true}).fill('300');await page.getByRole('tab',{name:/Insulin signaling/}).click();await expect(page.getByText('Response ready',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:`test-results/molecular-${viewport.width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Whole-body physiology'}).click();await expect(page.getByRole('heading',{name:'A body in balance.'})).toBeVisible();
  await page.getByRole('button',{name:/Open molecular lab/}).click();await expect(page.getByRole('heading',{name:'From signal to response.'})).toBeVisible();
});
