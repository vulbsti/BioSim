import {Color} from 'three';
import type {BodyState,Organ,Substance} from '../simulation/types';
import type {Bed} from './vessel-flow';

/** What the body view colours by: vessel speed only, or one transported substance. */
export type Lens='flow'|Substance;
export const lenses:{id:Lens;name:string;unit:string}[]=[{id:'flow',name:'Flow speed',unit:''},{id:'glucose',name:'Glucose',unit:'g'},{id:'oxygen',name:'Oxygen',unit:'mL'},{id:'carbonDioxide',name:'Carbon dioxide',unit:'mL'},{id:'aminoAcids',name:'Amino acids',unit:'g'},{id:'lipids',name:'Lipids',unit:'g'}];
export type BloodLevels={bed:Record<Bed,number>;arterial:number;venous:number;lungs:number;portal:number;gut:number};
const PERIPHERAL:Organ[]=['muscle','skin','adipose','endocrine'],COOL=new Color('#3f78ff'),REST=new Color('#ece7dc'),WARM=new Color('#ffa516');

/**
 * Signed display value of a concentration ratio: 0 at the reference, +1 at double, -1 at half.
 * A log scale, so a doubling and a halving read as equally strong.
 */
export const tint=(ratio:number)=>ratio>0&&Number.isFinite(ratio)?Math.max(-1,Math.min(1,Math.log2(ratio))):-1;
export function tintColor(t:number,out:Color){return out.copy(REST).lerp(t>0?WARM:COOL,Math.abs(t));}

/**
 * Reads the body model's well-mixed compartments for display. Blood is compared with resting
 * arterial blood, so arteries, veins and the portal vein share one scale and their differences
 * show what each organ took up or added. An organ is compared with its own resting level.
 */
export function createBodyLens(rest:BodyState){
 const amount=(s:BodyState,id:string,x:Substance)=>{const c=s.transport.compartments[id];return c?c.amounts[x]/c.volume:0;};
 const blood=(s:BodyState,id:string,x:Substance)=>amount(s,id,x)/amount(rest,'arterial',x);
 /** Substance levels in the blood compartment each vessel circuit and bed carries. */
 const levels=(s:BodyState,x:Substance):BloodLevels=>{
  const flow=(id:Organ)=>s.flows.find(f=>f.id===id)?.flow??0,total=PERIPHERAL.reduce((a,id)=>a+flow(id),0);
  // Veins draining the lumped peripheral bed carry its organs' blood mixed in proportion to flow.
  const peripheral=total>0?PERIPHERAL.reduce((a,id)=>a+flow(id)*blood(s,`${id}-blood`,x),0)/total:blood(s,'muscle-blood',x);
  return {arterial:blood(s,'arterial',x),venous:blood(s,'venous',x),lungs:blood(s,'lungs-blood',x),portal:blood(s,'portal',x),gut:blood(s,'gut-blood',x),
   bed:{heart:blood(s,'heart-blood',x),brain:blood(s,'brain-blood',x),kidneys:blood(s,'kidneys-blood',x),gut:blood(s,'gut-blood',x),liver:blood(s,'liver-blood',x),hepatic:blood(s,'liver-blood',x),peripheral,lungs:blood(s,'lungs-blood',x)}};
 };
 /** An organ's level against its own resting level: tissue where the model tracks it, else its blood. */
 const organ=(s:BodyState,id:Organ,x:Substance)=>{
  const where=amount(rest,`${id}-tissue`,x)>0?`${id}-tissue`:`${id}-blood`,resting=amount(rest,where,x);
  return resting>0?amount(s,where,x)/resting:1;
 };
 /**
  * Net amount an organ's tissue takes from its blood, per minute (negative: it releases). Read from
  * the transport step's own blood-to-tissue exchange records, which cover one simulated second.
  */
 const uptake=(s:BodyState,id:Organ,x:Substance)=>{
  // Gases are consumed and produced inside the tissue model, which reports them per minute.
  const gas=s.transport.metabolism[id];
  if(x==='oxygen')return gas?.oxygen??0;
  if(x==='carbonDioxide')return -(gas?.carbonDioxide??0);
  let net=0;
  for(const f of s.transport.fluxes){
   if(f.substance!==x||f.mechanism!=='exchange')continue;
   if(f.from===`${id}-blood`&&f.to===`${id}-tissue`)net+=f.amount;
   if(f.from===`${id}-tissue`&&f.to===`${id}-blood`)net-=f.amount;
  }
  return net*60;
 };
 return {levels,organ,uptake};
}
export type BodyLens=ReturnType<typeof createBodyLens>;
