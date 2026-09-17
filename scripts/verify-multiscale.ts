import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runExperiment,defaultConfig} from '../app/molecular/experiments';
import {runInsulin,SEDAGHAT_VERSION,INSULIN_SOLVER_VERSION} from '../app/molecular/sedaghat';
import {CORE_SOLVER_VERSION} from '../app/simulation/core/integrator';

const root=new URL('../',import.meta.url);
const sha=async(path:string)=>createHash('sha256').update(await readFile(new URL(path,root))).digest('hex');
const reference=JSON.parse(await readFile(new URL('validation/p1/insulin-reference.json',root),'utf8')) as {sourceSHA256:string;protocolSHA256:string;referenceScriptSHA256:string;maximumCrossSolverNormalizedError:number;samples:{time:number;state:number[]}[]};
const protocol=JSON.parse(await readFile(new URL('validation/p1/protocol.json',root),'utf8'));
const manifest=JSON.parse(await readFile(new URL('models/sedaghat2002/manifest.json',root),'utf8')) as {files:Record<string,string>};
for(const [file,expected] of Object.entries(manifest.files)) {
  if(await sha(`models/sedaghat2002/${file}`)!==expected)throw new Error(`Pinned model package changed: ${file}. Review provenance before updating the manifest.`);
}
if(reference.sourceSHA256!==await sha('models/sedaghat2002/source/sedaghat2002.mod') || reference.protocolSHA256!==await sha('validation/p1/protocol.json') || reference.referenceScriptSHA256!==await sha('scripts/reference-insulin.py'))
  throw new Error('Reference provenance changed. Regenerate the independent reference before verification.');
const actual=runInsulin(),binding=runExperiment(defaultConfig('binding'));
let maximumNormalizedError=0,maximumAbsoluteError=0;
const tolerance=protocol.sedaghat2002.solverComparisonTolerance;
for(let i=0;i<actual.length;i++){
  if(actual[i].time!==reference.samples[i].time)throw new Error('Reference sample clock mismatch.');
  for(let j=0;j<actual[i].state.length;j++){
    const difference=Math.abs(actual[i].state[j]-reference.samples[i].state[j]);
    maximumAbsoluteError=Math.max(maximumAbsoluteError,difference);
    maximumNormalizedError=Math.max(maximumNormalizedError,difference/(tolerance.absoluteInNativeUnits+tolerance.relative*Math.abs(reference.samples[i].state[j])));
  }
}
if(maximumNormalizedError>1 || !Number.isFinite(maximumNormalizedError))throw new Error('Insulin reproduction exceeds its predeclared tolerance.');
const testOutput=execFileSync(process.execPath,['--import','tsx','--test','tests/multiscale.test.ts'],{cwd:root,encoding:'utf8'});
await writeFile(new URL('validation/p1/numerical-tests.tap',root),testOutput);
const files=[
  'app/simulation/core/units.ts','app/simulation/core/model.ts','app/simulation/core/integrator.ts','app/simulation/core/binding-fixture.ts',
  'app/molecular/sedaghat.ts','app/molecular/experiments.ts','models/sedaghat2002/parameters.json','models/sedaghat2002/manifest.json',
  'models/sedaghat2002/source/sedaghat2002.mod','models/sedaghat2002/source/sedaghat2002.proj','models/sedaghat2002/parameter-provenance.json',
  'tests/multiscale.test.ts','scripts/reference-insulin.py','scripts/verify-multiscale.ts','validation/p1/protocol.json','validation/p1/insulin-reference.json',
];
const receipt={
  schemaVersion:1,recordedAt:new Date().toISOString(),invocation:'npm run verify:multiscale',
  sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  evidence:'Executed numerical verification and source-model reproduction. Not independent human biological validation.',
  platform:{node:process.version,platform:process.platform,arch:process.arch},
  solvers:{chemical:CORE_SOLVER_VERSION,insulin:INSULIN_SOLVER_VERSION},
  tests:{invocation:'node --import tsx --test tests/multiscale.test.ts',exitCode:0,output:'validation/p1/numerical-tests.tap'},
  E01:{input:defaultConfig('binding'),durationSeconds:binding.duration,samples:binding.samples.length,maximumLedgerResidualMol:binding.maximumResidualMol,minimumAmountMol:binding.minimumState,
    ligandTotalPmol:binding.samples.at(-1)!.values.ligandTotal,receptorTotalPmol:binding.samples.at(-1)!.values.receptorTotal,status:'passed synthetic numerical checks'},
  insulin:{model:SEDAGHAT_VERSION,input:{doseNM:100,pulseMinutes:15},samples:actual.length,durationSeconds:3600,
    maximumNormalizedError,maximumAbsoluteErrorNativeUnits:maximumAbsoluteError,normalizedAcceptanceBound:1,
    radauVsBdfNormalizedError:reference.maximumCrossSolverNormalizedError,
    surfaceGLUT4At15Minutes:actual[60].state[20],surfaceGLUT4At60Minutes:actual.at(-1)!.state[20],status:'passed independent-solver reproduction'},
  humanValidation:{status:'pending',reason:protocol.M1HumanValidation.reason},
  sourceHashes:Object.fromEntries(await Promise.all(files.map(async file=>[file,await sha(file)]))),
};
await writeFile(new URL('validation/p1/verification.json',root),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({receipt:'validation/p1/verification.json',E01:receipt.E01,insulin:receipt.insulin,humanValidation:'pending'},null,2));
