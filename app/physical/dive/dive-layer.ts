import * as T from 'three';
import type {BodyState} from '../../simulation/types';
import type {MoleculePack} from '../molecule-pack';
import type {MoleculeEntry,SpeciesId} from '../molecules';
import type {Circuit} from '../vessel-flow';
import {bloodOf,composition,type Amount} from './composition';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {redLattice} from './lattices';
import {cells,cubic,length,molar,nearest,niceLength,visit,type Lattice,type Point} from './field';

/** The vessel a dive starts in: lumen radius in m, mean blood speed in m/s. */
export type DiveVessel={name:string;radius:number;speed:number;circuit:Circuit};
export type DiveHooks={vesselAt:(clientX:number,clientY:number)=>DiveVessel|null;atClosest:()=>boolean;body:()=>BodyState;rest:BodyState;changed:()=>void};

const FOV=31,CAMERA=.5/Math.tan(T.MathUtils.degToRad(FOV/2));
/** How far the drawn volume extends beyond and in front of the focus, in view heights. */
const FAR=3.2,NEAR=1.2;
/** The narrowest view, m: a glucose molecule is then about a sixth of its height. */
export const MIN_SPAN=4e-9;
/** A species is drawn once it would be at least this many pixels across. */
const MIN_PX=6;
/** Below this many pixels an instance is drawn as a plain ellipsoid of the molecule's proportions and colour. */
const DETAIL_PX=20,DETAIL_TRIANGLES=1_100_000,DETAIL_LIMIT=420,CELL_LIMIT=5000,SOLUTE_LIMIT=3600;
/**
 * Everything in a frame is drawn through one slab of blood, so the numbers of different things in view
 * keep their true proportions. Its depth is the deepest at which every species large enough to see fits
 * its drawing budget. If one of them fits at no depth, its whole class (cells, proteins, or small
 * molecules) is left out, so a view never shows the rarer members of a class without the common ones.
 */
const SLABS=[1,.5,.25,.12,.06,.03];
export const STOPS=[{id:'vessel',name:'Vessel',span:0},{id:'cells',name:'Blood cells',span:45e-6},{id:'proteins',name:'Plasma proteins',span:140e-9},{id:'molecules',name:'Molecules',span:12e-9}] as const;

const RED_TILT=T.MathUtils.degToRad(62);

export function createDive(el:HTMLElement,renderer:T.WebGLRenderer,pack:MoleculePack,software:boolean,hooks:DiveHooks){
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(FOV,1,.05,CAMERA+FAR+2);camera.position.set(0,0,CAMERA);
 const fog=new T.Fog(0x000000,CAMERA,CAMERA+FAR);scene.fog=fog;scene.background=fog.color;
 scene.add(new T.HemisphereLight(0xfff4e6,0x40282a,1.5));const key=new T.DirectionalLight(0xffffff,2.6);key.position.set(-1.5,2.5,3);scene.add(key);
 const detailMaterial=software?new T.MeshLambertMaterial({vertexColors:true}):new T.MeshStandardMaterial({vertexColors:true,metalness:0,roughness:.5});
 const faceted=new T.IcosahedronGeometry(1,1);faceted.deleteAttribute('normal');faceted.deleteAttribute('uv');const ellipsoid=mergeVertices(faceted);ellipsoid.computeVertexNormals();faceted.dispose();
 const disposables:{dispose():void}[]=[detailMaterial,ellipsoid];
 // One detailed and one plain instanced mesh per species.
 const species=pack.entries.map((entry,i)=>{
  const geometry=pack.geometries[i],cell=entry.kind==='cell',limit=cell?CELL_LIMIT:SOLUTE_LIMIT,box=geometry.boundingBox!,half=box.getSize(new T.Vector3()).multiplyScalar(.5),centre=box.getCenter(new T.Vector3());
  const colors=geometry.getAttribute('color'),mean=new T.Color(0,0,0);for(let v=0;v<colors.count;v++){mean.r+=colors.getX(v);mean.g+=colors.getY(v);mean.b+=colors.getZ(v);}mean.multiplyScalar(1/colors.count);
  const plainMaterial=software?new T.MeshLambertMaterial({color:mean}):new T.MeshStandardMaterial({color:mean,metalness:0,roughness:.6});disposables.push(plainMaterial);
  const detailLimit=Math.max(40,Math.min(cell?limit:DETAIL_LIMIT,Math.floor(DETAIL_TRIANGLES/entry.triangles))),detail=new T.InstancedMesh(geometry,detailMaterial,detailLimit),plain=new T.InstancedMesh(ellipsoid,plainMaterial,limit);
  for(const mesh of [detail,plain]){mesh.count=0;mesh.frustumCulled=false;mesh.userData.entry=entry;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);}
  return {entry,cell,limit,detailLimit,found:new Float32Array(limit*5),ranked:new Uint32Array(limit),fit:0,radius:entry.radiusNm*1e-9,half:half.multiplyScalar(.85),centre,detail,plain,lattice:null as Lattice|null,amount:null as Amount|null,shown:0,state:'small' as 'small'|'crowded'|'shown'};
 });
 const byId=new Map(species.map(s=>[s.entry.id,s])),red=byId.get('redCell')!,order=[red,...species.filter(s=>s!==red)];
 const wallMaterial=new T.MeshStandardMaterial({color:0xb04a4a,side:T.BackSide,metalness:0,roughness:.8}),wallGeometry=new T.CylinderGeometry(1,1,1,64,1,true);wallGeometry.rotateZ(Math.PI/2);
 const wall=new T.Mesh(wallGeometry,wallMaterial);wall.frustumCulled=false;scene.add(wall);disposables.push(wallMaterial,wallGeometry);

 // On-screen frame of reference: where you are, how wide the view is, and what this blood holds.
 const hud=document.createElement('div');hud.className='physical-dive';hud.hidden=true;
 hud.innerHTML=`<header><span>INSIDE</span><strong></strong><em></em></header><nav aria-label="Scale">${STOPS.map(s=>`<button data-stop="${s.id}">${s.name}</button>`).join('')}<button data-stop="surface">Back to body</button></nav><div class="physical-dive-bar"><i></i><span></span></div><section aria-label="What this blood holds"><h4>IN THIS BLOOD · TRUE AMOUNTS</h4><ul></ul></section><p>Every size and count is to scale; the layout is illustrative and thermal motion is frozen. Water, about 55 mol/L, is not drawn. Scroll to change scale, drag to move.</p>`;
 el.appendChild(hud);
 const title=hud.querySelector('strong')!,subtitle=hud.querySelector('em')!,bar=hud.querySelector<HTMLElement>('.physical-dive-bar i')!,barLabel=hud.querySelector('.physical-dive-bar span')!,list=hud.querySelector('ul')!;
 const hint=document.createElement('div');hint.className='physical-dive-hint';hint.hidden=true;hint.textContent='Double-click a vessel to dive into its blood';el.appendChild(hint);
 const tip=document.createElement('div');tip.className='physical-hover';tip.hidden=true;tip.setAttribute('role','tooltip');el.appendChild(tip);
 const groups:[string,MoleculeEntry['kind'][]][]=[['Cells',['cell']],['Plasma proteins',['protein']],['Ions and nutrients',['ion','substance']],['Hormones',['hormone']]];
 const rows=new Map<SpeciesId,{amount:HTMLElement;near:HTMLElement;view:HTMLElement}>();
 for(const [name,kinds] of groups){
  const head=document.createElement('li');head.className='group';head.textContent=name;list.appendChild(head);
  for(const s of species.filter(x=>kinds.includes(x.entry.kind))){
   const row=document.createElement('li');row.innerHTML='<button></button><span></span><span></span><span></span>';const go=row.querySelector('button')!;go.textContent=s.entry.name;go.title=`Go to the nearest ${s.entry.name.toLowerCase()}`;go.dataset.go=s.entry.id;
   const cells=row.querySelectorAll('span');rows.set(s.entry.id,{amount:cells[0],near:cells[1],view:cells[2]});list.appendChild(row);
  }
 }

 let vessel:DiveVessel|null=null,span=1e-3,targetSpan=1e-3,maxSpan=1e-3,clock=0,last=0,amountsFor:BodyState|null=null,textAt=0;
 const focus=new T.Vector3(),targetFocus=new T.Vector3(),tilt=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),RED_TILT),untilt=tilt.clone().invert();
 const position=new T.Vector3(),scale=new T.Vector3(),turn=new T.Quaternion(),spin=new T.Quaternion(),axis=new T.Vector3(),matrix=new T.Matrix4(),local=new T.Vector3(),world=new T.Vector3(),nearRed:T.Vector3[]=[];
 const crowded=new Set<string>(),classOf=(e:MoleculeEntry)=>e.kind==='cell'||e.kind==='protein'?e.kind:'small';
 const circuitColor:Record<Circuit,number>={arterial:0xb8453f,venous:0x4a6fb0,'pulmonary-arterial':0x4a6fb0,'pulmonary-venous':0xb8453f,portal:0x7d5a9c};

 const refresh=(state:BodyState)=>{
  amountsFor=state;
  for(const amount of composition(state,hooks.rest,bloodOf(vessel!.circuit))){
   const s=byId.get(amount.id);if(!s)continue;s.amount=amount;
   s.lattice=amount.density<=0?null:s===red?redLattice(amount.density):cubic(amount.density,species.indexOf(s));const row=rows.get(amount.id)!;
   // A leading ≈ marks an amount that rests on an approximate reference value.
   row.amount.textContent=!amount.known?'no reliable value':amount.molar===null?`${(amount.density/1e9).toLocaleString('en',{maximumSignificantDigits:2})} /µL`:`${amount.approximate?'≈ ':''}${molar(amount.molar)}`;
   if(!amount.known){row.near.textContent='not measurable in blood';row.view.textContent='not drawn';}
  }
 };
 /** A red cell's centre in world space from its lattice coordinates. */
 const redWorld=(p:Point,out:T.Vector3)=>out.set(p.x,p.y,p.z).applyQuaternion(tilt);
 const inRedCell=(x:number,y:number,z:number)=>{
  for(const c of nearRed){local.set(x-c.x,y-c.y,z-c.z).applyQuaternion(untilt);if((local.x*local.x+local.y*local.y)/1.6e-11+local.z*local.z/1.9e-12<1)return true;}
  return false;
 };
 const frame=(now:number)=>{
  const dt=Math.min(.1,(now-last)/1000||0);last=now;clock+=dt;
  const state=hooks.body();if(state!==amountsFor)refresh(state);
  // Scale eases in log space; the focus eases toward where it was sent.
  const ease=1-Math.exp(-dt*5);span*=Math.pow(targetSpan/span,ease);focus.lerp(targetFocus,ease);
  const width=renderer.domElement.width,height=renderer.domElement.height,aspect=width/Math.max(1,height);camera.aspect=aspect;camera.updateProjectionMatrix();
  // Blood is red where its cells are too small to tell apart, and plasma is pale straw between them.
  const cellular=T.MathUtils.smoothstep(Math.log10(span),-5.3,-3.7);fog.color.setRGB(.035+.2*cellular,.03+.0*cellular,.02+.01*cellular);
  wall.visible=vessel!.radius/span<300;wall.scale.set(vessel!.radius*60/span,vessel!.radius/span,vessel!.radius/span);wall.position.set(0,-focus.y/span,-focus.z/span);wallMaterial.color.setHex(circuitColor[vessel!.circuit]);
  // The view box of a species for a slab depth, in the axes its lattice is searched in.
  const box=(s:typeof red,part:number)=>{
   const far=FAR*part,near=NEAR*part,hz=(far+near)/2*span,hy=.5*span*(CAMERA+far)/CAMERA+s.radius,hx=hy*aspect;
   if(s!==red)return {far,cz:focus.z+(near-far)/2*span,hx,hy,hz};
   // The red cell stack is tilted toward the viewer.
   const c=Math.abs(Math.cos(RED_TILT)),sn=Math.abs(Math.sin(RED_TILT));return {far,cz:focus.z+(near-far)/2*span,hx,hy:c*hy+sn*hz,hz:sn*hy+c*hz};
  };
  let slab=1;crowded.clear();
  for(const s of species){
   s.detail.count=0;s.plain.count=0;s.shown=0;s.fit=0;s.state='small';
   if(!s.lattice||2*s.radius/span*height<MIN_PX)continue;
   s.state='crowded';s.fit=SLABS.find(part=>{const b=box(s,part);return cells(s.lattice!,b.hx,b.hy,b.hz)<=s.limit*(s===red?3:2.2);})??0;
   if(!s.fit)crowded.add(classOf(s.entry));
  }
  for(const s of species)if(s.fit){if(crowded.has(classOf(s.entry))){s.fit=0;}else slab=Math.min(slab,s.fit);}
  fog.near=CAMERA-NEAR*slab*.4;fog.far=CAMERA+FAR*slab;
  // Red cells first: everything dissolved in plasma has to stay out of them.
  nearRed.length=0;
  for(const s of order){
   if(s.fit<slab)continue;
   const reach=s.radius/span,b=box(s,slab),found=s.found;let count=0;
   const emit=(p:Point)=>{
    if(s===red)redWorld(p,world);else world.set(p.x,p.y,p.z);
    const x=(world.x-focus.x)/span,y=(world.y-focus.y)/span,z=(world.z-focus.z)/span,depth=CAMERA-z;
    if(depth<.12||z<-b.far||Math.abs(y)>.5*depth/CAMERA+reach||Math.abs(x)>.5*aspect*depth/CAMERA+reach)return;
    if(s===red&&nearRed.length<600)nearRed.push(world.clone());
    if(s.amount!.where==='plasma'&&inRedCell(world.x,world.y,world.z))return;
    if(count>=s.limit)return;
    found[count*5]=x;found[count*5+1]=y;found[count*5+2]=z;found[count*5+3]=p.seed;found[count*5+4]=2*reach*height*CAMERA/depth;s.ranked[count]=count;count++;
   };
   if(s===red){local.set(focus.x,focus.y,b.cz).applyQuaternion(untilt);visit(s.lattice!,local.x,local.y,local.z,b.hx,b.hy,b.hz,Infinity,emit);}
   else visit(s.lattice!,focus.x,focus.y,b.cz,b.hx,b.hy,b.hz,Infinity,emit);
   // The largest on screen get the full model; the rest a plain ellipsoid of the same proportions and colour.
   const ranked=s.ranked.subarray(0,count);if(count>s.detailLimit)ranked.sort((m,n)=>found[n*5+4]-found[m*5+4]);
   for(let r=0;r<count;r++){
    const n=ranked[r]*5,seed=found[n+3];position.set(found[n],found[n+1],found[n+2]);
    const a=seed*6.2831853*7,t=Math.acos(2*((seed*977)%1)-1);axis.set(Math.sin(t)*Math.cos(a),Math.sin(t)*Math.sin(a),Math.cos(t));
    if(s===red){turn.copy(tilt).multiply(spin.setFromAxisAngle(axis,.1)).multiply(spin.setFromAxisAngle(axis.set(0,0,1),seed*40));}
    else turn.setFromAxisAngle(axis,seed*40+(s.cell?0:clock*(.15+.3*((seed*131)%1))));
    if(r<s.detailLimit&&found[n+4]>=DETAIL_PX)s.detail.setMatrixAt(s.detail.count++,matrix.compose(position,turn,scale.setScalar(reach)));
    else s.plain.setMatrixAt(s.plain.count++,matrix.compose(position.add(local.copy(s.centre).multiplyScalar(reach).applyQuaternion(turn)),turn,scale.copy(s.half).multiplyScalar(reach)));
   }
   s.shown=count;s.state='shown';
   if(s.detail.count)s.detail.instanceMatrix.needsUpdate=true;if(s.plain.count)s.plain.instanceMatrix.needsUpdate=true;
  }
  renderer.render(scene,camera);
  if(now-textAt>250){
   textAt=now;const cssHeight=el.clientHeight,nice=niceLength(span*.22);bar.style.width=`${(nice/span*cssHeight).toFixed(1)}px`;barLabel.textContent=length(nice);
   title.textContent=vessel!.name;subtitle.textContent=`${bloodOf(vessel!.circuit)} blood · moving with it at ${(vessel!.speed*100).toFixed(vessel!.speed<.1?1:0)} cm/s · view ${length(span)} tall`;
   const shown:string[]=[];
   for(const s of species){
    const row=rows.get(s.entry.id);if(!row||!s.lattice)continue;
    const point=s===red?null:nearest(s.lattice,focus.x,focus.y,focus.z);row.near.textContent=point?`nearest ${length(point.distance)}`:'';
    row.view.textContent=s.state==='shown'?`${s.shown} in view`:s.state==='small'?'too small here':'too many to draw here';if(s.shown)shown.push(`${s.entry.id}:${s.shown}`);
   }
   el.dataset.diveSpan=span.toExponential(3);el.dataset.diveView=shown.join(',');const insulin=byId.get('insulin')!.lattice;if(insulin)el.dataset.diveNearestInsulin=nearest(insulin,focus.x,focus.y,focus.z).distance.toExponential(3);
   for(const button of hud.querySelectorAll<HTMLElement>('nav button'))button.setAttribute('aria-current',String(button.dataset.stop===[...STOPS].reverse().find(s=>span<=(s.span||maxSpan)*1.5)?.id));
  }
 };
 const leave=()=>{if(!vessel)return;vessel=null;hud.hidden=true;tip.hidden=true;delete el.dataset.dive;delete el.dataset.diveSpan;delete el.dataset.diveView;delete el.dataset.diveNearestInsulin;hooks.changed();};
 const enter=(v:DiveVessel)=>{
  vessel=v;maxSpan=v.radius*2*2.4;span=targetSpan=maxSpan;amountsFor=null;last=performance.now();refresh(hooks.body());
  // Start in plasma: step along the vessel until the focus is outside every red cell.
  focus.set(0,0,0);for(let i=0;i<40;i++){nearRed.length=0;visit(red.lattice!,...local.copy(focus).applyQuaternion(untilt).toArray() as [number,number,number],9e-6,9e-6,9e-6,400,p=>{nearRed.push(redWorld(p,new T.Vector3()));});if(!inRedCell(focus.x,focus.y,focus.z))break;focus.x+=1.1e-6;}
  targetFocus.copy(focus);hud.hidden=false;hint.hidden=true;el.dataset.dive=v.name;hooks.changed();
 };
 const zoomTo=(next:number)=>{targetSpan=Math.min(maxSpan,Math.max(MIN_SPAN,next));};
 const goTo=(id:SpeciesId)=>{
  const s=byId.get(id);if(!s?.lattice||!vessel)return;
  if(s===red){const p=nearest(s.lattice,...local.copy(focus).applyQuaternion(untilt).toArray() as [number,number,number]);redWorld(p,targetFocus);}
  else{const p=nearest(s.lattice,focus.x,focus.y,focus.z);targetFocus.set(p.x,p.y,p.z);}
  zoomTo(s.radius*2*7);
 };
 const wheel=(e:WheelEvent)=>{
  if(vessel){
   e.preventDefault();e.stopImmediatePropagation();
   if(e.deltaY>0&&targetSpan>=maxSpan*.999){leave();return;}
   zoomTo(targetSpan*(e.deltaY<0?.86:1/.86));return;
  }
  if(e.deltaY<0&&hooks.atClosest()){const v=hooks.vesselAt(e.clientX,e.clientY);if(v){e.preventDefault();e.stopImmediatePropagation();enter(v);}}
 };
 // The first click of a double-click selects the vessel, which can re-frame the body view, so the vessel is
 // taken from where the first press landed.
 let pressed:{vessel:DiveVessel;at:number}|null=null;
 const doubleClick=()=>{if(!vessel&&pressed&&performance.now()-pressed.at<900)enter(pressed.vessel);};
 // Dragging moves the focus through the blood; nothing else in the body view responds while diving.
 let drag:{id:number;x:number;y:number}|null=null,hoverAt=0;const raycaster=new T.Raycaster(),pointer=new T.Vector2();
 const down=(e:PointerEvent)=>{if(!vessel){if(!pressed||performance.now()-pressed.at>600){const v=hooks.vesselAt(e.clientX,e.clientY);pressed=v?{vessel:v,at:performance.now()}:null;}return;}e.stopImmediatePropagation();drag={id:e.pointerId,x:e.clientX,y:e.clientY};tip.hidden=true;};
 const move=(e:PointerEvent)=>{
  if(!vessel)return;e.stopImmediatePropagation();
  if(drag&&drag.id===e.pointerId){const k=span/el.clientHeight;targetFocus.x-=(e.clientX-drag.x)*k;targetFocus.y+=(e.clientY-drag.y)*k;drag.x=e.clientX;drag.y=e.clientY;return;}
  if(performance.now()-hoverAt<80)return;hoverAt=performance.now();
  const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
  let nearestHit=Infinity,found:MoleculeEntry|null=null;
  for(const s of species)for(const mesh of [s.detail,s.plain]){if(!mesh.count)continue;mesh.computeBoundingSphere();const hit=raycaster.intersectObject(mesh,false)[0];if(hit&&hit.distance<nearestHit){nearestHit=hit.distance;found=s.entry;}}
  tip.hidden=!found;if(found){tip.textContent=`${found.name} · ${found.standIn?'stand-in ':''}${found.source} · ${length(found.radiusNm*2e-9)} across`;tip.style.left=`${Math.max(10,Math.min(e.clientX-rect.left+15,el.clientWidth-260))}px`;tip.style.top=`${Math.min(e.clientY-rect.top+20,el.clientHeight-55)}px`;}
 };
 const up=(e:PointerEvent)=>{if(!vessel)return;e.stopImmediatePropagation();if(drag?.id===e.pointerId)drag=null;};
 const click=(e:MouseEvent)=>{
  const target=(e.target as HTMLElement).closest<HTMLElement>('button');if(!target||!vessel)return;
  if(target.dataset.go)goTo(target.dataset.go as SpeciesId);
  else if(target.dataset.stop==='surface')leave();
  else if(target.dataset.stop){const stop=STOPS.find(s=>s.id===target.dataset.stop)!;zoomTo(stop.span||maxSpan);}
 };
 const canvas=renderer.domElement,options={capture:true,passive:false} as const;
 canvas.addEventListener('wheel',wheel,options);canvas.addEventListener('dblclick',doubleClick);hud.addEventListener('click',click);
 for(const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up]] as const)canvas.addEventListener(name,handler,{capture:true});
 return {
  /** True while the dive view replaces the body view. */
  active:()=>!!vessel,
  /** Draw one frame of the dive. */
  frame,
  /** Offer the dive when the body view is as close as it goes. */
  hint:(show:boolean)=>{if(hint.hidden===show)hint.hidden=!show;},
  enter,leave,
  dispose(){
   canvas.removeEventListener('wheel',wheel,options);canvas.removeEventListener('dblclick',doubleClick);for(const [name,handler] of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up]] as const)canvas.removeEventListener(name,handler,{capture:true});
   for(const s of species){s.detail.dispose();s.plain.dispose();}for(const d of disposables)d.dispose();for(const geometry of pack.geometries)geometry.dispose();hud.remove();hint.remove();tip.remove();
  },
 };
}
export type Dive=ReturnType<typeof createDive>;
