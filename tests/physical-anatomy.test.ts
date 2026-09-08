import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {BufferAttribute,BufferGeometry,Vector3} from 'three';
import type {Atlas,Part} from '../app/anatomy';
import {combineAtlases} from '../app/atlas-loader';
import {createAnatomyIndex,partOpacity,type PhysicalViewState} from '../app/physical/anatomy-view';
import {createTracerRoute,tracerKind} from '../app/physical/flow-routes';
import {cardiacContraction,respiratoryCycle,motionRates} from '../app/physical/motion';
import {applyAction,advance,createBody} from '../app/simulation/engine';
import {auditBrainVessels} from '../app/simulation/brain-coverage';
const read=(file:string)=>JSON.parse(readFileSync(new URL(`../public/models/${file}`,import.meta.url),'utf8')) as Atlas;
const base=read('atlas.json'),expansion=read('expansion.json'),lungs=read('lung-surfaces.json'),atlas=combineAtlases(combineAtlases(base,expansion),lungs);

test('source additions preserve base identity and have valid, finite geometry and complete concepts',()=>{
 assert.equal(atlas.parts.length,2273);assert.equal(new Set(atlas.parts.map(p=>p.id)).size,2273);
 assert.equal(atlas.triangles,2548238);assert.deepEqual(atlas.parts.slice(0,2234).map(p=>[p.id,p.positions,p.chunk]),base.parts.map(p=>[p.id,p.positions,p.chunk]));
 for(const addition of [expansion,lungs]){
  const buffers=addition.chunks.map(c=>{const raw=readFileSync(new URL(`../public${c.url}`,import.meta.url));assert.equal(raw.length,c.bytes);assert.deepEqual(gunzipSync(readFileSync(new URL(`../public${c.gzip}`,import.meta.url))),raw);return raw;});
  for(const p of addition.parts){const b=buffers[p.chunk];assert.ok(p.indices+p.indexCount*4<=b.length);const pos=new Float32Array(b.buffer,b.byteOffset+p.positions,p.vertexCount*3),idx=new Uint32Array(b.buffer,b.byteOffset+p.indices,p.indexCount);
   for(let i=0;i<pos.length;i++){assert.ok(Number.isFinite(pos[i]));assert.ok(pos[i]>=p.bounds[0][i%3]-1e-6&&pos[i]<=p.bounds[1][i%3]+1e-6);}
   for(const i of idx)assert.ok(i<p.vertexCount);
  }
  assert.equal(addition.parts.reduce((n,p)=>n+p.indexCount/3,0),addition.triangles);
 }
 const ids=new Set(atlas.parts.map(p=>p.id));for(const c of atlas.concepts)for(const id of c.elements)assert.ok(ids.has(id),`${c.id}: missing ${id}`);
 assert.throws(()=>combineAtlases(base,base),/Duplicate/);
});

test('display corrections retain actual heart, liver, brain and lung surfaces through isolation',()=>{
 const index=createAnatomyIndex(atlas);assert.ok(index.groups.heart.has('FJ2428'));
 assert.equal(atlas.parts.filter(p=>index.groups.lungs.has(p.id)&&p.id.startsWith('BP3D3-')).length,5);
 for(const p of atlas.parts.filter(p=>/^Hepatovenous segment/i.test(p.name)))assert.equal(index.system.get(p.id),'digestive');
 const thyroid=atlas.concepts.find(c=>c.name.toLowerCase()==='thyroid gland');assert.ok(thyroid);assert.equal(thyroid.elements.length,3);
 const v:PhysicalViewState={preset:'organs',region:'selection',selected:thyroid.elements,isolate:true,context:.5,cut:'none',slice:.5,angle:'front',focus:0,reset:0,hidden:[]};
 assert.equal(atlas.parts.filter(p=>partOpacity(p,index,v)>0).length,3);
 assert.equal(atlas.parts.filter(p=>partOpacity(p,index,{...v,hidden:thyroid.elements})>0).length,0);
});

test('cranial venous additions never become cerebral arterial territory associations',()=>{
 const audit=auditBrainVessels(atlas);assert.equal(audit.vessels.length,178);assert.equal(audit.missingVenousGeometry,false);
 const venous=audit.vessels.filter(p=>p.system==='venous');assert.equal(venous.length,27);
 for(const v of venous)assert.ok(v.nodes.every(n=>!/-(aca|pca|ica|frontal|visual|lateral)$/.test(n)),v.name);
 const saved=JSON.parse(readFileSync(new URL('../docs/brain-vessel-coverage.json',import.meta.url),'utf8'));assert.deepEqual(saved.vessels,audit.vessels);
});

test('display routes handle Float32 boundary drift and distinguish pulmonary direction and oxygen color',()=>{
 const geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array([0,1.15,0,0,1.4,0,0,1.6,0]),3));
 const part={name:'Left pulmonary artery',bounds:[[0,1.1500001,0],[0,1.6,0]]} as Part;
 const artery=createTracerRoute(part,0,geometry)!,vein=createTracerRoute({...part,name:'Left superior pulmonary vein'},0,geometry)!;
 assert.ok(artery.curve.getPointAt(0).distanceTo(new Vector3(.022,1.32,.036))<artery.curve.getPointAt(1).distanceTo(new Vector3(.022,1.32,.036)));
 assert.ok(vein.color.r>vein.color.b);assert.ok(artery.color.b>artery.color.r);
 for(let i=0;i<=100;i++)assert.ok(artery.curve.getPointAt(i/100).toArray().every(Number.isFinite));
 assert.equal(tracerKind('Right renal artery'),'blood');assert.equal(tracerKind('Right anterior cerebral vein'),null);
});

test('cycles remain continuous and exercise and a meal drive visual rates from the solver',()=>{
 for(let i=0;i<1000;i++){const p=i/1000,r=respiratoryCycle(p);assert.ok(r.inflation>=0&&r.inflation<=1);assert.ok(cardiacContraction(p)>=0&&cardiacContraction(p)<=1);}
 assert.ok(Math.abs(respiratoryCycle(.4-1e-6).inflation-respiratoryCycle(.4+1e-6).inflation)<1e-8);
 assert.ok(Math.abs(respiratoryCycle(1-1e-6).inflation-respiratoryCycle(0).inflation)<1e-8);
 const s=createBody(),rest=motionRates(s);applyAction(s,{kind:'environment',values:{exercise:.65}});advance(s,300);const moving=motionRates(s);
 assert.ok(moving.heartHz>rest.heartHz);assert.ok(moving.breathHz>rest.breathHz);assert.ok(moving.bloodSpeed>rest.bloodSpeed);assert.ok(moving.lungExcursion>rest.lungExcursion);
 const meal=createBody();assert.equal(motionRates(meal).digesting,0);applyAction(meal,{kind:'meal',meal:{carbs:60,protein:20,fat:15,water:250,sodium:500}});assert.ok(motionRates(meal).digesting>0);advance(meal,300);assert.ok(meal.digestionRates.carbs+meal.digestionRates.protein>0);
});


test('every chosen source route samples finitely and includes both main bronchi',()=>{
 const buffers=new Map<number,Buffer>();let air=0,blood=0;
 for(const p of atlas.parts){if(!tracerKind(p.name))continue;
  if(!buffers.has(p.chunk))buffers.set(p.chunk,readFileSync(new URL(`../public${atlas.chunks[p.chunk].url}`,import.meta.url)));
  const b=buffers.get(p.chunk)!,geometry=new BufferGeometry();geometry.setAttribute('position',new BufferAttribute(new Float32Array(b.buffer,b.byteOffset+p.positions,p.vertexCount*3),3));
  const route=createTracerRoute(p,0,geometry);assert.ok(route,p.name);
  for(let i=0;i<=30;i++)assert.ok(route.curve.getPointAt(i/30).toArray().every(Number.isFinite),p.name);
  if(route.kind==='air')air++;if(route.kind==='blood')blood++;
 }
 assert.equal(air,3);assert.ok(blood>30);
 const s=createBody();s.heartRate=0;s.respiratoryRate=0;s.tidalVolume=0;s.cardiacOutput=0;const rates=motionRates(s);
 assert.equal(rates.heartHz+rates.breathHz+rates.lungExcursion+rates.bloodSpeed,0);
});
