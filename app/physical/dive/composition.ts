import {concentration} from '../../simulation/transport';
import {HORMONES,type BodyState} from '../../simulation/types';
import type {Circuit} from '../vessel-flow';
import type {SpeciesId} from '../molecules';
import {REFERENCE} from './reference';

/** The blood compartment of the body model a vessel circuit carries. */
export type Blood='arterial'|'venous'|'portal';
export const bloodOf=(circuit:Circuit):Blood=>circuit==='portal'?'portal':circuit==='arterial'||circuit==='pulmonary-venous'?'arterial':'venous';

const AVOGADRO=6.02214076e23;
/** Members per cubic metre for a molar concentration (mol/L). */
export const perCubicMetre=(molPerL:number)=>molPerL*1000*AVOGADRO;
/** Members per cubic metre for a count per microlitre. */
const perMicrolitre=(count:number)=>count*1e9;

/**
 * `simulated`: the amount is the body model's own. `level`: the model gives a level against rest, and
 * a cited resting concentration turns it into an amount. `reference`: the model does not track it.
 */
export type Basis='simulated'|'level'|'reference';
/**
 * `density` is members per cubic metre of plasma, or of whole blood for cells; 0 when no usable blood
 * value exists. `molar` is mol/L, absent for cells. `approximate` marks an amount resting on a
 * reference value that may be off severalfold.
 */
export type Amount={id:SpeciesId;density:number;molar:number|null;basis:Basis;where:'plasma'|'blood';approximate:boolean;known:boolean};

/** Oxygen partial pressure, mmHg, at which the body model's own dissociation curve holds `content` mL O2 per mL blood. */
export function oxygenPressure(content:number):number {
 // Inverse of transport.ts oxygenContent, by bisection: the curve is monotonic.
 const curve=(p:number)=>.201*p**2.7/(p**2.7+26.8**2.7)+.00003*p;let lo=0,hi=700;
 for(let i=0;i<50;i++){const mid=(lo+hi)/2;if(curve(mid)<content)lo=mid;else hi=mid;}
 return (lo+hi)/2;
}

/** What one kind of blood holds now, in true amounts. */
export function composition(s:BodyState,rest:BodyState,blood:Blood):Amount[]{
 const here=s.transport.compartments[blood],resting=rest.transport.compartments[blood],out:Amount[]=[];
 const ref=(id:SpeciesId)=>REFERENCE[id]!,solute=(id:SpeciesId,molar:number,basis:Basis,approximate=false)=>out.push({id,density:perCubicMetre(Math.max(0,molar)),molar:Math.max(0,molar),basis,where:'plasma',approximate,known:true});
 const scaled=(id:SpeciesId,level:number,basis:Basis)=>{const r=ref(id);if(r.molar==null)out.push({id,density:0,molar:null,basis,where:'plasma',approximate:false,known:false});else solute(id,r.molar*level,basis,r.trust!=='cited');};
 // Glucose is tracked in grams per millilitre of its distribution volume.
 solute('glucose',concentration(here,'glucose')*1000/180.156,'simulated');
 // Amino acids and lipids are lumped pools whose resting size is the model's own calibration, so their
 // level against rest scales a cited concentration of the molecule each is drawn as.
 scaled('aminoAcids',concentration(here,'aminoAcids')/concentration(resting,'aminoAcids'),'level');
 scaled('lipids',concentration(here,'lipids')/concentration(resting,'lipids'),'level');
 // Dissolved gas only. The model's oxygen curve has a dissolved term of 0.00003 mL per mL per mmHg; a mole
 // of gas is 22,400 mL at standard conditions. Carbon dioxide content is close to linear in its pressure.
 solute('oxygen',.00003*oxygenPressure(concentration(here,'oxygen'))*1000/22400,'simulated');
 solute('carbonDioxide',ref('carbonDioxide').molarPerMmHg!*s.paCO2*concentration(here,'carbonDioxide')/concentration(s.transport.compartments.arterial,'carbonDioxide'),'simulated');
 // Hormones are body-wide levels against a reference of 1.
 for(const id of HORMONES)scaled(id,Math.max(0,s.hormones[id]),'level');
 // Sodium is one extracellular pool in millimoles; calcium is total plasma calcium in mmol/L.
 solute('sodium',s.sodium/(s.plasma+s.interstitial),'simulated');
 scaled('calcium',s.calcium/rest.calcium,'level');
 for(const id of ['potassium','chloride','bicarbonate','albumin','igg','fibrinogen'] as const)scaled(id,1,'reference');
 for(const id of ['redCell','platelet','whiteCell'] as const)out.push({id,density:perMicrolitre(ref(id).perMicrolitre!),molar:null,basis:'reference',where:'blood',approximate:false,known:true});
 return out;
}
