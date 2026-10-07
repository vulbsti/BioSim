import {atPhase,CHAMBERS,VALVES,type Chamber,type HeartCycle} from '../simulation/heart';

/**
 * Per-vertex data that lets the simulated chamber volumes move the source heart meshes.
 * Built by scripts/heart/build-heart-motion.ts. For each part: the two chambers that move it, and
 * per vertex [rhoA, rhoB, weightA], where rho is the vertex's distance from a chamber's centre as a
 * multiple of the cavity's own radius in that direction (1 on the cavity surface, larger outside).
 * A valve leaflet also has `valve` (index into VALVES) and `delta`: where, after the rig's
 * `vertices` entries, its per-vertex move from the closed source pose to the open one begins.
 */
export interface HeartRig {version:string;vertices:number;chambers:Record<Chamber,{cavity:string;center:[number,number,number];sourceVolumeMl:number}>;parts:Record<string,{a:number;b:number;offset:number;count:number;valve?:number;delta?:number}>}
/** Leaflet vertices carry their valve, chamber and radius in one number: 10000 + (valve*4 + chamber)*1000 + radius step. */
export const LEAFLET_KIND=10000,RHO_STEP=.003;
export const leafletKind=(valve:number,chamber:number,rho:number)=>LEAFLET_KIND+(valve*4+chamber)*1000+Math.min(999,Math.max(0,Math.round((rho-1)/RHO_STEP)));

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

/** Moves each valve's openness toward its simulated state. Leaflets take about 40 ms to swing. */
export function easeValves(cycle:HeartCycle,phase:number,dt:number,out:number[]){
 const i=Math.floor((((phase%1)+1)%1)*cycle.samples),ease=1-Math.exp(-dt/.04);
 VALVES.forEach((k,v)=>{out[v]+=((cycle.open[k][i]?1:0)-out[v])*ease;});return out;
}
/**
 * Where the impulse is in the modelled conduction system, 0 to 1 per stage. Timing follows the
 * heart model's two onsets: the sinoatrial node fires as atrial contraction starts, the
 * atrioventricular node holds the impulse until just before the ventricles contract at phase 0,
 * and the bundle, branches and Purkinje fibres pass it on in the last hundredths of a second.
 * Conduction itself is not simulated; the intervals between stages are fixed.
 */
export const CONDUCTION_STAGES=['sa','atrial','av','his','branch','fascicle','purkinje'] as const;
export type ConductionStage=(typeof CONDUCTION_STAGES)[number];
export function conductionGlow(stage:ConductionStage,phase:number,heartRate:number){
 const period=60/heartRate,atrial=period-.16*Math.sqrt(period),t=(((phase%1)+1)%1)*period;
 // Start and end of each stage's activity, seconds from the start of ventricular contraction.
 const window:Record<ConductionStage,[number,number]>={sa:[atrial-period,atrial-period+.03],atrial:[atrial-period+.01,atrial-period+.07],av:[atrial-period+.05,-.035],his:[-.04,-.015],branch:[-.025,.005],fascicle:[-.02,.01],purkinje:[-.01,.04]};
 const [from,to]=window[stage],since=t>period/2?t-period:t,soft=.012;
 return Math.max(0,Math.min(1,(since-from)/soft+1,(to-since)/soft+1));
}
