import {lazy,Suspense,useMemo,useState,type ReactNode} from 'react';
import {ChevronRight,Eye,Focus,Layers3,RotateCcw,Search,SlidersHorizontal,X,Play,Pause,Heart,Wind,Utensils,Droplet,Activity} from 'lucide-react';
import type {Atlas,Concept} from '../anatomy';
import {createAnatomyIndex,organNames,presets,type AnatomyAngle,type AnatomyPreset,type AnatomyRegion,type PhysicalViewState} from '../physical/anatomy-view';
import type {BodyState,Organ} from './types';
import {glucose} from './engine';
import {lenses,type Lens} from '../physical/body-lens';
import '../physical/physical.css';
const PhysicalScene=lazy(()=>import('../physical/PhysicalScene'));
const initialView:PhysicalViewState={preset:'dissection',region:'body',angle:'front',selected:[],isolate:false,context:.5,cut:'none',slice:.5,reset:0,focus:0,hidden:[]};
/** The body fills the screen; every control floats over it. */
export default function BodyMap({state,selected,onSelect,atlas,running,catalogueError,organCard}:{state:BodyState;selected:Organ;onSelect:(id:Organ)=>void;running:boolean;atlas:Atlas|null;catalogueError?:string;organCard:ReactNode}) {
 const [view,setView]=useState(initialView),[progress,setProgress]=useState(0),[error,setError]=useState(''),[query,setQuery]=useState(''),[structure,setStructure]=useState<Concept|null>(null),[toolsOpen,setToolsOpen]=useState(false),[motion,setMotion]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches),[lens,setLens]=useState<Lens>('flow'),[cardOpen,setCardOpen]=useState(()=>window.innerWidth>900);
 const index=useMemo(()=>atlas?createAnatomyIndex(atlas):null,[atlas]);
 const parts=structure?.elements??[...(index?.groups[selected]??[])];
 const sceneView=useMemo(()=>({...view,selected:parts}),[view,structure,index,selected]);
 const displayError=error||catalogueError;
 const searchResults=useMemo(()=>{if(!atlas||query.trim().length<2)return [];const q=query.toLowerCase().trim();return atlas.concepts.filter(c=>c.name.toLowerCase().includes(q)||c.id.toLowerCase().includes(q)).sort((a,b)=>Number(b.name.toLowerCase()===q)-Number(a.name.toLowerCase()===q)||a.name.length-b.name.length).slice(0,12);},[atlas,query]);
 const selectStructure=(c:Concept)=>{setStructure(c);setQuery('');setCardOpen(true);setView(v=>({...v,region:'selection',isolate:true,hidden:[],cut:'none',focus:v.focus+1}));const organ=c.elements.map(id=>index?.organ.get(id)).find(Boolean);if(organ)onSelect(organ);};
 const pick=(id:string)=>{const part=atlas?.parts.find(p=>p.id===id);if(!part)return;setStructure({id:part.conceptId,name:part.name,elements:[id]});setCardOpen(true);const organ=index?.organ.get(id);if(organ)onSelect(organ);};
 const watch=(id:Organ,preset:AnatomyPreset,nextLens:Lens=lens)=>{setStructure(null);onSelect(id);setCardOpen(true);setMotion(true);setLens(nextLens);setView(v=>({...v,preset,region:id==='gut'?'abdomen':id==='lungs'?'selection':'torso',isolate:false,cut:'none',hidden:[],focus:v.focus+1}));};
 const reset=()=>{setView(v=>({...initialView,reset:v.reset+1}));setStructure(null);setQuery('');};
 const eating=state.stomach.carbs+state.stomach.protein+state.stomach.fat>0;
 return <div className={`physical-anatomy body-first ${cardOpen?'card-open':''}`}>
  <div className="physical-stage">
   {atlas&&<Suspense fallback={null}><PhysicalScene atlas={atlas} body={state} motion={motion} lens={lens} view={sceneView} onSelect={pick} onProgress={setProgress} onError={setError}/></Suspense>}
   <div className="physical-processes" aria-label="Vital signs">
    <button aria-label="Watch the heart and circulation" onClick={()=>watch('heart','vessels','flow')}><Heart size={15}/><span>Heart<strong>{state.heartRate.toFixed(0)} <small>beats/min</small></strong></span></button>
    <button aria-label="Watch breathing" onClick={()=>watch('lungs','organs','oxygen')}><Wind size={15}/><span>Breathing<strong>{state.respiratoryRate.toFixed(0)} <small>breaths/min</small></strong></span></button>
    <button aria-label="Watch blood oxygen" onClick={()=>watch('lungs','organs','oxygen')}><Activity size={15}/><span>Blood oxygen<strong>{state.saturation.toFixed(0)} <small>%</small></strong></span></button>
    <button aria-label="Watch blood sugar" onClick={()=>watch('liver','organs','glucose')}><Droplet size={15}/><span>Blood sugar<strong>{glucose(state).toFixed(0)} <small>mg/dL</small></strong></span></button>
    <button aria-label="Watch digestion" onClick={()=>watch('gut','organs','flow')}><Utensils size={15}/><span>Digestion<strong>{eating?'Digesting':'Empty'}</strong></span></button>
   </div>
   <aside className="physical-side" aria-label="Selected part of the body">
    <div className="physical-search"><Search size={14}/><input aria-label="Search physical anatomy" placeholder="Find a body part…" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setQuery('');}}/>{query&&<button aria-label="Clear anatomy search" onClick={()=>setQuery('')}><X size={13}/></button>}{query.trim().length>=2&&<div className="physical-results">{searchResults.length?searchResults.map(c=><button key={c.id} onClick={()=>selectStructure(c)}><span>{c.name}</span><ChevronRight size={12}/></button>):<p>Nothing by that name in this body.</p>}</div>}</div>
    {cardOpen?<div className="organ-card">
     <div className="organ-card-head"><div><span>{structure?'BODY PART':'ORGAN'}</span><h3>{structure?.name??organNames[selected]}</h3></div><button aria-label="Close organ card" onClick={()=>setCardOpen(false)}><X size={15}/></button></div>
     <div className="organ-card-actions"><button disabled={!parts.length} onClick={()=>setView(v=>({...v,region:'selection',focus:v.focus+1}))}><Focus size={13}/> Zoom to it</button><button disabled={!parts.length} aria-pressed={view.isolate} onClick={()=>setView(v=>({...v,isolate:!v.isolate,region:!v.isolate?'selection':'body',focus:v.focus+1,cut:'none'}))}><Eye size={13}/> {view.isolate?'Show the rest':'Show only this'}</button>{structure&&<button onClick={()=>{setView(v=>({...v,hidden:[...new Set([...v.hidden,...parts])],isolate:false,region:v.region==='selection'?'body':v.region}));setStructure(null);}}>Hide</button>}</div>
     {organCard}
    </div>:<button className="organ-card-open" onClick={()=>setCardOpen(true)}>{organNames[selected]} <ChevronRight size={13}/></button>}
   </aside>
   <div className="physical-bottom">
    <div className="physical-orientation" aria-label="Camera angle">{(['front','oblique','back','side'] as AnatomyAngle[]).map(angle=><button key={angle} aria-pressed={view.angle===angle} onClick={()=>setView(v=>({...v,angle}))}>{angle==='front'?'Front':angle==='back'?'Back':angle==='side'?'Side':'¾'}</button>)}<i/>{([{id:'body',name:'Whole body'},{id:'torso',name:'Chest'},{id:'abdomen',name:'Belly'},{id:'head',name:'Head'}] as {id:AnatomyRegion;name:string}[]).map(r=><button key={r.id} aria-pressed={view.region===r.id&&!view.isolate} onClick={()=>setView(v=>({...v,region:r.id,isolate:false,focus:v.focus+1}))}>{r.name}</button>)}</div>
    <div className="physical-presets" role="group" aria-label="What to show">{presets.map(p=><button key={p.id} title={p.description} aria-pressed={view.preset===p.id} onClick={()=>{setStructure(null);setView(v=>({...v,preset:p.id,isolate:false,hidden:[],cut:'none'}));}}>{p.id==='dissection'?'Open body':p.name}</button>)}</div>
    <div className="physical-stage-actions"><label className="physical-lens"><span>Colour by</span><select aria-label="Colour the body by" value={lens} onChange={e=>setLens(e.target.value as Lens)}>{lenses.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><button aria-label={motion?'Pause anatomical motion':'Play anatomical motion'} aria-pressed={motion} onClick={()=>setMotion(v=>!v)}>{motion?<Pause size={14}/>:<Play size={14}/>}</button><button aria-label="Cut through the body" onClick={()=>setToolsOpen(v=>!v)} aria-expanded={toolsOpen}><SlidersHorizontal size={15}/></button><button aria-label="Reset anatomy view" onClick={reset}><RotateCcw size={15}/></button></div>
   </div>
   {toolsOpen&&<div className="physical-tools"><div><strong>Cut through the body</strong><button aria-label="Close cutting controls" onClick={()=>setToolsOpen(false)}><X size={13}/></button></div><label>Cut<select aria-label="Anatomical section plane" value={view.cut} onChange={e=>setView(v=>({...v,cut:e.target.value as PhysicalViewState['cut']}))}><option value="none">No cut</option><option value="sagittal">Left / right</option><option value="coronal">Front / back</option><option value="axial">Top / bottom</option></select></label>{view.cut!=='none'&&<label>Where<input aria-label="Anatomical section position" type="range" min="0" max="1" step=".01" value={view.slice} onChange={e=>setView(v=>({...v,slice:Number(e.target.value)}))}/></label>}<label>Skeleton see-through<input aria-label="Skeleton context opacity" type="range" min="0" max="1" step=".05" value={view.context} onChange={e=>setView(v=>({...v,context:Number(e.target.value)}))}/></label>{view.hidden.length>0&&<button onClick={()=>setView(v=>({...v,hidden:[]}))}>Bring back {view.hidden.length} hidden parts</button>}</div>}
   {progress<100&&!displayError&&<div className="physical-loading" role="status"><Layers3 size={25}/><strong>Assembling the body</strong><span>{progress}%</span><div><i style={{width:`${progress}%`}}/></div></div>}
   {displayError&&<div className="physical-loading physical-load-error" role="alert"><strong>{displayError}</strong><button onClick={()=>location.reload()}>Reload</button></div>}
   <div className="physical-tracer-legend" hidden={lens!=='flow'}><span><i/> Oxygen-rich blood</span><span><i/> Oxygen-poor blood</span><span><i/> Air</span><span><i/> Food</span></div>
   <div className="physical-stage-foot"><span>{running?'Running':'Paused'} · motion is illustrative, sizes not to scale</span><span>Drag to turn · scroll to zoom · click a part · double-click a vessel to look inside the blood</span></div>
  </div>
 </div>;
}
