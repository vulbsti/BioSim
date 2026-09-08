import {SUBSTANCES,type BodyState,type Substance} from './types';
import {concentration,gasResiduals,isGas,totalSubstance} from './transport';

export const substanceInfo:Record<Substance,{name:string;unit:string;concentrationUnit:string;scale:number}>={
  glucose:{name:'Glucose',unit:'g',concentrationUnit:'mg/dL',scale:100000},
  aminoAcids:{name:'Amino-acid substrate',unit:'g',concentrationUnit:'mg/dL',scale:100000},
  lipids:{name:'Lipid substrate',unit:'g',concentrationUnit:'mg/dL',scale:100000},
  oxygen:{name:'Oxygen',unit:'mL',concentrationUnit:'mL/dL',scale:100},
  carbonDioxide:{name:'Carbon dioxide',unit:'mL',concentrationUnit:'mL/dL',scale:100},
};
export default function TransportPanel({state:s,selected,onSelect,substance,onSubstance}:{state:BodyState;selected:string;onSelect:(id:string)=>void;substance:Substance;onSubstance:(id:Substance)=>void}){
  const info=substanceInfo[substance],compartments=Object.values(s.transport.compartments),gases=gasResiduals(s);
  return <div className="transport-panel"><div className="hormone-intro"><h2>Follow the substance.</h2><p>Blood carries material between organs. Tissue exchange, absorption, metabolism, and clearance each record a source and destination.</p></div><div className="transport-select"><label>Trace substance<select aria-label="Transport substance" value={substance} onChange={e=>onSubstance(e.target.value as Substance)}>{SUBSTANCES.map(k=><option key={k} value={k}>{substanceInfo[k].name}</option>)}</select></label><div><strong>{totalSubstance(s,substance).toFixed(2)}</strong><span>{info.unit} in transport pools</span></div></div>
    <div className="transport-route"><span>Lungs</span> → <span>Arterial</span> → <span>Organ blood ⇄ tissue</span> → <span>Venous</span> → <span>Lungs</span></div><p className="control-note">Gut blood returns through the portal vein and liver. Dietary lipid reaches venous blood through the lymph transit pool.</p>
    <div className="transport-table-wrap"><table className="transport-table"><thead><tr><th>Compartment</th><th>Amount <small>{info.unit}</small></th><th>Concentration <small>{info.concentrationUnit}</small></th></tr></thead><tbody>{compartments.filter(c=>!isGas(substance)||c.kind==='blood').map(c=><tr key={c.id} className={selected===c.id?'selected':''}><td><button onClick={()=>onSelect(c.id)}>{c.name}<small>{c.kind} · {c.volume.toFixed(0)} mL{c.kind==='blood'&&!isGas(substance)?' whole blood':''}</small></button></td><td>{c.amounts[substance].toFixed(3)}</td><td>{(concentration(c,substance)*info.scale).toFixed(2)}</td></tr>)}</tbody></table></div>
    <div className="transport-balance"><span>O₂ balance residual <b>{gases.oxygen.toExponential(1)} mL</b></span><span>CO₂ balance residual <b>{gases.carbonDioxide.toExponential(1)} mL</b></span></div><p className="control-note">Blood solutes use plasma distribution volume; gases use whole-blood volume. Tissue gas storage is omitted; oxidation consumes oxygen from the associated organ blood pool.</p></div>;
}

export function TransportInspector({state:s,selected,substance}:{state:BodyState;selected:string;substance:Substance}){
  const c=s.transport.compartments[selected],info=substanceInfo[substance];
  const fluxes=s.transport.fluxes.filter(f=>f.substance===substance&&(f.from===selected||f.to===selected));
  const name=(id:string)=>s.transport.compartments[id]?.name??id;
  return <><span className="sim-kicker">CONSERVED TRANSPORT POOL</span><h2>{c.name}</h2><p className="inspector-description">This compartment has its own substance inventory. Flow and finite permeability determine exchanges with its neighbors.</p>
    <div className="inspector-readout"><span>{info.name} inventory</span><strong>{c.amounts[substance].toFixed(3)}<small>{info.unit}</small></strong></div>
    <div className="inspector-readout"><span>Concentration</span><strong>{(concentration(c,substance)*info.scale).toFixed(2)}<small>{info.concentrationUnit}</small></strong></div>
    <h3 className="section-label">LAST SIMULATED SECOND</h3><div className="flux-list">{fluxes.length?fluxes.map(f=><div key={f.id}><span className={f.to===selected?'flux-in':'flux-out'}>{f.to===selected?'IN':'OUT'}</span><div><strong>{name(f.to===selected?f.from:f.to)}</strong><small>{f.mechanism}</small></div><b>{(f.amount*60).toFixed(3)}<small>{info.unit}/min</small></b></div>):<p className="control-note">Advance the model to observe fluxes.</p>}</div>
    {c.organ&&s.transport.metabolism[c.organ]&&<><h3 className="section-label">LOCAL OXIDATIVE METABOLISM</h3><div className="inspector-readout"><span>O₂ demand</span><strong>{s.transport.metabolism[c.organ].oxygenDemand.toFixed(1)}<small>mL/min</small></strong></div><div className="inspector-readout"><span>O₂ actually consumed</span><strong>{s.transport.metabolism[c.organ].oxygen.toFixed(1)}<small>mL/min</small></strong></div></>}
    <p className="control-note">Rates summarize the last one-second step. The export also retains cumulative amounts for every recorded transfer route. This is not a full time history of every flux.</p></>;
}
