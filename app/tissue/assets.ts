export const LEVELS=['muscle','fascicle','fiber','sarcomere'] as const;
export type TissueLevel=typeof LEVELS[number];
export type TissueLOD='context'|'detail';
export type TissueEntity={id:string;name:string;kind:string;level:TissueLevel;description:string;evidence:'source-surface'|'representative';representedCount?:number;diameterM?:number;sourceConcept?:string};
export type Representation={url:string;bytes:number;sha256:string;triangles:number;entities:string[]};
export type TissueManifest={id:string;version:string;status:string;metersPerAssetUnit:number;sourceSpace:string;levels:Record<TissueLevel,{spanM:number;description:string;localToAtlasTranslationM?:number[];layout?:{fiberCentersM:number[][];capillaryCentersM:number[][];fiberRadiusM:number;capillaryRadiusM:number};representations:Record<TissueLOD,Representation>}>;entities:TissueEntity[];provenance:{blenderVersion:string;license:string;referenceURL:string;registration:string}};
export function validateManifest(value:unknown):asserts value is TissueManifest {
 const m=value as TissueManifest;
 if(!m||m.id!=='muscle-pilot'||m.version!=='0.2.0'||m.metersPerAssetUnit!==1||!Array.isArray(m.entities)||!m.levels||!m.provenance)throw new Error('Unsupported tissue package or physical scale.');
 const ids=new Set<string>();
 for(const e of m.entities){if(!e.id||ids.has(e.id)||!LEVELS.includes(e.level)||!['source-surface','representative'].includes(e.evidence)||!e.description)throw new Error('Invalid tissue entity contract.');ids.add(e.id);}
 for(const level of LEVELS){
  const data=m.levels[level];if(!data||!Number.isFinite(data.spanM)||data.spanM<=0||!data.representations)throw new Error('Invalid tissue dimensions.');
  for(const lod of ['context','detail'] as const){
   const r=data.representations[lod];
   if(!r||r.url!==`/models/multiscale/muscle-pilot/${level}-${lod}.glb`||!Number.isInteger(r.bytes)||r.bytes<100||r.bytes>6_000_000||!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isInteger(r.triangles)||r.triangles<=0||r.triangles>180000||!Array.isArray(r.entities)||r.entities.some(id=>!ids.has(id)||m.entities.find(e=>e.id===id)!.level!==level))throw new Error('Tissue asset exceeds its admitted contract.');
  }
  const a=[...data.representations.context.entities].sort(),b=[...data.representations.detail.entities].sort();if(new Set(a).size!==a.length||JSON.stringify(a)!==JSON.stringify(b))throw new Error('Entity identity changed across detail levels.');
 }
}
export async function loadTissueManifest(signal?:AbortSignal):Promise<TissueManifest>{
 const r=await fetch('/models/multiscale/muscle-pilot/manifest.json',{signal});if(!r.ok)throw new Error('The tissue catalogue could not be loaded.');const data:unknown=await r.json();validateManifest(data);return data;
}
export async function verifiedGLB(asset:Representation,signal:AbortSignal):Promise<ArrayBuffer>{
 const response=await fetch(asset.url,{signal});if(!response.ok)throw new Error('The tissue specimen could not be loaded.');const buffer=await response.arrayBuffer();
 if(buffer.byteLength!==asset.bytes)throw new Error('The tissue specimen is incomplete.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==asset.sha256)throw new Error('The tissue specimen differs from its verified package.');
 const view=new DataView(buffer);if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw new Error('Invalid tissue GLB.');
 return buffer;
}
export function physicalLength(meters:number):string {
 if(meters<1e-6)return `${(meters*1e9).toFixed(1)} nm`;
 if(meters>=.01)return `${(meters*100).toFixed(1)} cm`;
 if(meters>=.001)return `${(meters*1000).toFixed(2)} mm`;
 return `${(meters*1e6).toFixed(meters<1e-6?2:1)} µm`;
}
