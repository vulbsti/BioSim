import {HORMONES,SUBSTANCES,type Hormone,type Substance} from '../simulation/types';

/** Every species the body model carries in blood. */
export type MoleculeId=Substance|Hormone;
export const MOLECULES:readonly MoleculeId[]=[...SUBSTANCES,...HORMONES];
/** What else is in blood and drawn on the way down: not simulated, present at reference amounts. */
export const BLOOD_EXTRAS=['albumin','igg','fibrinogen','sodium','potassium','chloride','calcium','bicarbonate','redCell','platelet','whiteCell'] as const;
export type BloodExtra=typeof BLOOD_EXTRAS[number];
export type SpeciesId=MoleculeId|BloodExtra;
export const SPECIES:readonly SpeciesId[]=[...MOLECULES,...BLOOD_EXTRAS];
export type MoleculeEntry={id:SpeciesId;name:string;kind:'substance'|'hormone'|'protein'|'ion'|'cell';style:'ball-stick'|'sticks'|'surface'|'ion'|'cell';source:string;method:string;standIn:boolean;note:string;radiusNm:number;massDa:number|null;triangles:number};
export type MoleculeManifest={id:string;version:string;unit:'nm';url:string;bytes:number;sha256:string;triangles:number;licenses:Record<string,{name:string;url:string}>;blender:string;molecules:MoleculeEntry[]};

export function validateMoleculeManifest(value:unknown):asserts value is MoleculeManifest {
 const m=value as MoleculeManifest;
 if(!m||m.id!=='blood-molecules'||m.unit!=='nm'||m.url!=='/models/molecules/molecules.glb'||!Array.isArray(m.molecules)||!Number.isInteger(m.bytes)||m.bytes<1000||m.bytes>8_000_000||!/^[a-f0-9]{64}$/.test(m.sha256))throw new Error('Unsupported molecule package.');
 const ids=new Set(m.molecules.map(e=>e.id));
 if(ids.size!==m.molecules.length||SPECIES.some(id=>!ids.has(id))||m.molecules.some(e=>!SPECIES.includes(e.id)))throw new Error('The molecule package does not match the species the body model carries.');
 for(const e of m.molecules)if(!e.name||!e.source||!(e.radiusNm>0)||!Number.isInteger(e.triangles)||e.triangles<=0||e.triangles>6500||(e.standIn&&!e.note))throw new Error('Invalid molecule entry.');
}
