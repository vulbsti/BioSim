import {insulinDerivative,insulinInitial,SEDAGHAT_VERSION} from '../molecular/sedaghat';
import {stableJSON} from '../simulation/core/model';
import sourceParameters from '../../models/sedaghat2002/parameters.json';

export const CIRCULATION_VERSION='closed-circulation-insulin-pilot-1';
export const CIRCULATION_SOLVER='rk4-fixed-0.01s-event-aligned-1';
export const DURATION=600,HEMATOCRIT=.45,INTERSTITIAL_L=.5,HEART_RATE=72,OUTPUT_L_S=5/60;
export const TRANSPORT={exchangeLPerS:.08/60,hepaticClearanceLPerS:.35/60,renalClearanceLPerS:.18/60,muscleClearanceLPerS:.04/60,pulseStartS:5,pulseEndS:25,pumpDuty:.32};
export type NodeId='arterial'|'venous'|'pulmonary-arterial'|'pulmonary-venous'|'muscle'|'other'|'kidney'|'gut'|'portal'|'liver';
export type BloodNode={id:NodeId;name:string;volumeL:number;pressureMmHg:number;complianceLPerMmHg:number;description:string};
/** Synthetic reference design; values are not fitted human parameters. */
export const BLOOD_NODES:readonly BloodNode[]=[
 {id:'arterial',name:'Systemic arteries',volumeL:.7,pressureMmHg:95,complianceLPerMmHg:.0013,description:'Receives the prescribed left pump output and distributes blood through parallel organ branches.'},
 {id:'venous',name:'Systemic veins',volumeL:2.7,pressureMmHg:5,complianceLPerMmHg:.08,description:'Mixes organ return before the right pump and pulmonary circulation.'},
 {id:'pulmonary-arterial',name:'Pulmonary arteries',volumeL:.25,pressureMmHg:15,complianceLPerMmHg:.01,description:'Receives right pump output. This pilot transports plasma insulin but has no gas-exchange model.'},
 {id:'pulmonary-venous',name:'Pulmonary veins',volumeL:.35,pressureMmHg:8,complianceLPerMmHg:.02,description:'Returns pulmonary blood to the prescribed left pump.'},
 {id:'muscle',name:'Muscle vascular bed',volumeL:.15,pressureMmHg:30,complianceLPerMmHg:.0015,description:'Exchanges insulin with a separate 0.5 L effective interstitial compartment. It represents an aggregate bed, not one depicted capillary.'},
 {id:'other',name:'Other systemic beds',volumeL:.4,pressureMmHg:25,complianceLPerMmHg:.004,description:'Remaining systemic circulation is lumped here. Brain, skin and adipose are not separately resolved in this experiment.'},
 {id:'kidney',name:'Renal vascular bed',volumeL:.1,pressureMmHg:25,complianceLPerMmHg:.002,description:'Removes insulin into an explicit renal clearance ledger. Clearance is a lumped coefficient, not a nephron model.'},
 {id:'gut',name:'Splanchnic vascular bed',volumeL:.15,pressureMmHg:25,complianceLPerMmHg:.003,description:'Receives arterial blood and drains through the portal compartment before the liver.'},
 {id:'portal',name:'Portal vein',volumeL:.1,pressureMmHg:12,complianceLPerMmHg:.006,description:'The portal pulse enters here, before hepatic transit. This prescribed input does not simulate beta-cell secretion.'},
 {id:'liver',name:'Hepatic vascular bed',volumeL:.1,pressureMmHg:8,complianceLPerMmHg:.005,description:'Receives both portal and hepatic arterial blood. Hepatic removal is charged once to its own clearance ledger.'},
];
export type Edge={id:string;from:NodeId;to:NodeId;name:string;resistance:number;kind:'passive'|'pump'};
const resistance=(a:NodeId,b:NodeId,litersPerMinute:number)=>(BLOOD_NODES.find(n=>n.id===a)!.pressureMmHg-BLOOD_NODES.find(n=>n.id===b)!.pressureMmHg)/(litersPerMinute/60);
const branch=(from:NodeId,to:NodeId,q:number,name:string):Edge=>({id:`${from}:${to}`,from,to,name,resistance:resistance(from,to,q),kind:'passive'});
export const BLOOD_EDGES:readonly Edge[]=[
 {id:'left-pump',from:'pulmonary-venous',to:'arterial',name:'Left pump',resistance:0,kind:'pump'},
 {id:'right-pump',from:'venous',to:'pulmonary-arterial',name:'Right pump',resistance:0,kind:'pump'},
 branch('pulmonary-arterial','pulmonary-venous',5,'Pulmonary bed'),
 branch('arterial','muscle',1,'Muscle arterial supply'),branch('muscle','venous',1,'Muscle venous return'),
 branch('arterial','other',1.65,'Other arterial supply'),branch('other','venous',1.65,'Other venous return'),
 branch('arterial','kidney',1.2,'Renal arterial supply'),branch('kidney','venous',1.2,'Renal venous return'),
 branch('arterial','gut',.8,'Splanchnic arterial supply'),branch('gut','portal',.8,'Portal drainage'),
 branch('portal','liver',.8,'Portal hepatic inflow'),branch('arterial','liver',.35,'Hepatic arterial supply'),branch('liver','venous',1.15,'Hepatic venous return'),
];
const index=Object.fromEntries(BLOOD_NODES.map((n,i)=>[n.id,i])) as Record<NodeId,number>;
const routes=BLOOD_EDGES.map(e=>({from:index[e.from],to:index[e.to]}));
export const STATE={volume:0,insulin:10,interstitial:20,hepaticCleared:21,renalCleared:22,muscleCleared:23,injected:24,signal:25,integratedFlow:46} as const;
export type CirculationConfig={dosePmol:number;route:'portal'|'venous';hepaticClearance:number;exchange:number;muscleResistance:number};
export const DEFAULT_CIRCULATION:CirculationConfig={dosePmol:1200,route:'portal',hepaticClearance:1,exchange:1,muscleResistance:1};
export function validateCirculationConfig(value:unknown):asserts value is CirculationConfig{
 const c=value as CirculationConfig;
 if(!c||typeof c!=='object'||Object.keys(c).sort().join(',')!=='dosePmol,exchange,hepaticClearance,muscleResistance,route'||!['portal','venous'].includes(c.route)||
  !Number.isFinite(c.dosePmol)||c.dosePmol<0||c.dosePmol>5000||!Number.isFinite(c.hepaticClearance)||c.hepaticClearance<0||c.hepaticClearance>2||!Number.isFinite(c.exchange)||c.exchange<0||c.exchange>2||!Number.isFinite(c.muscleResistance)||c.muscleResistance<.5||c.muscleResistance>2.5)throw new Error('Circulation settings are outside the supported experiment.');
}
/** Prescribed ejection, 32% duty cycle, analytically normalized beat integral. */
export function pumpFlow(time:number):number{
 const phase=((time*HEART_RATE/60)%1+1)%1,duty=TRANSPORT.pumpDuty;
 return phase<duty?OUTPUT_L_S*Math.PI/(2*duty)*Math.sin(Math.PI*phase/duty):0;
}
export function pressures(y:readonly number[]):number[]{return BLOOD_NODES.map((n,i)=>n.pressureMmHg+(y[i]-n.volumeL)/n.complianceLPerMmHg);}
export function bloodFlows(y:readonly number[],time:number,c:CirculationConfig):number[]{
 const p=pressures(y);
 return BLOOD_EDGES.map((e,i)=>e.kind==='pump'?pumpFlow(time):(p[routes[i].from]-p[routes[i].to])/(e.resistance*(e.from==='muscle'||e.to==='muscle'?c.muscleResistance:1)));
}
/** Conservative upwind transfer for signed whole-blood flow; insulin occupies plasma only. */
export function advect(y:readonly number[],dy:number[],from:number,to:number,wholeBloodLPerS:number):void{
 const a=wholeBloodLPerS>=0?from:to,b=wholeBloodLPerS>=0?to:from,q=Math.abs(wholeBloodLPerS);
 const plasmaL=y[a]*(1-HEMATOCRIT),insulinFlux=q*(1-HEMATOCRIT)*y[STATE.insulin+a]/plasmaL;
 dy[a]-=q;dy[b]+=q;dy[STATE.insulin+a]-=insulinFlux;dy[STATE.insulin+b]+=insulinFlux;
}
export function initialCirculation():number[]{return [...BLOOD_NODES.map(n=>n.volumeL),...Array(15).fill(0),...insulinInitial(),...BLOOD_EDGES.map(()=>0)];}
export function circulationDerivative(y:readonly number[],time:number,c:CirculationConfig,sourceOn:boolean):number[]{
 const dy=Array(y.length).fill(0) as number[],flows=bloodFlows(y,time,c);
 flows.forEach((q,i)=>{advect(y,dy,routes[i].from,routes[i].to,q);dy[STATE.integratedFlow+i]=q;});
 const concentration=(id:NodeId)=>y[STATE.insulin+index[id]]/(y[index[id]]*(1-HEMATOCRIT));
 const interstitial=y[STATE.interstitial]/INTERSTITIAL_L;
 const exchange=c.exchange*TRANSPORT.exchangeLPerS*(concentration('muscle')-interstitial);
 dy[STATE.insulin+index.muscle]-=exchange;dy[STATE.interstitial]+=exchange;
 const hepatic=c.hepaticClearance*TRANSPORT.hepaticClearanceLPerS*concentration('liver'),renal=TRANSPORT.renalClearanceLPerS*concentration('kidney'),muscle=TRANSPORT.muscleClearanceLPerS*interstitial;
 dy[STATE.insulin+index.liver]-=hepatic;dy[STATE.hepaticCleared]+=hepatic;
 dy[STATE.insulin+index.kidney]-=renal;dy[STATE.renalCleared]+=renal;
 dy[STATE.interstitial]-=muscle;dy[STATE.muscleCleared]+=muscle;
 if(sourceOn){const input=c.dosePmol*1e-12/(TRANSPORT.pulseEndS-TRANSPORT.pulseStartS);dy[STATE.insulin+index[c.route]]+=input;dy[STATE.injected]+=input;}
 // Native source states remain pM/percent; derivative's time basis is minutes.
 // They observe local insulin but do not consume it or own any transport flux.
 const signal=insulinDerivative(y.slice(STATE.signal,STATE.integratedFlow),interstitial);
 for(let i=0;i<signal.length;i++)dy[STATE.signal+i]=signal[i]/60;
 return dy;
}
export type CirculationSample={time:number;volumesL:number[];pressureMmHg:number[];flowLPerS:number[];integratedFlowL:number[];insulinPM:number[];interstitialPM:number;signal:number[];injectedPmol:number;circulatingPmol:number;interstitialPmol:number;clearedPmol:number[]};
export type CirculationResult={version:string;config:CirculationConfig;duration:number;stepSeconds:number;samples:CirculationSample[];maximumVolumeResidualL:number;maximumInsulinResidualMol:number;minimumInsulinMol:number};
export function circulationSample(y:readonly number[],time:number,c:CirculationConfig):CirculationSample{
 const amounts=y.slice(STATE.insulin,STATE.interstitial);
 return {time,volumesL:y.slice(0,10),pressureMmHg:pressures(y),flowLPerS:bloodFlows(y,time,c),integratedFlowL:y.slice(STATE.integratedFlow),insulinPM:amounts.map((n,i)=>n/(y[i]*(1-HEMATOCRIT))*1e12),interstitialPM:y[STATE.interstitial]/INTERSTITIAL_L*1e12,signal:y.slice(STATE.signal,STATE.integratedFlow),injectedPmol:y[STATE.injected]*1e12,circulatingPmol:amounts.reduce((a,b)=>a+b,0)*1e12,interstitialPmol:y[STATE.interstitial]*1e12,clearedPmol:y.slice(STATE.hepaticCleared,STATE.injected).map(n=>n*1e12)};
}
export function runCirculation(config:CirculationConfig=DEFAULT_CIRCULATION,stepSeconds=.01,duration=DURATION):CirculationResult{
 validateCirculationConfig(config);
 if(![.01,.005].includes(stepSeconds)||!Number.isInteger(duration)||duration<1||duration>DURATION)throw new Error('Unsupported circulation solver settings.');
 const c=structuredClone(config);let y=initialCirculation(),volumeResidual=0,insulinResidual=0,minimum=0;
 const samples:CirculationSample[]=[circulationSample(y,0,c)],count=Math.round(duration/stepSeconds),sampleTicks=Math.round(.1/stepSeconds);
 for(let tick=0;tick<count;tick++){
  const time=tick*stepSeconds,sourceOn=tick>=Math.round(TRANSPORT.pulseStartS/stepSeconds)&&tick<Math.round(TRANSPORT.pulseEndS/stepSeconds);
  const a=circulationDerivative(y,time,c,sourceOn),b=circulationDerivative(y.map((v,i)=>v+stepSeconds*a[i]/2),time+stepSeconds/2,c,sourceOn);
  const d=circulationDerivative(y.map((v,i)=>v+stepSeconds*b[i]/2),time+stepSeconds/2,c,sourceOn),e=circulationDerivative(y.map((v,i)=>v+stepSeconds*d[i]),time+stepSeconds,c,sourceOn);
  y=y.map((v,i)=>v+stepSeconds*(a[i]+2*b[i]+2*d[i]+e[i])/6);
  if(y.some(v=>!Number.isFinite(v))||y.slice(0,10).some(v=>v<=0)||y.slice(10,25).some(v=>v< -1e-20)||y.slice(25,STATE.integratedFlow).some(v=>v< -1e-10))throw new Error('Circulation left its verified numerical domain. No result was committed.');
  if((tick+1)%sampleTicks===0){
   const s=circulationSample(y,(tick+1)/sampleTicks/10,c);samples.push(s);
   volumeResidual=Math.max(volumeResidual,Math.abs(s.volumesL.reduce((a,b)=>a+b,0)-5));
   insulinResidual=Math.max(insulinResidual,Math.abs(s.injectedPmol-s.circulatingPmol-s.interstitialPmol-s.clearedPmol.reduce((a,b)=>a+b,0))*1e-12);
   minimum=Math.min(minimum,...y.slice(10,25));
  }
 }
 return {version:CIRCULATION_VERSION,config:c,duration,stepSeconds,samples,maximumVolumeResidualL:volumeResidual,maximumInsulinResidualMol:insulinResidual,minimumInsulinMol:minimum};
}
/** Interpolate display observations; the simulation never reads the playhead. */
export function observeCirculation(result:CirculationResult,time:number):CirculationSample{
 const t=Math.max(0,Math.min(result.duration,time)),at=Math.min(result.samples.length-1,Math.floor(t*10)),a=result.samples[at],b=result.samples[Math.min(at+1,result.samples.length-1)],f=b.time>a.time?(t-a.time)/(b.time-a.time):0;
 const scalar=(x:number,y:number)=>x+(y-x)*f,vector=(x:number[],y:number[])=>x.map((v,i)=>scalar(v,y[i]));
 return {time:t,volumesL:vector(a.volumesL,b.volumesL),pressureMmHg:vector(a.pressureMmHg,b.pressureMmHg),flowLPerS:vector(a.flowLPerS,b.flowLPerS),integratedFlowL:vector(a.integratedFlowL,b.integratedFlowL),insulinPM:vector(a.insulinPM,b.insulinPM),interstitialPM:scalar(a.interstitialPM,b.interstitialPM),signal:vector(a.signal,b.signal),injectedPmol:scalar(a.injectedPmol,b.injectedPmol),circulatingPmol:scalar(a.circulatingPmol,b.circulatingPmol),interstitialPmol:scalar(a.interstitialPmol,b.interstitialPmol),clearedPmol:vector(a.clearedPmol,b.clearedPmol)};
}
export const circulationContract=()=>stableJSON({model:CIRCULATION_VERSION,solver:CIRCULATION_SOLVER,nodes:BLOOD_NODES,edges:BLOOD_EDGES,transport:TRANSPORT,hematocrit:HEMATOCRIT,interstitialL:INTERSTITIAL_L,heartRate:HEART_RATE,outputLPerS:OUTPUT_L_S,source:SEDAGHAT_VERSION,sourceParameters});
export function exportCirculation(config:CirculationConfig,time:number):string{
 validateCirculationConfig(config);if(!Number.isFinite(time)||time<0||time>DURATION)throw new Error('Invalid circulation playhead.');
 return JSON.stringify({format:'human-atlas/circulation-experiment',schema:1,contract:circulationContract(),config,time},null,2);
}
export function importCirculation(text:string):{config:CirculationConfig;time:number}{
 if(text.length>100000)throw new Error('Circulation recording exceeds 100 kB.');const d=JSON.parse(text);
 if(!d||d.format!=='human-atlas/circulation-experiment'||d.schema!==1||d.contract!==circulationContract())throw new Error('This is not a compatible circulation experiment.');
 validateCirculationConfig(d.config);if(!Number.isFinite(d.time)||d.time<0||d.time>DURATION)throw new Error('Invalid circulation playhead.');return {config:structuredClone(d.config),time:d.time};
}
