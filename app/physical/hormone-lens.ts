import {HORMONES,type BodyState,type Hormone,type Organ} from '../simulation/types';
import type {BloodLevels} from './body-lens';
import type {Bed} from './vessel-flow';

/**
 * Hormones on the body. The model carries each hormone in every blood compartment, released into
 * its gland's own vein and cleared as it circulates. The view shows three things:
 * the gland pulses while it releases more than at rest, coloured dots ride the blood at a density
 * that follows the hormone's level in that vessel, and the organs it acts on light up as it rises.
 *
 * Nine hormones each get their own colour; the name is always written beside it.
 */
export const HORMONE_COLOUR:Record<Hormone,string>={
 insulin:'#ffc21a',glucagon:'#4b8dff',glp1:'#2fc58a',epinephrine:'#ff5a2b',cortisol:'#ef5fa7',
 thyroid:'#a58cff',adh:'#2ccbe0',aldosterone:'#d79a52',melatonin:'#e4e1ff',
};

/** Atlas structures that release a hormone, matched by part name. */
export const GLANDS={
 pancreas:{name:'Pancreas',match:/^(pancreas|parenchyma of pancreas)$/i},
 intestine:{name:'Small intestine',match:/^(duodenum|.* part of (jejunum|ileum))$/i},
 adrenal:{name:'Adrenal glands',match:/^(left|right) adrenal gland$/i},
 thyroid:{name:'Thyroid',match:/(lobe|isthmus) of thyroid gland$/i},
 pituitary:{name:'Pituitary',match:/^pituitary gland$/i},
 pineal:{name:'Pineal',match:/^pineal body$/i},
} as const;
export type Gland=keyof typeof GLANDS;
export const GLAND_OF:Record<Hormone,Gland>={
 insulin:'pancreas',glucagon:'pancreas',glp1:'intestine',epinephrine:'adrenal',cortisol:'adrenal',
 thyroid:'thyroid',adh:'pituitary',aldosterone:'adrenal',melatonin:'pineal',
};
/** What each hormone acts on: body organs, or a gland (GLP-1 acts on the pancreas). */
export type Site=Organ|Gland;
export const TARGETS:Record<Hormone,Site[]>={
 insulin:['muscle','liver'],glucagon:['liver'],glp1:['pancreas'],epinephrine:['heart','liver','muscle'],
 cortisol:['liver'],thyroid:['heart','muscle'],adh:['kidneys'],aldosterone:['kidneys'],melatonin:['brain'],
};

/** How far a level is from rest: 0 at rest, 1 at double or more, -1 at half or less. */
export const departure=(level:number)=>level>0?Math.max(-1,Math.min(1,Math.log2(level))):-1;
/** How hard a gland is releasing above rest, 0 to 1: full at four times its resting release. */
export const glandDrive=(s:BodyState,h:Hormone)=>Math.max(0,Math.min(1,Math.log2(Math.max(1e-9,s.secretion[h]))/2));
/** How strongly an organ is being acted on, 0 to 1: the hormone's arterial rise, as the model's effects use it. */
export const targetDrive=(s:BodyState,h:Hormone)=>Math.max(0,departure(s.hormones[h]));
/** An organ lights once a hormone acting on it is this far above rest (0.3: about a quarter higher). Smaller drifts, such as ADH creeping up in an hour without a drink, stay unlit. */
export const TARGET_LIT=.3;

/**
 * Share of blood dots drawn as a hormone at resting arterial level: small with all nine shown, so
 * the body at rest is mostly plain blood; larger when one is followed. Real molecules are far too
 * few to see at any zoom.
 */
export const DOTS_AT_REST={all:.006,one:.03};
/** Share of dots for a hormone at `level` against resting arterial blood, before the shares are fitted into one. */
export const dotShare=(level:number,atRest:number)=>Math.min(.7,atRest*Math.max(0,level));

const PERIPHERAL:Organ[]=['muscle','skin','adipose','endocrine'];
/** A hormone's level in the blood each vessel circuit and bed carries, on the scale of resting arterial blood. */
export function hormoneLevels(s:BodyState,h:Hormone):BloodLevels{
 const blood=s.hormoneBlood[h],flow=(id:Organ)=>s.flows.find(f=>f.id===id)?.flow??0,total=PERIPHERAL.reduce((a,id)=>a+flow(id),0);
 const peripheral=total>0?PERIPHERAL.reduce((a,id)=>a+flow(id)*blood[`${id}-blood`],0)/total:blood['muscle-blood'];
 const bed:Record<Bed,number>={heart:blood['heart-blood'],brain:blood['brain-blood'],kidneys:blood['kidneys-blood'],gut:blood['gut-blood'],liver:blood['liver-blood'],hepatic:blood['liver-blood'],peripheral,lungs:blood['lungs-blood']};
 return {arterial:blood.arterial,venous:blood.venous,lungs:blood['lungs-blood'],portal:blood.portal,gut:blood['gut-blood'],bed};
}

/**
 * Running shares of blood dots per vessel segment: for segment k, entries [k*n, k*n+n) climb
 * through the `n` shown hormones' shares, given each hormone's level per segment. When the shares
 * add up past 0.85 they are scaled down together, so some plain blood always shows.
 */
export function dotShares(levels:readonly ArrayLike<number>[],segments:number){
 const n=levels.length,out=new Float32Array(segments*n),atRest=n===1?DOTS_AT_REST.one:DOTS_AT_REST.all;
 for(let k=0;k<segments;k++){
  let total=0;for(let i=0;i<n;i++)total+=dotShare(levels[i][k],atRest);
  const scale=total>.85?.85/total:1;let at=0;
  for(let i=0;i<n;i++){at+=dotShare(levels[i][k],atRest)*scale;out[k*n+i]=at;}
 }
 return out;
}
/** Which of the `n` shown hormones a dot with fixed random number `u` shows in segment k, or -1 for plain blood. */
export function dotHormone(u:number,shares:Float32Array,k:number,n:number){
 for(let i=0;i<n;i++)if(u<shares[k*n+i])return i;
 return -1;
}
/** A fixed random number in [0, 1) for a dot, from its running number and its vessel. */
export const dotRandom=(number:number,segment:number)=>{const x=Math.sin(number*12.9898+segment*78.233)*43758.5453;return x-Math.floor(x);};

/** Hormones ordered by how far each gland is from its resting release, furthest first. */
export const mostActive=(s:BodyState)=>[...HORMONES].sort((a,b)=>Math.abs(Math.log2(s.secretion[b]))-Math.abs(Math.log2(s.secretion[a])));
export const levelText=(level:number)=>level>=.95&&level<=1.05?'at rest':`${level.toFixed(level<10?1:0)}× rest`;
