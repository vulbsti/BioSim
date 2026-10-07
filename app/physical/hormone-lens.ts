import {HORMONES,type BodyState,type Hormone} from '../simulation/types';
import {hormoneInfo} from '../simulation/endocrine';

/**
 * Hormones on the body. The model keeps one body-wide activity per hormone, as a multiple of its
 * baseline, so this view shows where each hormone comes from and acts, not where it is.
 *
 * Thirty-one hormones cannot each have a colour a reader can tell apart, so colour carries the
 * family (eight hues, checked for colour-vision deficiency against the stage background) and the
 * name is always written beside it.
 */
export const HORMONE_FAMILIES=[
 {id:'fluid',name:'Fluid and pressure',colour:'#3987e5',hormones:['adh','renin','angiotensin','aldosterone','anp']},
 {id:'stress',name:'Stress',colour:'#d95926',hormones:['epinephrine','norepinephrine','crh','acth','cortisol']},
 {id:'gut',name:'Gut',colour:'#199e70',hormones:['gastrin','secretin','cck','glp1','ghrelin']},
 {id:'glucose',name:'Glucose',colour:'#c98500',hormones:['insulin','glucagon']},
 {id:'reproductive',name:'Reproductive',colour:'#d55181',hormones:['gnrh','lh','fsh','testosterone','inhibin']},
 {id:'growth',name:'Growth, sleep and stores',colour:'#008300',hormones:['gh','igf1','leptin','melatonin']},
 {id:'thyroid',name:'Thyroid',colour:'#9085e9',hormones:['trh','tsh','thyroid']},
 {id:'calcium',name:'Calcium',colour:'#e66767',hormones:['pth','calcitriol']},
] as const satisfies readonly {id:string;name:string;colour:string;hormones:readonly Hormone[]}[];
export const familyOf=Object.fromEntries(HORMONE_FAMILIES.flatMap((f,i)=>f.hormones.map(h=>[h,i]))) as Record<Hormone,number>;

/** Structures of the atlas a hormone is released from or acts on, matched by part name. */
export const HORMONE_SITES={
 hypothalamus:{name:'Hypothalamus',match:/^(hypothalamus|tuber cinereum)$/i},
 pituitary:{name:'Pituitary',match:/^pituitary gland$/i},
 pineal:{name:'Pineal',match:/^pineal body$/i},
 thyroid:{name:'Thyroid',match:/(lobe|isthmus) of thyroid gland$/i},
 parathyroid:{name:'Parathyroids',match:/parathyroid gland$/i},
 adrenal:{name:'Adrenals',match:/^(left|right) adrenal gland$/i},
 pancreas:{name:'Pancreas',match:/^(pancreas|parenchyma of pancreas)$/i},
 kidney:{name:'Kidneys',match:/^(left|right) kidney$/i},
 stomach:{name:'Stomach',match:/^stomach$/i},
 intestine:{name:'Small intestine',match:/^(duodenum|.* part of (jejunum|ileum))$/i},
 liver:{name:'Liver',match:/^(liver|.* lobe of liver)$/i},
 atria:{name:'Atria',match:/^wall of (left|right) atrium$/i},
 heart:{name:'Ventricles',match:/^wall of ventricle$/i},
 testes:{name:'Testes',match:/^(left|right) testis$/i},
} as const;
export type HormoneSite=keyof typeof HORMONE_SITES;
/**
 * Where each hormone is released, and the listed structures it acts on, following the model's own
 * source and target descriptions. Fat, muscle, bone, vessels and nerves have no single structure
 * here, so hormones from or for them show only what the atlas can point at.
 */
export const HORMONE_ROUTES:Record<Hormone,{from:HormoneSite[];to:HormoneSite[]}>={
 insulin:{from:['pancreas'],to:['liver']},glucagon:{from:['pancreas'],to:['liver']},
 epinephrine:{from:['adrenal'],to:['heart','liver']},norepinephrine:{from:['adrenal'],to:['heart']},
 crh:{from:['hypothalamus'],to:['pituitary']},acth:{from:['pituitary'],to:['adrenal']},cortisol:{from:['adrenal'],to:['liver','hypothalamus','pituitary']},
 trh:{from:['hypothalamus'],to:['pituitary']},tsh:{from:['pituitary'],to:['thyroid']},thyroid:{from:['thyroid'],to:[]},
 adh:{from:['hypothalamus','pituitary'],to:['kidney']},renin:{from:['kidney'],to:[]},angiotensin:{from:[],to:['adrenal']},aldosterone:{from:['adrenal'],to:['kidney']},anp:{from:['atria'],to:['kidney']},
 gastrin:{from:['stomach'],to:['stomach']},secretin:{from:['intestine'],to:['pancreas']},cck:{from:['intestine'],to:['pancreas','stomach']},glp1:{from:['intestine'],to:['pancreas','stomach']},ghrelin:{from:['stomach'],to:['hypothalamus']},
 leptin:{from:[],to:['hypothalamus']},melatonin:{from:['pineal'],to:[]},gh:{from:['pituitary'],to:['liver']},igf1:{from:['liver'],to:[]},
 gnrh:{from:['hypothalamus'],to:['pituitary']},lh:{from:['pituitary'],to:['testes']},fsh:{from:['pituitary'],to:['testes']},testosterone:{from:['testes'],to:['hypothalamus','pituitary']},inhibin:{from:['testes'],to:['pituitary']},
 pth:{from:['parathyroid'],to:['kidney']},calcitriol:{from:['kidney'],to:[]},
};

/** How far a hormone is from its baseline: 0 at baseline, 1 at double or half. Signed. */
export const departure=(level:number)=>level>0?Math.max(-1,Math.min(1,Math.log2(level))):-1;
export type SiteShade={hormone:Hormone;family:number;strength:number;role:'source'|'target'};
/**
 * What each structure shows. With no hormone chosen, a structure shows the hormone it releases
 * that is furthest from baseline. With one chosen, its sources show it at full strength and its
 * targets at part strength, and everything else is left plain.
 */
export function hormoneShades(s:BodyState,chosen:Hormone|null):Partial<Record<HormoneSite,SiteShade>>{
 const shades:Partial<Record<HormoneSite,SiteShade>>={};
 if(chosen){
  const route=HORMONE_ROUTES[chosen],strength=Math.max(.35,Math.abs(departure(s.hormones[chosen])));
  for(const site of route.to)shades[site]={hormone:chosen,family:familyOf[chosen],strength:strength*.7,role:'target'};
  for(const site of route.from)shades[site]={hormone:chosen,family:familyOf[chosen],strength,role:'source'};
  return shades;
 }
 for(const hormone of HORMONES)for(const site of HORMONE_ROUTES[hormone].from){
  const strength=Math.abs(departure(s.hormones[hormone]));
  if(!shades[site]||strength>shades[site]!.strength)shades[site]={hormone,family:familyOf[hormone],strength,role:'source'};
 }
 return shades;
}
/** Hormones ordered by how far each is from baseline, furthest first. */
export const mostChanged=(s:BodyState)=>[...HORMONES].sort((a,b)=>Math.abs(departure(s.hormones[b]))-Math.abs(departure(s.hormones[a])));
export const hormoneLabel=(s:BodyState,h:Hormone)=>`${hormoneInfo[h].name} ${s.hormones[h].toFixed(2)}×`;
