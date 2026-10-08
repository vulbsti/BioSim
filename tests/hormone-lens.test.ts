import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Atlas} from '../app/anatomy';
import {departure,familyOf,HORMONE_FAMILIES,HORMONE_ROUTES,HORMONE_SITES,hormoneShades,mostChanged,type HormoneSite} from '../app/physical/hormone-lens';
import {advance,applyAction,createBody} from '../app/simulation/engine';
import {HORMONES} from '../app/simulation/types';

const read=(file:string)=>JSON.parse(readFileSync(new URL(`../public/models/${file}`,import.meta.url),'utf8')) as Atlas;
const parts=['atlas.json','expansion.json'].flatMap(f=>read(f).parts);

test('every hormone has one family, eight family colours, and every structure exists in the atlas',()=>{
 assert.deepEqual(HORMONE_FAMILIES.flatMap(f=>[...f.hormones]).sort(),[...HORMONES].sort());assert.equal(HORMONE_FAMILIES.length,8);
 // The eight dark-surface steps of the validated categorical palette, in its fixed order.
 assert.deepEqual(HORMONE_FAMILIES.map(f=>f.colour),['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300','#9085e9','#e66767']);
 for(const h of HORMONES)assert.ok(HORMONE_FAMILIES[familyOf[h]].hormones.includes(h as never));
 for(const [site,{match}] of Object.entries(HORMONE_SITES))assert.ok(parts.some(p=>match.test(p.name)),`no atlas part for ${site}`);
 // No part belongs to two structures, so a part's colour is never ambiguous.
 for(const p of parts)assert.ok(Object.values(HORMONE_SITES).filter(s=>s.match.test(p.name)).length<=1,p.name);
 for(const h of HORMONES)for(const site of [...HORMONE_ROUTES[h].from,...HORMONE_ROUTES[h].to])assert.ok(site in HORMONE_SITES,`${h}: ${site}`);
 assert.deepEqual([departure(1),departure(2),departure(.5),departure(16),departure(0)],[0,1,-1,1,-1]);
});

test('at rest nothing stands out; a meal lights the gut and pancreas, exercise the adrenals',()=>{
 const rest=hormoneShades(createBody(),null);for(const shade of Object.values(rest))assert.ok(shade.strength<.01);
 const fed=createBody();applyAction(fed,{kind:'meal',meal:{carbs:60,protein:20,fat:15,water:250,sodium:500}});advance(fed,1500);
 const shades=hormoneShades(fed,null);
 assert.equal(shades.pancreas!.hormone,'insulin');assert.ok(shades.pancreas!.strength>.3);assert.equal(HORMONE_FAMILIES[shades.pancreas!.family].id,'glucose');
 assert.ok(['cck','glp1','secretin'].includes(shades.intestine!.hormone)&&shades.intestine!.strength>.3);assert.ok(['gastrin','ghrelin'].includes(shades.stomach!.hormone));
 // A structure that releases several hormones shows the one furthest from baseline, and only sources are shown.
 for(const shade of Object.values(shades))assert.equal(shade.role,'source');
 assert.ok(['insulin','cck','glp1','gastrin','secretin','ghrelin'].includes(mostChanged(fed)[0]),mostChanged(fed)[0]);
 const run=createBody();applyAction(run,{kind:'environment',values:{exercise:.7}});advance(run,600);
 const hard=hormoneShades(run,null);assert.ok(['epinephrine','norepinephrine'].includes(hard.adrenal!.hormone)&&hard.adrenal!.strength>.8&&HORMONE_FAMILIES[hard.adrenal!.family].id==='stress');
});

test('choosing a hormone shows where it is released and where it acts, and nothing else',()=>{
 const fed=createBody();applyAction(fed,{kind:'meal',meal:{carbs:60,protein:20,fat:15,water:250,sodium:500}});advance(fed,1500);
 const insulin=hormoneShades(fed,'insulin');assert.deepEqual(Object.keys(insulin).sort(),['liver','pancreas']);
 assert.equal(insulin.pancreas!.role,'source');assert.equal(insulin.liver!.role,'target');assert.ok(insulin.liver!.strength<insulin.pancreas!.strength);
 // A hormone at baseline is still findable when chosen.
 const acth=hormoneShades(createBody(),'acth');assert.ok(acth.pituitary!.strength>=.35&&acth.adrenal!.role==='target');
 // A structure that is both source and target of the chosen hormone reads as its source.
 assert.equal(hormoneShades(fed,'gastrin').stomach!.role,'source');
 // Hormones with no structure of their own in the atlas still show their targets.
 assert.deepEqual(Object.keys(hormoneShades(fed,'leptin')) as HormoneSite[],['hypothalamus']);
});
