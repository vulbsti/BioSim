import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {composition,oxygenPressure,perCubicMetre} from '../app/physical/dive/composition';
import {cells,cubic,length,meanNearest,molar,nearest,niceLength,visit} from '../app/physical/dive/field';
import {redLattice} from '../app/physical/dive/lattices';
import {REFERENCE} from '../app/physical/dive/reference';
import {SPECIES,validateMoleculeManifest,type MoleculeManifest} from '../app/physical/molecules';
import {advance,applyAction,createBody} from '../app/simulation/engine';
import {HORMONES} from '../app/simulation/types';
const file=(path:string)=>readFileSync(new URL(`../${path}`,import.meta.url));
const manifest=JSON.parse(file('public/models/molecules/manifest.json').toString()) as MoleculeManifest,glb=file('public/models/molecules/molecules.glb');
const ledger=JSON.parse(file('assets/molecules/ledger.json').toString()) as {molecules:{id:string;database:string;url:string;license:string;downloadSHA256:string|null;standIn:boolean;note:string;title:string}[]};
const rest=createBody(),fed=()=>{const s=createBody();applyAction(s,{kind:'meal',meal:{carbs:60,protein:20,fat:15,water:250,sodium:500}});advance(s,1800);return s;};
const amount=(s:typeof rest,blood:'arterial'|'venous'|'portal',id:string)=>composition(s,rest,blood).find(a=>a.id===id)!;

test('the package holds one verified model for everything drawn in blood',()=>{
 validateMoleculeManifest(manifest);
 assert.deepEqual(manifest.molecules.map(m=>m.id).sort(),[...SPECIES].sort());
 assert.equal(glb.byteLength,manifest.bytes);assert.equal(createHash('sha256').update(glb).digest('hex'),manifest.sha256);
 // The GLB itself: one mesh per species, each with positions, normals and baked vertex colours.
 const json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString()) as {nodes:{name:string;mesh:number}[];meshes:{primitives:{attributes:Record<string,number>;indices:number}[]}[];accessors:{count:number}[]};
 for(const m of manifest.molecules){
  const node=json.nodes.find(n=>n.name===m.id);assert.ok(node,`no mesh named ${m.id}`);
  const [primitive,...others]=json.meshes[node.mesh].primitives;assert.equal(others.length,0);
  for(const attribute of ['POSITION','NORMAL','COLOR_0'])assert.ok(attribute in primitive.attributes,`${m.id} lacks ${attribute}`);
  assert.equal(json.accessors[primitive.indices].count/3,m.triangles,`${m.id} triangle count`);
 }
 assert.throws(()=>validateMoleculeManifest({...manifest,molecules:manifest.molecules.slice(1)}),/does not match/);
});

test('every model traces to a source, and stand-ins say what they are',()=>{
 assert.equal(ledger.molecules.length,SPECIES.length);
 for(const m of ledger.molecules){
  assert.match(m.url,/^https:\/\//,m.id);assert.ok(m.license,m.id);
  if(m.database==='computed')assert.ok(m.title.length>20,`${m.id} needs the publication its dimensions come from`);
  else{assert.match(m.url,/^https:\/\/(pubchem\.ncbi\.nlm\.nih\.gov|files\.rcsb\.org)\//);assert.match(m.downloadSHA256!,/^[a-f0-9]{64}$/);}
  if(m.standIn)assert.match(m.note,/^No .* structure is deposited\. Shown: /);
 }
 assert.deepEqual(ledger.molecules.filter(m=>m.standIn).map(m=>m.id).sort(),['inhibin','lh']);
});

test('sizes are the real ones, in nanometres',()=>{
 const r=(id:string)=>manifest.molecules.find(m=>m.id===id)!.radiusNm;
 // Red cell 7.82 µm across (Evans & Fung); glucose under a nanometre; an antibody about 19 nm.
 assert.ok(Math.abs(2*r('redCell')-7820)<5);assert.ok(2*r('glucose')>.6&&2*r('glucose')<1);assert.ok(2*r('igg')>14&&2*r('igg')<22);
 assert.ok(Math.abs(r('sodium')-.102)<1e-3&&Math.abs(r('chloride')-.181)<1e-3);
 assert.ok(r('redCell')/r('glucose')>9000,'a red cell is about ten thousand glucose molecules wide');
 assert.ok(r('oxygen')<r('glucose')&&r('glucose')<r('insulin')&&r('insulin')<r('albumin')&&r('albumin')<r('fibrinogen')&&r('fibrinogen')<r('platelet')&&r('platelet')<r('redCell')&&r('redCell')<r('whiteCell'));
});

test('a lattice holds exactly its density, wherever and however widely it is sampled',()=>{
 for(const [lattice,density] of [[cubic(3e24,1),3e24],[cubic(8.4e25,2),8.4e25],[redLattice(5.1e15),5.1e15]] as const){
  const half=lattice.gx*14,hz=lattice.gz*14;let count=0;
  assert.ok(visit(lattice,half*3,-half,hz*5,half,half,hz,1e6,()=>count++));
  const expected=density*8*half*half*hz;assert.ok(Math.abs(count/expected-1)<.02,`${count} members where ${expected.toFixed(0)} belong`);
  // A box too large for the budget is refused rather than sampled, and the estimate is an upper bound.
  assert.equal(visit(lattice,0,0,0,half,half,hz,100,()=>{}),false);assert.ok(cells(lattice,half,half,hz)>=count);
  const near=nearest(lattice,half,half,hz);assert.ok(near.distance<2*Math.max(lattice.gx,lattice.gz));
 }
 // Members stay put: the same box gives the same members.
 const seen=(l=cubic(1e24,7))=>{const out:number[]=[];visit(l,0,0,0,3e-8,3e-8,3e-8,1e5,p=>out.push(p.x,p.y,p.z,p.seed));return out;};
 assert.deepEqual(seen(),seen());
});

test('amounts are true concentrations read from the simulated body',()=>{
 // 90 mg/dL of glucose is 5.0 mmol/L; extracellular sodium is 140 mmol/L.
 assert.ok(Math.abs(amount(rest,'arterial','glucose').molar!-.004996)<2e-5);
 assert.ok(Math.abs(amount(rest,'arterial','sodium').molar!-.14)<1e-6);
 assert.equal(amount(rest,'arterial','glucose').density,perCubicMetre(amount(rest,'arterial','glucose').molar!));
 // Only dissolved gas is free in plasma: about 0.13 mmol/L of oxygen in arteries, less in veins.
 assert.ok(Math.abs(oxygenPressure(rest.transport.compartments.arterial.amounts.oxygen/rest.transport.compartments.arterial.volume)-rest.paO2)<.5);
 const o2=amount(rest,'arterial','oxygen').molar!,venous=amount(rest,'venous','oxygen').molar!;assert.ok(o2>1.2e-4&&o2<1.4e-4&&venous<o2*.5,`${o2} ${venous}`);
 assert.ok(amount(rest,'venous','carbonDioxide').molar!>amount(rest,'arterial','carbonDioxide').molar!);
 // Hormones: a cited resting concentration times the simulated level.
 assert.equal(amount(rest,'arterial','cortisol').molar,REFERENCE.cortisol.molar!*rest.hormones.cortisol);
 const meal=fed();
 assert.ok(amount(meal,'arterial','insulin').molar!>1.8*amount(rest,'arterial','insulin').molar!);
 assert.ok(amount(meal,'portal','glucose').molar!>amount(meal,'arterial','glucose').molar!&&amount(meal,'arterial','glucose').molar!>amount(rest,'arterial','glucose').molar!);
 // Cells are counts per microlitre of whole blood.
 assert.equal(amount(rest,'arterial','redCell').density,5.1e15);assert.equal(amount(rest,'arterial','redCell').where,'blood');
 // Where no usable blood value exists, nothing is drawn and nothing is invented.
 for(const id of ['trh','gnrh','renin']){const a=amount(rest,'arterial',id);assert.equal(a.known,false);assert.equal(a.density,0);assert.equal(REFERENCE[id].trust,'none');}
 for(const id of HORMONES)if(REFERENCE[id].trust!=='none')assert.ok(REFERENCE[id].molar!>1e-13&&REFERENCE[id].molar!<1e-6&&REFERENCE[id].url.startsWith('https://'),id);
 assert.equal(amount(rest,'arterial','insulin').approximate,true);assert.equal(amount(rest,'arterial','cortisol').approximate,false);
});

test('at true counts a hormone molecule is micrometres from the next, glucose nanometres',()=>{
 const insulin=meanNearest(amount(rest,'arterial','insulin').density),glucose=meanNearest(amount(rest,'arterial','glucose').density);
 assert.ok(insulin>1e-6&&insulin<4e-6,length(insulin));assert.ok(glucose>2e-9&&glucose<5e-9,length(glucose));
 // After a meal there is more insulin, so the nearest one is closer.
 assert.ok(meanNearest(amount(fed(),'arterial','insulin').density)<insulin);
});

test('lengths and concentrations read as people write them',()=>{
 assert.deepEqual([length(7.82e-6),length(7e-10),length(.0152),length(2.5e-3),length(4.5e-5)],['7.8 µm','0.70 nm','1.5 cm','2.5 mm','45 µm']);
 assert.deepEqual([molar(.005),molar(5.59e-11),molar(3.09e-7),molar(.14)],['5.00 mM','55.9 pM','309 nM','140 mM']);
 assert.deepEqual([niceLength(2.6e-9),niceLength(9.9e-6),niceLength(6e-3)].map(length),['2 nm','5 µm','5 mm']);
});
