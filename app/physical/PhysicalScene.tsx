import {useEffect,useRef} from 'react';
import * as T from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {Atlas,SystemId} from '../anatomy';
import {NUTRIENTS,type BodyState} from '../simulation/types';
import {cardiacContraction,respiratoryCycle,motionRates} from './motion';
import {heartCycle,CHAMBERS,VALVES,type HeartCycle} from '../simulation/heart';
import {chamberFill,conductionGlow,easeValves,heartPhaseName,leafletKind,type ConductionStage,type HeartRig} from './heart-motion';
import {createTracerRoute,type TracerRoute} from './flow-routes';
import {createBodyLens,fates,lenses,nutrientNames,tint,tintColor,type Lens} from './body-lens';
import {createBody} from '../simulation/engine';
import {bedFlows,createVesselFlow,type Bed,type VesselFlow,type VesselGraph} from './vessel-flow';
import {decodeModelResponse} from '../model-download';
import {PointerTap} from '../pointer-tap';
import {createAnatomyIndex,cutawayAt,partOpacity,tissueColor,type PhysicalViewState} from './anatomy-view';

interface Props {atlas:Atlas;body:BodyState;motion:boolean;lens:Lens;view:PhysicalViewState;onSelect:(id:string)=>void;onProgress:(n:number)=>void;onError:(message:string)=>void}
export default function PhysicalScene({atlas,body,motion,lens,view,onSelect,onProgress,onError}:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(view),pickCallback=useRef(onSelect);
 const physiology=useRef(body),animate=useRef(motion),shown=useRef(lens);
 latest.current=view;pickCallback.current=onSelect;physiology.current=body;animate.current=motion;shown.current=lens;
 useEffect(()=>{
  const el=host.current!;let disposed=false,frame=0,dirty=true,ready=false,lastState:PhysicalViewState|null=null,active=true,lastFit='';
  // Offscreen scenes may not draw yet. Subsequent updates follow rendered motion,
  // so the pause indicator does not get ahead of a pending GPU frame.
  el.dataset.motion=animate.current?'playing':'paused';
  const abort=new AbortController(),index=createAnatomyIndex(atlas);onError('');onProgress(0);
  let renderer:T.WebGLRenderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});}catch{onError('3D rendering is unavailable. Enable WebGL to explore the physical anatomy.');return;}
  renderer.setClearColor(0x131d24,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Detailed 3D human anatomy. Drag to rotate, scroll to zoom, and select a structure.');renderer.domElement.setAttribute('role','img');
  // Keep at most one frame in flight. Software GPUs otherwise accumulate seconds of
  // queued anatomy draws and prevent input or screenshot requests from completing.
  const gl=renderer.getContext() as WebGL2RenderingContext,canFence=typeof gl.fenceSync==='function';let gpuFence:WebGLSync|null=null,lastRender=0;
  const debugRenderer=gl.getExtension('WEBGL_debug_renderer_info');
  const software=!!debugRenderer&&/swiftshader|llvmpipe|softpipe|software/i.test(String(gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL)));
  if(software)renderer.setPixelRatio(1);el.dataset.lighting=software?'diffuse':'standard';
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(31,1,.005,30),controls=new OrbitControls(camera,renderer.domElement);
  controls.enableDamping=true;controls.dampingFactor=.09;controls.minDistance=.045;controls.maxDistance=8;controls.maxPolarAngle=Math.PI*.97;controls.addEventListener('change',()=>{dirty=true;});
  let environment:T.WebGLRenderTarget|null=null;
  if(!software){const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();environment=pmrem.fromScene(room,.04);scene.environment=environment.texture;room.dispose();pmrem.dispose();}
  scene.add(new T.HemisphereLight(0xe4efff,0x383039,.8));
  const key=new T.DirectionalLight(0xffe7d2,3.1);key.position.set(-2,3,4);scene.add(key);
  const fill=new T.DirectionalLight(0xbacde5,1);fill.position.set(3,1,2);scene.add(fill);
  const rim=new T.DirectionalLight(0xbfdadf,2.5);rim.position.set(1,2,-3);scene.add(rim);
  const width=T.MathUtils.ceilPowerOfTwo(atlas.parts.length),visualData=new Float32Array(width*4),visualTexture=new T.DataTexture(visualData,width,1,T.RGBAFormat,T.FloatType);
  visualTexture.needsUpdate=true;
  const uniforms={partVisual:{value:visualTexture},visualWidth:{value:width},dissect:{value:1},slicePlane:{value:new T.Vector4(0,0,0,1)},heartContraction:{value:0},chamberCenter:{value:CHAMBERS.map(()=>new T.Vector3())},chamberFill:{value:[1,1,1,1]},valveOpen:{value:[0,0,0,0]},lungInflation:{value:0},gutPhase:{value:0},gutActivity:{value:0},bladderFill:{value:0}};
  const geometries:T.BufferGeometry[]=[],materials:T.Material[]=[],pickers:(T.Mesh|undefined)[]=[],batches:{mesh:T.Mesh;ranges:{part:number;offset:number;count:number}[];source:Uint32Array;visible:T.BufferAttribute;ghost:boolean}[]=[];
  const bounds=atlas.parts.map(p=>new T.Box3(new T.Vector3().fromArray(p.bounds[0]),new T.Vector3().fromArray(p.bounds[1])));
  const selectedBounds=new T.Box3(),center=new T.Vector3(),size=new T.Vector3();
  const hovered=document.createElement('div');hovered.className='physical-hover';hovered.hidden=true;hovered.setAttribute('role','tooltip');el.appendChild(hovered);
  const material=(system:SystemId,ghost:boolean)=>{
   const common={vertexColors:true,side:T.DoubleSide,transparent:ghost,depthWrite:!ghost};
   const m=software?new T.MeshLambertMaterial(common):new T.MeshStandardMaterial({...common,metalness:0,roughness:system==='skeletal'?.72:system==='muscular'?.6:.46,envMapIntensity:.32});
   m.forceSinglePass=true;
   m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='attribute float partIndex; uniform sampler2D partVisual; uniform float visualWidth; varying vec4 partStyle; varying vec3 anatomyPosition; attribute float motionKind; attribute vec3 motionCenter; uniform float heartContraction; uniform vec3 chamberCenter[4]; uniform float chamberFill[4]; uniform float valveOpen[4]; uniform float lungInflation; uniform float gutPhase; uniform float gutActivity; uniform float bladderFill;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\npartStyle = texture2D(partVisual, vec2((partIndex + 0.5) / visualWidth, 0.5)); anatomyPosition = position; if(motionKind > 0.5 && motionKind < 1.5) transformed = motionCenter + (position-motionCenter) * (1.0-0.042*heartContraction); if(motionKind > 9999.5) { float code = motionKind - 10000.0; float combo = floor(code / 1000.0 + 0.0005); float rho = 1.0 + (code - combo * 1000.0) * 0.003; int valve = int(floor(combo / 4.0 + 0.01)); int chamber = int(combo - 4.0 * float(valve) + 0.01); vec3 opened = position + motionCenter * valveOpen[valve]; transformed = chamberCenter[chamber] + (opened - chamberCenter[chamber]) * pow(rho*rho*rho - 1.0 + chamberFill[chamber], 1.0/3.0) / rho; } else if(motionKind > 9.5) { float pair = motionKind - 10.0; int ca = int(floor(pair / 4.0 + 0.01)); int cb = int(pair - 4.0 * float(ca) + 0.01); float ra = max(motionCenter.x, 1.0); float rb = max(motionCenter.y, 1.0); vec3 pa = chamberCenter[ca] + (position - chamberCenter[ca]) * pow(ra*ra*ra - 1.0 + chamberFill[ca], 1.0/3.0) / ra; vec3 pb = chamberCenter[cb] + (position - chamberCenter[cb]) * pow(rb*rb*rb - 1.0 + chamberFill[cb], 1.0/3.0) / rb; transformed = mix(pb, pa, motionCenter.z); } if(motionKind > 1.5 && motionKind < 2.5) { transformed.xz = motionCenter.xz + (position.xz-motionCenter.xz)*(1.0+lungInflation); transformed.y -= lungInflation*0.12; } if(motionKind > 2.5 && motionKind < 3.5) transformed.y -= lungInflation*0.2; if(motionKind > 4.5 && motionKind < 5.5) transformed = motionCenter + (position-motionCenter) * (0.8+0.45*bladderFill); else if(motionKind > 3.5) transformed += normal * (0.0009 * gutActivity * sin(position.y*85.0-gutPhase));');
    shader.fragmentShader='varying vec4 partStyle; varying vec3 anatomyPosition; uniform float dissect; uniform vec4 slicePlane;\n'+shader.fragmentShader;
    const cut=system==='muscular'?'if(dissect > 0.5 && (anatomyPosition.y > 1.49 || (anatomyPosition.y > 0.84 && anatomyPosition.y < 1.49 && abs(anatomyPosition.x) < 0.19 && anatomyPosition.z > -0.065))) discard;':system==='skeletal'?'if(dissect > 0.5 && (anatomyPosition.y > 1.585 || (anatomyPosition.y > 0.93 && anatomyPosition.y < 1.45 && abs(anatomyPosition.x) < 0.18 && anatomyPosition.z > 0.025))) discard;':'';
    shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>\nif(partStyle.r < 0.005 ${ghost?'|| partStyle.r > 0.995':'|| partStyle.r < 0.995'}) discard; if(dot(vec4(anatomyPosition,1.0),slicePlane) < 0.0) discard; ${cut}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.72,0.53,0.28), partStyle.g * 0.15); diffuseColor.a *= partStyle.r;\n// Substance lens: mute the tissue colour, then tint by the signed level (b: 0.5 is the reference).\nif(partStyle.a > 0.5){ float lens = partStyle.b * 2.0 - 1.0; vec3 muted = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.333))), 0.7) * 0.8; diffuseColor.rgb = mix(muted, lens > 0.0 ? vec3(1.0,0.60,0.06) : vec3(0.22,0.45,1.0), min(abs(lens), 1.0) * 0.85); }');
    shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.07,0.032,0.009) * partStyle.g; if(partStyle.a > 0.5){ float glow = partStyle.b * 2.0 - 1.0; totalEmissiveRadiance += (glow > 0.0 ? vec3(0.5,0.28,0.02) : vec3(0.05,0.14,0.5)) * abs(glow) * 0.45; }');
   };
   m.customProgramCacheKey=()=>`physical-${system}-${ghost}`;materials.push(m);return m;
  };
  const materialCache=new Map<string,T.Material>();
  const routes:TracerRoute[]=[];
  const tracerLimit=16000,tracerPositions=new Float32Array(tracerLimit*3),tracerColors=new Float32Array(tracerLimit*3),tracerSizes=new Float32Array(tracerLimit),tracerLifts=new Float32Array(tracerLimit),tracerGeometry=new T.BufferGeometry();
  tracerGeometry.setAttribute('position',new T.BufferAttribute(tracerPositions,3));tracerGeometry.setAttribute('color',new T.BufferAttribute(tracerColors,3));tracerGeometry.setAttribute('beadSize',new T.BufferAttribute(tracerSizes,1));tracerGeometry.setAttribute('beadLift',new T.BufferAttribute(tracerLifts,1));tracerGeometry.setDrawRange(0,0);geometries.push(tracerGeometry);
  // Bead diameters are in metres: size is 1/tan(fov/2), so attenuation yields true screen size.
  const tracerMaterial=new T.PointsMaterial({size:1/Math.tan(T.MathUtils.degToRad(31/2)),sizeAttenuation:true,vertexColors:true,transparent:true,opacity:.95,depthTest:true,depthWrite:false});
  tracerMaterial.onBeforeCompile=shader=>{// A bead sits on the centerline, inside its own vessel wall. Lift it toward the camera by just over
   // the vessel radius so that wall does not hide it, while organs and bone in front still do.
   shader.vertexShader='attribute float beadSize; attribute float beadLift;\n'+shader.vertexShader.replace('#include <project_vertex>','vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 ); mvPosition.xyz += normalize(-mvPosition.xyz) * beadLift; gl_Position = projectionMatrix * mvPosition;').replace('gl_PointSize = size;','gl_PointSize = size * beadSize;').replace('#include <fog_vertex>','#include <fog_vertex>\ngl_PointSize = clamp(gl_PointSize, 1.6, 11.0);');shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat r=distance(gl_PointCoord,vec2(0.5)); if(r>0.5) discard;');};materials.push(tracerMaterial);
  const tracers=new T.Points(tracerGeometry,tracerMaterial);tracers.frustumCulled=false;tracers.renderOrder=5;scene.add(tracers);
  const heartCenter=new T.Vector3(.022,1.32,.036),tracerPoint=new T.Vector3();
  let vessels:VesselFlow|null=null,bedFlow:Record<Bed,number>|null=null,aorta=-1,femoral=-1;
  // Concentrations are read against a resting body, so the scale means the same thing in every run.
  const bodyLens=createBodyLens(createBody()),lensColor=new T.Color(),vesselOfPart=new Int32Array(atlas.parts.length).fill(-1);
  const beadColor={arterial:new T.Color('#ffac91'),venous:new T.Color('#88bfff'),'pulmonary-arterial':new T.Color('#88bfff'),'pulmonary-venous':new T.Color('#ffac91'),portal:new T.Color('#b79bd8')},nutrientColor=new T.Color('#efcc78');
  let heartRig:{rig:HeartRig;data:Float32Array}|null=null,beat:HeartCycle|null=null,beatState:BodyState|null=null,conductionParts:{i:number;stage:ConductionStage}[]|null=null;
  const loadHeart=async()=>{
   const [index,data]=await Promise.all(['json','bin'].map(kind=>fetch(`/models/heart-motion.${kind}`,{signal:abort.signal})));if(!index.ok||!data.ok)throw new Error('The heart motion data could not be loaded.');
   const rig=await index.json() as HeartRig,values=new Float32Array(await data.arrayBuffer());if(disposed)return;
   heartRig={rig,data:values};CHAMBERS.forEach((k,i)=>uniforms.chamberCenter.value[i].fromArray(rig.chambers[k].center));
  };
  const loadVessels=async()=>{
   const response=await fetch('/models/vessel-graph.json',{signal:abort.signal});if(!response.ok)throw new Error('The vessel paths could not be loaded.');
   const graph=await response.json() as VesselGraph,ids=new Map(atlas.parts.map((p,i)=>[p.id,i]));if(disposed)return;
   vessels=createVesselFlow(graph,ids);
   // Reported probes: the aortic root and the right femoral artery.
   aorta=vessels.segments.findIndex(s=>s.circuit==='arterial'&&s.parent<0&&atlas.parts[s.part]?.name==='Ascending aorta');femoral=vessels.segments.findIndex(s=>atlas.parts[s.part]?.name==='Right femoral artery');
   el.dataset.vesselSegments=String(vessels.segments.length);
   // The widest segment of each vessel mesh stands for that mesh when it is tinted.
   vessels.segments.forEach((s,i)=>{if(s.part>=0&&(vesselOfPart[s.part]<0||s.radius>vessels!.segments[vesselOfPart[s.part]].radius))vesselOfPart[s.part]=i;});
  };
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
    const system=index.system.get(p.id)!;
    const motionKind=index.groups.heart.has(p.id)&&['cardiac','arterial','venous'].includes(system)?1:p.id.startsWith('BP3D3-')?2:/^diaphragm$/i.test(p.name)?3:/^urinary bladder$/i.test(p.name)?5:system==='digestive'&&!index.groups.liver.has(p.id)&&!/pancrea|bile|biliary|duct/.test(p.name.toLowerCase())?4:0;
    const motionCenter=motionKind===1?heartCenter:bounds[i].getCenter(new T.Vector3()),centers=new Float32Array(p.vertexCount*3);for(let v=0;v<p.vertexCount;v++)motionCenter.toArray(centers,v*3);
    // Rigged heart parts carry their two chambers in the kind, and per vertex how far out from each cavity they sit.
    const rigged=motionKind===1?heartRig?.rig.parts[p.id]:undefined,kinds=new Float32Array(p.vertexCount).fill(rigged?10+rigged.a*4+rigged.b:motionKind);
    if(rigged&&rigged.count===p.vertexCount){
     const rig=heartRig!.data.subarray(rigged.offset*3,(rigged.offset+rigged.count)*3);
     // A leaflet carries its move from closed to open per vertex, and its valve, chamber and radius in the kind.
     if(rigged.valve!==undefined&&rigged.delta!==undefined){centers.set(heartRig!.data.subarray((heartRig!.rig.vertices+rigged.delta)*3,(heartRig!.rig.vertices+rigged.delta+rigged.count)*3));for(let v=0;v<p.vertexCount;v++)kinds[v]=leafletKind(rigged.valve,rigged.a,rig[v*3]);}
     else centers.set(rig);
    }
    g.setAttribute('motionKind',new T.BufferAttribute(kinds,1));g.setAttribute('motionCenter',new T.BufferAttribute(centers,3));const route=createTracerRoute(p,i,g);if(route)routes.push(route);
    const group=groups.get(system)??{geometries:[],indices:[]};group.geometries.push(g);group.indices.push(i);groups.set(system,group);
   });
   for(const [system,group] of groups){
    const geometry=mergeGeometries(group.geometries,false);if(!geometry)throw new Error('Could not assemble source anatomy.');geometries.push(geometry);
    const source=new Uint32Array(geometry.index!.array);let offset=0;
    const ranges=group.indices.map(part=>{const count=atlas.parts[part].indexCount,range={part,offset,count};offset+=count;return range;});
    for(const ghost of [false,true]){
     const key=`${system}-${ghost}`;if(!materialCache.has(key))materialCache.set(key,material(system,ghost));
     // Share vertex buffers, but submit only the indices visible in each pass.
     const pass=new T.BufferGeometry();for(const [name,attribute] of Object.entries(geometry.attributes))pass.setAttribute(name,attribute);
     const visible=new T.BufferAttribute(new Uint32Array(source.length),1);visible.setUsage(T.DynamicDrawUsage);pass.setIndex(visible);pass.setDrawRange(0,0);geometries.push(pass);
     const mesh=new T.Mesh(pass,materialCache.get(key));mesh.frustumCulled=false;scene.add(mesh);batches.push({mesh,ranges,source,visible,ghost});
    }
   }
   lastState=null;dirty=true;
  };
  let loaded=0;
  (async()=>{try{let cursor=0;await loadHeart();await Promise.all([loadVessels(),...Array.from({length:3},async()=>{while(cursor<atlas.chunks.length){await load(cursor++);if(!disposed)onProgress(Math.round(++loaded/atlas.chunks.length*100));}})]);if(!disposed){ready=true;el.dataset.ready='true';dirty=true;}}catch(e){if(!disposed)onError(e instanceof Error?e.message:'Could not load anatomy.');}})();
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
  const lensLegend=document.createElement('div');lensLegend.className='physical-lens-legend';lensLegend.hidden=true;lensLegend.setAttribute('aria-label','Substance colour scale');
  lensLegend.innerHTML='<strong></strong><i></i><div class="scale"><span>½×</span><span>resting arterial</span><span>2×</span></div><p></p><svg viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><polyline class="portal"/><polyline class="arterial"/></svg><div><span>last simulated hour</span><span><b class="arterial">arterial</b> <b class="portal">portal</b></span></div><small>Organs are compared with their own resting level.</small>';
  el.appendChild(lensLegend);const lensTitle=lensLegend.querySelector('strong')!,lensValues=lensLegend.querySelector('p')!,lensScale=lensLegend.querySelectorAll('.scale span'),lensNote=lensLegend.querySelector('small')!;
  // Where the marked meal is now: one bar per nutrient, split by place.
  const mealFate=document.createElement('div');mealFate.className='physical-meal-fate';mealFate.hidden=true;mealFate.setAttribute('aria-label','Where the latest meal is now');
  mealFate.innerHTML=`<strong></strong>${NUTRIENTS.map(key=>`<div data-nutrient="${key}"><span></span><i>${fates.map(f=>`<b class="${f}"></b>`).join('')}</i></div>`).join('')}<p>${fates.map(f=>`<span><b class="${f}"></b>${f}</span>`).join('')}</p>`;
  el.appendChild(mealFate);const fateTitle=mealFate.querySelector('strong')!,fateRows=NUTRIENTS.map(key=>{const row=mealFate.querySelector(`[data-nutrient="${key}"]`)!;return {key,text:row.querySelector('span')!,parts:[...row.querySelectorAll('b')] as HTMLElement[]};});let lensWas=false,tintedState:BodyState|null=null,tintedLens:Lens|null=null;
  // Labels pinned to organs: what each store holds now, and what each organ takes from its blood.
  const callouts=document.createElement('div');callouts.className='physical-callouts';callouts.setAttribute('aria-label','Live organ stores and exchange');el.appendChild(callouts);
  const clock=document.createElement('div');clock.className='physical-clock';clock.setAttribute('aria-label','Simulated time shown on the body');el.appendChild(clock);
  const anchorOf=(test:(name:string,id:string)=>boolean)=>{const box=new T.Box3();let part=-1;atlas.parts.forEach((p,i)=>{if(test(p.name,p.id)){box.union(bounds[i]);if(part<0)part=i;}});return part<0?null:{part,at:box.getCenter(new T.Vector3())};};
  const named=(name:string)=>anchorOf(n=>n.toLowerCase()===name),grouped=(organ:'heart'|'brain'|'liver')=>anchorOf((_,id)=>index.groups[organ].has(id));
  const tags=([
   {key:'gut',title:'STOMACH & GUT',anchor:named('stomach'),organ:'gut' as const,shift:[55,-34],store:(s:BodyState)=>`stomach ${(s.stomach.carbs+s.stomach.protein+s.stomach.fat).toFixed(0)} g · intestine ${(s.gut.carbs+s.gut.protein+s.gut.fat).toFixed(0)} g`},
   {key:'liver',shift:[0,0],title:'LIVER',anchor:grouped('liver'),organ:'liver' as const,store:(s:BodyState)=>`glycogen ${s.glycogen.toFixed(1)} g`},
   {key:'kidney',shift:[0,0],title:'KIDNEYS',anchor:named('left kidney'),organ:'kidneys' as const,store:(s:BodyState)=>`urine ${s.urineRate.toFixed(2)} mL/min`},
   {key:'bladder',shift:[0,0],title:'BLADDER',anchor:named('urinary bladder'),organ:null,store:(s:BodyState)=>`${s.bladder.toFixed(0)} mL`},
   {key:'heart',shift:[0,0],title:'HEART',anchor:grouped('heart'),organ:'heart' as const,store:null},
   {key:'brain',shift:[0,0],title:'BRAIN',anchor:grouped('brain'),organ:'brain' as const,store:null},
   {key:'muscle',shift:[0,0],title:'MUSCLE',anchor:named('left vastus lateralis'),organ:'muscle' as const,store:null},
  ]).filter(t=>t.anchor).map(t=>{const node=document.createElement('div');node.innerHTML='<span></span><strong></strong><em></em>';node.querySelector('span')!.textContent=t.title;callouts.appendChild(node);return {...t,anchor:t.anchor!,placed:'',node,store$:node.querySelector('strong')!,flux$:node.querySelector('em')!};});
  const projected=new T.Vector3(),trends=new Map<string,{time:number;arterial:number;portal:number}[]>(lenses.filter(l=>l.id!=='flow').map(l=>[l.id,[]]));
  const formatTime=(seconds:number)=>[seconds/3600,seconds/60%60,seconds%60].map(n=>String(Math.floor(n)).padStart(2,'0')).join(':');
  const cycleReadout=document.createElement('div');cycleReadout.className='physical-cycle-readout';cycleReadout.setAttribute('aria-label','Anatomical motion phases');
  cycleReadout.innerHTML='<div><span>HEART</span><strong></strong><i><b></b></i></div><div><span>BREATH</span><strong></strong><i><b></b></i></div>';
  el.appendChild(cycleReadout);const phaseText=cycleReadout.querySelectorAll('strong'),phaseBars=cycleReadout.querySelectorAll('b');
  let lastLens=shown.current,lastPhysiology=physiology.current,lastFrame=performance.now(),heartPhase=0,breathPhase=0,gutPhase=0,swallowUntil=-1,displayTime=0,previousMotion=animate.current,previousIntake=body.carbIn+body.proteinIn+body.fatIn+body.waterIn;
  const updateMotion=(dt:number)=>{
   if(previousMotion!==animate.current){previousMotion=animate.current;dirty=true;}
   const current=physiology.current,rates=motionRates(current),intake=current.carbIn+current.proteinIn+current.fatIn+current.waterIn;
   if(intake>previousIntake+.001)swallowUntil=displayTime+9;if(intake<previousIntake)swallowUntil=-1;previousIntake=intake;
   if(animate.current){displayTime+=dt;heartPhase=(heartPhase+dt*rates.heartHz)%1;breathPhase=(breathPhase+dt*rates.breathHz)%1;gutPhase+=dt*.85;}
   const breathing=respiratoryCycle(breathPhase);uniforms.heartContraction.value=cardiacContraction(heartPhase);uniforms.lungInflation.value=breathing.inflation*rates.lungExcursion;uniforms.gutPhase.value=gutPhase;uniforms.gutActivity.value=rates.digesting;
   // Display mapping: the bladder mesh swells toward a 500 mL fill. Not a calibrated wall model.
   uniforms.bladderFill.value=Math.min(1,Math.max(0,current.bladder/500));
   let count=0;const v=latest.current;
   // The beat the body state implies is solved when the state changes; each chamber then follows its own volume.
   if(beatState!==current){beatState=current;beat=heartCycle(current);const b=beat.summary;el.dataset.heartEf=b.ejectionFraction.toFixed(3);el.dataset.heartLvEdv=b.endDiastolic.lv.toFixed(1);el.dataset.heartLvEsv=b.endSystolic.lv.toFixed(1);el.dataset.heartSystolic=b.peak.aorta.toFixed(1);el.dataset.heartDiastolic=b.aorticDiastolic.toFixed(1);}
   const fill=chamberFill(beat!,heartPhase,uniforms.chamberFill.value),phaseName=heartPhaseName(beat!,heartPhase);CHAMBERS.forEach((k,i)=>{el.dataset['fill'+k[0].toUpperCase()+k.slice(1)]=fill[i].toFixed(3);});el.dataset.heartPhase=phaseName;
   // Leaflets swing toward the simulated valve states.
   const valves=easeValves(beat!,heartPhase,animate.current?dt:0,uniforms.valveOpen.value);VALVES.forEach((k,i)=>{el.dataset['valve'+k[0].toUpperCase()+k.slice(1)]=valves[i].toFixed(3);});
   phaseText[0].textContent=`${phaseName} · LV ${(fill[1]*beat!.summary.endDiastolic.lv).toFixed(0)} mL`;phaseText[1].textContent=breathing.inhaling?'Inhaling':'Exhaling';
   phaseBars[0].style.transform=`scaleX(${Math.min(1,(1-fill[1])/Math.max(.01,1-beat!.summary.endSystolic.lv/beat!.summary.endDiastolic.lv))})`;phaseBars[1].style.transform=`scaleX(${breathing.inflation})`;
   cycleReadout.hidden=v.preset==='surface'||v.preset==='skeleton'||v.preset==='nerves';
   const counts={blood:0,air:0,food:0,portal:0,mix:0},slice=uniforms.slicePlane.value;
   if(vessels){
    // Bed flows ease toward the solver's values so a step change does not teleport beads.
    const target=bedFlows(current),ease=bedFlow?1-Math.exp(-dt/1.2):1;bedFlow??={...target};
    for(const bed of Object.keys(target) as Bed[])bedFlow[bed]+=(target[bed]-bedFlow[bed])*ease;
    vessels.setFlows(bedFlow);
    // The systolic envelope averages .18 over a beat, so arterial beads keep their mean speed.
    if(animate.current)vessels.advance(dt*(.5+cardiacContraction(heartPhase)*.5/.18),dt);
    const absorbing=current.digestionRates.carbs+current.digestionRates.protein>=.0001,meal=shown.current==='meal',substance=shown.current==='flow'||shown.current==='meal'?null:shown.current,tinted=meal||!!substance;
    // The meal lens is linear from none to 1.5 times what resting blood holds; substances are log ratios.
    const shade=(level:number)=>meal?Math.min(1,Math.max(0,level/1.5)):tint(level);
    // Levels and tints change only when the solver hands over a new state or the lens changes.
    const restyle=tintedState!==current||tintedLens!==shown.current;tintedState=current;tintedLens=shown.current;
    if(tinted&&restyle)vessels.setLevels(substance?bodyLens.levels(current,substance):bodyLens.mealLevels(current));
    vessels.beads(s=>s.part>=0&&visualData[s.part*4]>=.5,(x,y,z,s)=>{
     if(slice.x*x+slice.y*y+slice.z*z+slice.w<0)return;
     const nutrient=!tinted&&s.circuit==='portal'&&absorbing,color=tinted?tintColor(shade(s.level),lensColor):nutrient?nutrientColor:beadColor[s.circuit];
     tracerPositions[count*3]=x;tracerPositions[count*3+1]=y;tracerPositions[count*3+2]=z;color.toArray(tracerColors,count*3);tracerSizes[count]=s.bead;tracerLifts[count]=s.radius*1.25+.0008;count++;
     if(nutrient)counts.portal++;else counts.blood++;
    },tracerLimit-600);
    // Tint organs by their own level and vessel walls by the blood they carry.
    if(restyle&&(tinted||lensWas)){
     const organTint=new Map<string,number>(),lumen=meal?bodyLens.mealLumen(current):null;
     atlas.parts.forEach((p,i)=>{
      let value=.5,on=0;
      if(tinted){
       const organ=index.organ.get(p.id),segment=vesselOfPart[i];
       if(segment>=0){value=shade(vessels!.segments[segment].level)*.5+.5;on=1;}
       // The stomach and small intestine show how much of the meal is still inside them.
       else if(lumen&&organ==='gut'&&/^(stomach|duodenum|.* part of (jejunum|ileum))$/i.test(p.name)){value=(/^stomach$/i.test(p.name)?lumen.stomach:lumen.intestine)*.5+.5;on=1;}
       else if(organ){if(!organTint.has(organ))organTint.set(organ,shade(substance?bodyLens.organ(current,organ,substance):bodyLens.mealOrgan(current,organ)));value=organTint.get(organ)!*.5+.5;on=1;}
      }
      visualData[i*4+2]=value;visualData[i*4+3]=on;
     });
     visualTexture.needsUpdate=true;dirty=true;lensWas=tinted;
     if(tinted){const l=substance?bodyLens.levels(current,substance):bodyLens.mealLevels(current);for(const [name,value] of [['Arterial',l.arterial],['Portal',l.portal],['Venous',l.venous]] as const)el.dataset['level'+name]=value.toFixed(3);for(const [organ,value] of organTint)el.dataset['tint'+organ[0].toUpperCase()+organ.slice(1)]=value.toFixed(3);
      lensValues.textContent=`Arterial ${l.arterial.toFixed(2)}×  ·  Portal ${l.portal.toFixed(2)}×  ·  Venous ${l.venous.toFixed(2)}×`;lensTitle.textContent=meal?'THIS MEAL · CARBOHYDRATE':lenses.find(x=>x.id===substance)!.name.toUpperCase();
      [meal?'none':'½×',meal?'':'resting arterial',meal?'1.5× resting blood glucose':'2×'].forEach((text,i)=>{lensScale[i].textContent=text;});lensLegend.dataset.kind=meal?'meal':'level';
      lensNote.textContent=meal?'Only glucose that came from the latest meal is coloured.':'Organs are compared with their own resting level.';}
    }
    lensLegend.hidden=!tinted;mealFate.hidden=!meal;el.dataset.lens=shown.current;
    if(meal&&restyle){
     const mark=current.transport.mark,fate=bodyLens.mealFate(current);
     fateTitle.textContent=mark.at<0?'NO MEAL YET · ADD A MEAL TO FOLLOW IT':`WHERE THE MEAL IS · EATEN ${formatTime(current.time-mark.at)} AGO`;el.dataset.mealAt=String(mark.at);
     for(const row of fateRows){
      const eaten=mark.eaten[row.key];row.text.textContent=`${nutrientNames[row.key]} ${eaten.toFixed(0)} g`;
      fates.forEach((f,i)=>{row.parts[i].style.flexGrow=String(eaten>0?Math.max(0,fate[row.key][f])/eaten:0);row.parts[i].title=`${f} ${fate[row.key][f].toFixed(1)} g`;});
     }
     for(const f of fates)el.dataset['meal'+f[0].toUpperCase()+f.slice(1)]=fate.glucose[f].toFixed(3);
     const lumen=bodyLens.mealLumen(current);el.dataset.tintStomach=lumen.stomach.toFixed(3);el.dataset.tintIntestine=lumen.intestine.toFixed(3);
    }
    // Every substance's last simulated hour is kept, so the passage of simulated time is visible
    // whichever one is chosen.
    if(restyle)for(const [id,trend] of trends){
     if(trend.length&&current.time<trend.at(-1)!.time)trend.length=0;
     if(trend.length&&current.time-trend.at(-1)!.time<15)continue;
     const l=id==='meal'?bodyLens.mealLevels(current):bodyLens.levels(current,id as Exclude<Lens,'flow'|'meal'>);trend.push({time:current.time,arterial:l.arterial,portal:l.portal});while(trend.length>1&&current.time-trend[0].time>3600)trend.shift();
    }
    if(tinted&&restyle){
     const trend=trends.get(shown.current)!,y=(level:number)=>meal?38-shade(level)*36:20-shade(level)*18,line=(pick:(p:{arterial:number;portal:number})=>number)=>trend.map(p=>`${(200-(current.time-p.time)/18).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(' ');
     lensLegend.querySelector('polyline.arterial')!.setAttribute('points',line(p=>p.arterial));lensLegend.querySelector('polyline.portal')!.setAttribute('points',line(p=>p.portal));
    }
    if(restyle){clock.textContent=`SIMULATED ${formatTime(current.time)}`;el.dataset.simulatedTime=String(Math.round(current.time));el.dataset.bladder=current.bladder.toFixed(1);el.dataset.glycogen=current.glycogen.toFixed(2);}
    const unit=lenses.find(x=>x.id===shown.current)!.unit;
    for(const tag of tags){
     projected.copy(tag.anchor.at).project(camera);
     const visible=visualData[tag.anchor.part*4]>=.5&&projected.z<1&&Math.abs(projected.x)<.92&&Math.abs(projected.y)<.9;
     const hide=!visible||(!tag.store&&!tinted);if(tag.node.hidden!==hide)tag.node.hidden=hide;if(hide)continue;
     const place=`translate(${((projected.x+1)/2*el.clientWidth+tag.shift[0]).toFixed(1)}px,${((1-projected.y)/2*el.clientHeight+tag.shift[1]).toFixed(1)}px)`;if(tag.placed!==place)tag.node.style.transform=tag.placed=place;
     // Text follows the solver's state, not the frame rate.
     if(!restyle)continue;
     tag.store$.textContent=tag.store?tag.store(current):'';
     if(substance&&tag.organ){const net=bodyLens.uptake(current,tag.organ,substance);tag.flux$.textContent=Math.abs(net)<5e-4?'no net exchange':`${net>0?'takes up':'releases'} ${Math.abs(net).toFixed(Math.abs(net)<1?3:1)} ${unit}/min`;tag.node.dataset.uptake=net.toFixed(4);}else if(meal&&tag.organ){const held=bodyLens.mealHeld(current,tag.organ);tag.flux$.textContent=`${held.toFixed(held<1?2:1)} g of this meal`;tag.node.dataset.held=held.toFixed(4);}else tag.flux$.textContent='';
    }
    el.dataset.cardiacOutput=(current.cardiacOutput).toFixed(3);
    if(aorta>=0)el.dataset.aortaFlow=(vessels.segments[aorta].flow*60000).toFixed(3);
    if(femoral>=0){el.dataset.femoralFlow=(vessels.segments[femoral].flow*60000).toFixed(4);el.dataset.femoralSpeed=(vessels.segments[femoral].speed*100).toFixed(3);}
   }
   // The modelled conduction system lights stage by stage as the impulse passes.
   conductionParts??=atlas.parts.flatMap((p,i)=>p.stage?[{i,stage:p.stage as ConductionStage}]:[]);
   if(conductionParts.length){let lit='';for(const c of conductionParts){const glow=conductionGlow(c.stage,heartPhase,current.heartRate);visualData[c.i*4+2]=.5+.5*glow;visualData[c.i*4+3]=1;if(glow>.5&&!lit.includes(c.stage))lit+=(lit?' ':'')+c.stage;}visualTexture.needsUpdate=true;el.dataset.conduction=lit;}
   for(const route of routes){
    if(visualData[route.part*4]<.5||route.kind==='mix'&&rates.digesting<.01||route.kind==='food'&&displayTime>swallowUntil||route.kind==='air'&&!['dissection','organs'].includes(v.preset)&&!v.isolate)continue;
    const number=route.kind==='air'?7:4;
    for(let n=0;n<number;n++){
     let t=0,direction=1;
     // The same parcels retrace smoothly during expiration; there is no phase-boundary jump.
     if(route.kind==='air'){t=(breathing.inflation*.8+n/number)%1;direction=breathing.inhaling?1:-1;}
     if(route.kind==='food'||route.kind==='mix')t=(displayTime*(route.kind==='food'?.2:.075)+n/number)%1;
     for(let tail=0;tail<4&&count<tracerLimit;tail++){
      const offset=tail*.0025/Math.max(.03,route.length)*(route.kind==='air'?breathing.flow:1);
      const at=((t-direction*offset)%1+1)%1;route.curve.getPointAt(at,tracerPoint);
      if(slice.x*tracerPoint.x+slice.y*tracerPoint.y+slice.z*tracerPoint.z+slice.w<0)continue;
      tracerPoint.toArray(tracerPositions,count*3);const fade=1-tail*.22;
      tracerSizes[count]=.005;tracerLifts[count]=.012;tracerColors[count*3]=route.color.r*fade;tracerColors[count*3+1]=route.color.g*fade;tracerColors[count*3+2]=route.color.b*fade;count++;counts[route.kind]++;
     }
    }
   }
   tracerGeometry.setDrawRange(0,count);tracerGeometry.attributes.position.needsUpdate=true;tracerGeometry.attributes.color.needsUpdate=true;tracerGeometry.attributes.beadSize.needsUpdate=true;tracerGeometry.attributes.beadLift.needsUpdate=true;
   el.dataset.motion=animate.current?'playing':'paused';el.dataset.tracers=String(count);for(const [kind,n] of Object.entries(counts))el.dataset[kind+'Tracers']=String(n);el.dataset.heartHz=rates.heartHz.toFixed(3);el.dataset.breathHz=rates.breathHz.toFixed(3);
  };
  const draw=()=>{
   const now=performance.now();frame=requestAnimationFrame(draw);
   if(!active||disposed||!ready){lastFrame=now;return;}
   if(gpuFence){if(gl.clientWaitSync(gpuFence,0,0)===gl.TIMEOUT_EXPIRED)return;gl.deleteSync(gpuFence);gpuFence=null;}
   const v=latest.current;
   if(lastLens!==shown.current){lastLens=shown.current;dirty=true;}
   if(!dirty&&v===lastState&&previousMotion===animate.current&&lastPhysiology===physiology.current&&(!animate.current||now-lastRender<1000/(software?12:30)))return;
   const dt=previousMotion?Math.min(1,(now-lastFrame)/1000):0;lastFrame=now;lastPhysiology=physiology.current;
   if(v!==lastState){
    lastState=v;atlas.parts.forEach((p,i)=>{visualData[i*4]=partOpacity(p,index,v);visualData[i*4+1]=v.selected.includes(p.id)?1:0;});visualTexture.needsUpdate=true;
    uniforms.dissect.value=v.preset==='dissection'&&!v.isolate?1:0;
    uniforms.slicePlane.value.set(0,0,0,1);
    if(v.cut==='sagittal')uniforms.slicePlane.value.set(-1,0,0,(v.slice-.5)*.85);
    if(v.cut==='coronal')uniforms.slicePlane.value.set(0,0,-1,(v.slice-.5)*.6);
    if(v.cut==='axial')uniforms.slicePlane.value.set(0,-1,0,v.slice*1.8);
    let submittedTriangles=0;
    for(const b of batches){let count=0;const visible=b.visible.array as Uint32Array;
     for(const r of b.ranges){const opacity=visualData[r.part*4];if(b.ghost?opacity>.005&&opacity<.995:opacity>=.995){visible.set(b.source.subarray(r.offset,r.offset+r.count),count);count+=r.count;}}
     b.mesh.visible=count>0;b.mesh.geometry.setDrawRange(0,count);b.visible.needsUpdate=true;submittedTriangles+=count/3;
    }
    el.dataset.submittedTriangles=String(submittedTriangles);
    el.dataset.visibleParts=String(atlas.parts.filter((p,i)=>visualData[i*4]>.005).length);el.dataset.preset=v.preset;
    const fitKey=`${v.region}-${v.angle}-${v.reset}-${v.focus}-${v.isolate}`;if(fitKey!==lastFit){lastFit=fitKey;fit();}dirty=true;
   }
   updateMotion(dt);controls.update();if(!dirty&&!animate.current)return;renderer.render(scene,camera);lastRender=now;if(canFence){gpuFence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);gl.flush();}dirty=false;
  };resize();draw();
  return()=>{disposed=true;abort.abort();cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();controls.dispose();for(const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['pointerleave',cancel]] as const)renderer.domElement.removeEventListener(name,handler);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());visualTexture.dispose();environment?.dispose();if(gpuFence)gl.deleteSync(gpuFence);renderer.dispose();renderer.domElement.remove();hovered.remove();cycleReadout.remove();lensLegend.remove();mealFate.remove();callouts.remove();clock.remove();};
 },[atlas,onProgress,onError]);
 return <div className="physical-canvas" ref={host} data-testid="physical-scene"/>;
}
