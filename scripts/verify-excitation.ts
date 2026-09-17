import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {runExcitation,type ExcitationConfig,stimulusAt,excitationInventory,observeExcitation} from '../app/tissue/excitation';
import {initialShorten,shortenRates} from '../app/tissue/generated/shorten';
const root=new URL('../',import.meta.url),file=(p:string)=>new URL(p,root);
const source=JSON.parse(await readFile(file('models/shorten2007/manifest.json'),'utf8'));
const protocol=JSON.parse(await readFile(file('validation/p5/excitation-protocol.json'),'utf8'));
const reference=JSON.parse(await readFile(file('validation/p5/excitation-reference.json'),'utf8'));
const sha=async(p:string)=>createHash('sha256').update(await readFile(file(p))).digest('hex');
for(const [p,hash]of Object.entries(source.files))assert.equal(await sha('models/shorten2007/'+p),hash);
assert.equal(reference.sourceSHA256,source.files['source/shorten2007.py']);
const {states,constants}=initialShorten(),a=new Float64Array(56),b=new Float64Array(56),alg=new Float64Array(71);
for(const t of [0,.1,.499,.5,1,50,50.1,50.5,399.9,400,400.1,400.5,450]){
 shortenRates(t,constants,a,states,alg);shortenRates(-1,constants,b,states,alg);b[0]+=stimulusAt({stimulus:'train',releaseScale:1},t)/constants[0];
 for(let i=0;i<56;i++)assert.ok(Math.abs(a[i]-b[i])<1e-10,'Source stimulus mismatch');
}
const metrics:{name:string;peakCalciumUM:number;peakVoltageMV:number;peakPostStrokeUM:number;[key:string]:number|string}[]=[];let single:ReturnType<typeof runExcitation>|undefined;
for(const fixture of reference.results as {name:string;config:ExcitationConfig;samples:{timeMs:number;state:number[]}[]}[]){
 const run=runExcitation(fixture.config);if(fixture.name==='single')single=run;
 assert.equal(run.samples.length,fixture.samples.length);
 let voltage=0,calcium=0,crossbridge=0,scaled=0,minState=Infinity;
 for(let n=0;n<run.samples.length;n++){
  const actual=run.samples[n],expected=fixture.samples[n];assert.equal(actual.timeMs,expected.timeMs);
  for(let j=0;j<56;j++){
   assert.ok(Number.isFinite(actual.state[j]));if(j>=2)minState=Math.min(minState,actual.state[j]);
   const error=Math.abs(actual.state[j]-expected.state[j]);
   scaled=Math.max(scaled,error/(protocol.bounds.allStateErrorAbsoluteFloor+protocol.bounds.allStateErrorRelativeScale*Math.max(Math.abs(actual.state[j]),Math.abs(expected.state[j]))));
   if(j<2)voltage=Math.max(voltage,error);if(j===28||j===30)calcium=Math.max(calcium,error);if(j===51||j===52)crossbridge=Math.max(crossbridge,error);
  }
 }
 assert.ok(voltage<protocol.bounds.maximumVoltageErrorMV,`Voltage ${fixture.name}: ${voltage}`);
 assert.ok(calcium<protocol.bounds.maximumCalciumErrorUM,`Calcium ${fixture.name}: ${calcium}`);
 assert.ok(crossbridge<protocol.bounds.maximumCrossbridgeErrorUM,`Crossbridge ${fixture.name}: ${crossbridge}`);
 assert.ok(scaled<=1,`All states ${fixture.name}: ${scaled}`);assert.ok(minState>=-protocol.bounds.negativeStateTolerance);
 assert.ok(run.maxCalciumResidualMol<protocol.bounds.maximumCalciumInventoryResidualMol);assert.ok(run.maxAdenineResidualMol<protocol.bounds.maximumAdenineInventoryResidualMol);
 const unchanged=JSON.stringify(run.samples);for(const t of [0,20,100,250,500])observeExcitation(run,t);assert.equal(JSON.stringify(run.samples),unchanged);
 metrics.push({name:fixture.name,maximumVoltageErrorMV:voltage,maximumCalciumErrorUM:calcium,maximumCrossbridgeErrorUM:crossbridge,maximumScaledAllStateError:scaled,minimumNonVoltageState:minState,steps:run.steps,rejected:run.rejected,elapsedMs:run.elapsedMs,maxCalciumResidualMol:run.maxCalciumResidualMol,maxAdenineResidualMol:run.maxAdenineResidualMol,peakVoltageMV:Math.max(...run.samples.map(s=>s.voltageMV)),peakCalciumUM:Math.max(...run.samples.map(s=>s.calciumUM)),peakPostStrokeUM:Math.max(...run.samples.map(s=>s.postStrokeUM))});
 console.log(fixture.name,JSON.stringify(metrics.at(-1)));
}
const fine=runExcitation({stimulus:'single',releaseScale:1},2e-7);
const convergence=Math.max(...fine.samples.map((s,i)=>Math.abs(s.calciumUM-single!.samples[i].calciumUM)));assert.ok(convergence<.002);
const metric=(name:string)=>metrics.find(m=>m.name===name)!;
assert.ok(metric('single').peakVoltageMV>0);assert.ok(metric('no-stimulus').peakVoltageMV<0);
assert.ok(metric('blocked-release').peakCalciumUM<metric('single').peakCalciumUM*.1);
assert.ok(metric('train').peakPostStrokeUM>metric('single').peakPostStrokeUM);
const receipt={recordedAt:new Date().toISOString(),invocation:'npx tsx scripts/verify-excitation.ts',model:source.id,scope:protocol.scope,initialInventories:excitationInventory(states,constants),metrics,tighterToleranceMaximumCalciumDifferenceUM:convergence,passed:true,sourceHashes:Object.fromEntries(await Promise.all(['models/shorten2007/manifest.json','app/tissue/generated/shorten.ts','app/tissue/excitation.ts','scripts/reference-excitation.py','scripts/verify-excitation.ts','validation/p5/excitation-protocol.json','validation/p5/excitation-reference.json'].map(async p=>[p,await sha(p)])))};
await mkdir(file('validation/p5'),{recursive:true});await writeFile(file('validation/p5/excitation-verification.json'),JSON.stringify(receipt,null,2)+'\n');
