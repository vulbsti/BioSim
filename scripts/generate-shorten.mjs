// Mechanical translation of the archived PMR C export; equations are not hand-edited.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),source=new URL('models/shorten2007/source/shorten2007.c',root);
const text=await readFile(source,'utf8'),sha=createHash('sha256').update(text).digest('hex');
function body(name){
 const match=text.match(new RegExp(`\\n${name}\\([^]*?\\n\\{\\n([^]*?)\\n\\}`));
 if(!match)throw new Error(`Missing ${name}`);
 for(const line of match[1].split('\n'))if(!/^(CONSTANTS|STATES|RATES|ALGEBRAIC)\[\d+\] = [^;]+;$/.test(line))throw new Error('Unexpected source statement');
 return match[1].replace(/\bpow\(/g,'Math.pow(').replace(/\bexp\(/g,'Math.exp(').replace(/\blog\(/g,'Math.log(').replace(/\bM_PI\b/g,'Math.PI');
}
const labels=[...text.matchAll(/\* STATES\[(\d+)\] is (.+)\./g)].map(([,index,label])=>({index:Number(index),label})).sort((a,b)=>a.index-b.index);
if(labels.length!==56)throw new Error('Missing state definitions');
const output=`/** Generated from PMR Shorten et al. 2007 fast-twitch export, CC BY 3.0.
 * Source changeset 33944b1d8ee3227ebd32df9a7b1116c649632145.
 * C SHA256 ${sha}. See models/shorten2007/README.md.
 * Retains source units: milliseconds, millivolts and mixed concentration units.
 * Do not edit; run node scripts/generate-shorten.mjs.
 */
export const SHORTEN_SOURCE_HASH='${sha}';
export const SHORTEN_STATE_LABELS=${JSON.stringify(labels,null,2)};
export function initialShorten(){
 const CONSTANTS=new Float64Array(105),STATES=new Float64Array(56);
${body('initConsts')}
 return {constants:CONSTANTS,states:STATES};
}
export function shortenRates(VOI:number,CONSTANTS:Float64Array,RATES:Float64Array,STATES:Float64Array,ALGEBRAIC:Float64Array){
${body('computeRates')}
}
`;
await mkdir(new URL('app/tissue/generated/',root),{recursive:true});
await writeFile(new URL('app/tissue/generated/shorten.ts',root),output);
console.log(JSON.stringify({sourceSHA256:sha,states:labels.length,output:'app/tissue/generated/shorten.ts'}));
