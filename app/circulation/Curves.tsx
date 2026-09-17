import {type CirculationResult} from './model';
export default function Curves({result,time}:{result:CirculationResult;time:number}){
 const w=750,h=175,left=44,top=15,right=14,bottom=28,innerW=w-left-right,innerH=h-top-bottom;
 const max=Math.max(1,...result.samples.map(s=>Math.max(s.insulinPM[0],s.interstitialPM)))*1.08;
 const values=result.samples.filter((_,i)=>i%10===0);
 const line=(field:'arterial'|'tissue')=>values.map((s,i)=>`${i?'L':'M'}${(left+s.time/result.duration*innerW).toFixed(2)},${(top+innerH-(field==='arterial'?s.insulinPM[0]:s.interstitialPM)/max*innerH).toFixed(2)}`).join(' ');
 return <div className="circ-curves"><div className="circ-chart-label"><span>LOCAL EXPOSURE OVER TEN MINUTES</span><span><i/> Arterial plasma <i/> Muscle interstitium</span></div><svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Arterial and muscle interstitial insulin concentration curves">
  {[0,.5,1].map(f=><g key={f}><line x1={left} x2={w-right} y1={top+f*innerH} y2={top+f*innerH} stroke="#dce3d6"/><text x={left-8} y={top+f*innerH+4} textAnchor="end">{((1-f)*max).toFixed(0)}</text></g>)}
  {[0,2,4,6,8,10].map(min=><text key={min} x={left+min/10*innerW} y={h-6} textAnchor="middle">{min} min</text>)}
  <path d={line('arterial')} fill="none" stroke="#b3705d" strokeWidth="2"/><path d={line('tissue')} fill="none" stroke="#608c6e" strokeWidth="2.5"/><line x1={left+time/result.duration*innerW} x2={left+time/result.duration*innerW} y1={top} y2={top+innerH} stroke="#374b44" strokeDasharray="3 4"/>
 </svg><small>pM = pmol/L, using each compartment’s stated fluid volume.</small></div>;
}
