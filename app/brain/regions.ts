import type {Atlas,Part} from '../anatomy';
import type {AnatomyIndex} from '../physical/anatomy-view';

/**
 * The brain as parts and jobs, linked many-to-many. A part is a set of atlas meshes with its anatomical name.
 * A job (moving, seeing, remembering) is carried by a few parts and helped by others; no part has only one job.
 * Links follow standard textbook neuroanatomy: Kandel et al., Principles of Neural Science (6th ed.);
 * Purves et al., Neuroscience (6th ed.); Blumenfeld, Neuroanatomy through Clinical Cases (3rd ed.).
 * They are deliberately coarse: a link means the part is a well-established player, not that it does nothing else.
 */
export type Lobe='frontal'|'parietal'|'temporal'|'occipital'|'limbic'|'deep'|'hormonal'|'brainstem'|'cerebellum'|'pathway'|'wiring'|'fluid';
export const LOBES:{id:Lobe;name:string}[]=[{id:'frontal',name:'Frontal lobe'},{id:'parietal',name:'Parietal lobe'},{id:'temporal',name:'Temporal lobe'},{id:'occipital',name:'Occipital lobe'},{id:'limbic',name:'Inner rim (limbic)'},{id:'deep',name:'Deep centre'},{id:'hormonal',name:'Hormone centre'},{id:'brainstem',name:'Brainstem'},{id:'cerebellum',name:'Cerebellum'},{id:'pathway',name:'Eye pathway'},{id:'wiring',name:'Wiring'},{id:'fluid',name:'Fluid spaces'}];
export interface BrainPart {id:string;name:string;gloss:string;lobe:Lobe;match:RegExp}
/** What fresh tissue looks like: grey matter pinkish grey, fibre tracts creamy white, the cerebellum a shade darker. Colour for meaning is added only on what you pick. */
export const TISSUE:Record<Lobe,string>={frontal:'#c99f95',parietal:'#c99f95',temporal:'#c69b92',occipital:'#c99f95',limbic:'#c49890',deep:'#bf9c90',hormonal:'#c4958a',brainstem:'#d3b6a6',cerebellum:'#b8877f',pathway:'#e2d6c3',wiring:'#e8dccb',fluid:'#a8c4cf'};
// Order matters: the first match wins, so narrow patterns come before broad ones.
export const BRAIN_PARTS:BrainPart[]=[
 {id:'precentral',name:'Precentral gyrus',gloss:'The "motor strip": a fold running over the top of the head from ear to ear. Each stretch of it maps one part of the body.',lobe:'frontal',match:/precentral gyrus/i},
 {id:'superior-frontal',name:'Superior frontal gyrus',gloss:'The top fold of the frontal lobe, along the midline.',lobe:'frontal',match:/superior frontal gyrus/i},
 {id:'middle-frontal',name:'Middle frontal gyrus',gloss:'The middle fold of the frontal lobe, behind the forehead.',lobe:'frontal',match:/middle frontal gyrus/i},
 {id:'inferior-frontal',name:'Inferior frontal gyrus',gloss:'The lowest fold of the frontal lobe, above the temple. On the left it holds Broca\'s area.',lobe:'frontal',match:/inferior frontal gyrus/i},
 {id:'orbital',name:'Orbital gyri',gloss:'The underside of the frontal lobe, resting on the eye sockets (orbitofrontal cortex).',lobe:'frontal',match:/orbital gyrus/i},
 {id:'postcentral',name:'Postcentral gyrus',gloss:'The "touch strip", just behind the motor strip. Each stretch of it maps the skin and muscles of one body part.',lobe:'parietal',match:/postcentral gyrus/i},
 {id:'superior-parietal',name:'Superior parietal lobule',gloss:'The top of the parietal lobe, near the crown of the head.',lobe:'parietal',match:/superior parietal lobule/i},
 {id:'supramarginal',name:'Supramarginal gyrus',gloss:'A fold of the lower parietal lobe that curves around the end of the side groove.',lobe:'parietal',match:/supramarginal gyrus/i},
 {id:'angular',name:'Angular gyrus',gloss:'A fold of the lower parietal lobe where it meets the temporal and occipital lobes.',lobe:'parietal',match:/angular gyrus/i},
 {id:'superior-temporal',name:'Superior temporal gyrus',gloss:'The top fold of the temporal lobe, above the ear. It holds the hearing cortex; on the left its back part is Wernicke\'s area.',lobe:'temporal',match:/superior temporal gyrus/i},
 {id:'middle-temporal',name:'Middle temporal gyrus',gloss:'The middle fold of the temporal lobe.',lobe:'temporal',match:/middle temporal gyrus/i},
 {id:'inferior-temporal',name:'Inferior temporal gyrus',gloss:'The lowest fold of the temporal lobe, on its underside edge.',lobe:'temporal',match:/inferior temporal gyrus/i},
 {id:'fusiform',name:'Fusiform gyrus',gloss:'A long fold on the underside of the temporal and occipital lobes.',lobe:'temporal',match:/fusiform gyrus/i},
 {id:'occipital',name:'Occipital lobe',gloss:'The back of the brain, above the cerebellum. It holds the visual cortex.',lobe:'occipital',match:/occipital lobe/i},
 {id:'cingulate',name:'Cingulate gyrus',gloss:'A fold that wraps around the corpus callosum on the inner face of each half.',lobe:'limbic',match:/cingulate gyrus/i},
 {id:'parahippocampal',name:'Parahippocampal gyrus',gloss:'A fold on the inner underside of the temporal lobe, next to the hippocampus.',lobe:'limbic',match:/parahippocampal gyrus/i},
 {id:'insula',name:'Insula',gloss:'A hidden lobe folded deep inside the side groove, covered by the frontal and temporal lobes.',lobe:'limbic',match:/insula/i},
 {id:'hippocampus',name:'Hippocampus',gloss:'A curled, seahorse-shaped ridge deep in each temporal lobe.',lobe:'limbic',match:/hippocamp/i},
 {id:'fornix',name:'Fornix and mammillary bodies',gloss:'An arching fibre bundle from the hippocampus ending in two small bumps under the brain.',lobe:'limbic',match:/fornix|mammillary/i},
 {id:'amygdala',name:'Amygdala',gloss:'An almond-sized cluster deep in each temporal lobe, just in front of the hippocampus.',lobe:'limbic',match:/amygdala|stria terminalis/i},
 {id:'basal-ganglia',name:'Basal ganglia',gloss:'Deep clusters on each side: the caudate, putamen and globus pallidus.',lobe:'deep',match:/caudate|putamen|globus pallidus/i},
 {id:'hypothalamus',name:'Hypothalamus',gloss:'A thumbnail-sized area under the thalamus, above the pituitary.',lobe:'hormonal',match:/hypothalamus|tuber cinereum|infundibul/i},
 {id:'thalamus',name:'Thalamus',gloss:'Two egg-shaped blocks at the very centre of the brain, including the geniculate bodies for sight and sound.',lobe:'deep',match:/^(left |right )?thalamus$|geniculate/i},
 {id:'epithalamus',name:'Pineal gland and habenula',gloss:'A pea-sized gland and a small nucleus at the back of the thalamus.',lobe:'hormonal',match:/pineal|habenula|stria medullaris/i},
 {id:'pituitary',name:'Pituitary gland',gloss:'A pea-sized gland hanging under the hypothalamus in a pocket of the skull.',lobe:'hormonal',match:/pituitary/i},
 {id:'midbrain',name:'Midbrain',gloss:'The top of the brainstem, with four small bumps (colliculi) on its back.',lobe:'brainstem',match:/midbrain|colliculus|posterior commissure/i},
 {id:'pons',name:'Pons',gloss:'The bulge in the middle of the brainstem, in front of the cerebellum.',lobe:'brainstem',match:/pons/i},
 {id:'medulla',name:'Medulla',gloss:'The bottom of the brainstem, where it becomes the spinal cord.',lobe:'brainstem',match:/medulla oblongata/i},
 {id:'cerebellum',name:'Cerebellum',gloss:'The "little brain": a finely folded ball under the back of the brain.',lobe:'cerebellum',match:/cerebellum/i},
 {id:'optic',name:'Optic nerves and tracts',gloss:'The cables from the eyes, crossing over at the optic chiasm on their way to the thalamus.',lobe:'pathway',match:/optic (nerve|chiasm|tract)/i},
 {id:'corpus-callosum',name:'Corpus callosum',gloss:'The thick band of fibres joining the left and right halves.',lobe:'wiring',match:/corpus callosum/i},
 {id:'white-matter',name:'White matter',gloss:'The bundles of nerve fibres under the folds, connecting areas to each other and to the spinal cord.',lobe:'wiring',match:/white matter|internal capsule|commissure/i},
 {id:'ventricles',name:'Ventricles',gloss:'Connected hollow spaces filled with clear fluid that cushions the brain and carries away waste.',lobe:'fluid',match:/ventricle|aqueduct|interventricular foramen|central canal/i},
];
export type Role='carries'|'helps';
export interface BrainJob {id:string;name:string;does:string;note?:string;parts:Partial<Record<string,Role>>}
export const BRAIN_JOBS:BrainJob[]=[
 {id:'move',name:'Moving on purpose',does:'Choosing a movement, starting it, sending the command down the spinal cord and correcting it as it happens.',parts:{precentral:'carries','basal-ganglia':'carries',cerebellum:'carries',thalamus:'helps','superior-frontal':'helps','middle-frontal':'helps','superior-parietal':'helps',pons:'helps',medulla:'helps'}},
 {id:'touch',name:'Touch, pain and body position',does:'Feeling touch, pain, warmth and where your limbs are, and how unpleasant a pain feels.',parts:{postcentral:'carries',thalamus:'carries','superior-parietal':'helps',insula:'helps',cingulate:'helps',midbrain:'helps',medulla:'helps'}},
 {id:'see',name:'Seeing',does:'Turning the signal from the eyes into the picture you see, and pointing the eyes at what matters.',parts:{optic:'carries',thalamus:'carries',occipital:'carries',midbrain:'helps',fusiform:'helps','inferior-temporal':'helps','superior-parietal':'helps'}},
 {id:'hear',name:'Hearing',note:'The midbrain part is the inferior colliculus, a relay for sound.',does:'Turning sound into pitch, rhythm and direction, and picking a voice out of noise.',parts:{'superior-temporal':'carries',thalamus:'carries',midbrain:'carries',pons:'helps',medulla:'helps'}},
 {id:'recognise',name:'Recognising faces, things and places',does:'Telling what you are looking at: a face, an object, a written word, a familiar place.',parts:{fusiform:'carries','inferior-temporal':'carries',occipital:'helps','middle-temporal':'helps',parahippocampal:'helps',amygdala:'helps'}},
 {id:'language',name:'Language',does:'Understanding and producing words, spoken, written and read.',note:'In most people the left half does most of this.',parts:{'inferior-frontal':'carries','superior-temporal':'carries',insula:'helps',supramarginal:'helps',angular:'helps','middle-temporal':'helps',precentral:'helps','basal-ganglia':'helps',thalamus:'helps',cerebellum:'helps'}},
 {id:'space',name:'Knowing where things are',does:'Keeping track of where things are around you and where your body is among them, so you can reach and find your way.',parts:{'superior-parietal':'carries',supramarginal:'helps',angular:'helps','middle-frontal':'helps',occipital:'helps',parahippocampal:'helps',hippocampus:'helps',midbrain:'helps'}},
 {id:'plan',name:'Planning, focus and self-control',does:'Holding a goal in mind, choosing what to do next and stopping what you no longer want to do.',parts:{'superior-frontal':'carries','middle-frontal':'carries','inferior-frontal':'carries',orbital:'helps',cingulate:'helps','basal-ganglia':'helps',thalamus:'helps',cerebellum:'helps'}},
 {id:'remember',name:'Remembering events',does:'Storing what happened, where and when, and finding it again later.',parts:{hippocampus:'carries',parahippocampal:'carries',fornix:'carries',thalamus:'helps','superior-frontal':'helps','middle-frontal':'helps',cingulate:'helps',amygdala:'helps'}},
 {id:'skills',name:'Learning skills and habits',does:'Turning practised movements and routines into automatic ones, like typing or riding a bike.',parts:{'basal-ganglia':'carries',cerebellum:'carries',precentral:'helps','superior-frontal':'helps',thalamus:'helps'}},
 {id:'emotion',name:'Fear, stress and mood',does:'Noticing danger and what matters to you, and setting off fear, stress and the feeling that goes with them.',parts:{amygdala:'carries',cingulate:'carries',orbital:'carries',insula:'helps',hypothalamus:'helps',hippocampus:'helps',midbrain:'helps',epithalamus:'helps'}},
 {id:'reward',name:'Wanting and reward',does:'Wanting things, enjoying them and learning what is worth doing again.',parts:{'basal-ganglia':'carries',orbital:'carries',midbrain:'carries',amygdala:'helps',cingulate:'helps',hypothalamus:'helps',epithalamus:'helps'}},
 {id:'interoception',name:'Feeling inside the body',does:'Sensing your heartbeat, breathing, hunger, a full bladder or a churning gut.',parts:{insula:'carries',cingulate:'helps',thalamus:'helps',medulla:'helps',hypothalamus:'helps'}},
 {id:'hormones',name:'Hormones, hunger, thirst and temperature',does:'Keeping the inside of the body steady and telling the glands which hormones to release.',parts:{hypothalamus:'carries',pituitary:'carries',epithalamus:'helps',amygdala:'helps',hippocampus:'helps',medulla:'helps'}},
 {id:'sleep',name:'Sleep and waking',does:'Switching between awake, deep sleep and dreaming, on a daily clock set by light.',note:'The daily clock itself is a tiny cluster inside the hypothalamus, just above the optic chiasm.',parts:{hypothalamus:'carries',pons:'carries',midbrain:'carries',thalamus:'carries',epithalamus:'helps',medulla:'helps'}},
 {id:'vital',name:'Heartbeat, blood pressure and breathing',does:'Setting heart rate, blood pressure and breathing without you thinking about it.',note:'The centres for heartbeat and breathing rhythm are mainly in the medulla; the pons fine-tunes breathing.',parts:{medulla:'carries',pons:'helps',hypothalamus:'helps',insula:'helps',cingulate:'helps',amygdala:'helps',midbrain:'helps'}},
 {id:'balance',name:'Balance and smooth movement',does:'Keeping you upright and making movements smooth and well timed.',parts:{cerebellum:'carries',medulla:'carries',pons:'carries',midbrain:'helps',thalamus:'helps'}},
];
export const jobsOf=(part:BrainPart)=>BRAIN_JOBS.flatMap(j=>j.parts[part.id]?[{job:j,role:j.parts[part.id]!}]:[]);
export const partsOf=(job:BrainJob)=>BRAIN_PARTS.flatMap(p=>job.parts[p.id]?[{part:p,role:job.parts[p.id]!}]:[]);
/** Meshes that sit inside the skull but are neither brain tissue nor fluid: membranes and tiny landmarks. They stay hidden. */
const NOT_SHOWN=/tentorium|lamina terminalis|interpeduncular fossa|septum of telencephalon/i;
/** Nerves to the eye muscles and face, in the orbit: kept out of the brain view until the cranial nerves are added properly. */
const ORBIT_NERVE=/ciliary|ethmoidal|frontal nerve|lacrimal|nasociliary|ophthalmic|oculomotor|trochlear|supra-orbital|supratrochlear|infratrochlear/i;
export function partOf(name:string):BrainPart|undefined {
 if(NOT_SHOWN.test(name)||ORBIT_NERVE.test(name))return;
 return BRAIN_PARTS.find(r=>r.match.test(name));
}
/** The cranial cavity in atlas metres, generous enough for the whole brain and its arteries. */
const CRANIUM={min:[-.078,1.535,-.118],max:[.078,1.715,.072]};
const inside=(p:Part)=>p.bounds[0].every((v,i)=>v>=CRANIUM.min[i])&&p.bounds[1].every((v,i)=>v<=CRANIUM.max[i]);
export interface BrainMeshes {parts:Map<string,BrainPart>;arteries:string[];skull:string[];skin:string[]}
/** Picks the brain, its arteries and the head around it out of the full body atlas, so the brain view shows the same meshes in the same place as the body. */
export function brainMeshes(atlas:Atlas,index:AnatomyIndex):BrainMeshes {
 const parts=new Map<string,BrainPart>(),arteries:string[]=[],skull:string[]=[],skin:string[]=[];
 for(const p of atlas.parts){
  const s=index.system.get(p.id)??p.system;
  // Cord and nerves registered from Z-Anatomy (ids ZA-) belong to the body nerve layer, not to the brain parts.
  if(p.id.startsWith('ZA-'))continue;
  if((s==='nervous'||s==='endocrine'||index.groups.brain.has(p.id))&&p.bounds[0][1]>1.5){const r=partOf(p.name);if(r)parts.set(p.id,r);}
  else if(s==='arterial'&&inside(p))arteries.push(p.id);
  else if(s==='skeletal'&&p.bounds[0][1]>1.5&&p.bounds[1][1]>1.6)skull.push(p.id);
  else if(s==='integumentary'&&/^skin$/i.test(p.name))skin.push(p.id);
 }
 return {parts,arteries,skull,skin};
}
