import {BLOOD_EDGES,BLOOD_NODES,type NodeId,type CirculationSample} from './model';
const positions:Record<NodeId,[number,number]>={arterial:[95,155],venous:[705,155],'pulmonary-arterial':[520,58],'pulmonary-venous':[285,58],muscle:[390,230],kidney:[390,330],gut:[230,440],portal:[405,440],liver:[580,440],other:[390,560]};
const names:Record<NodeId,string>={arterial:'Systemic arteries',venous:'Systemic veins','pulmonary-arterial':'Pulmonary arteries','pulmonary-venous':'Pulmonary veins',muscle:'Muscle bed',kidney:'Renal bed',gut:'Splanchnic bed',portal:'Portal vein',liver:'Liver bed',other:'Other beds'};
const path=(id:string,from:NodeId,to:NodeId)=>{
 const [x,y]=positions[from],[tx,ty]=positions[to];
 if(id==='left-pump')return `M${x} ${y} H95 V${ty}`;
 if(id==='right-pump')return `M${x} ${y} V58 H${tx}`;
 if(from==='arterial'&&to==='liver')return 'M95 155 V387 H580 V440';
 if(from==='arterial')return `M${x} ${y} V${ty} H${tx}`;
 if(to==='venous')return `M${x} ${y} H705 V155`;
 return `M${x} ${y} L${tx} ${ty}`;
};
export default function FlowMap({sample,selected,onSelect,reducedMotion}:{sample:CirculationSample;selected:NodeId;onSelect:(id:NodeId)=>void;reducedMotion:boolean}){
 return <svg className="circ-flow-map" viewBox="0 0 800 655" role="group" aria-label="Closed circulation flow map" data-time={sample.time.toFixed(2)}>
  <defs><marker id="circ-arrow" markerWidth="7" markerHeight="7" refX="4" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="currentColor" strokeWidth="1.1"/></marker></defs>
  <text x="400" y="124" textAnchor="middle" className="circ-map-note">PULMONARY LOOP</text>
  <text x="400" y="183" textAnchor="middle" className="circ-map-note">SYSTEMIC & PORTAL ROUTES</text>
  {BLOOD_EDGES.map((e,i)=>{
   const q=sample.flowLPerS[i],active=e.from===selected||e.to===selected,color=e.kind==='pump'?'#e9b879':e.to==='venous'||e.from==='venous'||e.to==='pulmonary-arterial'?'#719dac':'#c8796e';
   const fromIndex=BLOOD_NODES.findIndex(n=>n.id===(q>=0?e.from:e.to)),concentration=sample.insulinPM[fromIndex];
   const d=path(e.id,e.from,e.to),phase=-(sample.integratedFlowL[i]*230)%28;
   return <g key={e.id} className={active?'selected':''}><path d={d} fill="none" stroke={color} strokeOpacity={active?.8:.26} strokeWidth={active?4:2}/>
    <path d={d} fill="none" stroke={color} strokeOpacity={active?1:.55} strokeWidth="3" strokeDasharray="2 26" strokeDashoffset={reducedMotion?0:phase}/>
    {concentration>1&&<path d={d} fill="none" stroke="#b4de96" strokeWidth="3" strokeDasharray="2 26" strokeDashoffset={reducedMotion?0:phase-10} opacity={Math.min(.95,.2+concentration/400)}/>}
    <title>{e.name}: {(q*60).toFixed(3)} L/min whole blood; {concentration.toFixed(1)} pM upstream plasma insulin</title>
   </g>;
  })}
  <text x="117" y="42" className="circ-map-pump">LEFT PUMP</text><text x="640" y="42" className="circ-map-pump">RIGHT PUMP</text>
  {BLOOD_NODES.map((n,i)=>{const [x,y]=positions[n.id];return <g key={n.id} transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={`Inspect ${n.name}`} aria-pressed={selected===n.id} onClick={()=>onSelect(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n.id);}}} className={`circ-map-node ${selected===n.id?'active':''}`}>
   <rect x="-76" y="-29" width="152" height="61" rx="10"/>
   <text textAnchor="middle" y="-7">{names[n.id]}</text><text className="circ-map-value" textAnchor="middle" y="13">{sample.insulinPM[i].toFixed(1)} <tspan>pM plasma</tspan></text>
   <title>{n.description}</title>
  </g>;})}
  <g transform="translate(65 630)"><circle r="3" fill="#bcdb9e"/><text x="12" y="4" className="circ-map-legend">Insulin exposure</text><circle cx="200" r="3" fill="#c8796e"/><text x="212" y="4" className="circ-map-legend">Blood transfer</text></g>
 </svg>;
}
