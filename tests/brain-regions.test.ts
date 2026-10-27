import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Atlas} from '../app/anatomy';
import {combineAtlases} from '../app/atlas-loader';
import {createAnatomyIndex} from '../app/physical/anatomy-view';
import {BRAIN_JOBS,BRAIN_PARTS,brainMeshes,jobsOf,partOf} from '../app/brain/regions';
const read=(f:string)=>JSON.parse(readFileSync(`public/models/${f}.json`,'utf8')) as Atlas;
const atlas=combineAtlases(read('atlas'),read('expansion')),index=createAnatomyIndex(atlas),brain=brainMeshes(atlas,index);
const named=(id:string)=>atlas.parts.find(p=>p.id===id)!.name;
test('every brain part is built from real atlas meshes',()=>{
 const used=new Set(brain.parts.values());
 for(const p of BRAIN_PARTS)assert.ok(used.has(p),`${p.name} has no meshes`);
});
test('no brain tissue mesh in the head is left out by accident',()=>{
 const left=atlas.parts.filter(p=>(index.system.get(p.id)==='nervous'||index.groups.brain.has(p.id))&&p.bounds[0][1]>1.5&&!brain.parts.has(p.id)).map(p=>p.name);
 for(const name of left)assert.match(name,/tentorium|lamina terminalis|interpeduncular|septum of telencephalon|ciliary|ethmoidal|frontal nerve|lacrimal|nasociliary|ophthalmic|oculomotor|trochlear|orbital nerve|supratrochlear/i,`${name} is unassigned`);
});
test('parts keep their anatomical names',()=>{
 const cases:[string,string][]=[['Left precentral gyrus','precentral'],['Left inferior frontal gyrus','inferior-frontal'],['Hypothalamus','hypothalamus'],['Left thalamus','thalamus'],['Left lateral geniculate body','thalamus'],['Pituitary gland','pituitary'],['Medulla oblongata','medulla'],['Left inferior colliculus','midbrain'],['Brachium of left inferior colliculus','midbrain'],['Left stria medullaris of thalamus','epithalamus'],['Right thalamus','thalamus'],['Posterior part of left superior temporal gyrus','superior-temporal'],['Third ventricle','ventricles']];
 for(const [name,id] of cases)assert.equal(partOf(name)?.id,id,name);
});
test('jobs and parts are many-to-many, and every thinking part has a job',()=>{
 for(const j of BRAIN_JOBS){
  const roles=Object.entries(j.parts);for(const [id] of roles)assert.ok(BRAIN_PARTS.some(p=>p.id===id),`${j.name} names unknown part ${id}`);
  assert.ok(roles.filter(([,r])=>r==='carries').length>=1,`${j.name} has no main part`);
  assert.ok(roles.length>=4,`${j.name} rests on fewer than four parts`);
 }
 for(const p of BRAIN_PARTS.filter(p=>p.lobe!=='fluid'&&p.lobe!=='wiring'))assert.ok(jobsOf(p).length>=1,`${p.name} has no job`);
 const many=BRAIN_PARTS.filter(p=>jobsOf(p).length>=3).map(p=>p.id);
 for(const id of ['thalamus','cerebellum','hypothalamus','cingulate','midbrain','amygdala'])assert.ok(many.includes(id),`${id} should take part in several jobs`);
 // Textbook anchors: the medulla carries the heartbeat and breathing centres, the hippocampus memory, and speech is not one fold.
 const job=(id:string)=>BRAIN_JOBS.find(j=>j.id===id)!;
 assert.equal(job('vital').parts.medulla,'carries');assert.equal(job('remember').parts.hippocampus,'carries');
 assert.ok(Object.keys(job('language').parts).length>=8);
});
test('both halves of the brain are present for paired parts',()=>{
 for(const part of BRAIN_PARTS.filter(p=>!['hypothalamus','pituitary','epithalamus','corpus-callosum','ventricles','fornix','medulla','pons','midbrain','optic'].includes(p.id))){
  const xs=[...brain.parts].filter(([,x])=>x===part).map(([id])=>atlas.parts.find(p=>p.id===id)!).map(p=>(p.bounds[0][0]+p.bounds[1][0])/2);
  assert.ok(xs.some(x=>x>.002)&&xs.some(x=>x<-.002),`${part.name} is one-sided`);
 }
});
test('the arteries shown are the brain\'s own, and the brain sits inside the skull',()=>{
 const arteries=brain.arteries.map(named);
 for(const name of ['Basilar artery','Right anterior cerebral artery','Left posterior communicating artery'])assert.ok(arteries.includes(name),name);
 assert.ok(arteries.every(n=>!/carotid|facial|lingual|maxillary|superficial temporal/i.test(n)));
 const skull=brain.skull.map(id=>atlas.parts.find(p=>p.id===id)!);
 const lo=[0,1,2].map(i=>Math.min(...skull.map(p=>p.bounds[0][i]))),hi=[0,1,2].map(i=>Math.max(...skull.map(p=>p.bounds[1][i])));
 for(const id of brain.parts.keys()){const b=atlas.parts.find(p=>p.id===id)!.bounds;
  // The optic nerves leave through the eye sockets and the brainstem through the hole at the base of the skull.
  if(/optic nerve|central canal|medulla/i.test(named(id)))continue;for(let i=0;i<3;i++)assert.ok(b[0][i]>=lo[i]-.002&&b[1][i]<=hi[i]+.002,`${named(id)} leaves the skull on axis ${i}`);}
});
