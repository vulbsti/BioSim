import {useEffect,useRef} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {Atlas,SystemId} from '../anatomy';
import {decodeModelResponse} from '../model-download';
import {PointerTap} from '../pointer-tap';
import {createAnatomyIndex,cutawayAt,partOpacity,tissueColor,type PhysicalViewState} from './anatomy-view';

interface Props {atlas:Atlas;view:PhysicalViewState;onSelect:(id:string)=>void;onProgress:(n:number)=>void;onError:(message:string)=>void}
export default function PhysicalScene({atlas,view,onSelect,onProgress,onError}:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(view),pickCallback=useRef(onSelect);
 latest.current=view;pickCallback.current=onSelect;
 useEffect(()=>{
  const el=host.current!;let disposed=false,frame=0,dirty=true,ready=false,lastState:PhysicalViewState|null=null,active=true,lastFit='';
  const abort=new AbortController(),index=createAnatomyIndex(atlas);
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{onError('3D rendering is unavailable. Enable WebGL to explore the physical anatomy.');return;}
  renderer.setClearColor(0x131d24,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Detailed 3D human anatomy. Drag to rotate, scroll to zoom, and select a structure.');renderer.domElement.setAttribute('role','img');
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(31,1,.005,30),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=.045;controls.maxDistance=8;controls.maxPolarAngle=Math.PI*.97;controls.addEventListener('change',()=>{dirty=true;});
  const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xe4efff,0x383039,.8));
  const key=new T.DirectionalLight(0xffe7d2,3.1);key.position.set(-2,3,4);scene.add(key);
  const fill=new T.DirectionalLight(0xbacde5,1);fill.position.set(3,1,2);scene.add(fill);
  const rim=new T.DirectionalLight(0xbfdadf,2.5);rim.position.set(1,2,-3);scene.add(rim);
  const width=T.MathUtils.ceilPowerOfTwo(atlas.parts.length),visualData=new Float32Array(width*4),visualTexture=new T.DataTexture(visualData,width,1,T.RGBAFormat,T.FloatType);
  visualTexture.needsUpdate=true;
  const uniforms={partVisual:{value:visualTexture},visualWidth:{value:width},dissect:{value:1},slicePlane:{value:new T.Vector4(0,0,0,1)}};
  const geometries:T.BufferGeometry[]=[],materials:T.Material[]=[],pickers:(T.Mesh|undefined)[]=[],batches:{mesh:T.Mesh;indices:number[];ghost:boolean}[]=[];
  const bounds=atlas.parts.map(p=>new T.Box3(new T.Vector3().fromArray(p.bounds[0]),new T.Vector3().fromArray(p.bounds[1])));
  const selectedBounds=new T.Box3(),center=new T.Vector3(),size=new T.Vector3();
  const hovered=document.createElement('div');hovered.className='physical-hover';hovered.hidden=true;hovered.setAttribute('role','tooltip');el.appendChild(hovered);
  const material=(system:SystemId,ghost:boolean)=>{
   const m=new T.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:system==='skeletal'?.72:system==='muscular'?.6:.46,envMapIntensity:.32,side:T.DoubleSide,transparent:ghost,depthWrite:!ghost});
   m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='attribute float partIndex; uniform sampler2D partVisual; uniform float visualWidth; varying vec2 partStyle; varying vec3 anatomyPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\npartStyle = texture2D(partVisual, vec2((partIndex + 0.5) / visualWidth, 0.5)).rg; anatomyPosition = position;');
    shader.fragmentShader='varying vec2 partStyle; varying vec3 anatomyPosition; uniform float dissect; uniform vec4 slicePlane;\n'+shader.fragmentShader;
    const cut=system==='muscular'?'if(dissect > 0.5 && (anatomyPosition.y > 1.49 || (anatomyPosition.y > 0.84 && anatomyPosition.y < 1.49 && abs(anatomyPosition.x) < 0.19 && anatomyPosition.z > -0.065))) discard;':system==='skeletal'?'if(dissect > 0.5 && (anatomyPosition.y > 1.585 || (anatomyPosition.y > 0.93 && anatomyPosition.y < 1.45 && abs(anatomyPosition.x) < 0.18 && anatomyPosition.z > 0.025))) discard;':'';
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>\nif(partStyle.r < 0.005 ${ghost?'|| partStyle.r > 0.995':'|| partStyle.r < 0.995'}) discard; if(dot(vec4(anatomyPosition,1.0),slicePlane) < 0.0) discard; ${cut}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72,0.53,0.28), partStyle.g * 0.15); diffuseColor.a *= partStyle.r;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.07,0.032,0.009) * partStyle.g;');
   };
   m.customProgramCacheKey=()=>`physical-${system}-${ghost}`;materials.push(m);return m;
  };
  const materialCache=new Map<string,T.Material>();
  const load=async(ci:number)=>{
   const chunk=atlas.chunks[ci],compressed=!!chunk.gzip&&typeof DecompressionStream!=='undefined';
   const response=await fetch(compressed?chunk.gzip!:chunk.url,{signal:abort.signal}),buffer=await decodeModelResponse(response,chunk.bytes,compressed);if(disposed)return;
   const groups=new Map<SystemId,{geometries:T.BufferGeometry[];indices:number[]}>();
   atlas.parts.forEach((p,i)=>{
    if(p.chunk!==ci)return;
    const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(new Float32Array(buffer,p.positions,p.vertexCount*3),3));g.setAttribute('normal',new T.BufferAttribute(new Int16Array(buffer,p.normals,p.vertexCount*3),3,true));g.setIndex(new T.BufferAttribute(new Uint32Array(buffer,p.indices,p.indexCount),1));
    g.boundingBox=bounds[i];g.computeBoundingSphere();const picker=new T.Mesh(g);picker.material=new T.MeshBasicMaterial({side:T.DoubleSide});materials.push(picker.material);picker.updateMatrixWorld();pickers[i]=picker;geometries.push(g);
    const color=new T.Color(tissueColor(p,index)),colors=new Float32Array(p.vertexCount*3);for(let v=0;v<p.vertexCount;v++)color.toArray(colors,v*3);
    g.setAttribute('color',new T.BufferAttribute(colors,3));g.setAttribute('partIndex',new T.BufferAttribute(new Float32Array(p.vertexCount).fill(i),1));
    const system=index.system.get(p.id)!,group=groups.get(system)??{geometries:[],indices:[]};group.geometries.push(g);group.indices.push(i);groups.set(system,group);
   });
   for(const [system,group] of groups){
    const geometry=mergeGeometries(group.geometries,false);if(!geometry)throw new Error('Could not assemble source anatomy.');geometries.push(geometry);
    for(const ghost of [false,true]){const key=`${system}-${ghost}`;if(!materialCache.has(key))materialCache.set(key,material(system,ghost));const mesh=new T.Mesh(geometry,materialCache.get(key));mesh.frustumCulled=false;scene.add(mesh);batches.push({mesh,indices:group.indices,ghost});}
   }
   lastState=null;dirty=true;
  };
  let loaded=0;
  (async()=>{try{let cursor=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<atlas.chunks.length){await load(cursor++);if(!disposed)onProgress(Math.round(++loaded/atlas.chunks.length*100));}}));if(!disposed){ready=true;el.dataset.ready='true';dirty=true;}}catch(e){if(!disposed)onError(e instanceof Error?e.message:'Could not load anatomy.');}})();
  const fit=()=>{
   const v=latest.current;selectedBounds.makeEmpty();
   if(v.region==='selection'||v.isolate)atlas.parts.forEach((p,i)=>{if(v.selected.includes(p.id))selectedBounds.union(bounds[i]);});
   if(selectedBounds.isEmpty()){
    const regions={body:[[-.43,-.03,-.2],[.43,1.77,.2]],torso:[[-.27,.78,-.2],[.27,1.52,.2]],head:[[-.16,1.44,-.17],[.16,1.76,.15]],abdomen:[[-.25,.8,-.2],[.25,1.27,.2]],selection:[[-.43,0,-.2],[.43,1.75,.2]]};
    const b=regions[v.region];selectedBounds.set(new T.Vector3().fromArray(b[0]),new T.Vector3().fromArray(b[1]));
   }
   selectedBounds.getCenter(center);selectedBounds.getSize(size);
   const direction=v.angle==='front'?new T.Vector3(0,0,1):v.angle==='back'?new T.Vector3(0,0,-1):v.angle==='side'?new T.Vector3(1,0,0):new T.Vector3(.32,.05,1).normalize();
   const span=Math.max(size.y,Math.hypot(size.x,size.z)/Math.max(.2,camera.aspect)),distance=Math.max(.08,span/(2*Math.tan(T.MathUtils.degToRad(camera.fov/2)))*1.12+size.z*.4);
   controls.target.copy(center);camera.position.copy(center).addScaledVector(direction,distance);controls.update();dirty=true;
  };
  const resize=()=>{if(el.clientWidth<1||el.clientHeight<1)return;camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);fit();};
  const observer=new ResizeObserver(resize);observer.observe(el);
  const intersection=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;dirty=true;});intersection.observe(el);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),tap=new PointerTap(),hitPoint=new T.Vector3();
  const pick=(x:number,y:number)=>{
   const rect=renderer.domElement.getBoundingClientRect();pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
   let nearest=Infinity,found=-1;const v=latest.current;
   for(let i=0;i<pickers.length;i++){
    const mesh=pickers[i];if(!mesh||visualData[i*4]<.5||!raycaster.ray.intersectBox(bounds[i],hitPoint))continue;
    for(const hit of raycaster.intersectObject(mesh,false)){
     if(hit.distance>=nearest)continue;
     const p=hit.point;if(cutawayAt(p.x,p.y,p.z,index.system.get(atlas.parts[i].id)!,v))continue;
     if(uniforms.slicePlane.value.dot(new T.Vector4(p.x,p.y,p.z,1))<0)continue;
     nearest=hit.distance;found=i;break;
    }
   }return found;
  };
  let lastHover=0;
  const down=(e:PointerEvent)=>{hovered.hidden=true;tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?12:5);};
  const move=(e:PointerEvent)=>{tap.move(e.pointerId,e.clientX,e.clientY);if(e.buttons||e.pointerType==='touch'||!ready){hovered.hidden=true;return;}if(performance.now()-lastHover<75)return;lastHover=performance.now();const i=pick(e.clientX,e.clientY);hovered.hidden=i<0;renderer.domElement.style.cursor=i<0?'grab':'pointer';if(i>=0){const rect=el.getBoundingClientRect();hovered.textContent=atlas.parts[i].name;hovered.style.left=`${Math.max(10,Math.min(e.clientX-rect.left+15,el.clientWidth-240))}px`;hovered.style.top=`${Math.min(e.clientY-rect.top+20,el.clientHeight-55)}px`;}};
  const up=(e:PointerEvent)=>{if(!tap.up(e.pointerId,e.clientX,e.clientY)||!ready)return;const i=pick(e.clientX,e.clientY);if(i>=0)pickCallback.current(atlas.parts[i].id);};
  const cancel=(e:PointerEvent)=>{tap.cancel(e.pointerId);hovered.hidden=true;};
  for(const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['pointerleave',cancel]] as const)renderer.domElement.addEventListener(name,handler);
  const draw=()=>{
   frame=requestAnimationFrame(draw);if(!active||disposed)return;
   const v=latest.current;
   if(v!==lastState){
    lastState=v;atlas.parts.forEach((p,i)=>{visualData[i*4]=partOpacity(p,index,v);visualData[i*4+1]=v.selected.includes(p.id)?1:0;});visualTexture.needsUpdate=true;
    uniforms.dissect.value=v.preset==='dissection'&&!v.isolate?1:0;
    uniforms.slicePlane.value.set(0,0,0,1);
    if(v.cut==='sagittal')uniforms.slicePlane.value.set(-1,0,0,(v.slice-.5)*.85);
    if(v.cut==='coronal')uniforms.slicePlane.value.set(0,0,-1,(v.slice-.5)*.6);
    if(v.cut==='axial')uniforms.slicePlane.value.set(0,-1,0,v.slice*1.8);
    for(const b of batches)b.mesh.visible=b.indices.some(i=>b.ghost?visualData[i*4]>.005&&visualData[i*4]<.995:visualData[i*4]>=.995);
    el.dataset.visibleParts=String(atlas.parts.filter((p,i)=>visualData[i*4]>.005).length);el.dataset.preset=v.preset;
    const fitKey=`${v.region}-${v.angle}-${v.reset}-${v.focus}-${v.isolate}`;if(fitKey!==lastFit){lastFit=fitKey;fit();}dirty=true;
   }
   controls.update();if(!dirty)return;renderer.render(scene,camera);dirty=false;
  };resize();draw();
  return()=>{disposed=true;abort.abort();cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();controls.dispose();for(const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['pointerleave',cancel]] as const)renderer.domElement.removeEventListener(name,handler);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());visualTexture.dispose();environment.dispose();renderer.dispose();renderer.domElement.remove();hovered.remove();};
 },[atlas,onProgress,onError]);
 return <div className="physical-canvas" ref={host} data-testid="physical-scene"/>;
}
