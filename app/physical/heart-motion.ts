import {atPhase,CHAMBERS,type Chamber,type HeartCycle} from '../simulation/heart';

/**
 * Per-vertex data that lets the simulated chamber volumes move the source heart meshes.
 * Built by scripts/heart/build-heart-motion.ts. For each part: the two chambers that move it, and
 * per vertex [rhoA, rhoB, weightA], where rho is the vertex's distance from a chamber's centre as a
 * multiple of the cavity's own radius in that direction (1 on the cavity surface, larger outside).
 */
export interface HeartRig {version:string;chambers:Record<Chamber,{cavity:string;center:[number,number,number];sourceVolumeMl:number}>;parts:Record<string,{a:number;b:number;offset:number;count:number}>}

/**
 * Radial factor for a point at normalised radius `rho` when the cavity holds `fill` of its largest
 * volume. The cavity surface (rho 1) scales by the cube root of fill, so the cavity's volume is
 * exactly fill. Outside it the wall keeps its volume, so outer layers move less and the wall thickens.
 */
export const chamberFactor=(rho:number,fill:number)=>Math.cbrt(Math.max(rho,1)**3-1+fill)/Math.max(rho,1);

/** Each chamber's volume as a share of its largest in the beat, in CHAMBERS order. The source mesh is the full chamber. */
export function chamberFill(cycle:HeartCycle,phase:number,out:number[]){
 CHAMBERS.forEach((k,i)=>{out[i]=atPhase(cycle.volume[k],phase)/cycle.summary.endDiastolic[k];});return out;
}
export const HEART_PHASES=['Isovolumic contraction','Ejection','Isovolumic relaxation','Filling','Atrial contraction'] as const;
/** The left heart's phase of the cycle, from the simulated valve states. */
export function heartPhaseName(cycle:HeartCycle,phase:number):(typeof HEART_PHASES)[number]{
 const i=Math.floor((((phase%1)+1)%1)*cycle.samples),e=cycle.events;
 if(cycle.open.aortic[i])return 'Ejection';
 if(cycle.open.mitral[i]||phase>=e.mitral.closes)return phase>=1-.16*Math.sqrt(60/cycle.point.heartRate)/(60/cycle.point.heartRate)?'Atrial contraction':'Filling';
 return phase<e.aortic.opens?'Isovolumic contraction':'Isovolumic relaxation';
}
