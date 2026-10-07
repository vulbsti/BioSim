import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {Atlas} from '../app/anatomy';
import {chamberFactor,chamberFill,heartPhaseName,HEART_PHASES,type HeartRig} from '../app/physical/heart-motion';
import {CHAMBERS,heartCycle} from '../app/simulation/heart';
import {createBody} from '../app/simulation/engine';

const file=(name:string)=>readFileSync(new URL(`../public/models/${name}`,import.meta.url));
const atlas=JSON.parse(file('atlas.json').toString()) as Atlas,rig=JSON.parse(file('heart-motion.json').toString()) as HeartRig&{binSHA256:string;vertices:number};
const bin=file('heart-motion.bin'),data=new Float32Array(bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength));
const chunks=new Map<number,ArrayBuffer>(),chunk=(i:number)=>{if(!chunks.has(i)){const b=file('..'+atlas.chunks[i].url);chunks.set(i,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}return chunks.get(i)!;};
const mesh=(id:string)=>{const p=atlas.parts.find(p=>p.id===id)!;return {p,P:new Float32Array(chunk(p.chunk),p.positions,p.vertexCount*3),I:new Uint32Array(chunk(p.chunk),p.indices,p.indexCount)};};
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
 assert.equal(createHash('sha256').update(bin).digest('hex'),rig.binSHA256);assert.equal(data.length,rig.vertices*3);
 const heart=new Set(atlas.concepts.find(c=>c.name.toLowerCase()==='heart')!.elements);heart.add('FJ2428');
 assert.deepEqual(Object.keys(rig.parts).sort(),[...heart].filter(id=>atlas.parts.some(p=>p.id===id)).sort());
 for(const [id,r] of Object.entries(rig.parts))assert.equal(r.count,atlas.parts.find(p=>p.id===id)!.vertexCount);
 assert.ok(data.every(x=>Number.isFinite(x)));for(let i=0;i<data.length;i+=3)assert.ok(data[i]>=1&&data[i+1]>=1&&data[i+2]>=0&&data[i+2]<=1);
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
