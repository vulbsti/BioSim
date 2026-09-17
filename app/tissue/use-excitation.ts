import {useEffect,useState} from 'react';
import {defaultExcitationView,EXCITATION_DURATION,observeExcitation,type ExcitationView,type ExcitationResult} from './excitation';
export function useExcitation(){
 const [view,setView]=useState<ExcitationView>(defaultExcitationView),[result,setResult]=useState<ExcitationResult|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(.05);
 useEffect(()=>{
  setPlaying(false);setError('');setResult(null);
  if(!view.enabled){setBusy(false);return;}
  setBusy(true);let worker:Worker;
  try{worker=new Worker(new URL('./excitation.worker.ts',import.meta.url),{type:'module'});}catch{setBusy(false);setError('Excitation worker is unavailable.');return;}
  worker.onmessage=({data}:{data:{result?:ExcitationResult;error?:string}})=>{setBusy(false);if(data.result)setResult(data.result);else setError(data.error??'Excitation calculation failed.');};
  worker.onerror=()=>{setBusy(false);setError('Excitation calculation stopped.');};worker.postMessage({config:{stimulus:view.config.stimulus,releaseScale:view.config.releaseScale}});
  return()=>worker.terminate();
 },[view.enabled,view.config.stimulus,view.config.releaseScale]);
 useEffect(()=>{
  if(!playing||busy||!result||!view.enabled)return;
  let frame=0,last=performance.now();
  const tick=(now:number)=>{const dt=Math.min(150,now-last);last=now;setView(v=>({...v,timeMs:Math.min(EXCITATION_DURATION,v.timeMs+dt*speed)}));frame=requestAnimationFrame(tick);};
  frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[playing,busy,result,view.enabled,speed]);
 useEffect(()=>{if(view.timeMs>=EXCITATION_DURATION)setPlaying(false);},[view.timeMs]);
 const matched=result&&result.config.stimulus===view.config.stimulus&&result.config.releaseScale===view.config.releaseScale;
 const sample=view.enabled&&matched?observeExcitation(result,view.timeMs):null;
 return {view,setView,result:matched?result:null,sample,busy,error,playing,setPlaying,speed,setSpeed};
}
