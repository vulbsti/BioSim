import type {Atlas,Concept} from './anatomy';
import {createAnatomyIndex} from './physical/anatomy-view';
/** Merge additive source geometry without replacing or duplicating any original mesh. */
export function combineAtlases(base:Atlas,addition:Atlas):Atlas {
 const ids=new Set(base.parts.map(p=>p.id));
 for(const p of addition.parts){if(ids.has(p.id))throw new Error(`Duplicate anatomy source mesh: ${p.id}`);ids.add(p.id);}
 const concepts=new Map<string,Concept>(base.concepts.map(c=>[c.id,{...c,elements:[...c.elements]}]));
 for(const c of addition.concepts){const previous=concepts.get(c.id);concepts.set(c.id,previous?{...previous,elements:[...new Set([...previous.elements,...c.elements])]}:{...c,elements:[...c.elements]});}
 const merged:Atlas={...base,version:'BodyParts3D 4.0 + 4.3 additions',parts:[...base.parts.map(p=>({...p})),...addition.parts.map(p=>({...p,chunk:p.chunk+base.chunks.length}))],concepts:[...concepts.values()],chunks:[...base.chunks,...addition.chunks],triangles:base.triangles+addition.triangles};
 const index=createAnatomyIndex(merged);
 for(const p of merged.parts)p.system=index.system.get(p.id)!;
 // Explicit curated corrections are documented; do not change the archived manifest.
 for(const [name,group] of [['heart',index.groups.heart],['brain',index.groups.brain],['liver',index.groups.liver]] as const){const c=merged.concepts.find(c=>c.name===name);if(c)c.elements=[...new Set([...c.elements,...group])];}
 return merged;
}
export async function loadAtlas(signal?:AbortSignal):Promise<Atlas>{
 const [base,addition]=await Promise.all(['/models/atlas.json','/models/expansion.json'].map(async url=>{const r=await fetch(url,{signal});if(!r.ok)throw new Error('The anatomy catalogue could not be loaded.');return r.json() as Promise<Atlas>;}));
 return combineAtlases(base,addition);
}
