import {concentration} from '../simulation/transport';
import type {BodyState} from '../simulation/types';

/**
 * Glucose leaving capillary blood for muscle, scaled from the body model's whole-muscle
 * compartment to one fascicle segment so it can be drawn there.
 *
 * The model has one muscle compartment. A segment's share is its volume over the muscle's, and
 * every dot that crosses in the scene stands for the same, stated number of molecules.
 */
export type TissueUptake={
 /** Net glucose from muscle blood to muscle tissue, g/min for the whole muscle; negative when tissue releases it. */
 netGPerMin:number;
 /** Glucose in muscle capillary blood as a multiple of resting arterial blood. */
 capillaryLevel:number;
 /** Share of the glucose in muscle interstitium that came from the marked meal, 0 to 1. */
 mealShare:number;
 /** Glucose molecules crossing per second in the segment drawn. */
 moleculesPerSecond:number;
 /** Dots crossing per second in the scene, and the molecules each stands for. */
 dotsPerSecond:number;
 moleculesPerDot:number;
};
const AVOGADRO=6.02214076e23,GLUCOSE_G_PER_MOL=180.156;
/** Whole-muscle uptake at which the scene shows its fastest crossing rate, g/min. */
export const FULL_RATE_G_PER_MIN=.16,MAX_DOTS_PER_SECOND=40;
/** Volume of a fascicle segment of this radius and length, litres. */
export const segmentVolumeL=(radiusM:number,lengthM:number)=>Math.PI*radiusM*radiusM*lengthM*1000;

export function tissueUptake(s:BodyState,rest:BodyState,segmentL:number):TissueUptake{
 const c=s.transport.compartments,blood=c['muscle-blood'],tissue=c['muscle-tissue'];
 let net=0;
 // The transport step records one simulated second of exchange in each direction.
 for(const f of s.transport.fluxes){
  if(f.substance!=='glucose'||f.mechanism!=='exchange')continue;
  if(f.from==='muscle-blood'&&f.to==='muscle-tissue')net+=f.amount;
  if(f.from==='muscle-tissue'&&f.to==='muscle-blood')net-=f.amount;
 }
 const netGPerMin=net*60;
 // Muscle volume as the model holds it: interstitium plus the cell water its glucose pools are spread over.
 const muscleL=(tissue.volume+c['muscle-cell'].volume)/1000;
 const moleculesPerSecond=Math.abs(netGPerMin)/60/GLUCOSE_G_PER_MOL*AVOGADRO*segmentL/muscleL;
 const dotsPerSecond=Math.min(MAX_DOTS_PER_SECOND,Math.abs(netGPerMin)/FULL_RATE_G_PER_MIN*MAX_DOTS_PER_SECOND);
 return {
  netGPerMin,
  capillaryLevel:concentration(blood,'glucose')/concentration(rest.transport.compartments.arterial,'glucose'),
  mealShare:tissue.amounts.glucose>0?Math.min(1,Math.max(0,s.transport.mark.pools['muscle-tissue'].glucose/tissue.amounts.glucose)):0,
  moleculesPerSecond,
  dotsPerSecond,
  moleculesPerDot:dotsPerSecond>0?moleculesPerSecond/dotsPerSecond:0,
 };
}
/** A count of molecules in words a reader can hold: "2.1 billion". */
export function countInWords(n:number){
 if(n<=0)return '0';
 for(const [size,name] of [[1e12,'trillion'],[1e9,'billion'],[1e6,'million'],[1e3,'thousand']] as const)if(n>=size)return `${(n/size).toPrecision(2)} ${name}`;
 return n.toFixed(0);
}
