import {useMemo,useState} from 'react';
import {brainEdges,brainNodes,solveBrain} from './brain';
import type {BodyState} from './types';

export default function BrainMap({state,selected,onSelect,running}:{state:BodyState;selected:string;onSelect:(id:string)=>void;running:boolean}) {
  const result=useMemo(()=>solveBrain(state),[state]);
  const [zoom,setZoom]=useState(1);
  return <div className="brain-map-wrap"><div className="brain-zoom"><span>Pan the enlarged map to inspect smaller connections.</span><button aria-label="Zoom brain map out" disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,z-.5))}>−</button><output>{Math.round(zoom*100)}%</output><button aria-label="Zoom brain map in" disabled={zoom>=3} onClick={()=>setZoom(z=>Math.min(3,z+.5))}>+</button><button onClick={()=>setZoom(1)}>Fit</button></div><div className="brain-viewport"><svg viewBox="0 0 710 700" style={{width:`${zoom*100}%`,maxHeight:zoom===1?690:'none'}} className={`brain-map ${running?'flowing':''}`} role="img" aria-label="Cerebral circulation network: paired carotid and vertebral inflow, Circle of Willis, tissue beds, and venous return.">
    <path d="M338 36Q274 9 231 48Q125 35 95 124Q35 167 65 250Q22 318 63 389Q24 465 88 529Q132 608 272 585Q341 581 341 534ZM362 36Q426 9 469 48Q575 35 605 124Q665 167 635 250Q678 318 637 389Q676 465 612 529Q568 608 428 585Q359 581 359 534Z" fill="#eef2ed" stroke="#d9e1d8" strokeWidth="1.5"/>
    <text x="168" y="32" className="map-footnote">LEFT HEMISPHERE</text><text x="420" y="32" className="map-footnote">RIGHT HEMISPHERE</text>
    {brainEdges.map(e=>{
      const a=brainNodes.find(n=>n.id===e.from)!,b=brainNodes.find(n=>n.id===e.to)!,flow=result.flows[e.id];
      const connected=e.from===selected||e.to===selected;
      return <g key={e.id}><path d={`M${a.x} ${a.y}L${b.x} ${b.y}`} fill="none" stroke={e.kind==='vein'?'#6e97b7':e.kind==='bed'?'#c6a975':'#c87b74'} strokeWidth={connected?4:Math.max(1.2,Math.min(3.3,Math.abs(flow)/65))} opacity={selected&&!connected?.42:.85}/>
        {Math.abs(flow)>.1&&<path d={`M${a.x} ${a.y}L${b.x} ${b.y}`} className={`flow-path ${e.kind==='vein'?'vein':'artery'}`} style={{animationDirection:flow<0?'reverse':'normal',animationDuration:`${Math.max(.8,4-Math.abs(flow)/80)}s`,opacity:connected?.9:.4}}/>}<title>{e.name}: {Math.abs(flow).toFixed(1)} mL/min {flow<0?'(reverse)':''}</title></g>;
    })}
    {brainNodes.map(n=><g key={n.id} className={`brain-node ${selected===n.id?'selected':''}`} role="button" tabIndex={0} aria-label={`Inspect ${n.name}`} onClick={()=>onSelect(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n.id);}}}>
      <circle cx={n.x} cy={n.y} r="18" fill="transparent"/>
      <circle cx={n.x} cy={n.y} r={n.kind==='territory'?11:6} fill={n.kind==='vein'?'#749ab7':n.kind==='territory'?'#d3bc90':'#c47a71'} stroke={selected===n.id?'#245d50':'#fff'} strokeWidth={selected===n.id?3:2}/>
      <text x={n.x} y={n.y+(n.id.endsWith('jugular')?28:n.kind==='territory'?27:-14)} textAnchor="middle">{n.name}</text>
    </g>)}
    <text x="350" y="690" textAnchor="middle" className="map-footnote">SCHEMATIC CONNECTIVITY · DISTAL VESSELS GROUPED INTO TISSUE BEDS</text>
  </svg></div><div className="brain-summary"><span><b>{result.totalFlow.toFixed(0)}</b> mL/min supplied</span><span><b>{brainNodes.length}</b> connected nodes</span><span><b>{brainEdges.length}</b> flow paths</span></div></div>;
}
