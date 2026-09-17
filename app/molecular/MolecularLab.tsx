import {useEffect,useRef,useState} from 'react';
import {Activity,ArrowLeft,ArrowRight,Atom,BookOpen,Check,Download,FlaskConical,Pause,Play,RotateCcw,Upload} from 'lucide-react';
import {defaultConfig,exportExperiment,importExperiment,observe,type ExperimentConfig,type ExperimentResult} from './experiments';
import {bindingFixture} from '../simulation/core/binding-fixture';
import {INSULIN_STATES} from './sedaghat';
import MolecularScene from './MolecularScene';
import ResponseChart from './ResponseChart';
import './molecular.css';

const clock=(seconds:number)=>`${Math.floor(seconds/60).toString().padStart(2,'0')}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;
const detailText={
  binding:[['Blood reservoir','The input is a finite ligand amount. Delivery and clearance debit this same pool.','The reservoir volume is 1 L; concentration is amount divided by volume.'],['Tissue exposure','Ligand must reach the local bath before it can bind. Return transport carries free ligand back to blood.','Delivery and return rates correspond to equal concentrations at closed-system equilibrium.'],['Receptor occupancy','Binding consumes one free ligand and one free receptor. Dissociation restores both.','The effective reaction volume is 200 mL. This is an engineering fixture, not a calibrated tissue sample.'],['Clearance','Cleared ligand remains in an accounting pool so that removal can be reconciled with the administered amount.','This sink records removal; it does not simulate a kidney or liver.']],
  insulin:[['Insulin input','An externally maintained concentration is applied for the selected pulse duration, then withdrawn.','The original protocol is 100 nM for 15 minutes. Insulin supply is an open boundary, not a finite blood inventory.'],['Surface receptors','The archived equations model binding, phosphorylation, internalization and recycling.','Source receptor concentrations are retained, with M converted to pM for computation.'],['PI3K activation','Phosphorylated IRS-1 forms a complex with PI3K and controls downstream lipid signaling.','The displayed fraction is relative to the initial PI3K pool.'],['Akt activation','Lipid signaling changes Akt activation and the downstream GLUT4 transport rate.','This is the source no-feedback model. AS160 is not an explicit state.'],['Surface GLUT4','GLUT4 moves between intracellular and surface pools in response to signaling.','Percentage is relative to the source initial pool. Whole-body glucose uptake is not coupled to this model yet.']],
};

export default function MolecularLab({onBack}:{onBack:()=>void}) {
  const [config,setConfig]=useState<ExperimentConfig>(defaultConfig('binding')),[draft,setDraft]=useState<ExperimentConfig>(defaultConfig('binding'));
  const [result,setResult]=useState<ExperimentResult|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const [time,setTime]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(60),[selected,setSelected]=useState(0),[notice,setNotice]=useState('');
  const worker=useRef<Worker|null>(null),sequence=useRef(0),pending=useRef<{config:ExperimentConfig;time:number}|null>(null),file=useRef<HTMLInputElement>(null);
  const calculate=(next:ExperimentConfig,at=0)=>{
    if(!worker.current){setError('The calculation worker is not available. Reload the molecular lab to retry.');return;}
    const id=++sequence.current;pending.current={config:structuredClone(next),time:at};setBusy(true);setPlaying(false);setError('');
    worker.current.postMessage({id,config:next});
  };
  useEffect(()=>{
    const w=new Worker(new URL('./mechanism.worker.ts',import.meta.url),{type:'module'});worker.current=w;
    w.onmessage=({data}:{data:{id:number;result?:ExperimentResult;error?:string}})=>{
      if(data.id!==sequence.current)return;
      setBusy(false);
      if(data.error){setError(data.error);return;}
      const request=pending.current;
      if(data.result&&request){setResult(data.result);setConfig(request.config);setDraft(request.config);setTime(request.time);setSelected(0);pending.current=null;}
    };
    w.onerror=()=>{w.terminate();worker.current=null;setBusy(false);setPlaying(false);setError('The calculation worker stopped. Reload the molecular lab to retry.');};
    const initial=defaultConfig('binding');pending.current={config:initial,time:0};w.postMessage({id:++sequence.current,config:initial});
    return()=>{w.terminate();worker.current=null;};
  },[]);
  useEffect(()=>{
    if(!playing||!result||busy)return;
    let frame=0,last=performance.now();
    const tick=(now:number)=>{const elapsed=Math.min(.15,(now-last)/1000);last=now;setTime(t=>Math.min(result.duration,t+elapsed*speed));frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[playing,result,busy,speed]);
  useEffect(()=>{if(result&&time>=result.duration)setPlaying(false);},[time,result]);
  useEffect(()=>{if(!notice)return;const id=setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(id);},[notice]);
  const seek=(t:number)=>{setPlaying(false);setTime(t);};
  const sample=result?observe(result,time):null,binding=config.kind==='binding',different=JSON.stringify(draft)!==JSON.stringify(config);
  const stages=sample?(binding?[
    {name:'Blood',value:sample.values.blood,unit:'pM'}, {name:'Tissue',value:sample.values.tissue,unit:'pM'},
    {name:'Receptor',value:sample.values.occupancy,unit:'% occupied'}, {name:'Cleared',value:sample.values.cleared,unit:'pmol'},
  ]:[{name:'Insulin',value:sample.values.insulin,unit:'nM'}, {name:'Receptor',value:sample.values.receptor,unit:'% reference'},
    {name:'PI3K',value:sample.values.pi3k,unit:'% initial pool'}, {name:'Akt',value:sample.values.akt,unit:'% initial pool'}, {name:'GLUT4',value:sample.values.glut4,unit:'% initial pool'}]):[];
  const detail=detailText[config.kind][selected];
  const changeBinding=(key:'dosePmol'|'receptorPmol'|'clearancePerMinute',value:number)=>setDraft(c=>c.kind==='binding'?{...c,parameters:{...c.parameters,[key]:value}}:c);
  const changeInsulin=(key:'doseNM'|'pulseMinutes',value:number)=>setDraft(c=>c.kind==='insulin'?{...c,parameters:{...c.parameters,[key]:value}}:c);
  const save=()=>{
    try{const text=exportExperiment(config,time),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`human-atlas-${config.kind}-experiment.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Experiment and playhead saved.');}catch(e){setError((e as Error).message);}
  };
  return <div className="mol-app">
    <header className="mol-header"><button className="mol-brand" onClick={onBack}><span><Activity size={22}/></span><b>Human Atlas<small>MOLECULAR LAB</small></b></button><button className="mol-back" onClick={onBack}><ArrowLeft size={15}/> Whole-body physiology</button><span className="mol-phase"><i/> LOCAL RESPONSE</span></header>
    <main>
      <section className="mol-intro"><div><span className="mol-eyebrow">FOLLOW THE MECHANISM</span><h1>From signal to response.</h1><p>Watch a circulating signal reach a receptor. Follow what changes inside.</p></div><div className="mol-scope"><Atom size={23}/><span>Local mechanisms<small>Whole-body coupling comes next</small></span></div></section>
      <div className="mol-experiment-tabs" role="tablist" aria-label="Molecular experiments">
        <button role="tab" aria-selected={binding} disabled={busy} onClick={()=>calculate(defaultConfig('binding'))}><span>01</span><div>Receptor binding<small>Transport · binding · clearance</small></div><ArrowRight size={17}/></button>
        <button role="tab" aria-selected={!binding} disabled={busy} onClick={()=>calculate(defaultConfig('insulin'))}><span>02</span><div>Insulin signaling<small>Receptor · PI3K · Akt · GLUT4</small></div><ArrowRight size={17}/></button>
      </div>
      {error&&<div className="mol-error" role="alert">{error}</div>}
      <div className="mol-layout" aria-busy={busy}>
        <aside className="mol-controls">
          <div className="mol-panel-heading"><FlaskConical size={19}/><span>SET THE INPUT</span></div>
          <h2>{binding?'A finite ligand pulse.':'An insulin pulse.'}</h2>
          <p>{binding?'Change the amount, available receptors or clearance. Compare how much signal reaches the tissue.':'Recompute the archived model with a different insulin concentration or exposure duration.'}</p>
          <div className={`mol-evidence-tag ${binding?'':'published'}`}>{binding?'Synthetic verification fixture':'Published model · Sedaghat 2002'}</div>
          <fieldset disabled={busy}>
            {draft.kind==='binding'?<>
              <label className="mol-input">Ligand dose<output>{draft.parameters.dosePmol} <small>pmol</small></output><input aria-label="Ligand dose" type="range" min="0" max="500" step="25" value={draft.parameters.dosePmol} onChange={e=>changeBinding('dosePmol',Number(e.target.value))}/><span>Finite input into a 1 L reservoir</span></label>
              <label className="mol-input">Receptor capacity<output>{draft.parameters.receptorPmol} <small>pmol</small></output><input aria-label="Receptor capacity" type="range" min="0" max="100" step="5" value={draft.parameters.receptorPmol} onChange={e=>changeBinding('receptorPmol',Number(e.target.value))}/><span>Free + bound receptor inventory</span></label>
              <label className="mol-input">Clearance constant<output>{draft.parameters.clearancePerMinute.toFixed(2)} <small>/min</small></output><input aria-label="Clearance constant" type="range" min="0" max="1" step=".02" value={draft.parameters.clearancePerMinute} onChange={e=>changeBinding('clearancePerMinute',Number(e.target.value))}/><span>First-order removal from blood</span></label>
            </>:<>
              <label className="mol-input">Insulin concentration<select aria-label="Insulin concentration" value={draft.parameters.doseNM} onChange={e=>changeInsulin('doseNM',Number(e.target.value))}>{[0,.1,1,10,100].map(v=><option key={v} value={v}>{v} nM</option>)}</select><span>Original reference pulse: 100 nM</span></label>
              <label className="mol-input">Pulse duration<select aria-label="Insulin pulse duration" value={draft.parameters.pulseMinutes} onChange={e=>changeInsulin('pulseMinutes',Number(e.target.value))}>{[5,15,30].map(v=><option key={v} value={v}>{v} minutes</option>)}</select><span>Then withdraw insulin to zero</span></label>
            </>}
            <button className="mol-primary" onClick={()=>calculate(draft)}><Activity size={16}/> Calculate response <ArrowRight size={15}/></button>
            <button className="mol-reset" onClick={()=>calculate(defaultConfig(config.kind))}><RotateCcw size={13}/> Restore reference inputs</button>
          </fieldset>
          <p className="mol-draft-note">{busy?'Computing the response…':different?'Inputs changed. Calculate to apply them.':'The displayed trajectory uses these inputs.'}</p>
          <div className="mol-boundary-note"><span>MODEL BOUNDARY</span><p>{binding?'Ligand and receptor inventories are conserved. Rates and mixing volumes are synthetic.':'The source uses mixed cell preparations and some percentage pools. This is not calibrated human muscle.'}</p></div>
          <div className="mol-files"><button onClick={()=>file.current?.click()} disabled={busy}><Upload size={14}/> Load experiment</button><button onClick={save} disabled={busy||!result}><Download size={14}/> Export experiment</button></div>
          <input ref={file} type="file" accept="application/json,.json" aria-label="Import molecular experiment" hidden onChange={async e=>{const target=e.target,f=target.files?.[0];if(!f)return;try{if(f.size>100_000)throw new Error('Mechanism recording exceeds 100 kB.');const loaded=importExperiment(await f.text());calculate(loaded.config,loaded.time);setNotice('Recomputing the recorded experiment.');}catch(e){setError((e as Error).message);}target.value='';}}/>
        </aside>
        <section className="mol-workbench">
          <div className="mol-view-heading"><div><span className="mol-eyebrow">{binding?'EXTRACELLULAR → RECEPTOR':'RECEPTOR → CELLULAR RESPONSE'}</span><h2>{binding?'Arrival. Binding. Release.':'A signal crosses the membrane.'}</h2></div><span className="mol-ready" role="status">{busy?'Calculating…':<><i/> Response ready</>}</span></div>
          {sample&&result?<>
            <div className={busy?'mol-calculating':''}><MolecularScene config={config} sample={sample}/></div>
            <div className="mol-playback"><button className="mol-play" disabled={busy} aria-label={playing?'Pause mechanism':'Play mechanism'} onClick={()=>{if(time>=result.duration)setTime(0);setPlaying(!playing);}}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'Pause':'Play'}</button><strong aria-label="Mechanism elapsed time">{clock(time)}</strong><span>/ {clock(result.duration)}</span><select aria-label="Mechanism playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[15,30,60,120].map(v=><option key={v} value={v}>{v}× playback</option>)}</select><button disabled={busy} onClick={()=>seek(Math.min(result.duration,time+60))}>+1 min</button><button disabled={busy} aria-label="Rewind mechanism" onClick={()=>seek(0)}><RotateCcw size={15}/></button></div>
            <label className="mol-timeline"><span className="sr-only">Experiment time</span><input type="range" aria-label="Experiment time" min="0" max={result.duration} step="1" value={time} disabled={busy} onChange={e=>seek(Number(e.target.value))}/></label>
            <div className="mol-stages" style={{gridTemplateColumns:`repeat(${stages.length},minmax(0,1fr))`}}>{stages.map((stage,i)=><button key={stage.name} className={selected===i?'selected':''} aria-pressed={selected===i} onClick={()=>setSelected(i)}><span><small>0{i+1}</small>{stage.name}</span><strong>{stage.value.toFixed(1)}</strong><em>{stage.unit}</em></button>)}</div>
            <div className="mol-detail"><div><span className="mol-eyebrow">INSPECT / {stages[selected].name.toUpperCase()}</span><h3>{detail[0]}</h3></div><p>{detail[1]} <span>{detail[2]}</span></p></div>
            <section className="mol-trace"><div className="mol-trace-heading"><h3>The response over time</h3><span>Solid = elapsed · faint = computed future</span></div><ResponseChart result={result} time={time} onSeek={seek} unit={binding?'pM':'% of each source reference pool'} channels={binding?[
              {key:'blood',label:'Blood ligand',color:'#b56678'},{key:'tissue',label:'Tissue ligand',color:'#b08b37'},{key:'bound',label:'Bound receptor',color:'#438578'},
            ]:[{key:'receptor',label:'Phosphorylated receptor',color:'#b56678'},{key:'pi3k',label:'Active PI3K',color:'#b08b37'},{key:'akt',label:'Active Akt',color:'#628ea6'},{key:'glut4',label:'Surface GLUT4',color:'#438578'}]}/></section>
            <details className="mol-ledger"><summary><BookOpen size={15}/> {binding?'Inspect reaction ledger & balance':'Inspect source states & evidence'}</summary>
              {binding?<><p>Integrated reaction extents at this playhead. Binding and dissociation can repeat; their cumulative totals are not the amount currently bound.</p><table><thead><tr><th>Mechanism</th><th>Cumulative extent</th></tr></thead><tbody>{bindingFixture(config.parameters).reactions.map((r,i)=><tr key={r.id}><td>{r.name}</td><td>{(sample.ledger[i]*1e12).toFixed(4)} pmol</td></tr>)}</tbody></table><div className="mol-balance"><span>Ligand, including cleared <b>{sample.values.ligandTotal.toFixed(6)} pmol</b></span><span>Free + bound receptors <b>{sample.values.receptorTotal.toFixed(6)} pmol</b></span><span>Maximum ledger residual <b>{result.maximumResidualMol?.toExponential(2)} mol</b></span></div></>:<><p>21 source states are integrated in a worker. The no-feedback 100 nM / 15-minute pulse is compared against independent Radau and BDF calculations. Different inputs are exploratory variations.</p><div className="mol-source-states"><table><thead><tr><th>Source state</th><th>Current value</th></tr></thead><tbody>{INSULIN_STATES.map((name,i)=><tr key={name}><td>{name}{name==='IRS1sP'?' (feedback inactive)':''}</td><td>{sample.state[i].toPrecision(5)} {i<12?'pM':'% initial pool'}</td></tr>)}</tbody></table></div><p>Fixed extracellular insulin and source synthesis/degradation prevent a whole-system mass-conservation claim. GLUT4 movement is not yet connected to actual body glucose uptake.</p><a href="https://www.imagwiki.nibib.nih.gov/physiome/jsim/models/webmodel/NSR/sedaghat2002insulinsignal" target="_blank" rel="noreferrer">Archived equations, source model and paper ↗</a><p>Original model: Sedaghat, Sherman & Quon (2002). Archived JSim implementation: University of Washington; acknowledgement and copy notice retained in the model package.</p></>}
            </details>
          </>:<div className="mol-loading" role="status"><Atom size={34}/><h3>Preparing the mechanism</h3><p>Integrating local states and reaction rates.</p></div>}
        </section>
      </div>
      <footer className="mol-footer"><span>HUMAN ATLAS <b>/</b> MULTISCALE PHYSIOLOGY</span><p>Numerical verification and source reproduction · human calibration pending</p></footer>
    </main>
    {notice&&<div className="mol-notice" role="status"><Check size={16}/>{notice}</div>}
  </div>;
}
