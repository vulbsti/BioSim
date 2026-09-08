import {useState} from 'react';
import type {Hormone,Sample} from './types';
import {hormoneInfo} from './endocrine';

export const formatTime=(s:number)=>`${Math.floor(s/3600).toString().padStart(2,'0')}:${Math.floor(s%3600/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;
const metrics={portalGlucose:{name:'Portal glucose',unit:'mg/dL',color:'#9271aa',base:90},hepaticGlucose:{name:'Hepatic venous glucose',unit:'mg/dL',color:'#8a9b58',base:90},venousOxygen:{name:'Mixed venous O₂',unit:'mL/dL',color:'#668da8',base:15},oxygenConsumption:{name:'O₂ consumption',unit:'mL/min',color:'#8a9673',base:250},oxygenDebt:{name:'Unmet oxidative demand',unit:'mL O₂ equivalent',color:'#b68564',base:0},glucose:{name:'Glucose',unit:'mg/dL',color:'#b8894f',base:90},heartRate:{name:'Heart rate',unit:'bpm',color:'#b66762',base:72},saturation:{name:'Oxygen',unit:'%',color:'#5d90a4',base:97.5},map:{name:'Mean pressure',unit:'mmHg',color:'#9681ae',base:93},plasma:{name:'Plasma',unit:'mL',color:'#659483',base:3000},urine:{name:'Urine',unit:'mL/min',color:'#ad9665',base:1}};
export default function Trace({samples,reference,hormone,time}:{samples:Sample[];reference:Sample[]|null;hormone?:Hormone;time:number}) {
  const [metric,setMetric]=useState<keyof typeof metrics>('glucose'),[hover,setHover]=useState<number|null>(null);
  const info=hormone?{name:hormoneInfo[hormone].name,unit:'× baseline',color:'#4d8b79',base:1}:metrics[metric];
  const value=(s:Sample)=>hormone?s.hormones[hormone]:s[metric];
  const start=samples[0]?.time??0,end=Math.max(start+60,time);
  const all=[...samples,...(reference?.filter(s=>s.time>=start)??[])].map(value);
  const lo=Math.min(info.base,...all),hi=Math.max(info.base,...all),padding=Math.max((hi-lo)*.2,info.base*.025,.1),min=lo-padding,max=hi+padding;
  const x=(t:number)=>52+(t-start)/(end-start)*838,y=(v:number)=>124-(v-min)/(max-min)*100;
  const path=(data:Sample[])=>data.filter(s=>s.time>=start).map((s,i)=>`${i?'L':'M'}${x(s.time).toFixed(2)},${y(value(s)).toFixed(2)}`).join(' ');
  const focused=hover===null?null:samples.reduce((a,b)=>Math.abs(b.time-hover)<Math.abs(a.time-hover)?b:a,samples[0]);
  return <section className="sim-trace" aria-label="Physiology time series"><div className="trace-heading"><div><span className="sim-kicker">CONTINUOUS OBSERVATION</span><h3>{hormone?info.name:'The body, over time'} <small>{info.unit}</small></h3></div>{!hormone&&<select aria-label="Chart metric" value={metric} onChange={e=>setMetric(e.target.value as keyof typeof metrics)}>{Object.entries(metrics).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}</select>}<div className="trace-legend"><i style={{background:info.color}}/> Current run {reference&&<><span className="dash-legend"/> Comparison</>}</div></div>
    <svg viewBox="0 0 930 158" className="trace-svg" role="img" aria-label={`${info.name} over elapsed simulation time`} onPointerMove={e=>{const r=e.currentTarget.getBoundingClientRect();setHover(start+Math.max(0,Math.min(1,((e.clientX-r.left)/r.width*930-52)/838))*(end-start));}} onPointerLeave={()=>setHover(null)}>
      {[0,.5,1].map(t=>{const v=min+(max-min)*t;return <g key={t}><line x1="52" x2="890" y1={y(v)} y2={y(v)} stroke="#e8ece7"/><text x="42" y={y(v)+4} textAnchor="end">{v.toFixed(v<10?1:0)}</text></g>;})}
      <line x1="52" x2="890" y1={y(info.base)} y2={y(info.base)} stroke="#cad6cc" strokeDasharray="3 4"/>
      {reference&&<path d={path(reference)} stroke="#92a098" strokeWidth="1.7" strokeDasharray="5 4" fill="none"/>}
      <path d={path(samples)} stroke={info.color} strokeWidth="2.3" fill="none" strokeLinejoin="round"/>
      {samples.length===1&&<circle cx={x(samples[0].time)} cy={y(value(samples[0]))} r="3" fill={info.color}/>}
      {[0,.25,.5,.75,1].map(t=><text key={t} x={52+838*t} y="147" textAnchor="middle">{end-start<3600?formatTime(start+t*(end-start)).slice(3):formatTime(start+t*(end-start)).slice(0,5)}</text>)}
      {focused&&<g><line x1={x(focused.time)} x2={x(focused.time)} y1="15" y2="126" stroke="#9aa99e"/><circle cx={x(focused.time)} cy={y(value(focused))} r="4" fill={info.color}/><rect x={Math.min(744,Math.max(55,x(focused.time)-60))} y="1" width="147" height="20" rx="4" fill="#edf2ea"/><text x={Math.min(818,Math.max(129,x(focused.time)+14))} y="14" textAnchor="middle">{formatTime(focused.time)} · {value(focused).toFixed(2)}</text></g>}
    </svg><div className="trace-foot"><span>Sampled every 30 simulated seconds · latest 24 hours</span><span>Dashed horizontal line: initial reference</span></div>
  </section>;
}
