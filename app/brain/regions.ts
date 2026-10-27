import type {Atlas,Part} from '../anatomy';
import type {AnatomyIndex} from '../physical/anatomy-view';

/** A brain area named by what it does, in plain words. Each one is a set of atlas meshes, never a drawn overlay. */
export interface BrainRegion {id:string;name:string;does:string;color:string;match:RegExp}
// Order matters: the first match wins, so side-specific and narrow patterns come before broad ones.
export const BRAIN_REGIONS:BrainRegion[]=[
 {id:'speech',name:'Speaking',does:'Turns thoughts into words and moves the lips and tongue to say them. In most people this is on the left side only.',color:'#e3864f',match:/^left inferior frontal gyrus$/i},
 {id:'planning',name:'Planning and focus',does:'Holds a goal in mind, makes plans, decides what to do next and stops actions you have changed your mind about.',color:'#d9a84e',match:/(superior|middle|inferior) frontal gyrus/i},
 {id:'reward',name:'Weighing choices',does:'Compares how good or bad things are likely to be, such as food, smells and rewards, and steers decisions.',color:'#c8b35a',match:/orbital gyrus/i},
 {id:'movement',name:'Moving the body',does:'Sends the command for every voluntary movement down the spinal cord. Each strip of it controls one part of the body.',color:'#d9604f',match:/precentral gyrus/i},
 {id:'touch',name:'Touch and body sense',does:'Feels touch, pain, warmth and where your limbs are. Each strip of it maps one part of the body.',color:'#e08ea0',match:/postcentral gyrus/i},
 {id:'space',name:'Where things are',does:'Builds a map of the space around you and your body in it, so you can reach, point and find your way.',color:'#b48ad6',match:/superior parietal lobule/i},
 {id:'language',name:'Understanding words',does:'Makes sense of what you hear and read and links words to meaning.',color:'#8f7ee0',match:/posterior part of (left|right) superior temporal gyrus|supramarginal gyrus|angular gyrus/i},
 {id:'hearing',name:'Hearing',does:'Receives sound from the ears and picks out pitch, rhythm and voices.',color:'#6f9fe6',match:/superior temporal gyrus|medial geniculate|inferior colliculus/i},
 {id:'recognising',name:'Recognising things and faces',does:'Tells you what you are looking at: faces, objects, words on a page.',color:'#5bb6c9',match:/(inferior|middle) temporal gyrus|fusiform gyrus/i},
 {id:'vision',name:'Seeing',does:'Receives the signal from the eyes and builds the picture you see. The back of the brain sees, the front of the eye only collects light.',color:'#4fb38d',match:/occipital lobe|optic (nerve|chiasm|tract)|lateral geniculate|superior colliculus/i},
 {id:'memory',name:'Memory',does:'Stores new memories of events and places and later moves them into long-term storage.',color:'#86c06a',match:/hippocamp|fornix|mammillary/i},
 {id:'emotion',name:'Emotion and alarm',does:'Notices danger and things that matter to you, and sets off fear, stress and motivation.',color:'#e0556e',match:/amygdala|cingulate gyrus|stria terminalis|stria medullaris|habenula/i},
 {id:'feelings',name:'Feeling inside the body',does:'Senses what is happening inside you: heartbeat, breathing, hunger, a full bladder, a churning gut.',color:'#e98bc5',match:/insula/i},
 {id:'habits',name:'Habits and starting moves',does:'Starts and smooths movements and runs well-learned habits. Parkinson\'s disease affects this circuit.',color:'#c47b5b',match:/caudate|putamen|globus pallidus/i},
 {id:'hormones',name:'Hormones and body clock',does:'Keeps temperature, hunger, thirst and sleep in balance and tells the pituitary which hormones to release.',color:'#f0b84a',match:/hypothalamus|tuber cinereum|pituitary|pineal|infundibul/i},
 {id:'relay',name:'Relay station',does:'Every sense except smell passes through here on its way to the outer brain, which also sets how alert you are.',color:'#d7c58e',match:/thalamus/i},
 {id:'autonomic',name:'Heartbeat and breathing',does:'Runs the body without you thinking: sets heart rate, blood pressure, breathing, swallowing and alertness.',color:'#e6704a',match:/medulla oblongata|pons|midbrain|posterior commissure/i},
 {id:'balance',name:'Balance and coordination',does:'Times and smooths every movement and keeps you balanced. It learns skills like riding a bike.',color:'#9a7fcc',match:/cerebellum/i},
 {id:'wiring',name:'Wiring between areas',does:'Bundles of nerve fibres that connect the areas to each other and to the spinal cord.',color:'#efe6d6',match:/white matter|corpus callosum|internal capsule|anterior commissure/i},
 {id:'fluid',name:'Fluid spaces',does:'Hollow spaces filled with clear fluid that cushions the brain and carries away waste.',color:'#9ecbe0',match:/ventricle|aqueduct|interventricular foramen|central canal/i},
];
/** Meshes that sit inside the skull but are neither brain tissue nor fluid: membranes and tiny landmarks. They stay hidden. */
const NOT_SHOWN=/tentorium|lamina terminalis|interpeduncular fossa|septum of telencephalon/i;
/** Nerves to the eye muscles and face, in the orbit: kept out of the brain view until the cranial nerves are added properly. */
const ORBIT_NERVE=/ciliary|ethmoidal|frontal nerve|lacrimal|nasociliary|ophthalmic|oculomotor|trochlear|supra-orbital|supratrochlear|infratrochlear/i;
export function regionOf(name:string):BrainRegion|undefined {
 if(NOT_SHOWN.test(name)||ORBIT_NERVE.test(name))return;
 return BRAIN_REGIONS.find(r=>r.match.test(name));
}
/** The cranial cavity in atlas metres, generous enough for the whole brain and its arteries. */
const CRANIUM={min:[-.078,1.535,-.118],max:[.078,1.715,.072]};
const inside=(p:Part)=>p.bounds[0].every((v,i)=>v>=CRANIUM.min[i])&&p.bounds[1].every((v,i)=>v<=CRANIUM.max[i]);
export interface BrainParts {regions:Map<string,BrainRegion>;arteries:string[];skull:string[];skin:string[]}
/** Picks the brain, its arteries and the head around it out of the full body atlas, so the brain view shows the same meshes in the same place as the body. */
export function brainParts(atlas:Atlas,index:AnatomyIndex):BrainParts {
 const regions=new Map<string,BrainRegion>(),arteries:string[]=[],skull:string[]=[],skin:string[]=[];
 for(const p of atlas.parts){
  const s=index.system.get(p.id)??p.system;
  if((s==='nervous'||s==='endocrine'||index.groups.brain.has(p.id))&&p.bounds[0][1]>1.5){const r=regionOf(p.name);if(r)regions.set(p.id,r);}
  else if(s==='arterial'&&inside(p))arteries.push(p.id);
  else if(s==='skeletal'&&p.bounds[0][1]>1.5&&p.bounds[1][1]>1.6)skull.push(p.id);
  else if(s==='integumentary'&&/^skin$/i.test(p.name))skin.push(p.id);
 }
 return {regions,arteries,skull,skin};
}
