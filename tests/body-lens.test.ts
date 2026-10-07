import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Atlas} from '../app/anatomy';
import {createBodyLens,tint} from '../app/physical/body-lens';
import {bedFlows,createVesselFlow,type VesselGraph} from '../app/physical/vessel-flow';
import {advance,applyAction,createBody} from '../app/simulation/engine';
const read=<T>(file:string)=>JSON.parse(readFileSync(new URL(`../public/models/${file}`,import.meta.url),'utf8')) as T;
const graph=read<VesselGraph>('vessel-graph.json'),parts=['atlas.json','expansion.json','reconstructed-vessels.json'].flatMap(f=>read<Atlas>(f).parts),ids=new Map(parts.map((p,i)=>[p.id,i]));
const lens=createBodyLens(createBody());

test('a meal shows on the body in the order blood carries it: portal, then liver, then arteries',()=>{
 assert.deepEqual([tint(1),tint(2),tint(.5),tint(8),tint(0)],[0,1,-1,1,-1]);
 const rest=createBody(),r=lens.levels(rest,'glucose');
 for(const v of [r.arterial,r.venous,r.portal,...Object.values(r.bed)])assert.ok(Math.abs(v-1)<1e-9);
 // At rest veins already carry less oxygen than arteries: what the organs extracted.
 assert.ok(lens.levels(rest,'oxygen').venous<.8);
 const fed=createBody();applyAction(fed,{kind:'meal',meal:{carbs:60,protein:20,fat:15,water:250,sodium:500}});advance(fed,1800);
 const l=lens.levels(fed,'glucose');
 assert.ok(l.portal>l.bed.hepatic&&l.bed.hepatic>l.arterial&&l.arterial>1.1,JSON.stringify(l));
 // The liver is where most of it leaves the blood; every organ's tissue level is at or above rest.
 const uptake=(['liver','muscle','brain','heart','kidneys'] as const).map(o=>lens.uptake(fed,o,'glucose'));
 assert.ok(uptake[0]>.2&&uptake.slice(1).every(u=>u<uptake[0]),`uptake g/min ${uptake.map(u=>u.toFixed(3))}`);
 assert.ok(lens.organ(fed,'liver','glucose')>1&&lens.organ(fed,'muscle','glucose')>1);
 assert.ok(lens.uptake(fed,'muscle','oxygen')>0&&lens.uptake(fed,'muscle','carbonDioxide')<0);
});

test('veins carry the flow-weighted blend of the beds they drain',()=>{
 const flow=createVesselFlow(graph,ids),fed=createBody();applyAction(fed,{kind:'meal',meal:{carbs:60,protein:20,fat:15,water:250,sodium:500}});advance(fed,1800);
 flow.setFlows(bedFlows(fed));const l=lens.levels(fed,'glucose');flow.setLevels(l);
 const at=(name:string)=>flow.segments[graph.segments.map((s,i)=>i).filter(i=>parts[ids.get(graph.segments[i].part)!].name===name).sort((a,b)=>graph.segments[b].points.length-graph.segments[a].points.length)[0]];
 assert.equal(at('Abdominal aorta').level,l.arterial);assert.equal(at('Pulmonary trunk').level,l.venous);
 assert.equal(at('Hepatic portal vein').level,l.portal);assert.equal(at('Superior mesenteric vein').level,l.gut);
 assert.ok(Math.abs(at('Right femoral vein').level-l.bed.peripheral)<1e-9);assert.ok(Math.abs(at('Right hepatic vein').level-l.bed.hepatic)<1e-9);
 // The inferior vena cava mixes hepatic, renal and peripheral returns, so it lies between them.
 const cava=flow.segments.filter((s,i)=>parts[ids.get(graph.segments[i].part)!].name==='Inferior vena cava'&&s.share.length>=3).sort((a,b)=>b.flow-a.flow)[0];
 const mixed=cava.share.map(([bed])=>l.bed[bed]);assert.ok(cava.level>Math.min(...mixed)&&cava.level<Math.max(...mixed),`${cava.level} within ${mixed}`);
});
