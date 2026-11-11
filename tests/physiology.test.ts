import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advance,applyAction,carbohydrateResidual,createBody,fatResidual,glucose,proteinResidual,schedule,waterResidual} from '../app/simulation/engine';
import {concentration,gasResiduals,totalSubstance,transportSubstances} from '../app/simulation/transport';
import {scenarios} from '../app/simulation/scenarios';
import type {BodyState} from '../app/simulation/types';

function conserved(s:BodyState) {
  const gas=gasResiduals(s);assert.ok(Math.abs(gas.oxygen)<1e-5,`oxygen balance ${gas.oxygen}`);assert.ok(Math.abs(gas.carbonDioxide)<1e-5,`CO2 balance ${gas.carbonDioxide}`);
  for(const c of Object.values(s.transport.compartments))for(const [species,mass] of Object.entries(c.amounts))assert.ok(mass>=-1e-10,`${c.id} ${species} nonnegative`);

  for(const [name,value] of [['water',waterResidual(s)],['carbohydrate',carbohydrateResidual(s)],['protein',proteinResidual(s)],['fat',fatResidual(s)]] as const)assert.ok(Math.abs(value)<1e-6,`${name} residual ${value}`);
  const sum=s.flows.filter(f=>f.id!=='lungs').reduce((a,f)=>a+f.flow,0);
  assert.ok(Math.abs(sum-s.cardiacOutput)<1e-9,'Systemic flows sum to cardiac output');
  assert.equal(s.flows.find(f=>f.id==='lungs')!.flow,s.cardiacOutput,'Pulmonary and systemic output agree');
  const check=(v:unknown,path='state')=>{if(typeof v==='number')assert.ok(Number.isFinite(v),`${path} is finite`);else if(v&&typeof v==='object')for(const [k,x] of Object.entries(v))check(x,`${path}.${k}`);};check(s);
  for(const k of ['glucoseMass','aminoAcids','lipids','glycogen','fatStore','proteinStore','plasma','interstitial','intracellular','sodium','bladder'] as const)assert.ok(s[k]>=0,`${k} nonnegative`);
}
const mixedMeal={kind:'meal',meal:{carbs:75,protein:25,fat:20,water:350,sodium:600}} as const;

test('resting circulation and gas exchange remain in broad reference ranges for an hour',()=>{
 const s=createBody();advance(s,3600);conserved(s);
 assert.ok(s.heartRate>60&&s.heartRate<90);assert.ok(s.map>75&&s.map<110);assert.ok(s.saturation>94&&s.saturation<100);assert.ok(glucose(s)>70&&glucose(s)<110);
});
test('mixed meal causes delayed glucose and insulin rise followed by storage and recovery',()=>{
 const s=createBody();applyAction(s,mixedMeal);advance(s,1800);const peakG=glucose(s),peakI=s.hormones.insulin;
 assert.ok(peakG>95,`30 min glucose ${peakG}`);assert.ok(peakI>1.1);assert.ok(s.digestionRates.carbs>0);assert.ok(s.enzymes.lipase>1);
 advance(s,10800);assert.ok(s.glycogen>100,`glycogen ${s.glycogen}`);assert.ok(glucose(s)<peakG);conserved(s);
});
test('water loading expands plasma and suppresses ADH relative to fasting control',()=>{
 const s=createBody(),control=createBody();applyAction(s,{kind:'meal',meal:{carbs:0,protein:0,fat:0,water:750,sodium:0}});advance(s,3600);advance(control,3600);
 assert.ok(s.plasma>control.plasma);assert.ok(s.hormones.adh<control.hormones.adh);assert.ok(s.urineTotal>control.urineTotal);conserved(s);
});
test('exercise raises cardiac, respiratory, and metabolic demand and recovers when removed',()=>{
 const s=createBody();applyAction(s,{kind:'environment',values:{exercise:.5}});advance(s,600);const hr=s.heartRate;
 assert.ok(hr>100);assert.ok(s.oxygenConsumption>800);assert.ok(s.respiratoryRate>18);assert.ok(s.hormones.epinephrine>2);
 applyAction(s,{kind:'environment',values:{exercise:0}});advance(s,1200);assert.ok(s.heartRate<hr-20);conserved(s);
});
test('hypoxic air lowers arterial oxygen and recovery follows room air',()=>{
 const s=createBody();applyAction(s,{kind:'environment',values:{oxygen:.15}});advance(s,600);const low=s.saturation;assert.ok(low<94);
 applyAction(s,{kind:'environment',values:{oxygen:.2095}});advance(s,600);assert.ok(s.saturation>low+3);conserved(s);
});
test('acute stress recruits fast adrenaline and slower cortisol, and both settle when it passes',()=>{
 const s=createBody();applyAction(s,{kind:'environment',values:{stress:.8}});advance(s,120);const epi=s.hormones.epinephrine,hr=s.heartRate;
 assert.ok(epi>2,`adrenaline ${epi}`);assert.ok(s.hormones.cortisol<epi);assert.ok(hr>85,`heart rate ${hr}`);
 advance(s,1800);const cortisol=s.hormones.cortisol;assert.ok(cortisol>1.2,`cortisol ${cortisol}`);
 applyAction(s,{kind:'environment',values:{stress:0}});advance(s,1200);assert.ok(s.hormones.epinephrine<epi/2);assert.ok(s.heartRate<hr-10);conserved(s);
});
test('integer scheduling is deterministic, ordered and applied once at exact boundaries',()=>{
 const a=createBody(),b=createBody();for(const s of [a,b]){schedule(s,60,mixedMeal,'first');schedule(s,60,mixedMeal,'second');}
 advance(a,3600);for(let i=0;i<120;i++)advance(b,30);assert.deepEqual(a,b);
 assert.deepEqual(a.receipts.filter(r=>r.category==='input').map(r=>[r.time,r.title]),[[60,'first'],[60,'second']]);
 assert.equal(a.carbIn,150);assert.equal(a.queue.length,0);conserved(a);
});
test('invalid inputs are rejected before mutation',()=>{
 const s=createBody(),before=structuredClone(s);
 assert.throws(()=>applyAction(s,{kind:'environment',values:{oxygen:NaN}}));assert.throws(()=>applyAction(s,{...mixedMeal,meal:{...mixedMeal.meal,water:-1}}));assert.throws(()=>schedule(s,-1,mixedMeal,'bad'));assert.throws(()=>advance(s,.5));assert.throws(()=>advance(s,Infinity));assert.deepEqual(s,before);
});
test('all preset experiments conserve modeled substrates throughout their duration',()=>{
 for(const scenario of scenarios){const s=createBody();for(const e of scenario.events)schedule(s,e.at,e.action,e.label);advance(s,0);
 for(let t=0;t<scenario.duration;t+=300){advance(s,Math.min(300,scenario.duration-t));conserved(s);}assert.equal(s.queue.length,0);}
});
test('24-hour fasting run stays numerically finite and preserves complete intervention history',()=>{
 const s=createBody();advance(s,86400);conserved(s);assert.ok(s.history.length<=2881);assert.equal(s.time,86400);
 const urine=s.urineTotal;applyAction(s,{kind:'void'});assert.equal(s.bladder,0);assert.equal(s.urineTotal,urine);conserved(s);
});

test('combined inputs preserve accounting across repeatable randomized experiments',()=>{
 let seed=42;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 for(let run=0;run<8;run++){
   const s=createBody();for(let t=0;t<24;t++){
     applyAction(s,{kind:'environment',values:{exercise:random()*.8,oxygen:.15+random()*.08,temperature:15+random()*20,stress:random()*.3,sleep:random()<.2?1:0}});
     if(t%6===0)applyAction(s,{kind:'meal',meal:{carbs:random()*60,protein:random()*25,fat:random()*20,water:random()*400,sodium:random()*500}});
     advance(s,300);conserved(s);
   }
 }
});

test('portal tracer reaches hepatic blood before the systemic artery, preserving total mass',()=>{
 const s=createBody();for(const c of Object.values(s.transport.compartments))c.amounts.glucose=0;
 s.transport.compartments.portal.amounts.glucose=10;transportSubstances(s,1/60);
 assert.ok(s.transport.compartments['liver-blood'].amounts.glucose>0);assert.equal(s.transport.compartments.arterial.amounts.glucose,0);
 for(let t=0;t<60;t++)transportSubstances(s,1/60);assert.ok(s.transport.compartments.arterial.amounts.glucose>0);assert.ok(Math.abs(totalSubstance(s,'glucose')-10)<1e-9);
});
test('oxidation cannot consume oxygen absent from organ blood',()=>{
 const s=createBody();for(const c of Object.values(s.transport.compartments))c.amounts.oxygen=0;s.transport.initialOxygen=0;
 advance(s,1);assert.equal(s.oxygenConsumption,0);assert.equal(s.glucoseUsed,0);assert.equal(s.fatUsed,0);assert.ok(s.oxygenDebt>0);conserved(s);
 advance(s,60);assert.ok(s.oxygenConsumption>0);conserved(s);
});
test('high-throughput blood transport remains nonnegative and conservative',()=>{
 const s=createBody(),initial=totalSubstance(s,'glucose');const ratio=35/s.cardiacOutput;s.cardiacOutput=35;for(const f of s.flows)f.flow*=ratio;s.plasma=1200;
 for(let i=0;i<30;i++)transportSubstances(s,1/60);
 assert.ok(Math.abs(totalSubstance(s,'glucose')-initial)<1e-8);for(const c of Object.values(s.transport.compartments))for(const m of Object.values(c.amounts))assert.ok(m>=-1e-10);
});
test('meal absorption produces a portal-to-systemic nutrient gradient and flux receipts',()=>{
 const s=createBody();applyAction(s,mixedMeal);advance(s,1800);
 assert.ok(concentration(s.transport.compartments.portal,'glucose')>concentration(s.transport.compartments.arterial,'glucose'));
 assert.ok(s.transport.cumulativeFluxes.some(f=>f.from==='intestinal lumen'&&f.to==='portal'&&f.substance==='glucose'&&f.amount>0));
 assert.ok(s.transport.cumulativeFluxes.some(f=>f.from==='lymph'&&f.to==='venous'&&f.substance==='lipids'&&f.amount>0));conserved(s);
});

