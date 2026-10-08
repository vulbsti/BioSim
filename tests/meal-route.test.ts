import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Atlas} from '../app/anatomy';
import {buildMealRoute,routeAmounts,ROUTE_STATIONS} from '../app/physical/meal-route';
import type {VesselGraph} from '../app/physical/vessel-flow';
import {advance,applyAction,createBody} from '../app/simulation/engine';

const read=<T>(file:string)=>JSON.parse(readFileSync(new URL(`../public/models/${file}`,import.meta.url),'utf8')) as T;
const graph=read<VesselGraph>('vessel-graph.json'),parts=['atlas.json','expansion.json','reconstructed-vessels.json'].flatMap(f=>read<Atlas>(f).parts),names=new Map(parts.map(p=>[p.id,p.name]));
const centreOf=(pattern:RegExp)=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let n=0;for(const p of parts)if(pattern.test(p.name)){n++;for(let x=0;x<3;x++){lo[x]=Math.min(lo[x],p.bounds[0][x]);hi[x]=Math.max(hi[x],p.bounds[1][x]);}}assert.ok(n,`no part matches ${pattern}`);return [0,1,2].map(x=>(lo[x]+hi[x])/2) as [number,number,number];};
const route=buildMealRoute(graph,id=>names.get(id),centreOf);

test('the route runs stomach to thigh muscle through the named vessels, in the order blood flows',()=>{
 assert.deepEqual(route.stations.map(s=>s.id),ROUTE_STATIONS.map(s=>s.id));
 assert.deepEqual([...new Set(route.legs.map(l=>l.station))],['stomach','intestine','portal','liver','veins','lungs','arteries','muscle']);
 for(const vessel of ['Superior mesenteric vein','Hepatic portal vein','Right hepatic vein','Inferior vena cava','Pulmonary trunk','Ascending aorta','Arch of aorta','Abdominal aorta','Left common iliac artery','Left external iliac artery','Left femoral artery','Descending branch of left lateral circumflex femoral artery'])assert.ok(route.vessels.includes(vessel),`route misses ${vessel}: ${route.vessels.join(', ')}`);
 // Vessel order along the arterial leg follows the flow, away from the heart.
 const order=(name:string)=>route.vessels.indexOf(name);assert.ok(order('Ascending aorta')<order('Abdominal aorta')&&order('Abdominal aorta')<order('Left femoral artery')&&order('Superior mesenteric vein')<order('Hepatic portal vein')&&order('Hepatic portal vein')<order('Right hepatic vein'));
 // No segment is used twice, and each circuit is entered once.
 assert.equal(new Set(route.segments).size,route.segments.length);
 const circuits=route.segments.map(i=>graph.segments[i].circuit).filter((c,i,a)=>c!==a[i-1]);assert.deepEqual(circuits,['portal','venous','pulmonary-arterial','pulmonary-venous','arterial']);
});

test('the line is unbroken: each stretch starts where the last one ended, and vessel stretches follow touching centerlines',()=>{
 let previous:number[]|null=null;
 for(const leg of route.legs){
  assert.ok(leg.points.length>=6&&leg.points.every(x=>Number.isFinite(x)));
  if(previous)assert.ok(Math.hypot(leg.points[0]-previous[0],leg.points[1]-previous[1],leg.points[2]-previous[2])<1e-9,`${leg.station} ${leg.kind} does not start where the last stretch ended`);
  previous=leg.points.slice(-3);
  // Inside a vessel stretch, consecutive centerline points are never more than 3 cm apart (a bridged junction at most).
  if(leg.kind==='vessel')for(let k=3;k<leg.points.length;k+=3)assert.ok(Math.hypot(leg.points[k]-leg.points[k-3],leg.points[k+1]-leg.points[k-2],leg.points[k+2]-leg.points[k-1])<.03,`${leg.station} jumps at point ${k/3}`);
 }
 // The route ends in the thigh: the artery's end lies within the muscle's own length of its centre.
 const last=route.legs.at(-1)!.points,gap=Math.hypot(last[0]-last[3],last[1]-last[4],last[2]-last[5]);assert.ok(gap<.2,`artery end is ${(gap*100).toFixed(1)} cm from the muscle centre`);
 assert.ok(route.lengthM>1.5&&route.lengthM<4,`route length ${route.lengthM.toFixed(2)} m`);
 for(const s of route.stations)assert.ok(s.at.every(x=>Number.isFinite(x))&&s.at[1]>.3&&s.at[1]<1.6,`${s.id} at ${s.at}`);
});

test('station amounts are the marked meal: they move down the route and never exceed what was eaten',()=>{
 assert.ok(Object.values(routeAmounts(createBody())).every(x=>x===0));
 const s=createBody();applyAction(s,{kind:'meal',meal:{carbs:60,protein:20,fat:15,water:250,sodium:500}});
 assert.deepEqual(routeAmounts(s),{stomach:60,intestine:0,portal:0,liver:0,veins:0,lungs:0,arteries:0,muscle:0});
 advance(s,300);const early=routeAmounts(s);advance(s,3300);const later=routeAmounts(s);
 assert.ok(early.stomach>50&&early.intestine>early.portal&&early.muscle<.5,JSON.stringify(early));
 assert.ok(later.stomach<early.stomach&&later.liver>10&&later.muscle>early.muscle&&later.muscle>1,JSON.stringify(later));
 for(const amounts of [early,later])assert.ok(Object.values(amounts).reduce((a,b)=>a+b,0)<=60+1e-9);
});
