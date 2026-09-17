import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {canonical, DIMENSIONS} from '../app/simulation/core/units';
import {bindingFixture, compileBinding} from '../app/simulation/core/binding-fixture';
import {compileModel, type ChemicalModel} from '../app/simulation/core/model';
import {advanceChemical, chemicalResidual, exportChemical, importChemical, initialChemicalState} from '../app/simulation/core/integrator';
import {runInsulin} from '../app/molecular/sedaghat';
import {defaultConfig, exportExperiment, importExperiment, observe, runExperiment} from '../app/molecular/experiments';
const close = (a: number, b: number, absolute = 1e-18, relative = 1e-6) => assert.ok(Math.abs(a-b) <= absolute + relative*Math.abs(b), `${a} != ${b}`);
const mutant = (fn: (m: ChemicalModel) => void) => {const m = bindingFixture(); fn(m); return m;};

test('physical units convert explicitly and reject relative activities, dimensions and nonfinite input', () => {
  close(canonical({value: 250, unit: 'pmol'}, DIMENSIONS.amount), 2.5e-10);
  close(canonical({value: 200, unit: 'mL'}, DIMENSIONS.volume), .2);
  close(canonical({value: .12, unit: '1/min'}, DIMENSIONS.firstOrder), .002);
  assert.throws(() => canonical({value: 1, unit: 'mol/L'}, DIMENSIONS.amount), /incompatible/);
  assert.throws(() => canonical({value: NaN, unit: 'mol'}, DIMENSIONS.amount));
  assert.throws(() => canonical({value: -1, unit: 'mol'}, DIMENSIONS.amount));
  assert.throws(() => canonical({value: 1, unit: 'relative' as 'mol'}, DIMENSIONS.amount));
});
test('compilation rejects unbalanced chemistry, wrong kinetics, duplicate ownership and unauthorized ports', () => {
  assert.throws(() => compileModel(mutant(m => {m.species[2].moieties.ligand = 2;})), /unbalanced/);
  assert.throws(() => compileModel(mutant(m => {m.parameters[2].value.unit = '1/s';})), /incompatible/);
  assert.throws(() => compileModel(mutant(m => {m.modules[1].owns.push('blood-ligand');})), /ownership/);
  assert.throws(() => compileModel(mutant(m => {m.ports[0].grants = ['tissue'];})), /unauthorized/);
  assert.throws(() => compileModel(mutant(m => {m.ports[0].direction = 'out';})), /unauthorized/);
  assert.throws(() => compileModel(mutant(m => {m.reactions[0].evidence = 'missing';})), /unresolved/);
  assert.throws(() => compileModel(mutant(m => {m.reactions[2].products[0].pool = 'blood-ligand';})), /unauthorized|volume/);
  assert.throws(() => compileModel(mutant(m => {m.compartments[0].volume.value = 0;})), /positive volume/);
});
test('first-order clearance matches the exponential analytic solution and closes its ledger', () => {
  const m = bindingFixture(); m.reactions = m.reactions.filter(r => r.id === 'clearance');
  const model = compileModel(m), initial = initialChemicalState(model), final = advanceChemical(model, initial, 600);
  close(final.amounts[0], 1e-10*Math.exp(-.002*600));
  close(final.amounts[4], 1e-10-final.amounts[0]);
  assert.ok(chemicalResidual(model, final) < 1e-23);
  assert.equal(initial.tick, 0);
});
test('closed mixing matches analytic two-compartment transport and equalizes concentrations', () => {
  const m = bindingFixture(); m.reactions = m.reactions.filter(r => ['delivery','return'].includes(r.id));
  const model = compileModel(m), end = advanceChemical(model, initialChemicalState(model), 600);
  const a=.006,b=.03,total=1e-10;
  close(end.amounts[0], total*b/(a+b) + total*a/(a+b)*Math.exp(-(a+b)*600));
  close(end.amounts[1], total-end.amounts[0]);
  close(end.amounts[0]/1,end.amounts[1]/.2,1e-18,1e-6);
});
test('finite reversible receptor binding agrees with its analytic equilibrium and conserves both moieties', () => {
  const m = bindingFixture(); m.reactions = m.reactions.filter(r => ['binding','unbinding'].includes(r.id));
  m.pools[0].initial.value = 0; m.pools[1].initial.value = 100;
  const model=compileModel(m), end=advanceChemical(model,initialChemicalState(model),7200);
  const ligand=100e-12,receptor=20e-12,kdAmount=.003/2e7*.2;
  const sum=ligand+receptor+kdAmount, bound=2*ligand*receptor/(sum+Math.sqrt(sum*sum-4*ligand*receptor));
  close(end.amounts[3],bound); close(end.amounts[1]+end.amounts[3],ligand);close(end.amounts[2]+end.amounts[3],receptor);
});
test('high rates trigger internal refinement while retaining positivity and analytic agreement', () => {
  const m=bindingFixture();m.reactions=m.reactions.filter(r=>r.id==='clearance');m.parameters[4].value={value:600,unit:'1/min'};m.parameters[4].range=[0,600];
  const model=compileModel(m),end=advanceChemical(model,initialChemicalState(model),1);
  close(end.amounts[0],1e-10*Math.exp(-10),1e-19,1e-5);
  assert.ok(end.amounts.every(x=>x>=0));
});
test('a coupled pulse shows delayed binding; receptor and clearance perturbations have causal effects', () => {
  const base=runExperiment(defaultConfig('binding'));
  assert.equal(base.samples[0].values.occupancy,0);
  assert.ok(base.samples[12].values.occupancy>0);
  assert.ok(base.maximumResidualMol! < 1e-22);
  for(const sample of base.samples){close(sample.values.ligandTotal,100,1e-8);close(sample.values.receptorTotal,20,1e-8);assert.ok(sample.state.every(x=>x>=0));}
  const none=runExperiment({kind:'binding',parameters:{dosePmol:100,receptorPmol:0,clearancePerMinute:.12}});
  assert.ok(none.samples.every(s=>s.values.occupancy===0&&s.values.bound===0));
  const slow=runExperiment({kind:'binding',parameters:{dosePmol:100,receptorPmol:20,clearancePerMinute:0}});
  assert.ok(slow.samples.at(-1)!.values.bound>base.samples.at(-1)!.values.bound);
  const zero=runExperiment({kind:'binding',parameters:{dosePmol:0,receptorPmol:20,clearancePerMinute:.12}});
  assert.ok(zero.samples.every(s=>s.values.bound===0));
});
test('chemical checkpoint resume is deterministic; invalid state and model versions are rejected before mutation', () => {
  const model=compileBinding(),initial=initialChemicalState(model),mid=advanceChemical(model,initial,10);
  const restored=importChemical(model,exportChemical(model,mid));
  assert.deepEqual(advanceChemical(model,restored,30),advanceChemical(model,initial,40));
  assert.throws(()=>advanceChemical(model,mid,NaN));assert.throws(()=>advanceChemical(model,mid,.1));
  const corrupt=JSON.parse(exportChemical(model,mid));corrupt.state.amounts[0]+=1e-10;
  assert.throws(()=>importChemical(model,JSON.stringify(corrupt)),/ledger/);
  corrupt.version='future';assert.throws(()=>importChemical(model,JSON.stringify(corrupt)),/Incompatible/);
  assert.equal(mid.tick,40);
});
test('insulin no-feedback implementation reproduces independent Radau outputs and timestep refinement', async () => {
  const reference=JSON.parse(await readFile(new URL('../validation/p1/insulin-reference.json',import.meta.url),'utf8'));
  const source=await readFile(new URL('../models/sedaghat2002/source/sedaghat2002.mod',import.meta.url));
  assert.equal(createHash('sha256').update(source).digest('hex'),reference.sourceSHA256);
  const actual=runInsulin(),fine=runInsulin(undefined,.00025);
  assert.equal(actual.length,reference.samples.length);
  for(let i=0;i<actual.length;i++)for(let j=0;j<21;j++){
    assert.equal(actual[i].time,reference.samples[i].time);
    close(actual[i].state[j],reference.samples[i].state[j],.0002,.00001);
    close(actual[i].state[j],fine[i].state[j],.0002,.00001);
  }
  assert.equal(actual[59].insulinNM,100);assert.equal(actual[60].time,900);assert.equal(actual[60].insulinNM,0);
  assert.ok(actual[60].state[20]>35);assert.ok(actual.at(-1)!.state[20]<5);
});
test('insulin dose modifies the computed cascade and source pool invariants hold', () => {
  const low=runInsulin({doseNM:1,pulseMinutes:15}),zero=runInsulin({doseNM:0,pulseMinutes:15});
  assert.ok(low[60].state[20]>zero[60].state[20]);
  for(const s of low){close(s.state[7]+s.state[8]+s.state[11],1,1e-9);close(s.state[10]+s.state[11],.1,1e-9);close(s.state[12]+s.state[13]+s.state[14],100,1e-9);close(s.state[15]+s.state[16],100,1e-9);}
  // Source has synthesis/degradation; its GLUT4 and receptor totals are not closed pools.
});
test('camera/playhead observations never alter trajectories and replay packages reject legacy or altered contracts', () => {
  const config=defaultConfig('binding'),result=runExperiment(config),before=structuredClone(result);
  for(const t of [0,77.2,600,1200])observe(result,t);
  assert.deepEqual(result,before);
  assert.deepEqual(importExperiment(exportExperiment(config,77.2)),{config,time:77.2});
  assert.throws(()=>importExperiment('{"model":"atlas-physiology-0.2.0","state":{}}'),/not a compatible/);
  const corrupt=JSON.parse(exportExperiment(config,10));corrupt.config.parameters.dosePmol=300;
  assert.throws(()=>importExperiment(JSON.stringify(corrupt)),/differ/);
  assert.throws(()=>runExperiment({kind:'binding',parameters:{dosePmol:Infinity,receptorPmol:20,clearancePerMinute:.12}}));
});
