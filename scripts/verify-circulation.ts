import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {BLOOD_NODES,DEFAULT_CIRCULATION,runCirculation,type CirculationSample,type CirculationResult} from '../app/circulation/model';
const root=new URL('../',import.meta.url),path=(p:string)=>new URL(p,root),hash=async(p:string)=>createHash('sha256').update(await readFile(path(p))).digest('hex');
const reference=JSON.parse(await readFile(path('validation/p3/circulation-reference.json'),'utf8')) as {sourceHashes:Record<string,string>;samples:CirculationSample[];solver:Record<string,unknown>};
for(const [p,sha] of Object.entries(reference.sourceHashes))if(await hash(p)!==sha)throw new Error(`Independent reference is stale: ${p}`);
const output=execFileSync(process.execPath,['--import','tsx','--test','tests/circulation.test.ts'],{cwd:root,encoding:'utf8'});
await mkdir(path('validation/p3'),{recursive:true});await writeFile(path('validation/p3/numerical-tests.tap'),output);
const coarse=runCirculation(),fine=runCirculation(DEFAULT_CIRCULATION,.005);
const compare=(other:{samples:CirculationSample[]})=>{
 let pressureMmHg=0,glut4PercentagePoints=0,insulinPM=0,normalizedInsulinError=0;
 const peaks=BLOOD_NODES.map((_,i)=>Math.max(...other.samples.map(s=>s.insulinPM[i]))),tissuePeak=Math.max(...other.samples.map(s=>s.interstitialPM));
 for(const s of other.samples){const a=coarse.samples[Math.round(s.time*10)];for(let i=0;i<10;i++){
  pressureMmHg=Math.max(pressureMmHg,Math.abs(s.pressureMmHg[i]-a.pressureMmHg[i]));
  const error=Math.abs(s.insulinPM[i]-a.insulinPM[i]);insulinPM=Math.max(insulinPM,error);normalizedInsulinError=Math.max(normalizedInsulinError,error/Math.max(.01,.002*peaks[i]));
 }
  const error=Math.abs(s.interstitialPM-a.interstitialPM);insulinPM=Math.max(insulinPM,error);normalizedInsulinError=Math.max(normalizedInsulinError,error/Math.max(.01,.002*tissuePeak));glut4PercentagePoints=Math.max(glut4PercentagePoints,Math.abs(s.signal[20]-a.signal[20]));
 }
 if(pressureMmHg>.1||glut4PercentagePoints>.01||normalizedInsulinError>1)throw new Error(`Reference comparison failed: ${JSON.stringify({pressureMmHg,glut4PercentagePoints,insulinPM,normalizedInsulinError})}`);
 return {maximumPressureErrorMmHg:pressureMmHg,maximumGLUT4ErrorPercentagePoints:glut4PercentagePoints,maximumInsulinErrorPM:insulinPM,maximumNormalizedInsulinError:normalizedInsulinError};
};
const numericalAgreement={stepHalving:compare(fine),independentDOP853:compare(reference)};
const auc=(r:CirculationResult)=>r.samples.reduce((a,s,i)=>i?a+(s.insulinPM[0]+r.samples[i-1].insulinPM[0])*.05:a,0);
const noLiver=runCirculation({...DEFAULT_CIRCULATION,hepaticClearance:0}),venous=runCirculation({...DEFAULT_CIRCULATION,route:'venous'});
const envelope=coarse.samples.filter(s=>s.time>=590),peak=(r:CirculationResult,i:number)=>r.samples.reduce((best,s)=>s.insulinPM[i]>best.insulinPM[i]?s:best);
const domain=[];
for(const route of ['portal','venous'] as const)for(const dosePmol of [0,5000])for(const hepaticClearance of [0,2])for(const exchange of [0,2])for(const muscleResistance of [.5,2.5]){
 const config={...DEFAULT_CIRCULATION,route,dosePmol,hepaticClearance,exchange,muscleResistance},r=runCirculation(config);
 if(r.maximumVolumeResidualL>1e-9||r.maximumInsulinResidualMol>1e-17||r.minimumInsulinMol< -1e-20)throw new Error('Supported-domain corner failed.');
 domain.push({config,maximumVolumeResidualL:r.maximumVolumeResidualL,maximumInsulinResidualMol:r.maximumInsulinResidualMol,minimumInsulinMol:r.minimumInsulinMol});
}
const receipt={schemaVersion:1,recordedAt:new Date().toISOString(),invocation:'npm run verify:circulation',evidence:'Executed conservative physical transport and source-observer checks. Independent solver agreement concerns a synthetic reference design, not a human waveform fit.',
 tests:{count:6,exitCode:0,output:'validation/p3/numerical-tests.tap'},config:coarse.config,solver:{browserStepSeconds:.01,convergenceStepSeconds:.005,independentReference:reference.solver},numericalAgreement,
 conservation:{maximumVolumeResidualL:coarse.maximumVolumeResidualL,maximumInsulinResidualMol:coarse.maximumInsulinResidualMol,minimumInsulinMol:coarse.minimumInsulinMol},
 observed:{lateArterialPressureRangeMmHg:[Math.min(...envelope.map(s=>s.pressureMmHg[0])),Math.max(...envelope.map(s=>s.pressureMmHg[0]))],arterialPeak:{timeS:peak(coarse,0).time,insulinPM:peak(coarse,0).insulinPM[0]},liverPeak:{timeS:peak(coarse,9).time,insulinPM:peak(coarse,9).insulinPM[9]},arterialAUCPMSeconds:{portal:auc(coarse),venous:auc(venous),portalWithoutHepaticClearance:auc(noLiver)},final:coarse.samples.at(-1)},supportedParameterCorners:domain,
 limitations:['No measured human pressure or concentration comparison','Prescribed pumps without valves or ventricular mechanics','No gas chemistry, water extravasation or spatial capillary flow','No human-calibrated secretion or glucose uptake coupling','Open-input source signaling is an observer, not a physical receptor binding ledger'],
 sourceHashes:Object.fromEntries(await Promise.all(['app/circulation/model.ts','scripts/reference-circulation.py','scripts/reference-insulin.py','scripts/verify-circulation.ts','tests/circulation.test.ts','validation/p3/protocol.json','validation/p3/circulation-reference.json','app/molecular/sedaghat.ts','models/sedaghat2002/parameters.json'].map(async p=>[p,await hash(p)])))};
await writeFile(path('validation/p3/verification.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({receipt:'validation/p3/verification.json',tests:6,domainCorners:domain.length,numericalAgreement,conservation:receipt.conservation},null,2));
