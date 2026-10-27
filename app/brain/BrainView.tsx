import {useEffect,useMemo,useRef,useState} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {Brain,ChevronLeft,Scissors,User,Droplet,X} from 'lucide-react';
import type {Atlas} from '../anatomy';
import type {BodyState} from '../simulation/types';
import {createAnatomyIndex} from '../physical/anatomy-view';
import {decodeModelResponse} from '../model-download';
import {PointerTap} from '../pointer-tap';
import {BRAIN_REGIONS,brainParts,type BrainRegion} from './regions';
import './brain.css';

type Angle='side'|'front'|'top'|'below';
const ANGLES:{id:Angle;name:string;dir:[number,number,number]}[]=[{id:'side',name:'Side',dir:[1,.18,.12]},{id:'front',name:'Front',dir:[0,.12,1]},{id:'top',name:'Top',dir:[0,1,.0001]},{id:'below',name:'Below',dir:[.15,-1,.25]}];
/** Live readouts for the areas the body model already drives. Other areas have nothing measured yet, so they say nothing. */
function live(region:BrainRegion,s:BodyState):[string,string][] {
 if(region.id==='autonomic')return [['Heart rate it is setting',`${s.heartRate.toFixed(0)} beats/min`],['Breathing rate',`${s.respiratoryRate.toFixed(0)} breaths/min`]];
 if(region.id==='hormones')return [['Body temperature',`${s.coreTemperature.toFixed(1)} °C`],['Cortisol vs resting',`${s.hormones.cortisol.toFixed(1)}×`]];
 return [];
}
interface Props {atlas:Atlas;body:BodyState;motion:boolean;onClose:()=>void}
/** The brain on its own: the atlas's own brain meshes, in their place inside the head, coloured by what each area does. */
export default function BrainView({atlas,body,motion,onClose}:Props){
 const host=useRef<HTMLDivElement>(null),hover=useRef<HTMLDivElement>(null);
 const [selected,setSelected]=useState<BrainRegion|null>(null),[showHead,setShowHead]=useState(true),[showVessels,setShowVessels]=useState(false),[cut,setCut]=useState(false),[angle,setAngle]=useState<Angle>('side'),[listOpen,setListOpen]=useState(()=>window.innerWidth>700),[progress,setProgress]=useState(0),[error,setError]=useState('');
 const view=useRef({selected,showHead,showVessels,cut,angle,motion,heartRate:body.heartRate,turn:0});
 const parts=useMemo(()=>brainParts(atlas,createAnatomyIndex(atlas)),[atlas]);
 useEffect(()=>{view.current={...view.current,selected,showHead,showVessels,cut,motion,heartRate:body.heartRate};},[selected,showHead,showVessels,cut,motion,body.heartRate]);
 useEffect(()=>{view.current={...view.current,angle,turn:view.current.turn+1};},[angle]);
 // Cutting in half only helps when you look at the cut face.
 useEffect(()=>{if(cut)setAngle('side');},[cut]);
 useEffect(()=>{
  const el=host.current!;let disposed=false,frame=0,ready=false,turned=-1,lastKey='';
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true});}catch{setError('3D rendering is unavailable. Enable WebGL to see the brain.');return;}
  renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.localClippingEnabled=true;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','3D brain coloured by what each area does. Drag to turn, scroll to zoom, click an area.');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(30,1,.005,10),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.1;controls.minDistance=.06;controls.maxDistance=1.4;
  scene.add(new T.HemisphereLight(0xf2f5ff,0x4a3a3a,1.25));
  const key=new T.DirectionalLight(0xfff0e0,2.4);camera.add(key);key.position.set(-.4,.6,1);scene.add(camera);
  const rim=new T.DirectionalLight(0xbcd6e6,1.1);rim.position.set(1,2,-3);scene.add(rim);
  // The right half stays; everything left of the midline (atlas +x) is cut away to show the inside.
  const midline=new T.Plane(new T.Vector3(-1,0,0),.0004),noClip:T.Plane[]=[];
  const geometries:T.BufferGeometry[]=[],materials:T.Material[]=[];
  const regionMeshes:{mesh:T.Mesh;region:BrainRegion;material:T.MeshStandardMaterial;base:T.Color}[]=[];
  let arteries:T.Mesh|null=null,head:T.Mesh[]=[];
  const center=new T.Vector3(),size=new T.Vector3();
  const load=async()=>{
   const wanted=new Set([...parts.regions.keys(),...parts.arteries,...parts.skull,...parts.skin]);
   const byChunk=new Map<number,typeof atlas.parts>();for(const p of atlas.parts)if(wanted.has(p.id)){const list=byChunk.get(p.chunk)??[];list.push(p);byChunk.set(p.chunk,list);}
   const built=new Map<string,T.BufferGeometry>();let done=0;
   await Promise.all([...byChunk].map(async([ci,list])=>{
    const chunk=atlas.chunks[ci],compressed=!!chunk.gzip&&typeof DecompressionStream!=='undefined';
    const buffer=await decodeModelResponse(await fetch(compressed?chunk.gzip!:chunk.url),chunk.bytes,compressed);
    for(const p of list){const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(buffer,p.positions,p.vertexCount*3),3));g.setAttribute('normal',new T.BufferAttribute(new Int16Array(buffer,p.normals,p.vertexCount*3),3,true));g.setIndex(new T.BufferAttribute(new Uint32Array(buffer,p.indices,p.indexCount),1));built.set(p.id,g);}
    if(!disposed)setProgress(Math.round(++done/byChunk.size*100));
   }));
   if(disposed)return;
   const merge=(ids:string[])=>{const list=ids.map(id=>built.get(id)).filter((g):g is T.BufferGeometry=>!!g);if(!list.length)return null;const g=mergeGeometries(list,false);if(g){g.computeBoundingSphere();geometries.push(g);}return g;};
   for(const region of BRAIN_REGIONS){
    const g=merge([...parts.regions].filter(([,r])=>r===region).map(([id])=>id));if(!g)continue;
    const base=new T.Color(region.color);
    const material=new T.MeshStandardMaterial({color:base.clone(),roughness:.62,metalness:0,side:T.DoubleSide,clippingPlanes:noClip});materials.push(material);
    // The fluid spaces and the deep wiring sit inside; draw them so they read through when the outer areas fade.
    const mesh=new T.Mesh(g,material);mesh.renderOrder=region.id==='fluid'?2:1;scene.add(mesh);regionMeshes.push({mesh,region,material,base});
   }
   const all=new T.Box3();for(const r of regionMeshes)all.union(new T.Box3().setFromBufferAttribute(r.mesh.geometry.getAttribute('position') as T.BufferAttribute));all.getCenter(center);all.getSize(size);
   const a=merge(parts.arteries);if(a){const m=new T.MeshStandardMaterial({color:0xc23b3f,roughness:.45,clippingPlanes:noClip});materials.push(m);arteries=new T.Mesh(a,m);arteries.renderOrder=3;scene.add(arteries);}
   const skull=merge(parts.skull),skin=merge(parts.skin);
   // The head is a faint shell: enough to show the brain sits in its true place, never enough to hide it.
   for(const [g,colour,opacity] of [[skull,0xe5d8b9,.13],[skin,0xd9ab90,.07]] as const)if(g){const m=new T.MeshStandardMaterial({color:colour,roughness:.8,transparent:true,opacity,depthWrite:false,side:T.FrontSide,clippingPlanes:[new T.Plane(new T.Vector3(0,1,0),-1.43)]});materials.push(m);const mesh=new T.Mesh(g,m);mesh.renderOrder=4;scene.add(mesh);head.push(mesh);}
   for(const g of built.values())if(!geometries.includes(g))g.dispose();
   ready=true;el.dataset.ready='true';el.dataset.regions=String(regionMeshes.length);el.dataset.arteries=String(parts.arteries.length);
  };
  load().catch(e=>{if(!disposed)setError(e instanceof Error?e.message:'Could not load the brain.');});
  const fit=(dir:[number,number,number])=>{const d=new T.Vector3(...dir).normalize(),r=Math.max(size.x,size.y,size.z)*.62,dist=r/Math.sin(T.MathUtils.degToRad(camera.fov/2))/Math.min(1,camera.aspect)*1.05;controls.target.copy(center);camera.position.copy(center).addScaledVector(d,dist);controls.update();};
  const resize=()=>{if(el.clientWidth<1)return;camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);if(ready)fit(ANGLES.find(a=>a.id===view.current.angle)!.dir);};
  const observer=new ResizeObserver(resize);observer.observe(el);resize();
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),tap=new PointerTap();
  const pick=(x:number,y:number):BrainRegion|null=>{const rect=renderer.domElement.getBoundingClientRect();pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
   const v=view.current,hits=raycaster.intersectObjects(regionMeshes.filter(r=>r.mesh.visible&&(!v.selected||r.region===v.selected||r.material.opacity>.5)).map(r=>r.mesh),false);
   // With the brain cut in half, the hidden half must not catch the pointer.
   const hit=hits.find(h=>!v.cut||h.point.x<=.0004);return hit?regionMeshes.find(r=>r.mesh===hit.object)!.region:null;};
  const down=(e:PointerEvent)=>tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?10:4);
  const move=(e:PointerEvent)=>{tap.move(e.pointerId,e.clientX,e.clientY);if(e.pointerType!=='mouse'||!hover.current)return;const r=pick(e.clientX,e.clientY),rect=el.getBoundingClientRect();hover.current.hidden=!r;if(r){hover.current.textContent=r.name;hover.current.style.left=`${e.clientX-rect.left+14}px`;hover.current.style.top=`${e.clientY-rect.top+12}px`;}};
  const up=(e:PointerEvent)=>{if(tap.up(e.pointerId,e.clientX,e.clientY)){const r=pick(e.clientX,e.clientY);setSelected(s=>r&&s!==r?r:null);}};
  const leave=()=>{if(hover.current)hover.current.hidden=true;};
  const cancel=(e:PointerEvent)=>tap.cancel(e.pointerId);
  renderer.domElement.addEventListener('pointerdown',down);renderer.domElement.addEventListener('pointermove',move);renderer.domElement.addEventListener('pointerup',up);renderer.domElement.addEventListener('pointercancel',cancel);renderer.domElement.addEventListener('pointerleave',leave);
  const tick=(now:number)=>{frame=requestAnimationFrame(tick);if(!ready)return;const v=view.current;
   if(turned!==v.turn){turned=v.turn;fit(ANGLES.find(a=>a.id===v.angle)!.dir);}
   const key=`${v.selected?.id}|${v.cut}|${v.showHead}|${v.showVessels}`;
   if(key!==lastKey){lastKey=key;
    for(const r of regionMeshes){const on=!v.selected||r.region===v.selected,inner=r.region.id==='fluid'||r.region.id==='wiring';
     r.material.color.copy(on?r.base:r.base.clone().lerp(new T.Color(0x8a959b),.65));
     // Fading the rest to a ghost is what lets a deep area (memory, relay station) be seen from outside.
     r.material.opacity=on?1:inner?.05:.12;r.material.transparent=!on;r.material.depthWrite=on;r.material.clippingPlanes=v.cut?[midline]:noClip;r.material.emissive.set(v.selected&&on?r.base:0x000000);r.material.emissiveIntensity=v.selected&&on?.18:0;r.material.needsUpdate=true;}
    for(const m of head)m.visible=v.showHead;
    if(arteries){arteries.visible=v.showVessels;(arteries.material as T.MeshStandardMaterial).clippingPlanes=v.cut?[midline]:noClip;(arteries.material as T.Material).needsUpdate=true;}
    el.dataset.selected=v.selected?.id??'';el.dataset.cut=String(v.cut);el.dataset.head=String(v.showHead);
   }
   // The brainstem sets the heartbeat; it flickers once per beat the body model is beating.
   const stem=regionMeshes.find(r=>r.region.id==='autonomic');
   if(stem){const phase=v.motion?(now/1000*v.heartRate/60)%1:.5,beat=v.motion?Math.exp(-phase*7):0,on=!v.selected||v.selected===stem.region;stem.material.emissive.copy(stem.base);stem.material.emissiveIntensity=on?(v.selected?.18:0)+beat*.55:0;el.dataset.beat=beat.toFixed(2);}
   controls.update();renderer.render(scene,camera);};
  frame=requestAnimationFrame(tick);
  return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();renderer.dispose();renderer.domElement.remove();};
 },[atlas,parts]);
 const rows=selected?live(selected,body):[];
 return <div className="brain-view" data-testid="brain-view">
  <div className="brain-canvas" ref={host} data-testid="brain-scene"/>
  <div className="brain-hover" ref={hover} hidden/>
  <header className="brain-head"><button className="brain-back" onClick={onClose}><ChevronLeft size={15}/> Back to the body</button><h2><Brain size={16}/> The brain</h2></header>
  {listOpen?<nav className="brain-list" aria-label="Brain areas">
   <div className="brain-list-head"><strong>What each area does</strong><button aria-label="Hide the list of areas" onClick={()=>setListOpen(false)}><X size={14}/></button></div>
   {BRAIN_REGIONS.map(r=><button key={r.id} aria-pressed={selected===r} onClick={()=>setSelected(s=>s===r?null:r)}><i style={{background:r.color}}/>{r.name}</button>)}
  </nav>:<button className="brain-list-open" onClick={()=>setListOpen(true)}>Areas</button>}
  {selected&&<aside className="brain-card" aria-label="Selected brain area">
   <div className="organ-card-head"><div><span>BRAIN AREA</span><h3>{selected.name}</h3></div><button aria-label="Close area card" onClick={()=>setSelected(null)}><X size={15}/></button></div>
   <p>{selected.does}</p>
   {rows.length>0&&<dl className="organ-now">{rows.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
  </aside>}
  <div className="brain-bottom">
   <div className="brain-angles" role="group" aria-label="Look from">{ANGLES.map(a=><button key={a.id} aria-pressed={angle===a.id} onClick={()=>{setAngle(a.id);view.current={...view.current,angle:a.id,turn:view.current.turn+1};}}>{a.name}</button>)}</div>
   <div className="brain-toggles">
    <button aria-pressed={cut} onClick={()=>setCut(v=>!v)}><Scissors size={13}/> Cut in half</button>
    <button aria-pressed={showVessels} onClick={()=>setShowVessels(v=>!v)}><Droplet size={13}/> Blood supply</button>
    <button aria-pressed={showHead} onClick={()=>setShowHead(v=>!v)}><User size={13}/> Show the head</button>
   </div>
  </div>
  <p className="brain-foot">The same brain that sits in the body, in its true place in the skull. Areas are coloured by their main job; real areas share work and overlap.</p>
  {progress<100&&!error&&<div className="physical-loading" role="status"><Brain size={25}/><strong>Building the brain</strong><span>{progress}%</span></div>}
  {error&&<div className="physical-loading physical-load-error" role="alert"><strong>{error}</strong></div>}
 </div>;
}
