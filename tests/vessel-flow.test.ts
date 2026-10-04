import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Atlas} from '../app/anatomy';
import {bedFlows,createVesselFlow,BEAD_INTERVAL,type Bed,type VesselGraph} from '../app/physical/vessel-flow';
import {advance,applyAction,createBody} from '../app/simulation/engine';
const read=<T>(file:string)=>JSON.parse(readFileSync(new URL(`../public/models/${file}`,import.meta.url),'utf8')) as T;
const graph=read<VesselGraph>('vessel-graph.json'),parts=[...read<Atlas>('atlas.json').parts,...read<Atlas>('expansion.json').parts,...read<Atlas>('reconstructed-vessels.json').parts];
const ids=new Map(parts.map((p,i)=>[p.id,i])),named=(name:string)=>(s:{part:string})=>parts[ids.get(s.part)!].name===name;

test('vessel graph conserves bed flow at every junction and reaches each bed exactly once',()=>{
 const S=graph.segments,below=S.map(()=>new Map<string,number>()),roots=new Map<string,number>(),leaf=S.map(()=>true);
 S.forEach((s,i)=>{assert.ok(ids.has(s.part),s.part);assert.ok(s.parent===null||s.parent<i,'parents precede children');assert.ok(s.points.length>=6&&s.radiusMm>0);});
 S.forEach(s=>{if(s.parent!==null&&S[s.parent].away===s.away){leaf[s.parent]=false;for(const [bed,share] of Object.entries(s.share))below[s.parent].set(bed,(below[s.parent].get(bed)??0)+share);}});
 S.forEach((s,i)=>{
  // What a vessel carries is exactly what its branches carry: nothing appears or vanishes at a fork.
  if(!leaf[i])for(const [bed,share] of Object.entries(s.share))assert.ok(Math.abs(share-(below[i].get(bed)??0))<1e-4,`${s.part} ${bed}`);
  if(s.parent===null||S[s.parent].away!==s.away)for(const [bed,share] of Object.entries(s.share)){const key=`${s.circuit} ${s.away} ${bed}`;roots.set(key,(roots.get(key)??0)+share);}
 });
 for(const [key,total] of roots)assert.ok(Math.abs(total-1)<1e-3,`${key}: ${total}`);
 for(const key of ['arterial true heart','arterial true brain','arterial true kidneys','arterial true gut','arterial true liver','arterial true peripheral','venous false hepatic','pulmonary-arterial true lungs','pulmonary-venous false lungs','portal false gut','portal true gut'])assert.ok(roots.has(key),key);
 // Arteries leave the heart and veins approach it.
 const end=(s:typeof S[number],last:boolean)=>s.points.slice(last?-3:0).slice(0,3).map(v=>v/10000),heart=[.022,1.32,.036],far=(p:number[])=>Math.hypot(p[0]-heart[0],p[1]-heart[1],p[2]-heart[2]);
 for(const name of ['Right femoral artery','Right femoral vein','Abdominal aorta']){const s=S.filter(named(name)).sort((a,b)=>b.points.length-a.points.length)[0];assert.ok(far(end(s,true))>far(end(s,false)),name);}
 assert.equal(S.find(named('Right femoral artery'))!.away,true);assert.equal(S.find(named('Right femoral vein'))!.away,false);
});

test('simulated organ flows set vessel flow and speed; exercise speeds the leg, a meal the portal vein',()=>{
 const flow=createVesselFlow(graph,ids),at=(name:string,root=false)=>flow.segments[graph.segments.map((s,i)=>i).filter(i=>named(name)(graph.segments[i])&&(!root||graph.segments[i].parent===null)).sort((a,b)=>graph.segments[b].points.length-graph.segments[a].points.length)[0]];
 const rest=createBody();advance(rest,60);flow.setFlows(bedFlows(rest));
 const beds=bedFlows(rest),systemic=beds.heart+beds.brain+beds.kidneys+beds.gut+beds.liver+beds.peripheral;
 assert.ok(Math.abs(systemic-rest.cardiacOutput/60000)<1e-9,'beds partition cardiac output');
 // Every systemic bed, the brain included, is supplied through the aortic root.
 const aorta=at('Ascending aorta',true);assert.ok(Math.abs(aorta.flow-systemic)/systemic<.01);
 // The brain is fed by both internal carotids and both vertebral arteries through the reconstructed neck segments.
 const neck=['Cervical part of left internal carotid artery','Cervical part of right internal carotid artery','Prevertebral part of left vertebral artery','Prevertebral part of right vertebral artery'].map(name=>graph.segments.reduce((q,s,i)=>q+(named(name)(s)&&!named(name)(graph.segments[s.parent!])?flow.segments[i].flow:0),0));
 assert.ok(neck.every(q=>q>.01*beds.brain),`neck supply ${neck.map(q=>(q/beds.brain).toFixed(3))}`);assert.ok(Math.abs(neck.reduce((a,q)=>a+q,0)-beds.brain)/beds.brain<.02);
 assert.ok(aorta.speed>.05&&aorta.speed<1.5,`aortic mean speed ${aorta.speed} m/s`);
 assert.ok(Math.abs(at('Pulmonary trunk',true).flow-beds.lungs)/beds.lungs<.02);
 const restLeg=at('Right femoral artery').speed,restPortal=at('Hepatic portal vein').flow;
 const moving=createBody();applyAction(moving,{kind:'environment',values:{exercise:.7}});advance(moving,300);flow.setFlows(bedFlows(moving));
 assert.ok(at('Right femoral artery').speed>restLeg*1.5);
 const fed=createBody();applyAction(fed,{kind:'meal',meal:{carbs:60,protein:20,fat:15,water:250,sodium:500}});advance(fed,900);flow.setFlows(bedFlows(fed));
 assert.ok(at('Hepatic portal vein').flow>=restPortal);
 // Beads advance downstream by speed x time and stay on the path.
 flow.setFlows(bedFlows(rest));flow.advance(0,0);
 const femoral=at('Right femoral artery'),sample=()=>{const out:number[][]=[];flow.beads(s=>s===femoral,(x,y,z)=>out.push([x,y,z]));return out;};
 const before=sample();flow.advance(BEAD_INTERVAL/4,BEAD_INTERVAL/4);const after=sample();
 assert.ok(before.length>3&&after.length>=before.length-1);
 const moved=Math.hypot(...after[1].map((v,i)=>v-before[1][i]));assert.ok(Math.abs(moved-Math.max(.004,femoral.speed)*BEAD_INTERVAL/4)<5e-4,`bead moved ${moved} m`);
 for(const p of after)assert.ok(p.every(Number.isFinite));
 for(const bed of Object.keys(beds) as Bed[])assert.ok(beds[bed]>0,bed);
});
