import {defaultConfig,exportExperiment,importExperiment} from '../molecular/experiments';
import {stableJSON} from '../simulation/core/model';
import {LEVELS,type TissueLevel,type TissueLOD,type TissueManifest} from './assets';
import {sarcomereBands} from './sarcomere';
import {EXCITATION_MODEL,EXCITATION_SOLVER,validateExcitation,defaultExcitationView,type ExcitationView} from './excitation';
export type TissueRecording={level:TissueLevel;lod:TissueLOD;selection:Record<TissueLevel,string>;showSheath:boolean;showBone:boolean;section:'none'|'cross'|'longitudinal';slice:number;angle:'oblique'|'front'|'end';signal:boolean;time:number;sarcomereLength:number;excitation:ExcitationView};
const hashes=(m:TissueManifest)=>LEVELS.flatMap(l=>[m.levels[l].representations.detail.sha256,m.levels[l].representations.context.sha256]);
export function exportTissueView(manifest:TissueManifest,state:TissueRecording):string {
 const {time,...view}=state;
 const data={format:'human-atlas/tissue-view',schema:1,package:{id:manifest.id,version:manifest.version,hashes:hashes(manifest)},...view,excitationModel:EXCITATION_MODEL,excitationSolver:EXCITATION_SOLVER,experiment:JSON.parse(exportExperiment(defaultConfig('insulin'),time))};
 const text=JSON.stringify(data,null,2);importTissueView(manifest,text);return text;
}
export function importTissueView(manifest:TissueManifest,text:string):TissueRecording {
 if(text.length>100000)throw new Error('Tissue recording exceeds 100 kB.');const d=JSON.parse(text);
 if(!d||d.format!=='human-atlas/tissue-view'||d.schema!==1||d.package?.id!==manifest.id||d.package?.version!==manifest.version||JSON.stringify(d.package?.hashes)!==JSON.stringify(hashes(manifest))||!LEVELS.includes(d.level)||!['detail','context'].includes(d.lod)||!['none','cross','longitudinal'].includes(d.section)||!['front','oblique','end'].includes(d.angle)||!Number.isFinite(d.slice)||d.slice<0||d.slice>1||['showSheath','showBone','signal'].some(k=>typeof d[k]!=='boolean')||LEVELS.some(l=>!manifest.entities.some(e=>e.level===l&&e.id===d.selection?.[l])))throw new Error('This is not a compatible tissue view.');
 sarcomereBands(d.sarcomereLength);
 const excitation=d.excitation===undefined?defaultExcitationView():d.excitation;
 if(d.excitation!==undefined&&(d.excitationModel!==EXCITATION_MODEL||d.excitationSolver!==EXCITATION_SOLVER))throw new Error('Incompatible excitation model or solver.');
 if(!excitation||typeof excitation.enabled!=='boolean'||!Number.isFinite(excitation.timeMs)||excitation.timeMs<0||excitation.timeMs>500)throw new Error('Invalid excitation view.');
 validateExcitation(excitation.config);
 const experiment=importExperiment(JSON.stringify(d.experiment));if(stableJSON(experiment.config)!==stableJSON(defaultConfig('insulin')))throw new Error('This tissue preview requires the archived reference pulse.');
 return {level:d.level,lod:d.lod,selection:structuredClone(d.selection),showSheath:d.showSheath,showBone:d.showBone,section:d.section,slice:d.slice,angle:d.angle,signal:d.signal,time:experiment.time,sarcomereLength:d.sarcomereLength,excitation:structuredClone(excitation)};
}
