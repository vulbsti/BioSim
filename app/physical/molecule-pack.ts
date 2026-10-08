import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {SPECIES,validateMoleculeManifest,type MoleculeEntry,type MoleculeManifest,type SpeciesId} from './molecules';

/** Geometries have unit radius; `entries[i].radiusNm` is the real one. Both are in SPECIES order. */
export type MoleculePack={manifest:MoleculeManifest;geometries:T.BufferGeometry[];entries:MoleculeEntry[];index:Map<SpeciesId,number>};

/** Load and verify the molecule package. */
export async function loadMolecules(signal:AbortSignal):Promise<MoleculePack>{
 const response=await fetch('/models/molecules/manifest.json',{signal});if(!response.ok)throw new Error('The molecule catalogue could not be loaded.');
 const manifest:unknown=await response.json();validateMoleculeManifest(manifest);
 const file=await fetch(manifest.url,{signal});if(!file.ok)throw new Error('The molecule models could not be loaded.');
 const bytes=await file.arrayBuffer();if(bytes.byteLength!==manifest.bytes)throw new Error('The molecule models are incomplete.');
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 if(hash!==manifest.sha256)throw new Error('The molecule models differ from their verified package.');
 const parsed=await new GLTFLoader().parseAsync(bytes,''),entries=SPECIES.map(id=>manifest.molecules.find(e=>e.id===id)!);
 const geometries=entries.map(entry=>{
  const mesh=parsed.scene.getObjectByName(entry.id) as T.Mesh|undefined;if(!mesh?.isMesh)throw new Error(`The molecule models are missing ${entry.name}.`);
  const geometry=mesh.geometry.clone();geometry.scale(1/entry.radiusNm,1/entry.radiusNm,1/entry.radiusNm);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
 });
 parsed.scene.traverse(o=>{const m=o as T.Mesh;if(m.isMesh){m.geometry.dispose();for(const x of [m.material].flat())x.dispose();}});
 return {manifest,geometries,entries,index:new Map(SPECIES.map((id,i)=>[id,i]))};
}
