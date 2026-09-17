import {useId} from 'react';
import type {ExperimentConfig, MechanismSample} from './experiments';

export default function MolecularScene({config, sample}: {config: ExperimentConfig; sample: MechanismSample}) {
  const uid=useId().replaceAll(':',''), v=sample.values;
  const binding=config.kind==='binding', activity=Math.max(0,Math.min(1,v.occupancy/100));
  const exposure=binding?v.tissue/150:v.insulin/100;
  const phase=sample.time, glut=binding?0:Math.max(0,Math.min(1,v.glut4/45));
  const receptorSymbols=config.kind==='binding'?Math.ceil(config.parameters.receptorPmol*.3):18;
  return <figure className="mol-scene" aria-label="Illustrated local mechanism with state-driven receptors and particles">
    <svg viewBox="0 0 960 420" role="img" aria-label={binding?'Ligand moves from blood into a tissue bath and binds local receptors':'Insulin exposure activates receptors and a signaling cascade that moves GLUT4 to the membrane'}>
      <defs>
        <linearGradient id={`${uid}-blood`} x2="0" y2="1"><stop stopColor="#7a3e48"/><stop offset="1" stopColor="#3f2936"/></linearGradient>
        <linearGradient id={`${uid}-cell`} x2="0" y2="1"><stop stopColor="#2b5354"/><stop offset="1" stopColor="#122e36"/></linearGradient>
        <radialGradient id={`${uid}-glow`}><stop stopColor="#8bf0cc" stopOpacity=".35"/><stop offset="1" stopColor="#8bf0cc" stopOpacity="0"/></radialGradient>
        <pattern id={`${uid}-dots`} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#b6d6cf" opacity=".13"/></pattern>
      </defs>
      <rect width="960" height="420" fill="#122831"/><rect width="960" height="420" fill={`url(#${uid}-dots)`}/>
      <path d="M-10 67 C220 46 460 102 970 65 L970 130 C580 171 220 107-10 135Z" fill={`url(#${uid}-blood)`} stroke="#bb727d" strokeWidth="1.5"/>
      <path d="M-10 134 C220 106 580 170 970 130" fill="none" stroke="#d28e91" strokeWidth="3" opacity=".65"/>
      {Array.from({length:9},(_,i)=>{const x=(i*137+phase*1.7)%1040-40;return <g key={i} transform={`translate(${x} ${97+Math.sin(x/200)*12}) rotate(${i*23})`}><ellipse rx="16" ry="8" fill="#a85c70" opacity=".62"/><ellipse rx="9" ry="3" fill="#7b3f53"/></g>;})}
      <text x="34" y="37" className="mol-svg-label">{binding?'BLOOD RESERVOIR':'CONTROLLED INSULIN EXPOSURE'}</text>
      <text x="925" y="37" textAnchor="end" className="mol-svg-number">{binding?`${v.blood.toFixed(1)} pM`:`${v.insulin.toFixed(1)} nM`}</text>
      {[200,460,710].map((x,i)=><g key={x} opacity={.15+Math.min(1,exposure)*.7}><path d={`M${x} 145 C${x-30} 165 ${x+30} 178 ${x} 216`} fill="none" stroke="#eac280" strokeWidth="1.4" strokeDasharray="3 8" strokeDashoffset={-phase*.4}/><path d={`M${x-4} 208 L${x} 216 L${x+4} 208`} fill="none" stroke="#eac280"/></g>)}
      <text x="34" y="191" className="mol-svg-label">{binding?'INTERSTITIAL BATH · 200 mL':'EXTRACELLULAR SPACE · PRESCRIBED INPUT'}</text>
      {Array.from({length:30},(_,i)=>{const x=75+(i*67)%820+Math.sin(phase*.02+i)*12,y=163+(i*31)%69+Math.cos(phase*.03+i)*7;return <circle key={i} cx={x} cy={y} r={3.2} fill="#f4cf86" opacity={Math.min(.9,Math.max(0,exposure)*2)*(i%3===0?.6:1)}/>;})}
      <path d="M-10 268 Q470 197 970 268 V430 H-10Z" fill={`url(#${uid}-cell)`}/>
      {[0,7].map(offset=><path key={offset} d={`M-10 ${258+offset} Q470 ${197+offset} 970 ${258+offset}`} fill="none" stroke={offset?'#508981':'#82b9a2'} strokeWidth={offset?2:3}/>)}
      {Array.from({length:receptorSymbols},(_,i)=>{const x=65+(i+.5)*830/receptorSymbols,y=260-29*Math.sin(x/960*Math.PI),bound=Math.max(0,Math.min(1,activity*receptorSymbols-i));return <g key={i} data-receptor-symbol="" transform={`translate(${x} ${y})`}>
        <path d="M-7-15 L-7-6 Q0 1 7-6 L7-15 M0-3 V15" fill="none" stroke="#90caba" strokeWidth="3" strokeLinecap="round"/>
        <circle cy="-13" r="5" fill="#f4cf86" opacity={bound}/>
        <circle cy="14" r="10" fill={`url(#${uid}-glow)`} opacity={bound}/>
      </g>;})}
      {binding?<>
        <text x="34" y="330" className="mol-svg-label">LOCAL RECEPTOR BINDING</text>
        <text x="34" y="361" className="mol-svg-large">{v.occupancy.toFixed(1)}<tspan fontSize="17"> % occupied</tspan></text>
        <text x="925" y="330" textAnchor="end" className="mol-svg-label">L + R ⇌ LR</text>
        <text x="925" y="358" textAnchor="end" className="mol-svg-number">{v.bindingRate.toFixed(3)} pmol/s binding</text>
      </>:<>
        <path d="M250 271 L300 330 L465 330 L630 330 L730 273" fill="none" stroke="#8dd3bc" strokeOpacity=".4" strokeWidth="1.5" strokeDasharray="4 5" strokeDashoffset={-phase*.08}/>
        {[{x:300,label:'IRS / PI3K',value:v.pi3k/5},{x:465,label:'Akt',value:v.akt/9.1},{x:630,label:'GLUT4',value:glut}].map(n=><g key={n.label}>
          <circle cx={n.x} cy="330" r="42" fill={`url(#${uid}-glow)`} opacity={Math.max(0,n.value)}/>
          <circle cx={n.x} cy="330" r="19" fill="#1c3e45" stroke="#86c9b3" strokeOpacity={.2+Math.max(0,n.value)*.8}/>
          <text x={n.x} y="334" textAnchor="middle" fill="#badccf" fontSize="10">{n.label==='GLUT4'?'↑':'P'}</text>
          <text x={n.x} y="373" textAnchor="middle" className="mol-svg-label">{n.label}</text>
        </g>)}
        {Array.from({length:7},(_,i)=><rect key={i} x={730+i*18} y={246+i*1.2} width="8" height="21" rx="3" fill="#c2ddba" opacity={.1+glut*.85}/>)}
        <text x="35" y="391" className="mol-svg-label">INTRACELLULAR SIGNALING</text>
        <text x="925" y="391" textAnchor="end" className="mol-svg-number">{v.glut4.toFixed(1)}% surface GLUT4</text>
      </>}
    </svg>
    <figcaption><span><i/> {binding?'Finite ligand and receptor pools':'Archived no-feedback signaling model'}</span><span>Illustrated populations · geometry and particle paths are schematic</span></figcaption>
  </figure>;
}
