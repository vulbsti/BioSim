import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {Atlas} from '../app/anatomy';
import {chamberFactor,chamberFill,conductionGlow,CONDUCTION_STAGES,easeValves,heartPhaseName,HEART_PHASES,leafletKind,RHO_STEP,type HeartRig} from '../app/physical/heart-motion';
import {CHAMBERS,VALVES,heartCycle} from '../app/simulation/heart';
import {createBody} from '../app/simulation/engine';
import {combineAtlases} from '../app/atlas-loader';

const file=(name:string)=>readFileSync(new URL(`../public/models/${name}`,import.meta.url));
const atlas=JSON.parse(file('atlas.json').toString()) as Atlas,rig=JSON.parse(file('heart-motion.json').toString()) as HeartRig&{binSHA256:string;valvesSHA256:string;deltaVertices:number},conduction=JSON.parse(file('heart-conduction.json').toString()) as Atlas;
const provenance=JSON.parse(readFileSync(new URL('../docs/heart-package-provenance.json',import.meta.url),'utf8')),asset=(name:string)=>readFileSync(new URL(`../assets/heart/${name}`,import.meta.url));
const bin=file('heart-motion.bin'),data=new Float32Array(bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength));
const chunks=new Map<number,ArrayBuffer>(),chunk=(i:number)=>{if(!chunks.has(i)){const b=file('..'+atlas.chunks[i].url);chunks.set(i,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}return chunks.get(i)!;};
const mesh=(id:string)=>{const p=atlas.parts.find(p=>p.id===id)!;return {p,P:new Float32Array(chunk(p.chunk),p.positions,p.vertexCount*3),I:new Uint32Array(chunk(p.chunk),p.indices,p.indexCount)};};
const conductionBin=file('heart-conduction.bin'),conductionMesh=(id:string)=>{const p=conduction.parts.find(p=>p.id===id)!,b=conductionBin.buffer.slice(conductionBin.byteOffset,conductionBin.byteOffset+conductionBin.byteLength);return {p,P:new Float32Array(b,p.positions,p.vertexCount*3),I:new Uint32Array(b,p.indices,p.indexCount)};};
const volume=(P:Float32Array|number[],I:Uint32Array)=>{let v=0;for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3;v+=(P[a]*(P[b+1]*P[c+2]-P[b+2]*P[c+1])-P[a+1]*(P[b]*P[c+2]-P[b+2]*P[c])+P[a+2]*(P[b]*P[c+1]-P[b+1]*P[c]))/6;}return Math.abs(v)*1e6;};
/** The vertex shader's motion, on the CPU. */
const moved=(id:string,fill:number[])=>{
 const {P}=mesh(id),r=rig.parts[id],out=new Array<number>(P.length),centers=CHAMBERS.map(k=>rig.chambers[k].center);
 for(let v=0;v<r.count;v++){
  const [ra,rb,w]=data.subarray((r.offset+v)*3,(r.offset+v)*3+3),fa=chamberFactor(ra,fill[r.a]),fb=chamberFactor(rb,fill[r.b]);
  for(let x=0;x<3;x++){const p=P[v*3+x],a=centers[r.a][x]+(p-centers[r.a][x])*fa,b=centers[r.b][x]+(p-centers[r.b][x])*fb;out[v*3+x]=b+(a-b)*w;}
 }
 return out;
};

test('the rig is the one the build script writes, and covers every heart mesh',()=>{
 assert.equal(createHash('sha256').update(bin).digest('hex'),rig.binSHA256);assert.equal(data.length,(rig.vertices+rig.deltaVertices)*3);
 const heart=new Set(atlas.concepts.find(c=>c.name.toLowerCase()==='heart')!.elements);heart.add('FJ2428');
 assert.deepEqual(Object.keys(rig.parts).sort(),[...[...heart].filter(id=>atlas.parts.some(p=>p.id===id)),...conduction.parts.map(p=>p.id)].sort());
 for(const [id,r] of Object.entries(rig.parts))assert.equal(r.count,[...atlas.parts,...conduction.parts].find(p=>p.id===id)!.vertexCount);
 assert.ok(data.every(x=>Number.isFinite(x)));for(let i=0;i<rig.vertices*3;i+=3)assert.ok(data[i]>=1&&data[i+1]>=1&&data[i+2]>=0&&data[i+2]<=1);
 // The source cavities are closed and near a filled adult heart.
 const v=rig.chambers;assert.ok(v.lv.sourceVolumeMl>80&&v.lv.sourceVolumeMl<150&&v.rv.sourceVolumeMl>90&&v.la.sourceVolumeMl>35&&v.ra.sourceVolumeMl>35);
});

test('each cavity mesh holds exactly the simulated share of its volume, and the wall keeps its own',()=>{
 const cycle=heartCycle(createBody()),fill=[0,0,0,0];
 for(const phase of [0,.15,.3,.5,.9]){
  chamberFill(cycle,phase,fill);
  CHAMBERS.forEach((k,i)=>{const {I,P}=mesh(rig.chambers[k].cavity),ratio=volume(moved(rig.chambers[k].cavity,fill),I)/volume(P,I);assert.ok(Math.abs(ratio-fill[i])<1e-4,`${k} at ${phase}: mesh ${ratio} model ${fill[i]}`);});
 }
 // At end systole the ventricles have lost over 40% of their volume, yet the wall's own volume changes little.
 chamberFill(cycle,cycle.events.aortic.closes,fill);assert.ok(fill[1]<.6&&fill[3]<.6,JSON.stringify(fill));
 const wall=mesh('FJ2428'),kept=volume(moved('FJ2428',fill),wall.I)/volume(wall.P,wall.I);assert.ok(kept>.8&&kept<1.2,`ventricular wall volume ratio ${kept}`);
 // Nothing moves outward, and the outer wall moves less than the inner.
 assert.ok(chamberFactor(1,.5)<chamberFactor(1.5,.5)&&chamberFactor(1.5,.5)<chamberFactor(3,.5)&&chamberFactor(3,.5)<1);assert.equal(chamberFactor(2,1),1);
});

test('the phase name follows the simulated valves through the whole cycle in order',()=>{
 const cycle=heartCycle(createBody()),seen:string[]=[];
 for(let i=0;i<240;i++){const name=heartPhaseName(cycle,i/240);if(seen.at(-1)!==name)seen.push(name);}
 assert.deepEqual(seen,[...HEART_PHASES]);
});

test('the Blender-built valve shapes are the ones in the rig, and every leaflet opens its valve',()=>{
 const valves=JSON.parse(asset('valves.json').toString()) as {valves:string[];binSHA256:string;parts:Record<string,{valve:number;name:string;offset:number;count:number}>},shape=asset('valves.bin');
 const sha=createHash('sha256').update(shape).digest('hex');assert.equal(sha,valves.binSHA256);assert.equal(sha,rig.valvesSHA256);assert.equal(sha,provenance.outputs['assets/heart/valves.bin']);
 assert.equal(createHash('sha256').update(conductionBin).digest('hex'),provenance.outputs['public/models/heart-conduction.bin']);
 // Eleven leaflets and cusps: two mitral, three each for the other valves, each on its own valve and chamber.
 const leaflets=Object.entries(rig.parts).filter(([,r])=>r.valve!==undefined),count=VALVES.map((_,v)=>leaflets.filter(([,r])=>r.valve===v).length);
 assert.deepEqual(Object.fromEntries(VALVES.map((k,i)=>[k,count[i]])),{mitral:2,aortic:3,tricuspid:3,pulmonary:3});
 for(const [id,r] of leaflets){
  const name=atlas.parts.find(p=>p.id===id)!.name.toLowerCase(),valve=VALVES[r.valve!];assert.ok(name.includes(valve),`${name} on ${valve}`);
  assert.equal(r.a,valve==='mitral'||valve==='aortic'?1:3);assert.equal(r.a,r.b);
  const delta=data.subarray((rig.vertices+r.delta!)*3,(rig.vertices+r.delta!+r.count)*3);let largest=0,still=0;
  for(let v=0;v<r.count;v++){const d=Math.hypot(delta[v*3],delta[v*3+1],delta[v*3+2]);largest=Math.max(largest,d);if(d<5e-4)still++;}
  // Part of every leaflet stays within half a millimetre where it is attached, and part of it moves by millimetres, not centimetres.
  assert.ok(still>r.count*.03&&largest>.003&&largest<.025,`${name}: ${still} of ${r.count} still, largest move ${(largest*1000).toFixed(1)} mm`);
 }
 // The opening each valve clears, as the build measured it.
 for(const k of VALVES){const v=provenance.valves[k];assert.ok(v.openAreaShareOfAnnulus>.3&&v.openAreaShareOfAnnulus<.85,`${k} open share ${v.openAreaShareOfAnnulus}`);const clear=v.clearRadiusMm??v.openingRadiusMm;assert.ok(clear.open>clear.closed+5,`${k} ${JSON.stringify(clear)}`);}
 // The kind packs valve, chamber and radius, and the shader's unpacking recovers them.
 const kind=leafletKind(2,3,1.2345),code=kind-10000,combo=Math.floor(code/1000+.0005);assert.deepEqual([Math.floor(combo/4+.01),combo-4*Math.floor(combo/4+.01)],[2,3]);assert.ok(Math.abs(1+(code-combo*1000)*RHO_STEP-1.2345)<=RHO_STEP/2);assert.ok(kind<2**24);
});

test('valves follow the simulated beat, and the conduction stages light in order before the ventricles contract',()=>{
 const cycle=heartCycle(createBody()),open=[0,0,0,0],seen={mitral:[1,0],aortic:[1,0]};
 for(let beat=0;beat<2;beat++)for(let i=0;i<240;i++){
  easeValves(cycle,i/240,60/72/240,open);
  // A ventricle's inlet and outlet are never both more than half open.
  assert.ok(!(open[0]>.5&&open[1]>.5)&&!(open[2]>.5&&open[3]>.5),`phase ${i/240}: ${open.map(x=>x.toFixed(2))}`);
  seen.mitral=[Math.min(seen.mitral[0],open[0]),Math.max(seen.mitral[1],open[0])];seen.aortic=[Math.min(seen.aortic[0],open[1]),Math.max(seen.aortic[1],open[1])];
 }
 assert.ok(seen.mitral[0]<.05&&seen.mitral[1]>.95&&seen.aortic[0]<.05&&seen.aortic[1]>.95,JSON.stringify(seen));
 // Peak time of each stage, seconds before (negative) or after the start of ventricular contraction.
 const period=60/72,peak=CONDUCTION_STAGES.map(stage=>{let sum=0,weight=0;for(let i=0;i<2000;i++){const phase=i/2000,g=conductionGlow(stage,phase,72),t=phase>.5?(phase-1)*period:phase*period;sum+=g*t;weight+=g;}assert.ok(weight>0,stage);return sum/weight;});
 for(let i=1;i<peak.length;i++)assert.ok(peak[i]>=peak[i-1],`${CONDUCTION_STAGES[i]} at ${peak[i].toFixed(3)} s before ${CONDUCTION_STAGES[i-1]} at ${peak[i-1].toFixed(3)} s`);
 // The sinoatrial node fires with atrial contraction; the Purkinje fibres as the ventricles start.
 assert.ok(peak[0]<-.1&&Math.abs(peak[6])<.03&&conductionGlow('sa',.5,72)===0&&conductionGlow('purkinje',0,72)===1);
 // The atrioventricular node holds the impulse longest.
 const held=CONDUCTION_STAGES.map(stage=>{let n=0;for(let i=0;i<2000;i++)if(conductionGlow(stage,i/2000,72)>.5)n++;return n;});assert.equal(Math.max(...held),held[2]);
});

test('the modelled conduction system sits in the heart and joins the atlas as heart parts',()=>{
 assert.equal(conduction.parts.length,10);assert.deepEqual([...new Set(conduction.parts.map(p=>p.stage))].sort(),[...CONDUCTION_STAGES].sort());
 const heartBox=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];for(const id of Object.keys(rig.parts)){const p=atlas.parts.find(p=>p.id===id);if(!p)continue;for(let x=0;x<3;x++){heartBox[0][x]=Math.min(heartBox[0][x],p.bounds[0][x]);heartBox[1][x]=Math.max(heartBox[1][x],p.bounds[1][x]);}}
 for(const p of conduction.parts){
  assert.equal(p.system,'cardiac');assert.equal(p.sourceVersion,'modelled');assert.ok(!atlas.parts.some(q=>q.id===p.id));
  for(let x=0;x<3;x++)assert.ok(p.bounds[0][x]>heartBox[0][x]-.01&&p.bounds[1][x]<heartBox[1][x]+.01,`${p.name} lies outside the heart`);
  const {P,I}=conductionMesh(p.id);assert.ok(I.every(i=>i<p.vertexCount)&&P.every(x=>Number.isFinite(x)));assert.ok(volume(P,I)>0,`${p.name} has no volume`);
 }
 const combined=combineAtlases(atlas,conduction),heartConcept=combined.concepts.find(c=>c.name.toLowerCase()==='heart')!;
 for(const p of conduction.parts)assert.ok(heartConcept.elements.includes(p.id));assert.ok(combined.concepts.some(c=>c.name==='cardiac conduction system'&&c.elements.length===10));
 // Nodes are small bodies; the sinoatrial node is the larger. Volumes in cubic millimetres.
 const node=(id:string)=>{const {P,I}=conductionMesh(id);return volume(P,I)*1000;};assert.ok(node('COND-SA')>40&&node('COND-SA')<120&&node('COND-AV')>8&&node('COND-AV')<node('COND-SA'),`${node('COND-SA')} ${node('COND-AV')}`);
});
