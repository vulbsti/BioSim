/**
 * Plays card steps on the real app through the controls a person uses, and takes repeatable screenshots.
 * This file is the only place that knows the app's labels: when the UI changes, fix it here and every card keeps working.
 */
import {expect,type Page} from '@playwright/test';
import type {Step} from './cards';

const SCENE = '[data-testid="physical-scene"]';
const clock = (page: Page) => page.getByLabel('Elapsed simulation time', {exact: true});
const seconds = (t: string) => t.split(':').map(Number).reduce((a, x) => a * 60 + x, 0);

export async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator(SCENE)).toHaveAttribute('data-ready', 'true', {timeout: 180000});
  await pause(page);
  await setMotion(page, false);
}

async function pause(page: Page) {
  const button = page.getByRole('button', {name: 'Pause', exact: true});
  if (await button.isVisible()) await button.click();
  await expect(page.getByRole('button', {name: 'Play', exact: true})).toBeVisible();
}

export async function setMotion(page: Page, on: boolean) {
  const button = page.getByRole('button', {name: on ? 'Play anatomical motion' : 'Pause anatomical motion'});
  if (await button.isVisible()) await button.click();
}

async function tryPanel(page: Page) {
  const open = page.getByRole('button', {name: 'Try something'});
  if (!(await page.getByRole('heading', {name: 'Try something'}).isVisible())) await open.click();
}

/** Wait until the engine and the 3D scene both show this simulated second. */
async function settleAt(page: Page, at: number) {
  await expect.poll(async () => seconds((await clock(page).textContent()) ?? ''), {timeout: 120000}).toBe(at);
  await expect.poll(async () => Number(await page.locator(SCENE).getAttribute('data-simulated-time')), {timeout: 60000}).toBe(at);
}

export async function play(page: Page, step: Step) {
  if ('scenario' in step) {
    await tryPanel(page);
    await page.locator('.bio-scenarios').getByRole('button', {name: step.scenario, exact: true}).click();
    // Choosing a situation restarts the body and plays it; pause it so the card controls time from here.
    return pause(page);
  }
  if ('eat' in step) {
    await tryPanel(page);
    for (const [k, label] of [['carbs', 'Carbs'], ['protein', 'Protein'], ['fat', 'Fat']] as const) await page.getByLabel(label, {exact: true}).fill(String(step.eat[k]));
    return page.getByRole('button', {name: 'Eat it', exact: true}).click();
  }
  if ('water' in step) {await tryPanel(page); return page.getByRole('button', {name: 'Glass of water', exact: true}).click();}
  if ('exercise' in step) {
    await tryPanel(page);
    await page.getByLabel('Exercise', {exact: true}).fill(String(step.exercise));
    // The slider sends its value once it has settled for a moment.
    return page.waitForTimeout(1500);
  }
  if ('advance' in step) {
    let left = Math.round(step.advance / 5) * 5, at = seconds((await clock(page).textContent()) ?? '');
    while (left > 0) {
      const hour = left >= 60;
      await page.getByRole('button', {name: hour ? 'Advance one hour' : 'Advance five minutes'}).click();
      at += hour ? 3600 : 300;
      left -= hour ? 60 : 5;
      await settleAt(page, at);
    }
    return;
  }
  if ('watch' in step) {
    const name = {heart: 'Watch the heart and circulation', breathing: 'Watch breathing', oxygen: 'Watch blood oxygen', sugar: 'Watch blood sugar', digestion: 'Watch digestion'}[step.watch];
    await page.getByRole('button', {name, exact: true}).click();
    // Watching turns the motion on; screenshots keep it still.
    return setMotion(page, false);
  }
  if ('lens' in step) return page.getByLabel('Colour the body by').selectOption({label: step.lens});
  if ('show' in step) return page.getByRole('group', {name: 'What to show'}).getByRole('button', {name: step.show, exact: true}).click();
  if ('angle' in step) return page.getByLabel('Camera angle').getByRole('button', {name: step.angle, exact: true}).click();
  if ('region' in step) return page.getByLabel('Camera angle').getByRole('button', {name: step.region, exact: true}).click();
  if ('find' in step) {
    await page.getByLabel('Search physical anatomy').fill(step.find);
    return page.locator('.physical-results button').filter({hasText: new RegExp(`^${step.find}$`, 'i')}).first().click();
  }
  if ('chart' in step) {
    const open = await page.locator('.bio-chart').isVisible();
    if (open !== step.chart) await (step.chart ? page.getByRole('button', {name: 'Over time'}) : page.getByRole('button', {name: 'Close chart'})).click();
    return;
  }
  if ('motion' in step) return setMotion(page, step.motion);
}

/** Hide every overlay so only the 3D body is left: the rest/change comparison must not count changing numbers. */
export const CLEAN = 'html.verify-clean *{visibility:hidden!important} html.verify-clean canvas{visibility:visible!important}';

/** Screenshots, taken once the frame stops changing (camera eases and colours fade in). Returns [full, body only]. */
export async function shoot(page: Page): Promise<[Buffer, Buffer]> {
  await page.addStyleTag({content: CLEAN}).catch(() => {});
  let last: Buffer | null = null;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const now = await page.screenshot({type: 'png'});
    if (last && now.equals(last)) break;
    last = now;
  }
  const full = await page.screenshot({type: 'jpeg', quality: 82});
  await page.evaluate(() => document.documentElement.classList.add('verify-clean'));
  await page.waitForTimeout(150);
  const body = await page.screenshot({type: 'png'});
  await page.evaluate(() => document.documentElement.classList.remove('verify-clean'));
  return [full, body];
}

/** What the 3D scene animates, read from the scene itself with motion playing for a few seconds (flows ease in). */
export async function motionRates(page: Page): Promise<Record<string, number>> {
  const scene = page.locator(SCENE), read = async (k: string) => Number(await scene.getAttribute(k));
  await setMotion(page, true);
  await page.waitForTimeout(4000);
  const rates = {'heart beats': await read('data-heart-hz'), breaths: await read('data-breath-hz'), 'thigh blood speed': await read('data-femoral-speed')};
  await setMotion(page, false);
  return rates;
}

/**
 * Share of the frame that changed between two body-only screenshots, and a picture of where.
 * Decoded in the page, so the harness needs no image library.
 */
export async function compare(page: Page, rest: Buffer, change: Buffer): Promise<{changed: number; diff: Buffer}> {
  const [changed, png] = await page.evaluate(async ([a, b]) => {
    const load = async (s: string) => createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
    const [x, y] = await Promise.all([load(a), load(b)]), w = x.width, h = x.height;
    const c = new OffscreenCanvas(w, h), g = c.getContext('2d')!;
    g.drawImage(x, 0, 0); const p = g.getImageData(0, 0, w, h);
    g.drawImage(y, 0, 0); const q = g.getImageData(0, 0, w, h);
    const out = g.createImageData(w, h);
    let n = 0;
    for (let i = 0; i < p.data.length; i += 4) {
      const d = Math.max(Math.abs(p.data[i] - q.data[i]), Math.abs(p.data[i + 1] - q.data[i + 1]), Math.abs(p.data[i + 2] - q.data[i + 2]));
      // Changed pixels in magenta over a faded copy of the changed frame.
      const grey = (q.data[i] + q.data[i + 1] + q.data[i + 2]) / 3;
      if (d > 24) {n++; out.data.set([255, 0, 200, 255], i);} else out.data.set([grey * 0.45 + 120, grey * 0.45 + 120, grey * 0.45 + 120, 255], i);
    }
    g.putImageData(out, 0, 0);
    const blob = await c.convertToBlob({type: 'image/jpeg', quality: 0.8});
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return [n / (w * h), btoa(s)] as const;
  }, [rest.toString('base64'), change.toString('base64')] as const);
  return {changed, diff: Buffer.from(png, 'base64')};
}
