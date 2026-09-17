import type {ExperimentResult} from './experiments';
export type Channel = {key: string; label: string; color: string};
export default function ResponseChart({result,time,channels,unit,onSeek}: {result: ExperimentResult; time: number; channels: Channel[]; unit: string; onSeek:(time:number)=>void}) {
  const w=850,h=198,l=46,r=16,t=25,b=30;
  const max=Math.max(1,...result.samples.flatMap(p=>channels.map(c=>p.values[c.key])))*1.08;
  const x=(sec:number)=>l+sec/result.duration*(w-l-r),y=(v:number)=>h-b-v/max*(h-t-b);
  const path=(key:string,until:number)=>result.samples.filter(p=>p.time<=until).map((p,i)=>`${i?'L':'M'}${x(p.time).toFixed(2)} ${y(p.values[key]).toFixed(2)}`).join(' ');
  return <div className="mol-chart">
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Computed response curves in ${unit}`} onClick={e=>{const bounds=e.currentTarget.getBoundingClientRect();onSeek(Math.max(0,Math.min(result.duration,((e.clientX-bounds.left)/bounds.width*w-l)/(w-l-r)*result.duration)));}}>
      {[0,.25,.5,.75,1].map(f=><g key={f}><line x1={l} x2={w-r} y1={y(max*f)} y2={y(max*f)} stroke="#dfe8df" strokeDasharray={f?'3 5':'0'}/><text x={l-10} y={y(max*f)+3} textAnchor="end">{(max*f).toFixed(0)}</text></g>)}
      {[0,.25,.5,.75,1].map(f=><text key={f} x={x(result.duration*f)} y={h-8} textAnchor="middle">{result.duration*f/60} min</text>)}
      <text x={l} y="12">{unit}</text>
      {channels.map(c=><g key={c.key}><path d={path(c.key,result.duration)} fill="none" stroke={c.color} strokeWidth="1.5" opacity=".22"/><path d={path(c.key,time)} fill="none" stroke={c.color} strokeWidth="2.4" strokeLinejoin="round"/></g>)}
      <line x1={x(time)} x2={x(time)} y1={t-5} y2={h-b} stroke="#435e54" strokeDasharray="3 4"/><circle cx={x(time)} cy={h-b} r="3" fill="#435e54"/>
    </svg>
    <div className="mol-chart-legend">{channels.map(c=><span key={c.key}><i style={{background:c.color}}/>{c.label}</span>)}</div>
  </div>;
}
