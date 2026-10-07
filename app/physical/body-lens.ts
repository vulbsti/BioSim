import {Color} from 'three';
import {NUTRIENTS,type BodyState,type Nutrient,type Organ,type Substance} from '../simulation/types';
import type {Bed} from './vessel-flow';

/** What the body view colours by: vessel speed only, one transported substance, the latest meal's carbohydrate, or hormones by family. */
export type Lens='flow'|Substance|'meal'|'hormones';
export const lenses:{id:Lens;name:string;unit:string}[]=[{id:'flow',name:'Flow speed',unit:''},{id:'glucose',name:'Glucose',unit:'g'},{id:'oxygen',name:'Oxygen',unit:'mL'},{id:'carbonDioxide',name:'Carbon dioxide',unit:'mL'},{id:'aminoAcids',name:'Amino acids',unit:'g'},{id:'lipids',name:'Lipids',unit:'g'},{id:'meal',name:'This meal',unit:'g'},{id:'hormones',name:'Hormones',unit:''}];
/** Where a marked meal can be, in the order it travels. */
export const fates=['stomach','intestine','blood','tissues','stored','burned','excreted'] as const;
export type Fate=(typeof fates)[number];
export const nutrientNames:Record<Nutrient,string>={glucose:'Carbohydrate',aminoAcids:'Protein',lipids:'Fat'};
export type BloodLevels={bed:Record<Bed,number>;arterial:number;venous:number;lungs:number;portal:number;gut:number};
const PERIPHERAL:Organ[]=['muscle','skin','adipose','endocrine'],COOL=new Color('#3f78ff'),REST=new Color('#ece7dc'),WARM=new Color('#ffa516');

/**
 * Signed display value of a concentration ratio: 0 at the reference, +1 at double, -1 at half.
 * A log scale, so a doubling and a halving read as equally strong.
 */
export const tint=(ratio:number)=>ratio>0&&Number.isFinite(ratio)?Math.max(-1,Math.min(1,Math.log2(ratio))):-1;
export function tintColor(t:number,out:Color){return out.copy(REST).lerp(t>0?WARM:COOL,Math.abs(t));}

/**
 * Reads the body model's well-mixed compartments for display. Blood is compared with resting
 * arterial blood, so arteries, veins and the portal vein share one scale and their differences
 * show what each organ took up or added. An organ is compared with its own resting level.
 */
export function createBodyLens(rest:BodyState){
 const amount=(s:BodyState,id:string,x:Substance)=>{const c=s.transport.compartments[id];return c?c.amounts[x]/c.volume:0;};
 const blood=(s:BodyState,id:string,x:Substance)=>amount(s,id,x)/amount(rest,'arterial',x);
 /** Substance levels in the blood compartment each vessel circuit and bed carries. */
 const levels=(s:BodyState,x:Substance):BloodLevels=>{
  const flow=(id:Organ)=>s.flows.find(f=>f.id===id)?.flow??0,total=PERIPHERAL.reduce((a,id)=>a+flow(id),0);
  // Veins draining the lumped peripheral bed carry its organs' blood mixed in proportion to flow.
  const peripheral=total>0?PERIPHERAL.reduce((a,id)=>a+flow(id)*blood(s,`${id}-blood`,x),0)/total:blood(s,'muscle-blood',x);
  return {arterial:blood(s,'arterial',x),venous:blood(s,'venous',x),lungs:blood(s,'lungs-blood',x),portal:blood(s,'portal',x),gut:blood(s,'gut-blood',x),
   bed:{heart:blood(s,'heart-blood',x),brain:blood(s,'brain-blood',x),kidneys:blood(s,'kidneys-blood',x),gut:blood(s,'gut-blood',x),liver:blood(s,'liver-blood',x),hepatic:blood(s,'liver-blood',x),peripheral,lungs:blood(s,'lungs-blood',x)}};
 };
 /** An organ's level against its own resting level: tissue where the model tracks it, else its blood. */
 const organ=(s:BodyState,id:Organ,x:Substance)=>{
  const where=amount(rest,`${id}-tissue`,x)>0?`${id}-tissue`:`${id}-blood`,resting=amount(rest,where,x);
  return resting>0?amount(s,where,x)/resting:1;
 };
 /**
  * Net amount an organ's tissue takes from its blood, per minute (negative: it releases). Read from
  * the transport step's own blood-to-tissue exchange records, which cover one simulated second.
  */
 const uptake=(s:BodyState,id:Organ,x:Substance)=>{
  // Gases are consumed and produced inside the tissue model, which reports them per minute.
  const gas=s.transport.metabolism[id];
  if(x==='oxygen')return gas?.oxygen??0;
  if(x==='carbonDioxide')return -(gas?.carbonDioxide??0);
  let net=0;
  for(const f of s.transport.fluxes){
   if(f.substance!==x||f.mechanism!=='exchange')continue;
   if(f.from===`${id}-blood`&&f.to===`${id}-tissue`)net+=f.amount;
   if(f.from===`${id}-tissue`&&f.to===`${id}-blood`)net-=f.amount;
  }
  return net*60;
 };
 const marked=(s:BodyState,id:string)=>{const c=s.transport.compartments[id];return c?s.transport.mark.pools[id].glucose/c.volume:0;};
 const meal=(s:BodyState,id:string)=>marked(s,id)/amount(rest,'arterial','glucose');
 /**
  * The latest meal's glucose in each blood compartment, as a multiple of resting arterial glucose:
  * 0 where none has arrived, 1 where the meal alone supplies as much as resting blood holds.
  */
 const mealLevels=(s:BodyState):BloodLevels=>{
  const flow=(id:Organ)=>s.flows.find(f=>f.id===id)?.flow??0,total=PERIPHERAL.reduce((a,id)=>a+flow(id),0);
  const peripheral=total>0?PERIPHERAL.reduce((a,id)=>a+flow(id)*meal(s,`${id}-blood`),0)/total:meal(s,'muscle-blood');
  return {arterial:meal(s,'arterial'),venous:meal(s,'venous'),lungs:meal(s,'lungs-blood'),portal:meal(s,'portal'),gut:meal(s,'gut-blood'),
   bed:{heart:meal(s,'heart-blood'),brain:meal(s,'brain-blood'),kidneys:meal(s,'kidneys-blood'),gut:meal(s,'gut-blood'),liver:meal(s,'liver-blood'),hepatic:meal(s,'liver-blood'),peripheral,lungs:meal(s,'lungs-blood')}};
 };
 /** The meal's glucose in an organ's tissue, as a multiple of that tissue's resting glucose. */
 const mealOrgan=(s:BodyState,id:Organ)=>{
  const where=amount(rest,`${id}-tissue`,'glucose')>0?`${id}-tissue`:`${id}-blood`,resting=amount(rest,where,'glucose');
  return resting>0?marked(s,where)/resting:0;
 };
 /** Grams of the meal's carbohydrate an organ holds now, in its blood, tissue and cells. */
 const mealHeld=(s:BodyState,id:Organ)=>Object.values(s.transport.compartments).reduce((a,c)=>a+(c.organ===id?s.transport.mark.pools[c.id].glucose:0),0);
 /** Grams of each of the meal's nutrients in each place. Every row sums to what the meal contained. */
 const mealFate=(s:BodyState)=>{
  const p=s.transport.mark.pools,sum=(kind:'blood'|'tissue',key:Nutrient)=>Object.values(s.transport.compartments).reduce((a,c)=>a+((kind==='blood'?c.kind!=='tissue':c.kind==='tissue')?p[c.id][key]:0),0);
  return Object.fromEntries(NUTRIENTS.map(key=>[key,{stomach:p.stomach[key],intestine:p['intestinal lumen'][key],blood:sum('blood',key),tissues:sum('tissue',key),stored:p['hepatic glycogen'][key]+p['fat reserve'][key]+p['protein reserve'][key],burned:p['oxidized substrate'][key]+p.gluconeogenesis[key],excreted:p.urine[key]}])) as Record<Nutrient,Record<Fate,number>>;
 };
 /** Share of the meal's carbohydrate still inside the stomach and the small intestine, 0 to 1. */
 const mealLumen=(s:BodyState)=>{const m=s.transport.mark,eaten=m.eaten.glucose;return eaten>0?{stomach:m.pools.stomach.glucose/eaten,intestine:m.pools['intestinal lumen'].glucose/eaten}:{stomach:0,intestine:0};};
 return {levels,organ,uptake,mealLevels,mealOrgan,mealHeld,mealFate,mealLumen};
}
export type BodyLens=ReturnType<typeof createBodyLens>;
