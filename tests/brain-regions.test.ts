import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Atlas} from '../app/anatomy';
import {combineAtlases} from '../app/atlas-loader';
import {createAnatomyIndex} from '../app/physical/anatomy-view';
import {BRAIN_REGIONS,brainParts,regionOf} from '../app/brain/regions';
const read=(f:string)=>JSON.parse(readFileSync(`public/models/${f}.json`,'utf8')) as Atlas;
const atlas=combineAtlases(read('atlas'),read('expansion')),index=createAnatomyIndex(atlas),brain=brainParts(atlas,index);
const named=(id:string)=>atlas.parts.find(p=>p.id===id)!.name;
test('every brain region is built from real atlas meshes',()=>{
 const used=new Set(brain.regions.values());
 for(const r of BRAIN_REGIONS)assert.ok(used.has(r),`${r.name} has no meshes`);
 assert.ok(BRAIN_REGIONS.length>=15&&BRAIN_REGIONS.length<=20);
});
test('no brain tissue mesh in the head is left out by accident',()=>{
 const left=atlas.parts.filter(p=>(index.system.get(p.id)==='nervous'||index.groups.brain.has(p.id))&&p.bounds[0][1]>1.5&&!brain.regions.has(p.id)).map(p=>p.name);
 for(const name of left)assert.match(name,/tentorium|lamina terminalis|interpeduncular|septum of telencephalon|ciliary|ethmoidal|frontal nerve|lacrimal|nasociliary|ophthalmic|oculomotor|trochlear|orbital nerve|supratrochlear/i,`${name} is unassigned`);
});
test('areas are named by what they do, and the classic landmarks land in the right place',()=>{
 const cases:[string,string][]=[['Left precentral gyrus','movement'],['Right postcentral gyrus','touch'],['Left inferior frontal gyrus','speech'],['Right inferior frontal gyrus','planning'],['Left occipital lobe','vision'],['Left hippocampus','memory'],['Right amygdala','emotion'],['Hypothalamus','hormones'],['Pituitary gland','hormones'],['Medulla oblongata','autonomic'],['Cerebellum','balance'],['Left insula','feelings'],['Posterior part of left superior temporal gyrus','language'],['Anterior part of left superior temporal gyrus','hearing'],['Left thalamus','relay'],['Left stria medullaris of thalamus','emotion'],['Brachium of left inferior colliculus','hearing']];
 for(const [name,id] of cases)assert.equal(regionOf(name)?.id,id,name);
});
test('both halves of the brain are present for paired areas',()=>{
 for(const r of BRAIN_REGIONS.filter(r=>!['speech','hormones','autonomic','fluid'].includes(r.id))){
  const xs=[...brain.regions].filter(([,x])=>x===r).map(([id])=>atlas.parts.find(p=>p.id===id)!).map(p=>(p.bounds[0][0]+p.bounds[1][0])/2);
  assert.ok(xs.some(x=>x>.002)&&xs.some(x=>x<-.002),`${r.name} is one-sided`);
 }
});
test('the arteries shown are the brain\'s own, and the brain sits inside the skull',()=>{
 const arteries=brain.arteries.map(named);
 for(const name of ['Basilar artery','Right anterior cerebral artery','Left posterior communicating artery'])assert.ok(arteries.includes(name),name);
 assert.ok(arteries.every(n=>!/carotid|facial|lingual|maxillary|superficial temporal/i.test(n)),arteries.filter(n=>/carotid|facial|lingual/i.test(n)).join());
 const skull=brain.skull.map(id=>atlas.parts.find(p=>p.id===id)!);
 const lo=[0,1,2].map(i=>Math.min(...skull.map(p=>p.bounds[0][i]))),hi=[0,1,2].map(i=>Math.max(...skull.map(p=>p.bounds[1][i])));
 for(const id of brain.regions.keys()){const b=atlas.parts.find(p=>p.id===id)!.bounds;// The optic nerves leave through the eye sockets and the brainstem through the hole at the base of the skull.
 if(/optic nerve|central canal|medulla/i.test(named(id)))continue;for(let i=0;i<3;i++)assert.ok(b[0][i]>=lo[i]-.002&&b[1][i]<=hi[i]+.002,`${named(id)} leaves the skull on axis ${i}`);}
});
