import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Atlas} from '../app/anatomy';
import {DOTS_AT_REST,GLAND_OF,GLANDS,HORMONE_COLOUR,TARGET_LIT,TARGETS,departure,dotHormone,dotRandom,dotShares,glandDrive,hormoneLevels,targetDrive} from '../app/physical/hormone-lens';
import {advance,applyAction,createBody} from '../app/simulation/engine';
import {HORMONES} from '../app/simulation/types';

const read=(file:string)=>JSON.parse(readFileSync(new URL(`../public/models/${file}`,import.meta.url),'utf8')) as Atlas;
const parts=['atlas.json','expansion.json'].flatMap(f=>read(f).parts);
const meal={kind:'meal',meal:{carbs:75,protein:25,fat:20,water:350,sodium:600}} as const;

test('every hormone has its own colour, a gland in the atlas, and targets the view can show',()=>{
 assert.equal(new Set(HORMONES.map(h=>HORMONE_COLOUR[h])).size,HORMONES.length);
 for(const [gland,{match}] of Object.entries(GLANDS))assert.ok(parts.some(p=>match.test(p.name)),`no atlas part for ${gland}`);
 // No part belongs to two glands, so a part's colour is never ambiguous.
 for(const p of parts)assert.ok(Object.values(GLANDS).filter(g=>g.match.test(p.name)).length<=1,p.name);
 for(const h of HORMONES){assert.ok(GLAND_OF[h] in GLANDS);assert.ok(TARGETS[h].length>0,h);}
 assert.deepEqual([departure(1),departure(2),departure(.5),departure(16),departure(0)],[0,1,-1,1,-1]);
});

test('rest is quiet: no gland releases above rest and no organ lights in the first daytime hour',()=>{
 const s=createBody();advance(s,3600);
 for(const h of HORMONES){assert.ok(glandDrive(s,h)<.15,`${h} gland ${glandDrive(s,h)}`);assert.ok(targetDrive(s,h)<TARGET_LIT,`${h} target ${targetDrive(s,h)}`);}
});

test('a meal is loud: the pancreas releases insulin, the portal vein carries most of it, and muscle and liver light up',()=>{
 const rest=createBody(),s=createBody();applyAction(s,meal);advance(s,1800);advance(rest,1800);
 assert.ok(glandDrive(s,'insulin')>.5,`pancreas ${glandDrive(s,'insulin')}`);assert.ok(glandDrive(s,'glp1')>.5,`gut GLP-1 ${glandDrive(s,'glp1')}`);
 assert.ok(targetDrive(s,'insulin')>.8,`insulin reaching muscle and liver ${targetDrive(s,'insulin')}`);
 // Glucagon falls: the liver stops being told to release sugar.
 assert.ok(s.hormones.glucagon<.6);assert.equal(glandDrive(s,'glucagon'),0);
 const l=hormoneLevels(s,'insulin'),r=hormoneLevels(rest,'insulin');
 assert.ok(l.portal>2*l.arterial,`portal ${l.portal} arterial ${l.arterial}`);assert.ok(l.portal>2*r.portal);
 assert.ok(l.bed.kidneys<l.arterial,'the kidneys clear insulin');
});

test('exercise and stress drive the adrenals and the heart; water quiets ADH; the pineal works at night',()=>{
 const run=createBody();applyAction(run,{kind:'environment',values:{exercise:.6}});advance(run,600);
 assert.ok(glandDrive(run,'epinephrine')>.6);assert.ok(targetDrive(run,'epinephrine')>.8);
 assert.ok(hormoneLevels(run,'epinephrine').bed.kidneys>hormoneLevels(run,'epinephrine').arterial,'adrenaline leaves through the veins beside the kidneys');
 const water=createBody();applyAction(water,{kind:'meal',meal:{carbs:0,protein:0,fat:0,water:750,sodium:0}});advance(water,3600);
 assert.ok(water.hormones.adh<.5);assert.ok(water.urineRate>3);
 const night=createBody();advance(night,16*3600);applyAction(night,{kind:'environment',values:{sleep:1}});advance(night,3*3600);
 assert.ok(glandDrive(night,'melatonin')>.8);assert.ok(night.hormones.cortisol<.7,'cortisol is low in the night');
});

test('dots: a share per hormone that follows its level, fixed per dot, and never all of the blood',()=>{
 const levels=[new Float32Array([1,400,0]),new Float32Array([1,400,2])],shares=dotShares(levels,3),r=DOTS_AT_REST.all;
 assert.ok(Math.abs(shares[1]-2*r)<1e-6);assert.ok(shares[3]<=.85+1e-6);assert.equal(shares[4],0);assert.ok(Math.abs(shares[5]-2*r)<1e-6);
 assert.equal(dotHormone(r/2,shares,0,2),0);assert.equal(dotHormone(r*1.5,shares,0,2),1);assert.equal(dotHormone(.9,shares,1,2),-1);
 // Followed alone, a hormone gets more dots.
 assert.ok(Math.abs(dotShares([levels[0]],3)[0]-DOTS_AT_REST.one)<1e-6);
 assert.equal(dotRandom(7,3),dotRandom(7,3));const u=Array.from({length:2000},(_,i)=>dotRandom(i,5));assert.ok(u.every(x=>x>=0&&x<1));
 assert.ok(Math.abs(u.reduce((a,b)=>a+b,0)/u.length-.5)<.05);
});
