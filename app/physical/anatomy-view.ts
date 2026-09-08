import {SYSTEMS,type Atlas,type Part,type SystemId} from '../anatomy';
import type {Organ} from '../simulation/types';

export type AnatomyPreset='dissection'|'organs'|'muscles'|'skeleton'|'vessels'|'nerves'|'surface';
export type AnatomyRegion='body'|'torso'|'head'|'abdomen'|'selection';
export type AnatomyAngle='front'|'oblique'|'back'|'side';
export const presets:{id:AnatomyPreset;name:string;description:string}[]=[
 {id:'dissection',name:'Dissection',description:'Open anterior body wall · organs in their source positions'},
 {id:'organs',name:'Organs',description:'Viscera, airways and glands · surrounding skeleton for orientation'},
 {id:'muscles',name:'Muscles',description:'Superficial and deep muscle geometry · rotate to see attachments'},
 {id:'skeleton',name:'Skeleton',description:'Bones, cartilage and connective structures'},
 {id:'vessels',name:'Vessels',description:'Source arterial and venous geometry · no inferred junctions'},
 {id:'nerves',name:'Nerves',description:'Brain, spinal cord and available peripheral nerves'},
 {id:'surface',name:'Surface',description:'Adult male body surface · source proportions'},
];
export const organNames:Record<Organ,string>={heart:'Heart',brain:'Brain',lungs:'Lungs',liver:'Liver',gut:'Gut',kidneys:'Kidneys',muscle:'Muscle',skin:'Skin',adipose:'Adipose',endocrine:'Endocrine'};
export interface AnatomyIndex {groups:Record<Organ,Set<string>>;system:Map<string,SystemId>;organ:Map<string,Organ>}
export function createAnatomyIndex(atlas:Atlas):AnatomyIndex {
 const concepts=(...names:string[])=>new Set(atlas.concepts.filter(c=>names.includes(c.name.toLowerCase())).flatMap(c=>c.elements));
 const groups:Record<Organ,Set<string>>={heart:concepts('heart'),brain:concepts('brain'),lungs:concepts('left lung','right lung','trachea'),liver:concepts('liver'),gut:new Set(),kidneys:concepts('kidney'),muscle:new Set(),skin:concepts('skin'),adipose:new Set(),endocrine:concepts('pituitary gland','pineal body','pancreas','left adrenal gland','right adrenal gland')};
 // Source concept aggregation omits the ventricular wall from the compound heart.
 // These corrections preserve the source identity and geometry of every mesh.
 groups.heart.add('FJ2428');
 const system=new Map<string,SystemId>(),organ=new Map<string,Organ>();
 for(const p of atlas.parts){
  let s=p.system;
  if(/^Hepatovenous segment /i.test(p.name)){s='digestive';groups.liver.add(p.id);}
  if(/^(Third ventricle|Fourth ventricle|Left lateral ventricle|Right lateral ventricle|Interventricular foramen)$/i.test(p.name)){s='nervous';groups.brain.add(p.id);}
  if(groups.heart.has(p.id)&&s==='muscular')s='cardiac';
  system.set(p.id,s);
  if(s==='digestive'&&!groups.liver.has(p.id))groups.gut.add(p.id);
  if(s==='muscular')groups.muscle.add(p.id);
  if(s==='endocrine')groups.endocrine.add(p.id);
 }
 for(const id of ['muscle','skin','gut','endocrine','liver','lungs','heart','brain','kidneys'] as Organ[])for(const p of groups[id])organ.set(p,id);
 return {groups,system,organ};
}
export function tissueColor(part:Part,index:AnatomyIndex):string {
 const n=part.name.toLowerCase(),s=index.system.get(part.id)!;
 if(s==='arterial')return '#ba383d';
 if(s==='venous')return /portal/.test(n)?'#775185':'#416caa';
 if(index.groups.liver.has(part.id))return /duct|biliary/.test(n)?'#7b9160':'#8b4645';
 if(index.groups.brain.has(part.id))return /ventricle|aqueduct|foramen/.test(n)?'#9db8c3':/white matter/.test(n)?'#ead3bb':'#cd9c93';
 if(s==='cardiac')return /valve|leaflet|cusp/.test(n)?'#e5c9ae':/cavity/.test(n)?'#9a3c45':'#9c4448';
 if(s==='skeletal')return /cartilage/.test(n)?'#b9ccc7':'#e5d8b9';
 if(s==='muscular')return '#a74f4e';
 if(s==='nervous')return '#d8b879';
 if(s==='urinary')return /kidney/.test(n)?'#a55d52':'#ddb08d';
 if(s==='digestive')return /pancrea/.test(n)?'#d2ad6d':/gallbladder|bile|biliary/.test(n)?'#718b52':/colon|rectum/.test(n)?'#bd8d7b':'#d3a18b';
 if(s==='respiratory')return part.id.startsWith('BP3D3-')?'#c7878c':'#d2c6ac';
 if(s==='integumentary')return /hair|eyebrow/.test(n)?'#483a35':/lip/.test(n)?'#ad7470':'#c79e86';
 if(s==='sensory')return /lens|cornea|sclera/.test(n)?'#e7e5dd':'#b4a699';
 return SYSTEMS.find(x=>x.id===s)?.color??'#b6b5a0';
}
export interface PhysicalViewState {preset:AnatomyPreset;region:AnatomyRegion;angle:AnatomyAngle;selected:string[];isolate:boolean;context:number;cut:'none'|'sagittal'|'coronal'|'axial';slice:number;reset:number;focus:number;hidden:string[]}
export function partOpacity(p:Part,index:AnatomyIndex,state:PhysicalViewState):number {
 if(state.hidden.includes(p.id))return 0;
 const selected=state.selected.includes(p.id),s=index.system.get(p.id)!,preset=state.preset;
 if(state.isolate)return selected?1:0;
 if(preset==='surface')return s==='integumentary'||s==='sensory'?1:0;
 if(preset==='skeleton')return s==='skeletal'||s==='connective'?1:0;
 if(preset==='muscles')return ['muscular','skeletal','connective','sensory'].includes(s)?1:0;
 if(p.id.startsWith('BP3D3-'))return preset==='dissection'?.68:preset==='organs'?.84:0;
 if(preset==='vessels')return s==='arterial'||s==='venous'||index.groups.heart.has(p.id)?1:s==='skeletal'?state.context*.25:0;
 if(preset==='nerves')return s==='nervous'||s==='endocrine'?1:s==='skeletal'?state.context*.22:0;
 if(s==='integumentary'||s==='connective')return 0;
 if(s==='skeletal')return preset==='organs'?state.context*.3:1;
 if(s==='muscular')return /^diaphragm$/i.test(p.name)&&preset==='organs'?.65:preset==='dissection'?1:0;
 if(s==='nervous')return index.groups.brain.has(p.id)?1:.65;
 return 1;
}
/** Display cutaway removes only the anterior wall; it does not move the organs. */
export function cutawayAt(x:number,y:number,z:number,system:SystemId,state:PhysicalViewState):boolean {
 if(state.isolate||state.preset!=='dissection')return false;
 if(system==='skeletal'&&y>1.585)return true;
 if(system==='muscular')return y>1.49|| (y>.84&&y<1.49&&Math.abs(x)<.19&&z>-.065);
 if(system==='skeletal')return y>.93&&y<1.45&&Math.abs(x)<.18&&z>.025;
 return false;
}
