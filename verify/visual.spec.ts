/** Runs every card and the screen budget in a real browser, and writes what the report page shows. */
import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {cards} from './cards';
import {compare,motionRates,open,play,shoot} from './driver';
import {measureBudget} from './budget';
import {OUT} from './report-data';

test.use({reducedMotion: 'reduce'});
mkdirSync(`${OUT}/shots`, {recursive: true});
mkdirSync(`${OUT}/cards`, {recursive: true});
const only = process.env.VERIFY_CARDS?.split(',');

test('screen budget: one screen, few controls, no developer tooling', async ({page}) => {
  await open(page);
  const r = await measureBudget(page);
  writeFileSync(`${OUT}/budget.json`, JSON.stringify(r, null, 1));
  // The budget is reported, not enforced here: the report shows it as pass or fail next to the cards.
  expect(r.tabs.pass).toBe(true);
});

for (const card of cards) {
  if (only && !only.includes(card.id)) continue;
  test(`${card.id}: ${card.title}`, async ({page}) => {
    if (card.pending) {
      writeFileSync(`${OUT}/cards/${card.id}.json`, JSON.stringify({card, status: 'pending', shots: [], pairs: []}, null, 1));
      test.skip(true, card.pending);
    }
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A card that cannot be played is a failed card, and the report says why.
    const crashed = (e: unknown) => {writeFileSync(`${OUT}/cards/${card.id}.json`, JSON.stringify({card, status: 'fail', shots: [], pairs: [], errors: [`Could not play the card: ${String(e).split('\n')[0]}`]}, null, 1)); throw e;};
    await open(page).catch(crashed);
    for (const s of card.setup ?? []) await play(page, s).catch(crashed);
    const bodies = new Map<string, Buffer>(), shots: {label: string; file: string; time: string; rates?: Record<string, number>}[] = [];
    let noise = 0;
    const rates = new Map<string, Record<string, number>>();
    for (const [i, shot] of card.shots.entries()) {
      for (const s of shot.after ?? []) await play(page, s).catch(crashed);
      const [full, body] = await shoot(page);
      const file = `shots/${card.id}-${i}.jpg`;
      writeFileSync(`${OUT}/${file}`, full);
      bodies.set(shot.label, body);
      // The first frame shot twice: whatever differs here is noise, not a mechanism.
      if (i === 0) noise = (await compare(page, body, (await shoot(page))[1])).changed;
      shots.push({label: shot.label, file, time: (await page.getByLabel('Elapsed simulation time', {exact: true}).textContent()) ?? ''});
    }
    // Motion is read in a second, separate play-through: running the animation would move the beads in the pictures above.
    const moving = new Set((card.pairs ?? []).flatMap((p) => (p.motion ? [p.rest, p.change] : [])));
    if (moving.size) {
      await open(page).catch(crashed);
      for (const s of card.setup ?? []) await play(page, s).catch(crashed);
      for (const shot of card.shots) {
        for (const s of shot.after ?? []) await play(page, s).catch(crashed);
        if (moving.has(shot.label)) rates.set(shot.label, await motionRates(page));
      }
    }
    const pairs: Record<string, unknown>[] = [];
    for (const [i, pair] of (card.pairs ?? []).entries()) {
      if (pair.motion) {
        const rest = rates.get(pair.rest)![pair.motion], change = rates.get(pair.change)![pair.motion], min = pair.min ?? 1.25, ratio = change / Math.max(rest, 1e-9);
        pairs.push({...pair, min, changed: ratio, restRate: rest, changeRate: change, pass: ratio >= min});
        continue;
      }
      const {changed, diff} = await compare(page, bodies.get(pair.rest)!, bodies.get(pair.change)!);
      const file = `shots/${card.id}-diff-${i}.jpg`, min = Math.max(pair.min ?? 0.004, noise * 3);
      writeFileSync(`${OUT}/${file}`, diff);
      pairs.push({...pair, min, changed, pass: changed >= min, file});
    }
    const status = errors.length ? 'fail' : pairs.every((p) => p.pass) ? 'pass' : 'fail';
    writeFileSync(`${OUT}/cards/${card.id}.json`, JSON.stringify({card, status, shots, pairs, noise, errors}, null, 1));
    expect(errors, 'page errors').toEqual([]);
    for (const p of pairs) expect.soft(p.changed as number, `${p.what}: rest and change look the same`).toBeGreaterThanOrEqual(p.min as number);
  });
}
