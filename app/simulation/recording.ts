import {createBody,MODEL_VERSION,validateAction,carbohydrateResidual,fatResidual,proteinResidual,waterResidual,INPUT_BOUNDS} from './engine';
import {HORMONES,SUBSTANCES,type BodyState,type Sample} from './types';
import {gasResiduals,totalSubstance} from './transport';

export type Recording={model:string;exportedAt:string;state:BodyState;reference:BodyState|null;scope:string};
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
function finiteTree(x:unknown,path:string) {
  if(typeof x==='number'&&!Number.isFinite(x))throw new Error(`${path} must be finite.`);
  if(object(x)||Array.isArray(x))for(const [key,value] of Object.entries(x))finiteTree(value,`${path}.${key}`);
}
function shape(value:unknown,template:unknown,path:string) {
  if(template===null){if(value!==null)throw new Error(`Invalid ${path}.`);return;}
  if(typeof value!==typeof template||(value===null&&template!==null))throw new Error(`Invalid ${path}.`);
  if(object(template)){
    if(!object(value))throw new Error(`Invalid ${path}.`);
    for(const key of Object.keys(template))shape(value[key],template[key],`${path}.${key}`);
    for(const key of Object.keys(value))if(!Object.hasOwn(template,key))throw new Error(`Unknown field ${path}.${key}.`);
  }
}
function validateState(value:unknown):asserts value is BodyState {
  if(!object(value))throw new Error('Missing simulation state.');
  const template=createBody();
  for(const [key,v] of Object.entries(template))if(!Array.isArray(v))shape(value[key],v,`state.${key}`);
  const s=value as unknown as BodyState;finiteTree(s,'state');
  if(s.version!==2||!Number.isInteger(s.time)||s.time<0||s.time>7*86400)throw new Error('Unsupported simulation time or version.');
  for(const [key,[min,max]] of Object.entries(INPUT_BOUNDS)){const v=s.inputs[key as keyof typeof s.inputs];if(v<min||v>max)throw new Error(`Invalid input ${key}.`);}
  for(const key of HORMONES)if(s.hormones[key]<0||s.hormones[key]>15)throw new Error(`Invalid ${key} activity.`);
  for(const key of ['queue','receipts','history','flows'] as const)if(!Array.isArray(s[key])||s[key].length>50000)throw new Error(`Invalid ${key} collection.`);
  const sampleShape:Sample=template.history[0];
  let last=-1;for(const point of s.history){shape(point,sampleShape,'history sample');if(point.time<last||point.time>s.time)throw new Error('History timestamps are out of order.');last=point.time;}
  for(const f of s.flows){shape(f,template.flows[0],'flow');if(!template.flows.some(t=>t.id===f.id)||f.flow<0)throw new Error('Invalid organ flow.');}
  if(s.flows.length!==template.flows.length||new Set(s.flows.map(f=>f.id)).size!==s.flows.length)throw new Error('Incomplete organ flow collection.');
  const ids=new Set<number>();
  for(const e of [...s.queue,...s.receipts]){if(!object(e)||!Number.isInteger(e.id)||e.id<1||ids.has(e.id))throw new Error('Invalid or duplicate event identifier.');ids.add(e.id);}
  last=s.time;for(const e of s.queue){if(!Number.isInteger(e.at)||e.at<last||e.at>7*86400||typeof e.label!=='string')throw new Error('Invalid queued event.');validateAction(e.action);last=e.at;}
  last=-1;for(const e of s.receipts){if(!Number.isInteger(e.time)||e.time<last||e.time>s.time||typeof e.title!=='string'||typeof e.detail!=='string'||!['input','response'].includes(e.category))throw new Error('Invalid event receipt.');last=e.time;}
  if(!Number.isInteger(s.nextId)||s.nextId<=Math.max(0,...ids))throw new Error('Invalid next event identifier.');
  for(const fn of [waterResidual,carbohydrateResidual,proteinResidual,fatResidual])if(Math.abs(fn(s))>1e-5)throw new Error('Recording fails substrate conservation checks.');
  for(const key of ['glucoseMass','aminoAcids','lipids','glycogen','fatStore','proteinStore','plasma','interstitial','intracellular','sodium'] as const)if(s[key]<0)throw new Error(`Negative ${key} pool.`);
  if(s.plasma+s.interstitial<1)throw new Error('Invalid fluid distribution volume.');
  for(const c of Object.values(s.transport.compartments)){
    if(c.volume<=0)throw new Error('Invalid compartment volume.');
    for(const amount of Object.values(c.amounts))if(amount< -1e-10)throw new Error('Negative transported substance.');
  }
  for(const [species,amount] of [['glucose',s.glucoseMass],['aminoAcids',s.aminoAcids],['lipids',s.lipids]] as const)if(Math.abs(totalSubstance(s,species)-amount)>1e-7)throw new Error('Compartment totals disagree with systemic state.');
  for(const list of [s.transport.fluxes,s.transport.cumulativeFluxes]){
    if(!Array.isArray(list)||list.length>10000)throw new Error('Invalid flux ledger.');
    for(const f of list)if(!object(f)||typeof f.id!=='string'||typeof f.from!=='string'||typeof f.to!=='string'||!SUBSTANCES.includes(f.substance)||!Number.isFinite(f.amount)||f.amount<0||!['advection','exchange','reaction','absorption','clearance'].includes(f.mechanism))throw new Error('Invalid flux receipt.');
  }
  const gases=gasResiduals(s);if(Math.abs(gases.oxygen)>1e-5||Math.abs(gases.carbonDioxide)>1e-5)throw new Error('Recording fails gas conservation.');
}
export function parseRecording(text:string):Recording {
  if(text.length>15_000_000)throw new Error('Recording exceeds the 15 MB import limit.');
  const data:unknown=JSON.parse(text);if(!object(data)||data.model!==MODEL_VERSION)throw new Error(`Expected a ${MODEL_VERSION} recording.`);
  validateState(data.state);if(data.reference!==null){validateState(data.reference);if(data.reference.time!==data.state.time)throw new Error('Comparison time does not match the run.');}
  return data as unknown as Recording;
}
