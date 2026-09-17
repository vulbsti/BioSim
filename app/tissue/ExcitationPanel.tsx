import {Pause,Play,RotateCcw} from 'lucide-react';
import {EXCITATION_DURATION,type ExcitationConfig,type ExcitationResult} from './excitation';
import type {useExcitation} from './use-excitation';

function Trace({result,timeMs,field,label,unit,color}:{result:ExcitationResult;timeMs:number;field:'voltageMV'|'calciumUM'|'postStrokeUM';label:string;unit:string;color:string}){
 const values=result.samples.map(s=>s[field]),lo=Math.min(0,...values),hi=Math.max(field==='voltageMV'?40:field==='calciumUM'?1:1,...values),range=hi-lo||1;
 const x=(t:number)=>42+t/EXCITATION_DURATION*598,y=(v:number)=>100-(v-lo)/range*70;
 const points=result.samples.map(s=>`${x(s.timeMs).toFixed(2)},${y(s[field]).toFixed(2)}`).join(' ');
 return <svg className="excitation-trace" viewBox="0 0 662 128" role="img" aria-label={`${label} over 500 milliseconds`}>
  <text x="42" y="15" fill={color}>{label} · {unit}</text>
  <line x1="42" x2="640" y1="100" y2="100" stroke="#cad5cb"/>
  <text x="36" y="34" textAnchor="end">{hi.toFixed(1)}</text><text x="36" y="103" textAnchor="end">{lo.toFixed(1)}</text>
  <polyline points={points} fill="none" stroke={color} strokeWidth="1.6"/>
  <line x1={x(timeMs)} x2={x(timeMs)} y1="24" y2="104" stroke="#294b43" strokeDasharray="3 3"/>
  <text x="42" y="120">0</text><text x="640" y="120" textAnchor="end">500 ms</text>
 </svg>;
}
export default function ExcitationPanel({controller:e}:{controller:ReturnType<typeof useExcitation>}){
 const {view,result,sample}=e;
 return <section className="excitation-panel" aria-label="Muscle excitation experiment" data-result={result?`${result.config.stimulus}:${result.config.releaseScale}`:'pending'}>
  <div><span className="tissue-eyebrow">ELECTRICAL INPUT → CALCIUM → CROSS-BRIDGES</span><h2>Activate the muscle machinery.</h2><p>A published fast-twitch mouse-muscle model drives the local activation overlay. The specimen is held at a fixed 2.50 µm sarcomere length.</p></div>
  <label className="tissue-check"><input aria-label="Enable excitation experiment" type="checkbox" checked={view.enabled} onChange={event=>e.setView(v=>({...v,enabled:event.target.checked}))}/> Show the fixed-length activation experiment</label>
  {view.enabled&&<>
   <div className="excitation-settings">
    <label className="tissue-field">Electrical stimulus<select aria-label="Excitation stimulus" value={view.config.stimulus} onChange={event=>{e.setPlaying(false);e.setView(v=>({...v,timeMs:0,config:{...v.config,stimulus:event.target.value as ExcitationConfig['stimulus']}}));}}><option value="single">One pulse · twitch</option><option value="train">20 Hz · nine pulses</option><option value="none">No electrical stimulus</option></select></label>
    <label className="tissue-field">SR calcium release<select aria-label="SR calcium release" value={view.config.releaseScale} onChange={event=>{e.setPlaying(false);e.setView(v=>({...v,timeMs:0,config:{...v.config,releaseScale:Number(event.target.value)}}));}}><option value="1">Source release rate</option><option value="0">Block SR release</option></select></label>
   </div>
   <div className="excitation-status" role="status">{e.busy?'Computing 56 coupled states…':result?'Excitation experiment ready':e.error?'Calculation unavailable':'Preparing experiment…'}</div>
   {e.error&&<p role="alert">{e.error}</p>}
   <div className="tissue-playback"><button disabled={!result||e.busy} aria-label={e.playing?'Pause excitation':'Play excitation'} onClick={()=>{if(view.timeMs>=EXCITATION_DURATION)e.setView(v=>({...v,timeMs:0}));e.setPlaying(!e.playing);}}>{e.playing?<Pause size={14}/>:<Play size={14}/>} {e.playing?'Pause':'Play'}</button><strong aria-label="Excitation time">{view.timeMs.toFixed(1)} ms</strong><select aria-label="Excitation playback speed" value={e.speed} onChange={event=>e.setSpeed(Number(event.target.value))}><option value=".05">0.05× · slow motion</option><option value=".1">0.1×</option><option value="1">1×</option></select><button aria-label="Rewind excitation" onClick={()=>{e.setPlaying(false);e.setView(v=>({...v,timeMs:0}));}}><RotateCcw size={14}/></button></div>
   <input className="excitation-time" aria-label="Excitation playhead" type="range" min="0" max="500" step=".5" value={view.timeMs} disabled={!result||e.busy} onChange={event=>{e.setPlaying(false);e.setView(v=>({...v,timeMs:Number(event.target.value)}));}}/>
   <div className="excitation-values"><span>Membrane<b aria-label="Excitation membrane voltage">{sample?.voltageMV.toFixed(1)??'—'} mV</b></span><span>Free calcium<b aria-label="Excitation free calcium">{sample?.calciumUM.toFixed(3)??'—'} µM</b></span><span>Post-stroke bridges<b aria-label="Excitation post stroke">{sample?.postStrokeUM.toFixed(3)??'—'} µM</b></span></div>
   {result&&<div className="excitation-traces"><Trace result={result} timeMs={view.timeMs} field="voltageMV" label="Membrane voltage" unit="mV" color="#956047"/><Trace result={result} timeMs={view.timeMs} field="calciumUM" label="Myoplasmic calcium" unit="µM" color="#397d78"/><Trace result={result} timeMs={view.timeMs} field="postStrokeUM" label="Post-stroke cross-bridges" unit="µM" color="#a45365"/></div>}
   <p className="excitation-boundary">Thin-filament tint reports calcium-bound regulatory units; thick-filament tint reports post-stroke cross-bridges. Brightness is scaled for visibility, not a molecule count. Length stays fixed: activation can develop without shortening. These mouse-model responses are not human force measurements. No motor neuron, neuromuscular junction or complete ATP energy balance is included.</p>
   {view.config.stimulus==='none'&&<p>The archived initial conditions are not at steady state: a small settling response remains without electrical stimulation.</p>}
  </>}
  <a href="https://models.physiomeproject.org/exposure/159ba2f081022ca651284404f39eeb40/shorten_ocallaghan_davidson_soboleva_2007.cellml/view" target="_blank" rel="noreferrer">Shorten et al. 2007 · source model and species ↗</a>
 </section>;
}
