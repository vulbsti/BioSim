import {useEffect,useMemo,useRef,useState} from 'react';
import {Activity,AlertCircle,ArrowLeft,ArrowRight,Box,Check,ChevronRight,Download,Focus,Layers,Pause,Play,RotateCcw,Upload} from 'lucide-react';
import {defaultConfig,observe,type ExperimentResult} from '../molecular/experiments';
import TissueScene,{type SceneMetrics,type TissueView} from './TissueScene';
import {LEVELS,loadTissueManifest,physicalLength,type TissueLevel,type TissueLOD,type TissueManifest} from './assets';
import {exportTissueView,importTissueView} from './recording';
import {SARCOMERE,sarcomereBands} from './sarcomere';
import ExcitationPanel from './ExcitationPanel';
import {useExcitation} from './use-excitation';
import './tissue.css';
const titles={muscle:'Right vastus lateralis',fascicle:'A bundle of muscle fibers',fiber:'Inside a muscle fiber',sarcomere:'The sliding filaments'};
const subtitles={muscle:'SOURCE ANATOMY / THIGH',fascicle:'REPRESENTATIVE / TISSUE SEGMENT',fiber:'REPRESENTATIVE / CELL SEGMENT',sarcomere:'REPRESENTATIVE / FILAMENT LATTICE'};
const defaults={muscle:'FJ1442',fascicle:'pilot-fiber-00',fiber:'pilot-myofibrils',sarcomere:'pilot-thick-filaments'};
const levelNames={muscle:'Muscle',fascicle:'Fascicle',fiber:'Muscle fiber',sarcomere:'Sarcomere'};
const clock=(s:number)=>`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
export default function TissueExplorer({onBack,onAnatomy,onMolecular}:{onBack:()=>void;onAnatomy:(query:string)=>void;onMolecular:()=>void}){
 const [manifest,setManifest]=useState<TissueManifest|null>(null),[error,setError]=useState(''),[sceneError,setSceneError]=useState(''),[ready,setReady]=useState(false);
 const [level,setLevel]=useState<TissueLevel>('muscle'),[lod,setLOD]=useState<TissueLOD>('detail'),[selection,setSelection]=useState({...defaults}),[showSheath,setShowSheath]=useState(true),[showBone,setShowBone]=useState(false),[section,setSection]=useState<TissueView['section']>('none'),[slice,setSlice]=useState(.5),[reset,setReset]=useState(0),[angle,setAngle]=useState<TissueView['angle']>('oblique');
 const [metrics,setMetrics]=useState<SceneMetrics|null>(null),[result,setResult]=useState<ExperimentResult|null>(null),[signalError,setSignalError]=useState(''),[signal,setSignal]=useState(false),[time,setTime]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(60),[notice,setNotice]=useState(''),[noticeError,setNoticeError]=useState(false);
 const file=useRef<HTMLInputElement>(null);
 const [sarcomereLength,setSarcomereLength]=useState<number>(SARCOMERE.rest);
 const excitation=useExcitation(),displayLength=excitation.view.enabled?SARCOMERE.rest:sarcomereLength;
 const bands=sarcomereBands(displayLength);
 useEffect(()=>{const abort=new AbortController();loadTissueManifest(abort.signal).then(setManifest).catch(e=>{if(!abort.signal.aborted)setError((e as Error).message);});return()=>abort.abort();},[]);
 useEffect(()=>{let worker:Worker;try{worker=new Worker(new URL('../molecular/mechanism.worker.ts',import.meta.url),{type:'module'});}catch{setSignalError('The signaling calculation worker is unavailable.');return;}
  worker.onmessage=({data}:{data:{result?:ExperimentResult;error?:string}})=>{if(data.result)setResult(data.result);else setSignalError(data.error??'Could not compute the signaling preview.');};worker.onerror=()=>setSignalError('The signaling calculation worker stopped.');worker.postMessage({id:1,config:defaultConfig('insulin')});return()=>worker.terminate();
 },[]);
 useEffect(()=>{setReady(false);setSceneError('');setMetrics(null);},[level,lod]);
 useEffect(()=>{if(!playing||!result)return;let frame=0,last=performance.now();const tick=(now:number)=>{const dt=Math.min(.15,(now-last)/1000);last=now;setTime(t=>Math.min(3600,t+dt*speed));frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[playing,result,speed]);
 useEffect(()=>{if(time>=3600)setPlaying(false);},[time]);
 useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(id);},[notice]);
 const sample=result?observe(result,time):null,entity=manifest?.entities.find(e=>e.id===selection[level]),levelIndex=LEVELS.indexOf(level);
 const changeLevel=(next:TissueLevel)=>{setLevel(next);setSection('none');setSlice(.5);};
 const glut4=sample?.values.glut4??4;
 const view=useMemo<TissueView>(()=>({selected:selection[level],showSheath,showBone,section,slice,reset,angle,signal,glut4,sarcomereLength:displayLength,excitation:excitation.sample?{boundTroponinUM:excitation.sample.boundTroponinUM,postStrokeUM:excitation.sample.postStrokeUM}:undefined}),[selection,level,showSheath,showBone,section,slice,reset,angle,signal,glut4,displayLength,excitation.sample]);
 const save=()=>{if(!manifest)return;try{const text=exportTissueView(manifest,{level,lod,selection,showSheath,showBone,section,slice,angle,signal,time,sarcomereLength,excitation:excitation.view});const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='human-atlas-tissue-view.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNoticeError(false);setNotice('Specimen selection and mechanism playheads saved.');}catch(e){setNoticeError(true);setNotice((e as Error).message);}};
 return <div className="tissue-app">
  <header className="tissue-header"><button className="tissue-brand" onClick={onBack}><span><Activity size={22}/></span><b>Human Atlas<small>TISSUE EXPLORER</small></b></button><button className="tissue-back" onClick={onBack}><ArrowLeft size={14}/> Whole-body physiology</button><button className="tissue-back tissue-molecular-link" onClick={onMolecular}>Molecular lab <ArrowRight size={14}/></button></header>
  <main><div className="tissue-intro"><div><span className="tissue-eyebrow">ANATOMY ACROSS SCALES</span><h1>A muscle, from the inside.</h1><p>Follow its structure from an anatomical surface to the machinery within a cell.</p></div><span className="tissue-source-badge"><Box size={20}/><span>Blender-authored specimens<small>Physical scale · named structures</small></span></span></div>
   {error?<div className="tissue-error" role="alert">{error}</div>:!manifest?<div className="tissue-loading" role="status">Preparing the tissue catalogue…</div>:<>
    <nav className="tissue-levels" aria-label="Anatomical scale">{LEVELS.map((l,i)=><button key={l} aria-current={l===level?'step':undefined} onClick={()=>changeLevel(l)}><span className="tissue-level-number">0{i+1}</span><span><b>{levelNames[l]}</b><small>{physicalLength(manifest.levels[l].spanM)} {l==='muscle'?'reference extent':'segment'}</small></span><ChevronRight size={18}/></button>)}</nav>
    <section className="tissue-workspace">
     <div className="tissue-viewer"><div className="tissue-view-heading"><div><span className="tissue-eyebrow">{subtitles[level]}</span><h2>{titles[level]}</h2></div><span className="tissue-ready" role="status">{sceneError?'Unavailable':ready?<><i/> Specimen ready</>:'Loading specimen…'}</span></div>
      <div className="tissue-stage">
       <TissueScene asset={manifest.levels[level].representations[lod]} level={level} view={view} onSelect={id=>setSelection(s=>({...s,[level]:id}))} onReady={()=>setReady(true)} onError={setSceneError} onMetrics={setMetrics}/>
       {sceneError&&<div className="tissue-stage-error" role="alert">{sceneError}</div>}
       {!ready&&!sceneError&&<div className="tissue-stage-loading" role="status"><Box size={30}/><span>Loading {level} geometry</span></div>}
       <div className="tissue-stage-caption"><span>{level==='muscle'?'BodyParts3D / FJ1442':'Illustrative microstructure'}</span><small>{level==='muscle'?'Original source surface':'Not registered to the source donor'}</small></div>
       {excitation.view.enabled&&<div className="tissue-activation-overlay">
        <button disabled={!excitation.result||excitation.busy} aria-label={excitation.playing?'Pause activation in scene':'Play activation in scene'} onClick={()=>{if(excitation.view.timeMs>=500)excitation.setView(v=>({...v,timeMs:0}));excitation.setPlaying(!excitation.playing);}}>{excitation.playing?<Pause size={12}/>:<Play size={12}/>} {excitation.view.timeMs.toFixed(1)} ms</button>
        <span>Ca²⁺ {excitation.sample?.calciumUM.toFixed(2)??'—'} µM</span><small>Fixed-length activation</small>
       </div>}
       <div className="tissue-scale-bar"><i/><span>{metrics?physicalLength(metrics.metersPer100Pixels):'…'}</span><small>at the focus plane</small></div>
       <div className="tissue-orbit-note">Drag to orbit · scroll to zoom · select a structure</div>
       <div className="tissue-view-tools"><button aria-label="Reset specimen camera" onClick={()=>{setAngle('oblique');setReset(n=>n+1);}}><Focus size={16}/></button><button aria-label="Front specimen view" aria-pressed={angle==='front'} onClick={()=>setAngle(a=>a==='front'?'oblique':'front')}>Front</button>{level!=='muscle'&&<button aria-label="View cut end" aria-pressed={angle==='end'} onClick={()=>setAngle(a=>a==='end'?'oblique':'end')}>Cut end</button>}</div>
      </div>
      <div className="tissue-drill"><div><span className="tissue-eyebrow">{levelIndex<3?'LOOK CLOSER':'SLIDING FILAMENT ORGANIZATION'}</span><p>{level==='muscle'?'Open a representative tissue segment to inspect its organization.':level==='fascicle'?'A muscle fiber is one long, multinucleated cell. Explore a cut segment.':level==='fiber'?'The stripes repeat along each myofibril. Open one sarcomere to inspect the filaments behind them.':'Gold thin filaments slide past rose thick filaments. Blue Z discs move with their attached thin filaments; the central M line stays in place.'}</p></div>{levelIndex<3?<button onClick={()=>changeLevel(LEVELS[levelIndex+1])}>{level==='muscle'?'Explore fascicle':level==='fascicle'?'Enter muscle fiber':'Inspect sarcomere'} <ArrowRight size={16}/></button>:<button onClick={()=>setSarcomereLength(SARCOMERE.rest)}>Reset length <RotateCcw size={15}/></button>}</div>
      {level==='sarcomere'&&<div className="tissue-contraction">
       <label className="tissue-field">{excitation.view.enabled?'Held length · isometric experiment':'Sarcomere length'} <output aria-label="Sarcomere length value">{(displayLength*1e6).toFixed(2)} µm</output><input aria-label="Sarcomere length" type="range" min="2" max="3.2" step="0.01" disabled={excitation.view.enabled} value={displayLength*1e6} onChange={e=>setSarcomereLength(Number(e.target.value)*1e-6)}/></label>
       <div className="tissue-band-values"><span>A band <b aria-label="A band length">{(bands.aBand*1e6).toFixed(2)} µm</b></span><span>Half I band <b aria-label="Half I band length">{(bands.halfIBand*1e6).toFixed(2)} µm</b></span><span>H zone <b aria-label="H zone length">{(bands.hZone*1e6).toFixed(2)} µm</b></span></div>
       <p>Change the distance between Z discs to inspect filament overlap. Each thin filament remains 1.00 µm long; each thick filament remains 1.60 µm. Enable the experiment below to follow calcium and cross-bridge activation at fixed length. Load-driven shortening, titin and physical force remain unresolved.</p>
      </div>}
     </div>
     <aside className="tissue-inspector"><div className="tissue-panel-label"><Layers size={16}/> INSPECT THE SPECIMEN</div>
      <label className="tissue-field">Structure<select aria-label="Inspect tissue structure" value={selection[level]} onChange={e=>setSelection(s=>({...s,[level]:e.target.value}))}>{manifest.entities.filter(e=>e.level===level).map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
      <div className="tissue-entity"><span className={`tissue-evidence ${entity?.evidence==='source-surface'?'source':''}`}>{entity?.evidence==='source-surface'?'Source anatomy':'Representative geometry'}</span><h3>{entity?.name}</h3><p>{entity?.description}</p><dl><div><dt>Stable ID</dt><dd>{entity?.id}</dd></div>{entity?.diameterM&&<div><dt>Illustrative diameter</dt><dd>{physicalLength(entity.diameterM)}</dd></div>}{entity?.representedCount&&<div><dt>Display instances</dt><dd>{entity.representedCount}</dd></div>}</dl></div>
      <div className="tissue-options"><label className="tissue-check"><input type="checkbox" checked={showSheath} onChange={e=>setShowSheath(e.target.checked)}/> Show outer sheath</label>{level==='muscle'&&<label className="tissue-check"><input type="checkbox" checked={showBone} onChange={e=>setShowBone(e.target.checked)}/> Show bone context</label>}
       <label className="tissue-field">Section plane<select aria-label="Tissue section plane" value={section} onChange={e=>setSection(e.target.value as TissueView['section'])}><option value="none">Specimen windows</option><option value="cross">Cross section</option><option value="longitudinal">Longitudinal section</option></select></label>
       {section!=='none'&&<label className="tissue-field">Section position<input aria-label="Tissue section position" type="range" min="0" max="1" step=".01" value={slice} onChange={e=>setSlice(Number(e.target.value))}/><small>Clipped surfaces are open.</small></label>}
       <label className="tissue-field">Geometry detail<select aria-label="Tissue geometry detail" value={lod} onChange={e=>setLOD(e.target.value as TissueLOD)}><option value="detail">Detailed specimen</option><option value="context">Lighter geometry</option></select></label>
      </div>
      <button className="tissue-locate" onClick={()=>onAnatomy('Right vastus lateralis')}>Locate muscle in full atlas <ArrowRight size={14}/></button>
     </aside>
    </section>
    <ExcitationPanel controller={excitation}/>
    <section className="tissue-signal"><div className="tissue-signal-title"><span className="tissue-eyebrow">ONE PLAYHEAD ACROSS VIEWS</span><h2>Follow the local response.</h2><p>Preview the archived insulin model while changing anatomical scale. The same calculated trajectory stays in place.</p></div>
     {signalError?<p role="alert">{signalError}</p>:<div className="tissue-signal-controls"><div className="tissue-playback"><button disabled={!result} aria-label={playing?'Pause tissue signaling':'Play tissue signaling'} onClick={()=>{setSignal(true);if(time>=3600)setTime(0);setPlaying(!playing);}}>{playing?<Pause size={15}/>:<Play size={15}/>} {playing?'Pause':'Play'}</button><strong aria-label="Tissue mechanism elapsed time">{clock(time)}</strong><span>/ 60:00</span><select aria-label="Tissue playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value="30">30×</option><option value="60">60×</option><option value="120">120×</option></select><button aria-label="Rewind tissue signaling" onClick={()=>{setTime(0);setPlaying(false);}}><RotateCcw size={14}/></button></div>
      <input aria-label="Tissue mechanism time" type="range" min="0" max="3600" step="1" value={time} disabled={!result} onChange={e=>{setTime(Number(e.target.value));setPlaying(false);}}/>
      <div className="tissue-response-values"><span>Insulin <b>{sample?.values.insulin.toFixed(1)??'—'}<small> nM</small></b></span><span>Active Akt <b>{sample?.values.akt.toFixed(1)??'—'}<small> % pool</small></b></span><span>Surface GLUT4 <b aria-label="Tissue surface GLUT4">{sample?.values.glut4.toFixed(1)??'—'}<small> % pool</small></b></span></div>
      <label className="tissue-check"><input aria-label="Show signaling overlay" type="checkbox" checked={signal} onChange={e=>setSignal(e.target.checked)}/> Highlight GLUT4 display sites in the fiber view</label>
     </div>}
     <p className="tissue-signal-boundary">The source model uses mixed cell preparations. Its response is an illustrative overlay, not a human muscle calibration or a contribution to whole-body glucose uptake. Surface markers show activity; they do not count molecules.</p>
    </section>
    <details className="tissue-provenance"><summary>Source, scale and rendering evidence</summary><p>{manifest.provenance.license}. {manifest.provenance.registration}. Blender {manifest.provenance.blenderVersion} exports preserve entity IDs across detail levels.</p><p>{metrics?`${metrics.triangles.toLocaleString()} drawn triangles · ${metrics.calls} draw calls · ${(metrics.loadedBytes/1000).toFixed(0)} kB loaded. Last CPU render submission: ${metrics.renderSubmitMs.toFixed(1)} ms (not GPU frame time).`:'Scene metrics will appear after loading.'}</p><a href="/ATTRIBUTION.md" target="_blank" rel="noreferrer">BodyParts3D attribution ↗</a><a href={manifest.provenance.referenceURL} target="_blank" rel="noreferrer">Muscle organization reference ↗</a></details>
    <div className="tissue-files"><button onClick={save}><Download size={14}/> Save tissue view</button><button onClick={()=>file.current?.click()}><Upload size={14}/> Load tissue view</button><span>Selection, scale and mechanism playhead</span></div>
    <input ref={file} type="file" hidden accept=".json,application/json" aria-label="Import tissue view" onChange={async e=>{const input=e.target,f=input.files?.[0];if(!f)return;try{
     if(f.size>100000)throw new Error('Tissue recording exceeds 100 kB.');const d=importTissueView(manifest,await f.text());
     setPlaying(false);setTime(d.time);setLevel(d.level);setLOD(d.lod);setSelection(d.selection);setShowSheath(d.showSheath);setShowBone(d.showBone);setSection(d.section);setSlice(d.slice);setAngle(d.angle);setSignal(d.signal);setSarcomereLength(d.sarcomereLength);excitation.setPlaying(false);excitation.setView(d.excitation);setNoticeError(false);setNotice('Tissue view and playheads restored.');
    }catch(e){setNoticeError(true);setNotice((e as Error).message);}input.value='';}}/>
   </>}
   <footer className="tissue-footer">HUMAN ATLAS / MULTISCALE ANATOMY <span>Source surfaces + representative interiors · anatomical review pending</span></footer>
  </main>{notice&&<div className={`tissue-notice ${noticeError?'error':''}`} role={noticeError?'alert':'status'}>{noticeError?<AlertCircle size={16}/>:<Check size={16}/>} {notice}</div>}
 </div>;
}
