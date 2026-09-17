import {useEffect,useRef} from 'react';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {PointerTap} from '../pointer-tap';
import {verifiedGLB,type Representation,type TissueLevel} from './assets';
import {filamentTranslation} from './sarcomere';
export type TissueView={selected:string;showSheath:boolean;showBone:boolean;section:'none'|'cross'|'longitudinal';slice:number;reset:number;angle:'oblique'|'front'|'end';signal:boolean;glut4:number;sarcomereLength:number;excitation?:{boundTroponinUM:number;postStrokeUM:number}};
export type SceneMetrics={triangles:number;calls:number;renderSubmitMs:number;metersPer100Pixels:number;renderer:string;loadedBytes:number};
interface Props{asset:Representation;level:TissueLevel;view:TissueView;onSelect:(id:string)=>void;onReady:()=>void;onError:(error:string)=>void;onMetrics:(metrics:SceneMetrics)=>void}
export default function TissueScene({asset,level,view,onSelect,onReady,onError,onMetrics}:Props){
 const host=useRef<HTMLDivElement>(null),latest=useRef(view),callbacks=useRef({onSelect,onReady,onError,onMetrics});latest.current=view;callbacks.current={onSelect,onReady,onError,onMetrics};
 useEffect(()=>{
  const el=host.current!,abort=new AbortController();let disposed=false,frame=0,dirty=true,ready=false,active=true,lastView:TissueView|null=null,lastMetric=0;
  let renderer:T.WebGLRenderer;try{renderer=new T.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});}catch{callbacks.current.onError('WebGL is unavailable. Enable graphics acceleration to inspect the specimen.');return;}
  el.dataset.ready='false';renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor('#132229');renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;renderer.localClippingEnabled=true;el.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label',`3D ${level} specimen. Drag to orbit, scroll to zoom, click to inspect.`);renderer.domElement.setAttribute('role','img');
  const gl=renderer.getContext() as WebGL2RenderingContext,debug=gl.getExtension('WEBGL_debug_renderer_info'),rendererName=debug?String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)):'WebGL renderer';
  const software=/swiftshader|llvmpipe|software/i.test(rendererName);if(software)renderer.setPixelRatio(1);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(32,1,.002,20),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.minDistance=.14;controls.maxDistance=5;controls.addEventListener('change',()=>{dirty=true;});
  scene.add(new T.HemisphereLight('#e4f1f1','#7e4e42',1.4));for(const [position,intensity,color] of [[[3,4,5],3.1,'#ffdfc1'],[[-3,0,2],1.1,'#adc5df'],[[1,2,-3],2.7,'#e6b998']] as const){const light=new T.DirectionalLight(color,intensity);light.position.set(position[0],position[1],position[2]);scene.add(light);}
  const group=new T.Group();scene.add(group);let meshRoot:T.Group|null=null,span=1,meshes:T.Mesh[]=[],lastFit='',lastRender=0;
  const clipPlane=new T.Plane(),pointer=new T.Vector2(),raycaster=new T.Raycaster(),tap=new PointerTap();
  const materials=new Set<T.Material>(),textures=new Set<T.Texture>(),geometries=new Set<T.BufferGeometry>();
  const release=(root:T.Object3D)=>{root.traverse(object=>{if(!(object instanceof T.Mesh))return;object.geometry.dispose();for(const m of Array.isArray(object.material)?object.material:[object.material]){for(const v of Object.values(m))if(v instanceof T.Texture)v.dispose();m.dispose();}});};
  const fit=()=>{const front=latest.current.angle==='front',end=latest.current.angle==='end';controls.target.set(0,end?.4:0,0);camera.up.set(0,end?0:1,end?-1:0);if(end)camera.position.set(.02,1.10,.035);else{camera.position.set(front?0:1.0,front?.08:.65,front?2.05:1.9);if(level==='sarcomere')camera.position.multiplyScalar(1.35);}controls.update();dirty=true;};
  const resize=()=>{if(!el.clientWidth||!el.clientHeight)return;camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();renderer.setSize(el.clientWidth,el.clientHeight);dirty=true;};
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(el);const intersection=new IntersectionObserver(entries=>{active=entries[0].isIntersecting;dirty=true;});intersection.observe(el);
  const down=(e:PointerEvent)=>tap.down(e.pointerId,e.clientX,e.clientY,e.pointerType==='touch'?12:5);
  const move=(e:PointerEvent)=>tap.move(e.pointerId,e.clientX,e.clientY);
  const up=(e:PointerEvent)=>{if(!ready||!tap.up(e.pointerId,e.clientX,e.clientY))return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
   const hit=raycaster.intersectObjects(meshes.filter(m=>m.visible),false).find(h=>latest.current.section==='none'||clipPlane.distanceToPoint(h.point)>=0);if(hit)callbacks.current.onSelect(hit.object.userData.entityId);};
  const cancel=(e:PointerEvent)=>tap.cancel(e.pointerId);
  for(const [event,handler]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel]]as const)renderer.domElement.addEventListener(event,handler);
  (async()=>{try{
   const bytes=await verifiedGLB(asset,abort.signal);if(disposed)return;
   const parsed=await new GLTFLoader().parseAsync(bytes,'');if(disposed){release(parsed.scene);return;}
   meshRoot=parsed.scene;
   const found:string[]=[];meshRoot.traverse(o=>{if(!(o instanceof T.Mesh))return;const id=o.userData.entityId;if(typeof id!=='string'||!asset.entities.includes(id))throw new Error('Specimen identity metadata is missing.');found.push(id);meshes.push(o);geometries.add(o.geometry);const originals=Array.isArray(o.material)?o.material:[o.material];originals.forEach(m=>materials.add(m));o.material=Array.isArray(o.material)?originals.map(m=>m.clone()):originals[0].clone();o.castShadow=false;o.frustumCulled=false;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v instanceof T.Texture){textures.add(v);v.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());}m.side=T.DoubleSide;}
   });
   if(new Set(found).size!==asset.entities.length)throw new Error('The specimen is missing a named structure.');
   meshRoot.updateMatrixWorld(true);const box=new T.Box3().setFromObject(meshRoot),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());span=Math.max(size.x,size.y,size.z);if(!Number.isFinite(span)||span<=0)throw new Error('Invalid specimen dimensions.');
   for(const mesh of meshes)mesh.userData.restPosition=mesh.position.clone();
   meshRoot.position.sub(center);group.scale.setScalar(1/span);group.add(meshRoot);fit();ready=true;dirty=true;el.dataset.ready='true';el.dataset.entities=String(found.length);callbacks.current.onReady();
  }catch(e){if(!disposed&&!abort.signal.aborted)callbacks.current.onError(e instanceof Error?e.message:'Could not load the specimen.');}})();
  const draw=(now:number)=>{frame=requestAnimationFrame(draw);if(disposed||!active||!ready||now-lastRender<1000/(software?24:60))return;const v=latest.current;
   if(v!==lastView){lastView=v;dirty=true;
    if(v.section==='cross')clipPlane.set(new T.Vector3(0,-1,0),(v.slice-.5)*1.05);else clipPlane.set(new T.Vector3(0,0,-1),(v.slice-.5)*.65);
    for(const mesh of meshes){const kind=mesh.userData.kind;mesh.visible=(v.showSheath||!['sheath','membrane'].includes(kind))&&(v.showBone||kind!=='bone');
     if(level==='sarcomere'){
      mesh.position.copy(mesh.userData.restPosition);
      mesh.position.y+=filamentTranslation(mesh.userData.slidingSide??0,v.sarcomereLength);
     }
     for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){const m=material as T.MeshStandardMaterial;m.clippingPlanes=v.section==='none'?[]:[clipPlane];m.emissive.set(mesh.userData.entityId===v.selected?'#a95926':'#000000');m.emissiveIntensity=.16;
      if(kind==='glut4'&&v.signal){m.emissive.set('#7de0b7');m.emissiveIntensity=Math.max(.02,v.glut4/40)*1.2;}
      if(v.excitation&&level==='sarcomere'){
       if(kind==='thin-filament'){m.emissive.set('#57bdac');m.emissiveIntensity=Math.min(1.5,v.excitation.boundTroponinUM/30);}
       if(kind==='thick-filament'){m.emissive.set('#e9857e');m.emissiveIntensity=Math.min(1.5,v.excitation.postStrokeUM/1);}
      }
      if(v.excitation&&level==='fiber'&&kind==='myofibrils'){m.emissive.set('#e9857e');m.emissiveIntensity=Math.min(.6,v.excitation.postStrokeUM*.5);}
     }
    }
    const key=`${v.reset}:${v.angle}`;if(key!==lastFit){lastFit=key;fit();}el.dataset.section=v.section;el.dataset.selected=v.selected;el.dataset.signal=v.signal?String(v.glut4):'off';
    if(level==='sarcomere'){group.updateMatrixWorld(true);el.dataset.sarcomereLength=String(v.sarcomereLength);}
    el.dataset.excitation=v.excitation?String(v.excitation.postStrokeUM):'off';
   }
   controls.update();if(!dirty)return;const start=performance.now();renderer.render(scene,camera);const renderSubmitMs=performance.now()-start;lastRender=now;dirty=false;
   if(now-lastMetric>250){lastMetric=now;const distance=camera.position.distanceTo(controls.target);callbacks.current.onMetrics({triangles:renderer.info.render.triangles,calls:renderer.info.render.calls,renderSubmitMs,metersPer100Pixels:2*distance*Math.tan(T.MathUtils.degToRad(camera.fov/2))/Math.max(1,el.clientHeight)*span*100,renderer:rendererName,loadedBytes:asset.bytes});}
  };resize();frame=requestAnimationFrame(draw);
  return()=>{disposed=true;abort.abort();cancelAnimationFrame(frame);resizeObserver.disconnect();intersection.disconnect();controls.dispose();for(const[event,handler]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel]]as const)renderer.domElement.removeEventListener(event,handler);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();};
 },[asset,level]);
 return <div className="tissue-canvas" ref={host} data-testid="tissue-scene"/>;
}
