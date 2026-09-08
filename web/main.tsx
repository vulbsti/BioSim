import {createRoot} from 'react-dom/client';
import {lazy,Suspense,useEffect,useState} from 'react';
import Simulator from '../app/simulation/Simulator';
import '../app/globals.css';
const Home=lazy(()=>import('../app/page'));
function App(){
 const [mode,setMode]=useState(location.hash==='#anatomy'?'anatomy':'simulation'),[query,setQuery]=useState('');
 useEffect(()=>{document.documentElement.dataset.workspace=mode;window.scrollTo(0,0);},[mode]);
 useEffect(()=>{const change=()=>setMode(location.hash==='#anatomy'?'anatomy':'simulation');window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
 const anatomy=(name='')=>{setQuery(name);setMode('anatomy');location.hash='anatomy';};
 return <><div hidden={mode!=='simulation'}><Simulator onAnatomy={anatomy}/></div>{mode==='anatomy'&&<><Suspense fallback={<div className="loading glass" role="status">Preparing 3D anatomy…</div>}><Home initialQuery={query}/></Suspense><button className="atlas-return" onClick={()=>{setMode('simulation');location.hash='';}}>← Back to physiology lab</button></>}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
