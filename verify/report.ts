/**
 * Builds verify-report/index.html from what the gates wrote: one self-contained page (screenshots embedded)
 * that can be opened from disk, attached to a PR, or published as it is.
 */
import {existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {execSync} from 'node:child_process';
import {OUT} from './report-data';
import {cards as allCards} from './cards';
import type {DirectionResult} from './directions';
import type {RoundTrip} from './round-trip';
import type {ContainmentResult} from './containment';
import type {BudgetResult} from './budget';

type Status = 'pass' | 'fail' | 'pending' | 'missing';
type CardRun = {card: (typeof allCards)[number]; status: Status; shots: {label: string; file: string; time: string}[]; pairs: {rest: string; change: string; what: string; min: number; changed: number; pass: boolean; file?: string; motion?: string; restRate?: number; changeRate?: number}[]; noise?: number; errors?: string[]};

const json = <T,>(f: string): T | null => (existsSync(`${OUT}/${f}`) ? (JSON.parse(readFileSync(`${OUT}/${f}`, 'utf8')) as T) : null);
const files = (prefix: string) => (existsSync(OUT) ? readdirSync(OUT).filter((f) => f.startsWith(prefix) && f.endsWith('.json')) : []);
// Each picture is embedded once and placed by a tiny script, so a shot used in a strip and a pair costs nothing extra.
const images = new Map<string, string>();
const img = (f: string) => {if (f && existsSync(`${OUT}/${f}`) && !images.has(f)) images.set(f, `data:image/jpeg;base64,${readFileSync(`${OUT}/${f}`).toString('base64')}`); return images.has(f) ? f : '';};
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]!);
const pct = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;
const pill = (s: Status, text?: string) => `<span class="pill ${s}">${esc(text ?? {pass: 'Pass', fail: 'Fail', pending: 'Not built yet', missing: 'Not run'}[s])}</span>`;
const git = (c: string) => {try {return execSync(c, {encoding: 'utf8'}).trim();} catch {return '';}};

const cardRuns: CardRun[] = allCards.map((card) => json<CardRun>(`cards/${card.id}.json`) ?? {card, status: card.pending ? 'pending' : 'missing', shots: [], pairs: []});
const directions = json<DirectionResult[]>('directions.json') ?? [];
const trips = files('round-trip-').map((f) => json<RoundTrip>(f)!);
const contain = files('containment-').map((f) => json<ContainmentResult>(f)!);
const budget = json<BudgetResult>('budget.json');

const tally = (xs: Status[]) => ({pass: xs.filter((x) => x === 'pass').length, fail: xs.filter((x) => x === 'fail').length, open: xs.filter((x) => x === 'pending' || x === 'missing').length});
const gates = [
  // A1 is a person's verdict on the pictures; the harness only says whether the card could be played.
  {id: 'a1', name: 'Cause → visible effect (judge by eye)', t: tally(cardRuns.map((c) => (c.status === 'pending' || c.status === 'missing' ? c.status : c.shots.length ? 'pending' : 'fail')))},
  {id: 'a2', name: 'Rest is quiet, change is loud', t: tally(cardRuns.flatMap((c) => (c.pairs.length ? c.pairs.map((p) => (p.pass ? 'pass' : 'fail')) : c.status === 'pass' ? [] : [c.status])))},
  {id: 'a3', name: 'Direction of mechanism', t: tally(directions.map((d) => d.status))},
  {id: 'a4', name: 'Data round trip', t: tally(trips.length ? trips.map((r) => (r.pass ? 'pass' : 'fail')) : ['pending'])},
  {id: 'a5', name: 'Anatomy sits inside', t: tally(contain.length ? contain.map((r) => (r.pass ? 'pass' : 'fail')) : ['missing'])},
  {id: 'b', name: 'Serves the goal (screen budget)', t: tally(budget ? [budget.controls.pass, budget.tabs.pass, budget.developerWords.pass, budget.scroll.pass].map((x) => (x ? 'pass' : 'fail')) : ['missing'])},
];

const cardHtml = (c: CardRun) => `
<article class="card" id="card-${esc(c.card.id)}">
  <header><h3>${esc(c.card.title)}</h3><span class="counts">${c.shots.length ? pill('pending', 'Judge the pictures') : ''}${c.pairs.length ? pill(c.status, c.status === 'pass' ? 'Changes visibly' : c.status === 'fail' ? 'Fails rest vs change' : undefined) : pill(c.status)}</span></header>
  <p class="cause"><b>Cause</b> ${esc(c.card.cause)}</p>
  <div class="expect"><b>Expected on screen</b><ol>${c.card.expect.map((e) => `<li>${esc(e)}</li>`).join('')}</ol></div>
  ${c.card.pending ? `<p class="note">${esc(c.card.pending)}</p>` : ''}
  ${c.shots.length ? `<div class="strip">${c.shots.map((s) => `<figure><img data-img="${img(s.file)}" alt="${esc(s.label)}"><figcaption><b>${esc(s.label)}</b><span>${esc(s.time)}</span></figcaption></figure>`).join('')}</div>` : ''}
  ${c.pairs.map((p) => p.motion ? `<div class="pair"><div class="pair-head"><b>Rest vs change, in motion:</b> ${esc(p.what)} ${pill(p.pass ? 'pass' : 'fail', `${p.changed.toFixed(2)}× as fast as at rest (needs ${p.min}×)`)}</div><p class="note">The scene animates ${esc(p.motion)} at ${+(p.restRate ?? 0).toPrecision(3)} at rest and ${+(p.changeRate ?? 0).toPrecision(3)} under the change.</p></div>` : `<div class="pair"><div class="pair-head"><b>Rest vs change:</b> ${esc(p.what)} ${pill(p.pass ? 'pass' : 'fail', `${pct(p.changed)} of the frame changed (needs ${pct(p.min)})`)}</div>
    <div class="pair-row">${[[p.rest, c.shots.find((s) => s.label === p.rest)?.file], [p.change, c.shots.find((s) => s.label === p.change)?.file], ['Where it changed', p.file]].map(([l, f]) => `<figure><img data-img="${img(f ?? '')}" alt="${esc(l)}"><figcaption><b>${esc(l)}</b></figcaption></figure>`).join('')}</div></div>`).join('')}
  ${c.errors?.length ? `<p class="note fail">Page errors: ${esc(c.errors.join('; '))}</p>` : ''}
  ${c.shots.length ? `<details class="five"><summary>Five-second test: look at the pictures, say what happened, then open</summary><p>${esc(c.card.answer)}</p></details>` : ''}
</article>`;

const chains = [...new Set(directions.map((d) => d.chain))];
const html = `<title>BioSim Verification</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: a lab report. Summary of the gates first, then each gate's evidence, screenshots large enough to judge. */
:root{--bg:#f5f6f4;--panel:#ffffff;--fg:#1d2321;--muted:#5d6763;--line:#d9dedb;--accent:#2f6f62;--pass:#1f7a4d;--pass-bg:#e1f2e8;--fail:#b3261e;--fail-bg:#fbe3e0;--open:#8a6a10;--open-bg:#f6edcf;
 --sans:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#121615;--panel:#1a201e;--fg:#e4e9e6;--muted:#9aa5a0;--line:#2c3431;--accent:#7cc4b2;--pass:#7fd4a4;--pass-bg:#173326;--fail:#ff9a8f;--fail-bg:#3a1a17;--open:#e6c76a;--open-bg:#332a10;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121615;--panel:#1a201e;--fg:#e4e9e6;--muted:#9aa5a0;--line:#2c3431;--accent:#7cc4b2;--pass:#7fd4a4;--pass-bg:#173326;--fail:#ff9a8f;--fail-bg:#3a1a17;--open:#e6c76a;--open-bg:#332a10;color-scheme:dark}
body{background:var(--bg);color:var(--fg);font:15px/1.55 var(--sans)}
main{max-width:1180px;margin:0 auto;padding-block:32px 64px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:40px}
h1{font-size:28px;font-weight:600;margin:0}h2{font-size:20px;font-weight:600;margin:0 0 4px;text-wrap:balance}h3{font-size:16px;font-weight:600;margin:0;text-wrap:balance}
.lede{color:var(--muted);max-width:68ch;margin:6px 0 0}.meta{font:12px var(--mono);color:var(--muted);margin-top:10px}
.gates{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}
.gate{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:12px 14px;display:grid;gap:6px;text-decoration:none;color:inherit}
.gate small{font:11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}.gate b{font-weight:500}
.counts{display:flex;gap:6px;flex-wrap:wrap;font:12px var(--mono)}
.pill{display:inline-block;font:500 12px var(--mono);padding:2px 8px;border-radius:999px;white-space:nowrap}
.pill.pass{color:var(--pass);background:var(--pass-bg)}.pill.fail{color:var(--fail);background:var(--fail-bg)}.pill.pending,.pill.missing{color:var(--open);background:var(--open-bg)}
section>p.lede{margin-bottom:16px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:18px;display:grid;gap:12px;min-width:0}
.card>header{display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap}
.cards{display:grid;gap:16px}.cause,.expect{margin:0}.expect ol{margin:4px 0 0;padding-left:20px}.cause b,.expect b{font:500 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-right:8px}
.strip{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.pair{border-top:1px solid var(--line);padding-top:12px;display:grid;gap:8px}.pair-head{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.pair-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
@media (max-width:700px){.pair-row{grid-template-columns:1fr}}
figure{margin:0;display:grid;gap:4px;min-width:0}figure img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:4px;border:1px solid var(--line);display:block}
figcaption{display:flex;justify-content:space-between;gap:6px;font-size:13px}figcaption span{font:12px var(--mono);color:var(--muted)}
.note{margin:0;color:var(--muted);font-size:14px}.note.fail{color:var(--fail)}
.five summary{cursor:pointer;color:var(--accent)}.five p{margin:6px 0 0}
.table{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:6px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font:500 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}td.num{font:13px var(--mono);font-variant-numeric:tabular-nums}
tr.chain td{background:var(--bg);font-weight:600}
ul.controls{columns:2 220px;margin:6px 0 0;padding-left:18px;font-size:14px}
a{color:var(--accent)}a:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
</style>
<main>
<header>
  <h1>BioSim verification</h1>
  <p class="lede">Every change must show its mechanism on the body and serve the goal. Each check below is pass or fail from what a browser actually rendered or what the model actually did, not from reading code.</p>
  <p class="meta">${esc(git('git rev-parse --abbrev-ref HEAD'))} · ${esc(git('git rev-parse --short HEAD'))} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC</p>
</header>
<nav class="gates" aria-label="Gates">${gates.map((g) => `<a class="gate" href="#${g.id}"><small>${g.id.toUpperCase()}</small><b>${esc(g.name)}</b><span class="counts">${g.t.pass ? pill('pass', `${g.t.pass} pass`) : ''}${g.t.fail ? pill('fail', `${g.t.fail} fail`) : ''}${g.t.open ? pill('pending', `${g.t.open} open`) : ''}</span></a>`).join('')}</nav>

<section id="a1"><h2>A1 and A2. Cause → visible effect</h2>
<p class="lede">Each card was written before its mechanism. The automatic check only proves that something changed; whether the right thing changed, in the right order, is your call from the pictures against the expected list. The rest/change pair fails when the body barely changes between the two pictures: that visual is decoration. Pictures are taken with the overlays on; the comparison uses the same frame with every overlay hidden, so changing numbers do not count.</p>
<div class="cards" id="a2">${cardRuns.map(cardHtml).join('')}</div></section>

<section id="a3"><h2>A3. Direction of mechanism</h2>
<p class="lede">The model is run with the cause and without it. A row passes when the effect has the right sign by the stated time. Exact numbers are not the bar.</p>
<div class="table"><table><thead><tr><th>Claim</th><th>Result</th><th>What the model did</th></tr></thead><tbody>
${chains.map((ch) => `<tr class="chain"><td colspan="3">${esc(ch)}</td></tr>${directions.filter((d) => d.chain === ch).map((d) => `<tr><td>${esc(d.claim)}</td><td>${pill(d.status)}</td><td>${esc(d.detail)}</td></tr>`).join('')}`).join('') || '<tr><td colspan="3">Not run. Run <code>npm run verify:directions</code>.</td></tr>'}
</tbody></table></div></section>

<section id="a4"><h2>A4. Data round trip</h2>
<p class="lede">A real export goes in; the replay must follow the measured curve at every point within the margin.</p>
${trips.length ? `<div class="table"><table><thead><tr><th>Import</th><th>Result</th><th>Points within margin</th><th>Worst gap</th></tr></thead><tbody>${trips.map((r) => `<tr><td>${esc(r.name)}</td><td>${pill(r.pass ? 'pass' : 'fail')}</td><td class="num">${pct(r.within)} (margin ${r.margin} ${esc(r.unit)})</td><td class="num">${Number.isFinite(r.worst.gap) ? `${r.worst.gap.toFixed(1)} ${esc(r.unit)} at ${(r.worst.t / 60).toFixed(0)} min` : 'nothing drawn at a measured time'}</td></tr>`).join('')}</tbody></table></div>` : `<p class="note">No importer exists yet. Each importer saves its round trip with <code>saveRoundTrip</code> from <code>verify/round-trip.ts</code> and it appears here.</p>`}</section>

<section id="a5"><h2>A5. Anatomy sits inside</h2>
<p class="lede">Every vertex of the checked parts is tested against the skin, and optionally against parts it must stay clear of. Pictures from four angles come from a card with front, back, side and ¾ shots.</p>
${contain.length ? `<div class="table"><table><thead><tr><th>Parts</th><th>Result</th><th>Vertices</th><th>Outside or touching</th></tr></thead><tbody>${contain.map((r) => {const bad = r.rows.filter((x) => x.outside || x.touching); return `<tr><td>${esc(r.parts)} inside ${esc(r.inside)}${r.clearOf ? `, clear of ${esc(r.clearOf)}` : ''}${r.except ? ` except ${esc(r.except)}` : ''}${r.allow ? ` (allowance ${(r.allow * 100).toFixed(1)}%)` : ''}</td><td>${pill(r.pass ? 'pass' : 'fail')}</td><td class="num">${r.checked} in ${r.rows.length} parts</td><td>${bad.length ? bad.slice(0, 8).map((x) => `${esc(x.name)}: ${x.outside + x.touching}`).join('<br>') + (bad.length > 8 ? `<br>and ${bad.length - 8} more` : '') : 'none'}</td></tr>`;}).join('')}</tbody></table></div>` : `<p class="note">Not run. Run <code>npm run verify:containment -- --parts "your part"</code>.</p>`}</section>

<section id="b"><h2>B. Serves the goal</h2>
<p class="lede">Standing budgets measured on the main screen as it first loads. The written questions (which input does it use, can a non-medical person understand it, what did this change delete) are answered in the pull request.</p>
${budget ? `<div class="table"><table><thead><tr><th>Budget</th><th>Result</th><th>Measured</th></tr></thead><tbody>
<tr><td>At most about ${budget.controls.limit} controls visible</td><td>${pill(budget.controls.pass ? 'pass' : 'fail')}</td><td><span class="num">${budget.controls.count} controls</span><ul class="controls">${budget.controls.names.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></td></tr>
<tr><td>One screen, no tabs</td><td>${pill(budget.tabs.pass && budget.scroll.pass ? 'pass' : 'fail')}</td><td class="num">${budget.tabs.count} tabs, ${budget.scroll.pass ? 'no' : 'has'} page scroll</td></tr>
<tr><td>No developer tooling in the product</td><td>${pill(budget.developerWords.pass ? 'pass' : 'fail')}</td><td>${budget.developerWords.found.length ? esc(budget.developerWords.found.join(', ')) : 'none found'}</td></tr>
</tbody></table></div>` : '<p class="note">Not run.</p>'}</section>
</main>
<script>const IMAGES=${JSON.stringify(Object.fromEntries(images))};for(const el of document.querySelectorAll('img[data-img]'))if(IMAGES[el.dataset.img])el.src=IMAGES[el.dataset.img];</script>`;
writeFileSync(`${OUT}/index.html`, html);
console.log(`Wrote ${OUT}/index.html (${(html.length / 1e6).toFixed(1)} MB)`);
