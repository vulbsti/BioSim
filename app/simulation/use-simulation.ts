import {useEffect,useRef,useState} from 'react';
import {createBody} from './engine';
import type {BodyState,Sample} from './types';

export function useSimulation() {
  const worker=useRef<Worker|null>(null);
  const [data,setData]=useState<{state:BodyState;running:boolean;speed:number;reference:Sample[]|null;error?:string}>({state:createBody(),running:false,speed:120,reference:null});
  useEffect(()=>{
    const w=new Worker(new URL('./simulation.worker.ts',import.meta.url),{type:'module'});worker.current=w;
    w.onmessage=e=>{
      if(e.data.download){
        const url=URL.createObjectURL(new Blob([JSON.stringify(e.data.download,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download=`human-atlas-run-${e.data.download.state.time}s.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }else setData(e.data);
    };
    w.onerror=()=>setData(d=>({...d,running:false,error:'The simulation worker stopped unexpectedly. Reset or reload to restart.'}));
    w.postMessage({type:'init'});
    return()=>{w.terminate();worker.current=null;};
  },[]);
  const send=(message:Record<string,unknown>)=>worker.current?.postMessage(message);
  return {...data,send};
}
