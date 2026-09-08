import type {Atlas} from '../anatomy';
import {brainNodes} from './brain';

export type VesselCoverage={id:string;name:string;system:string;status:'exact-name link'|'grouped territory'|'unresolved'|'adjacent circulation';nodes:string[];side:'L'|'R'|null;sideEvidence:string;basis:string};
/** Catalogue accounting, NOT automatic extraction of anatomical vessel connectivity. */
export function auditBrainVessels(atlas:Atlas):{scope:string;vessels:VesselCoverage[];counts:Record<VesselCoverage['status'],number>;missingVenousGeometry:boolean} {
  const brain=atlas.concepts.find(c=>c.name.toLowerCase()==='brain');
  if(!brain)throw new Error('The source atlas lacks a brain concept; spatial coverage cannot be established.');
  const brainParts=atlas.parts.filter(p=>brain.elements.includes(p.id));
  const lower=[0,1,2].map(i=>Math.min(...brainParts.map(p=>p.bounds[0][i]))),upper=[0,1,2].map(i=>Math.max(...brainParts.map(p=>p.bounds[1][i])));
  const candidates=atlas.parts.filter(p=>['arterial','venous'].includes(p.system)&&([0,1,2].every(i=>p.bounds[1][i]>=lower[i]&&p.bounds[0][i]<=upper[i])||/internal carotid artery|vertebral artery|basilar artery|cerebral artery|communicating artery|cerebellar artery/i.test(p.name)));
  const vessels:VesselCoverage[]=candidates.map(p=>{
    const name=p.name.toLowerCase(),directSide=/\bright\b/.test(name)?'R':/\bleft\b/.test(name)?'L':null;
    const sides=new Set(atlas.concepts.filter(c=>c.elements.includes(p.id)).flatMap(c=>/\bright\b/i.test(c.name)?['R']:/\bleft\b/i.test(c.name)?['L']:[]));
    const side=directSide??(sides.size===1?[...sides][0] as 'L'|'R':null);
    const sideEvidence=directSide?'Source mesh name':side?'Source concept membership':'Laterality unresolved in source names';
    const exact=brainNodes.filter(n=>n.match.includes(name)&&(!side||!n.id.startsWith(side==='L'?'R-':'L-'))).map(n=>n.id);
    if(exact.length===1)return {id:p.id,name:p.name,system:p.system,status:'exact-name link',nodes:exact,side,sideEvidence,basis:'Exact source name matches a schematic node. This establishes a label association, not a geometric connection.'};
    if(p.system==='venous'){
      const node=/^(left |right )?(internal cerebral vein|great cerebral vein)$/.test(name)?'deepvein':null;
      return {id:p.id,name:p.name,system:p.system,status:node?'grouped territory':'unresolved',nodes:node?[node]:[],side,sideEvidence,basis:node?'Named deep cerebral vein belongs to the schematic deep venous collector; individual junctions remain unresolved.':'Source venous geometry is present; its individual drainage connection is not represented in the current schematic.'};
    }
    if(/ophthalmic|external carotid|facial|temporal superficial|superficial temporal/.test(name))return {id:p.id,name:p.name,system:p.system,status:'adjacent circulation',nodes:[],side,sideEvidence,basis:'Orbital or extracranial supply is adjacent to the brain and not included in the cerebral tissue beds.'};
    let key:string|null=null;
    if(/hypothalamic|thalamoperforating|thalamogeniculate|central branch|choroidal/.test(name))key='deep';
    else if(/cerebellar|pontine|vermian/.test(name))key='cerebellum';
    else if(/pericallosal|callosomarginal|precuneal|paracentral|medial frontobasal/.test(name))key='frontal';
    else if(/occipital|splenial/.test(name))key='visual';
    else if(/middle cerebral|central sulcus|parietal artery|precentral|postcentral|prefrontal|anterior temporal|polar temporal|lateral frontobasal|angular gyrus/.test(name))key='lateral';
    else if(/posterior cerebral/.test(name))key='pca';
    else if(/anterior cerebral/.test(name))key='aca';
    else if(/internal carotid/.test(name))key='ica';
    else if(/vertebral/.test(name))key='vertebral';
    const nodes=key&&side?[`${side}-${key}`]:exact;
    const status=nodes.length===1?'grouped territory':'unresolved';
    return {id:p.id,name:p.name,system:p.system,status,nodes,side,sideEvidence,basis:status==='grouped territory'?'Source terminology assigns a coarse vascular territory. Its separate branch flow and parent junction have not been resolved.':'No unambiguous association in the current schematic; requires anatomical review.'};
  });
  const counts={'exact-name link':0,'grouped territory':0,'unresolved':0,'adjacent circulation':0};for(const v of vessels)counts[v.status]++;
  return {scope:'Arterial / venous meshes intersecting the source brain bounding box, plus named carotid / vertebral, cerebral, communicating, and cerebellar vessels. Bounding-box overlap is a candidate rule, not proof of intracranial anatomy.',vessels,counts,missingVenousGeometry:!vessels.some(v=>v.system==='venous')};
}
