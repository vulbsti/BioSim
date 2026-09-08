/// <reference lib="webworker" />
import {advance, applyAction, createBody, schedule, MODEL_VERSION} from './engine';
import {scenarios} from './scenarios';
import type {Action, BodyState} from './types';
import {parseRecording} from './recording';

let state=createBody(), running=false, speed=120, fraction=0;
let reference:BodyState|null=null;
function publish(error?:string){self.postMessage({state,running,speed,reference:reference?.history??null,error});}
function tick(seconds:number){advance(state,seconds);if(reference)advance(reference,seconds);}
self.onmessage=(e:MessageEvent)=>{
  try {
    const m=e.data;
    switch(m.type) {
      case 'init':break;
      case 'run':running=!!m.running;break;
      case 'speed':if(![1,30,120,600,3600].includes(m.speed))throw new Error('Unsupported playback speed.');speed=m.speed;fraction=0;break;
      case 'advance':running=false;tick(m.seconds);break;
      case 'action':applyAction(state,m.action as Action,m.label);break;
      case 'schedule':schedule(state,m.at,m.action as Action,m.label);advance(state,0);break;
      case 'cancel':state.queue=state.queue.filter(a=>a.id!==m.id);break;
      case 'scenario':{
        const scenario=scenarios.find(s=>s.id===m.id);if(!scenario)throw new Error('Unknown scenario.');
        running=false;fraction=0;state=createBody();reference=null;
        for(const event of scenario.events)schedule(state,event.at,event.action,event.label);
        advance(state,0);break;
      }
      case 'reset':state=createBody();reference=null;running=false;fraction=0;break;
      case 'import':{const saved=parseRecording(m.text);state=saved.state;reference=saved.reference;running=false;fraction=0;break;}
      case 'compare':reference=m.enabled?structuredClone(state):null;if(reference)reference.queue=[];break;
      case 'export':self.postMessage({download:{model:MODEL_VERSION,exportedAt:new Date().toISOString(),state,reference,scope:'Exploratory compartment model. Hormones are relative activities, not measured concentrations. Cerebral topology is schematic.'}});return;
      default:throw new Error('Unknown simulator command.');
    }
    publish();
  } catch(e){running=false;publish(e instanceof Error?e.message:String(e));}
};
setInterval(()=>{
  if(!running)return;
  try {fraction+=speed/4;const seconds=Math.floor(fraction);fraction-=seconds;if(seconds>0)tick(seconds);publish();}
  catch(e){running=false;publish(e instanceof Error?e.message:String(e));}
},250);
