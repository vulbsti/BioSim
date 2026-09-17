import {initialShorten,shortenRates,SHORTEN_SOURCE_HASH} from './generated/shorten';
export const EXCITATION_MODEL='shorten2007-fast-pmr-33944b1-1';
export const EXCITATION_SOLVER='dormand-prince-54-event-split-1';
export const EXCITATION_DURATION=500; // source milliseconds
export type ExcitationConfig={stimulus:'single'|'train'|'none';releaseScale:number};
export const DEFAULT_EXCITATION:ExcitationConfig={stimulus:'single',releaseScale:1};
export type ExcitationView={enabled:boolean;config:ExcitationConfig;timeMs:number};
export const defaultExcitationView=():ExcitationView=>({enabled:false,config:{...DEFAULT_EXCITATION},timeMs:0});
export type ExcitationSample={timeMs:number;voltageMV:number;tubuleMV:number;calciumUM:number;srCalciumUM:number;boundTroponinUM:number;preStrokeUM:number;postStrokeUM:number;phosphateMM:number;state:number[]};
export type ExcitationResult={model:string;solver:string;sourceHash:string;config:ExcitationConfig;samples:ExcitationSample[];steps:number;rejected:number;maxCalciumResidualMol:number;maxAdenineResidualMol:number;elapsedMs:number};
export function validateExcitation(c:ExcitationConfig){
 if(!c||!['single','train','none'].includes(c.stimulus)||!Number.isFinite(c.releaseScale)||c.releaseScale<0||c.releaseScale>1)throw new Error('Invalid excitation experiment.');
}
export function stimulusAt(c:ExcitationConfig,timeMs:number){
 if(c.stimulus==='none'||timeMs<0)return 0;
 const pulse=Math.floor(timeMs/50);
 return pulse< (c.stimulus==='single'?1:9)&&timeMs-pulse*50<.5?150:0;
}
export function excitationInventory(y:ArrayLike<number>,c:ArrayLike<number>){
 // Source concentrations: Ca/buffers µM; precipitate mM. Volume: µm³.
 const boundCa=y[32]+2*y[47]+y[49]+2*(y[50]+y[51]+y[52]);
 return {
  calciumMol:1e-21*(c[101]*(y[28]+y[33]+y[39])+c[102]*(y[30]+y[34]+y[40]+boundCa)+c[103]*(y[29]+y[37])+c[104]*(y[31]+y[38]+1000*y[55])),
  adenineMol:1e-21*(c[101]*(y[39]+y[41]+y[43])+c[102]*(y[40]+y[42]+y[44])),
 };
}
const A=[[],[1/5],[3/40,9/40],[44/45,-56/15,32/9],[19372/6561,-25360/2187,64448/6561,-212/729],[9017/3168,-355/33,46732/5247,49/176,-5103/18656],[35/384,0,500/1113,125/192,-2187/6784,11/84]];
const B=[35/384,0,500/1113,125/192,-2187/6784,11/84,0];
const LOW=[5179/57600,0,7571/16695,393/640,-92097/339200,187/2100,1/40];
/** Adaptive explicit integration of all 56 source states; fixed current within each event interval.
 * No clipped or projected state, and no force-to-length animation is invented.
 */
export function runExcitation(config:ExcitationConfig=DEFAULT_EXCITATION,rtol=1e-6):ExcitationResult{
 validateExcitation(config);if(![1e-6,2e-7].includes(rtol))throw new Error('Unsupported excitation tolerance.');
 const started=performance.now(),{states:initial,constants:c}=initialShorten();c[98]*=config.releaseScale;
 let y=initial,time=0,h=.0001,steps=0,rejected=0,maxCalciumResidualMol=0,maxAdenineResidualMol=0;
 const k=Array.from({length:7},()=>new Float64Array(56)),trial=new Float64Array(56),next=new Float64Array(56),algebraic=new Float64Array(71);
 const initialInventory=excitationInventory(y,c),samples:ExcitationSample[]=[];
 const sample=()=>{
  const inventory=excitationInventory(y,c);
  maxCalciumResidualMol=Math.max(maxCalciumResidualMol,Math.abs(inventory.calciumMol-initialInventory.calciumMol));
  maxAdenineResidualMol=Math.max(maxAdenineResidualMol,Math.abs(inventory.adenineMol-initialInventory.adenineMol));
  samples.push({timeMs:time,voltageMV:y[0],tubuleMV:y[1],calciumUM:y[30],srCalciumUM:y[31],boundTroponinUM:y[47]+y[50]+y[51]+y[52],preStrokeUM:y[51],postStrokeUM:y[52],phosphateMM:y[53],state:Array.from(y)});
 };
 sample();
 // Half-millisecond boundaries split every source pulse start/end exactly.
 for(let interval=0;interval<EXCITATION_DURATION*2;interval++){
  const end=(interval+1)/2,current=stimulusAt(config,(interval+.5)/2);
  while(time<end-1e-12){
   if(steps+rejected>2_000_000||h<1e-10)throw new Error('Excitation integration exceeded its numerical budget.');
   const dt=Math.min(h,end-time);
   let finite=true;
   for(let stage=0;stage<7;stage++){
    for(let j=0;j<56;j++){let v=y[j];for(let n=0;n<stage;n++)v+=dt*A[stage][n]*k[n][j];trial[j]=v;}
    shortenRates(-1,c,k[stage],trial,algebraic);k[stage][0]+=current/c[0];
    if(k[stage].some(v=>!Number.isFinite(v))){finite=false;break;}
   }
   let error=0;
   if(finite)for(let j=0;j<56;j++){
    let hi=y[j],lo=y[j];for(let n=0;n<7;n++){hi+=dt*B[n]*k[n][j];lo+=dt*LOW[n]*k[n][j];}
    next[j]=hi;error=Math.max(error,Math.abs(hi-lo)/(1e-9+rtol*Math.max(Math.abs(y[j]),Math.abs(hi))));
    if(!Number.isFinite(hi)||(j>=2&&hi < -1e-9))finite=false;
   }
   if(finite&&error<=1){y.set(next);time+=dt;steps++;h=Math.min(.05,dt*Math.min(3,Math.max(.2,.9*Math.pow(Math.max(error,1e-12),-.2))));}
   else{rejected++;h=dt*(finite?Math.max(.1,.9*Math.pow(Math.max(error,1),-.2)):.25);}
  }
  time=end;sample();
 }
 return {model:EXCITATION_MODEL,solver:EXCITATION_SOLVER,sourceHash:SHORTEN_SOURCE_HASH,config:{...config},samples,steps,rejected,maxCalciumResidualMol,maxAdenineResidualMol,elapsedMs:performance.now()-started};
}
export function observeExcitation(result:ExcitationResult,timeMs:number):ExcitationSample{
 if(!Number.isFinite(timeMs)||timeMs<0||timeMs>EXCITATION_DURATION)throw new Error('Invalid excitation playhead.');
 const index=Math.min(result.samples.length-1,Math.round(timeMs*2));return result.samples[index];
}
