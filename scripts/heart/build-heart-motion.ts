// Builds the heart motion rig from the source heart meshes: which chambers move each vertex, and
// how far out from each cavity it sits. Deterministic; reads only the packaged atlas.
//   npx tsx scripts/heart/build-heart-motion.ts
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {Atlas} from '../../app/anatomy';
import {CHAMBERS} from '../../app/simulation/heart';

const ROOT=new URL('../../public/models/',import.meta.url),atlas=JSON.parse(readFileSync(new URL('atlas.json',ROOT),'utf8')) as Atlas;
const chunks=new Map<number,ArrayBuffer>(),chunk=(i:number)=>{if(!chunks.has(i)){const b=readFileSync(new URL('..'+atlas.chunks[i].url,ROOT));chunks.set(i,b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}return chunks.get(i)!;};
const positions=(p:Atlas['parts'][number])=>new Float32Array(chunk(p.chunk),p.positions,p.vertexCount*3),indices=(p:Atlas['parts'][number])=>new Uint32Array(chunk(p.chunk),p.indices,p.indexCount);
const heart=new Set(atlas.concepts.find(c=>c.name.toLowerCase()==='heart')!.elements);heart.add('FJ2428');
const parts=atlas.parts.filter(p=>heart.has(p.id)),named=(name:string)=>{const p=parts.find(p=>p.name===name);if(!p)throw new Error(`Missing ${name}`);return p;};
const CAVITY={la:'Cavity of left atrium',lv:'Cavity of left ventricle',ra:'Cavity of right atrium',rv:'Cavity of right ventricle'} as const;

// Each cavity: its vertices, its volume, and the centre of that volume.
const cavities=CHAMBERS.map(k=>{
 const p=named(CAVITY[k]),P=positions(p),I=indices(p);let volume=0;const c=[0,0,0];
 for(let t=0;t<I.length;t+=3){
  const a=I[t]*3,b=I[t+1]*3,d=I[t+2]*3,v=(P[a]*(P[b+1]*P[d+2]-P[b+2]*P[d+1])-P[a+1]*(P[b]*P[d+2]-P[b+2]*P[d])+P[a+2]*(P[b]*P[d+1]-P[b+1]*P[d]))/6;
  volume+=v;for(let x=0;x<3;x++)c[x]+=v*(P[a+x]+P[b+x]+P[d+x])/4;
 }
 const center=c.map(x=>x/volume) as [number,number,number],n=p.vertexCount,unit=new Float32Array(n*3),radius=new Float32Array(n);
 for(let v=0;v<n;v++){const d=[P[v*3]-center[0],P[v*3+1]-center[1],P[v*3+2]-center[2]],r=Math.hypot(...d);radius[v]=r;for(let x=0;x<3;x++)unit[v*3+x]=d[x]/r;}
 return {key:k,part:p,P,center,volumeMl:Math.abs(volume)*1e6,unit,radius};
});
/** Distance from the cavity centre as a multiple of the cavity's radius in the same direction. */
const rho=(c:typeof cavities[number],x:number,y:number,z:number)=>{
 const d=[x-c.center[0],y-c.center[1],z-c.center[2]],r=Math.hypot(...d);if(r<1e-6)return 1;
 let best=-2,at=0;for(let v=0;v<c.radius.length;v++){const dot=(d[0]*c.unit[v*3]+d[1]*c.unit[v*3+1]+d[2]*c.unit[v*3+2])/r;if(dot>best){best=dot;at=v;}}
 return Math.max(1,r/c.radius[at]);
};
const nearest=(c:typeof cavities[number],x:number,y:number,z:number)=>{let best=Infinity;for(let v=0;v<c.P.length;v+=3)best=Math.min(best,(x-c.P[v])**2+(y-c.P[v+1])**2+(z-c.P[v+2])**2);return Math.sqrt(best);};

/** Parts the source names for one side move with that side's ventricle or atrium. */
const fixed=(name:string):number|null=>{
 const n=name.toLowerCase();
 if(/left atrium/.test(n))return 0;if(/right atrium/.test(n))return 2;
 if(/cavity of left ventricle|mitral|aortic valve|of left ventricle/.test(n))return 1;
 if(/cavity of right ventricle|tricuspid|pulmonary valve|of right ventricle/.test(n))return 3;
 return null;
};
const out:number[]=[],index:Record<string,{a:number;b:number;offset:number;count:number}>={};
for(const p of parts){
 const P=positions(p),one=fixed(p.name),distance=cavities.map(()=>new Float32Array(p.vertexCount));let a=one??0,b=one??0;
 if(one===null){
  for(let v=0;v<p.vertexCount;v++)cavities.forEach((c,i)=>{distance[i][v]=nearest(c,P[v*3],P[v*3+1],P[v*3+2]);});
  // The ventricular wall belongs to both ventricles. Vessels on the surface follow the two chambers they lie nearest.
  const order=p.name==='Wall of ventricle'?[1,3]:cavities.map((_,i)=>i).sort((i,j)=>distance[i].reduce((s,x)=>s+x,0)-distance[j].reduce((s,x)=>s+x,0));
  [a,b]=order;
 }
 index[p.id]={a,b,offset:out.length/3,count:p.vertexCount};
 for(let v=0;v<p.vertexCount;v++){
  const x=P[v*3],y=P[v*3+1],z=P[v*3+2],cavity=cavities.findIndex(c=>c.part===p);
  if(cavity>=0){out.push(1,1,1);continue;}
  const weight=a===b?1:distance[b][v]**2/(distance[a][v]**2+distance[b][v]**2+1e-12);
  out.push(rho(cavities[a],x,y,z),a===b?1:rho(cavities[b],x,y,z),weight);
 }
}
const bin=Buffer.from(new Float32Array(out).buffer),sha=createHash('sha256').update(bin).digest('hex');
const rig={version:'heart-motion-1',source:'BodyParts3D heart meshes as packaged in atlas.json',binSHA256:sha,vertices:out.length/3,
 chambers:Object.fromEntries(cavities.map(c=>[c.key,{cavity:c.part.id,center:c.center.map(x=>+x.toFixed(6)),sourceVolumeMl:+c.volumeMl.toFixed(2)}])),parts:index};
writeFileSync(new URL('heart-motion.bin',ROOT),bin);writeFileSync(new URL('heart-motion.json',ROOT),JSON.stringify(rig));
console.log(`HEART_MOTION_BUILT parts ${parts.length} vertices ${out.length/3} sha ${sha.slice(0,12)}`,JSON.stringify(rig.chambers));
