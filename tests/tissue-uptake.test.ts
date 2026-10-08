import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {advance,applyAction,createBody} from '../app/simulation/engine';
import {countInWords,FULL_RATE_G_PER_MIN,MAX_DOTS_PER_SECOND,segmentVolumeL,tissueUptake} from '../app/tissue/uptake';

const manifest=JSON.parse(readFileSync(new URL('../public/models/multiscale/muscle-pilot/manifest.json',import.meta.url),'utf8')),fascicle=manifest.levels.fascicle,layout=fascicle.layout;
const radius=Math.max(...layout.fiberCentersM.map((p:number[])=>Math.hypot(p[0],p[2])))+layout.fiberRadiusM,segment=segmentVolumeL(radius,fascicle.spanM),rest=createBody();
const meal={kind:'meal' as const,meal:{carbs:60,protein:20,fat:15,water:250,sodium:500}};

test('the fascicle segment is a fraction of a cubic millimetre, and every capillary has fibres beside it',()=>{
 // About 0.4 mm across and 1.4 mm long.
 assert.ok(radius>.00015&&radius<.00025&&segment>1e-7&&segment<3e-7,`radius ${radius} m, volume ${segment} L`);
 assert.equal(layout.capillaryCentersM.length,5);assert.equal(layout.fiberCentersM.length,37);
 for(const c of layout.capillaryCentersM){const nearest=Math.min(...layout.fiberCentersM.map((f:number[])=>Math.hypot(f[0]-c[0],f[2]-c[2])));assert.ok(nearest>layout.fiberRadiusM&&nearest<layout.fiberRadiusM+4*layout.capillaryRadiusM,`capillary ${c} is ${nearest} m from the nearest fibre centre`);}
 assert.deepEqual([countInWords(0),countInWords(950),countInWords(2.1e9),countInWords(4.3e10),countInWords(7e12)],['0','950','2.1 billion','43 billion','7.0 trillion']);
});

test('uptake follows the body run: little at rest, more after a meal, most of it the meal itself later',()=>{
 const before=createBody();advance(before,60);const resting=tissueUptake(before,rest,segment);
 assert.ok(Math.abs(resting.capillaryLevel-1)<.05&&resting.mealShare===0);
 const fed=createBody();applyAction(fed,meal);advance(fed,1800);const u=tissueUptake(fed,rest,segment);
 assert.ok(u.netGPerMin>resting.netGPerMin+.02&&u.netGPerMin<1,`net ${u.netGPerMin} g/min against ${resting.netGPerMin} at rest`);
 assert.ok(u.capillaryLevel>1.1&&u.mealShare>.1&&u.mealShare<1,JSON.stringify(u));
 // Dots follow the rate up to a ceiling, and each stands for the same stated number of molecules.
 assert.ok(Math.abs(u.dotsPerSecond-Math.min(MAX_DOTS_PER_SECOND,u.netGPerMin/FULL_RATE_G_PER_MIN*MAX_DOTS_PER_SECOND))<1e-9&&u.dotsPerSecond>resting.dotsPerSecond);
 assert.ok(Math.abs(u.moleculesPerDot*u.dotsPerSecond-u.moleculesPerSecond)<u.moleculesPerSecond*1e-9);
 // The segment's molecules per second are the whole muscle's uptake times the segment's share of muscle volume.
 const muscleL=(fed.transport.compartments['muscle-tissue'].volume+fed.transport.compartments['muscle-cell'].volume)/1000,whole=u.netGPerMin/60/180.156*6.02214076e23;
 assert.ok(Math.abs(u.moleculesPerSecond-whole*segment/muscleL)<whole*segment/muscleL*1e-9);assert.ok(u.moleculesPerSecond>1e9&&u.moleculesPerSecond<1e13,String(u.moleculesPerSecond));
 const later=createBody();applyAction(later,meal);advance(later,7200);assert.ok(tissueUptake(later,rest,segment).mealShare>u.mealShare);
});

test('exercise without a meal still draws glucose into muscle, with none of it marked',()=>{
 const run=createBody();applyAction(run,{kind:'environment',values:{exercise:.7}});advance(run,900);const u=tissueUptake(run,rest,segment);
 assert.ok(u.netGPerMin>.05&&u.mealShare===0&&u.dotsPerSecond>5,JSON.stringify(u));
});
