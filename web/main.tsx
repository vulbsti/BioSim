import {createRoot} from 'react-dom/client';
import {lazy,Suspense,useEffect,useState} from 'react';
import Simulator from '../app/simulation/Simulator';
import '../app/globals.css';
const Home=lazy(()=>import('../app/page'));
const MolecularLab=lazy(()=>import('../app/molecular/MolecularLab'));
const TissueExplorer=lazy(()=>import('../app/tissue/TissueExplorer'));
const CirculationLab=lazy(()=>import('../app/circulation/CirculationLab'));
const currentMode=()=>location.hash==='#anatomy'?'anatomy':location.hash==='#molecular'?'molecular':location.hash==='#tissue'?'tissue':location.hash==='#circulation'?'circulation':'simulation';
function App(){
 const [mode,setMode]=useState(currentMode),[query,setQuery]=useState('');
 const [hasSimulation,setHasSimulation]=useState(()=>currentMode()==='simulation');
 useEffect(()=>{document.documentElement.dataset.workspace=mode;window.scrollTo(0,0);if(mode==='simulation')setHasSimulation(true);},[mode]);
 useEffect(()=>{const change=()=>setMode(currentMode());window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
 const anatomy=(name='')=>{setQuery(name);setMode('anatomy');location.hash='anatomy';};
 const back=()=>{setMode('simulation');location.hash='';};
 return <>
  <div hidden={mode!=='simulation'}>{hasSimulation&&<Simulator onAnatomy={anatomy} onMechanisms={()=>{setMode('molecular');location.hash='molecular';}} onTissue={()=>{setMode('tissue');location.hash='tissue';}} onCirculation={()=>{setMode('circulation');location.hash='circulation';}}/>}</div>
  {mode==='anatomy'&&<><Suspense fallback={<div className="loading glass" role="status">Preparing 3D anatomy…</div>}><Home initialQuery={query}/></Suspense><button className="atlas-return" onClick={back}>← Back to physiology lab</button></>}
  {mode==='tissue'&&<Suspense fallback={<div className="loading glass" role="status">Preparing tissue explorer…</div>}><TissueExplorer onBack={back} onAnatomy={anatomy} onMolecular={()=>{setMode('molecular');location.hash='molecular';}}/></Suspense>}
  {mode==='circulation'&&<Suspense fallback={<div className="loading glass" role="status">Preparing circulation…</div>}><CirculationLab onBack={back} onTissue={()=>{setMode('tissue');location.hash='tissue';}}/></Suspense>}
  {mode==='molecular'&&<Suspense fallback={<div className="loading glass" role="status">Preparing molecular lab…</div>}><MolecularLab onBack={back}/></Suspense>}
 </>;
}
createRoot(document.getElementById('root')!).render(<App/>);
