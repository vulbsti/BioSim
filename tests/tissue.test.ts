import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inspectTissueGLB,glbEdgeTopology} from '../scripts/lib/inspect-tissue.mjs';
import {LEVELS,validateManifest,physicalLength,type TissueManifest} from '../app/tissue/assets';
import {exportTissueView,importTissueView,type TissueRecording} from '../app/tissue/recording';
import {SARCOMERE,sarcomereBands,filamentTranslation} from '../app/tissue/sarcomere';
import {defaultExcitationView} from '../app/tissue/excitation';
const root=new URL('../',import.meta.url);
const load=async()=>JSON.parse(await readFile(new URL('public/models/multiscale/muscle-pilot/manifest.json',root),'utf8')) as TissueManifest;
const hash=(data:Buffer)=>createHash('sha256').update(data).digest('hex');
test('tissue GLBs match hashes, contain finite metric geometry and preserve every entity across LODs',async()=>{
 const m=await load();validateManifest(m);
 for(const level of LEVELS)for(const lod of ['context','detail'] as const){const a=m.levels[level].representations[lod],bytes=await readFile(new URL('public'+a.url,root)),result=inspectTissueGLB(bytes);
  assert.equal(hash(bytes),a.sha256);assert.equal(result.bytes,a.bytes);assert.equal(result.triangles,a.triangles);assert.deepEqual(result.entityIds,[...a.entities].sort());assert.ok(result.primitives<=160);assert.ok(result.spanM>m.levels[level].spanM*.8&&result.spanM<m.levels[level].spanM*1.2);
  if(level!=='muscle')assert.ok(result.spanM<.002);if(level==='fiber')assert.equal(result.embeddedImages,1);
 }
 const atlas=JSON.parse(await readFile(new URL('public/models/atlas.json',root),'utf8'));
 const muscle=inspectTissueGLB(await readFile(new URL('public'+m.levels.muscle.representations.detail.url,root)));
 // Compare the actual source triangles; catalogue extents differ from packed geometry.
 for(const id of m.levels.muscle.representations.detail.entities){
  const p=atlas.parts.find((p:{id:string})=>p.id===id),b=muscle.entityBoundsM[id];
  const packed=await readFile(new URL('public'+atlas.chunks[p.chunk].url,root));
  const source={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(let i=0;i<p.indexCount;i++){
   const vertex=packed.readUInt32LE(p.indices+i*4);
   for(let axis=0;axis<3;axis++){
    const value=packed.readFloatLE(p.positions+(vertex*3+axis)*4)-m.levels.muscle.localToAtlasTranslationM![axis];
    source.min[axis]=Math.min(source.min[axis],value);source.max[axis]=Math.max(source.max[axis],value);
   }
  }
  for(let axis=0;axis<3;axis++){
   assert.ok(Math.abs(b.min[axis]-source.min[axis])<1e-7,`${id}: minimum on axis ${axis}`);
   assert.ok(Math.abs(b.max[axis]-source.max[axis])<1e-7,`${id}: maximum on axis ${axis}`);
  }
 }
 const layout=m.levels.fascicle.layout!;assert.equal(layout.fiberCentersM.length,37);assert.equal(layout.capillaryCentersM.length,5);for(const c of layout.capillaryCentersM)for(const f of layout.fiberCentersM)assert.ok(Math.hypot(c[0]-f[0],c[2]-f[2])>layout.fiberRadiusM+layout.capillaryRadiusM);
 for(const level of LEVELS)assert.ok(m.levels[level].representations.context.triangles<m.levels[level].representations.detail.triangles,`${level}: context LOD must be lighter than detail`);
});
test('muscle context LOD is a real reduced derivative that keeps identity and silhouette',async()=>{
 const m=await load(),read=async(lod:'context'|'detail')=>inspectTissueGLB(await readFile(new URL('public'+m.levels.muscle.representations[lod].url,root)));
 const context=await read('context'),detail=await read('detail');
 assert.deepEqual(context.entityIds,detail.entityIds);assert.ok(context.triangles<detail.triangles*.5);
 for(const id of detail.entityIds)for(let axis=0;axis<3;axis++){
  assert.ok(Math.abs(context.entityBoundsM[id].min[axis]-detail.entityBoundsM[id].min[axis])<.02*detail.spanM,`${id} min ${axis}`);
  assert.ok(Math.abs(context.entityBoundsM[id].max[axis]-detail.entityBoundsM[id].max[axis])<.02*detail.spanM,`${id} max ${axis}`);
 }
});
test('generated display meshes are closed except named openings; source surfaces keep their topology',async()=>{
 const m=await load(),spec=JSON.parse(await readFile(new URL('assets/multiscale/muscle-pilot/spec.json',root),'utf8')),policy=spec.topology;
 const report=JSON.parse(await readFile(new URL('assets/multiscale/muscle-pilot/topology-report.json',root),'utf8'));
 assert.deepEqual(report.policy,policy);
 for(const level of LEVELS)for(const lod of ['context','detail'] as const){
  const entries=report.levels[level][lod];assert.deepEqual(Object.keys(entries).sort(),[...m.levels[level].representations[lod].entities].sort());
  for(const [id,{verdict,stats}] of Object.entries(entries) as [string,{verdict:{status:string;reasons:string[]};stats:{boundaryEdges:number;nonManifoldEdges:number;coincidentBoundaryVertexPairs:number;componentsByBoundaryLoops:Record<string,number>}}][]){
   assert.notEqual(verdict.status,'fail',`${level}/${lod}/${id}: ${verdict.reasons}`);
   if(policy.sourceSurfaces.includes(id))assert.ok(['source-preserved','source-derived-lod'].includes(verdict.status));
   else if(policy.openings[id]){assert.equal(verdict.status,'classified-openings');assert.deepEqual(Object.keys(stats.componentsByBoundaryLoops),[String(policy.openings[id].loopsPerComponent)]);}
   else{assert.equal(verdict.status,'closed');assert.equal(stats.boundaryEdges,0);assert.equal(stats.nonManifoldEdges,0);assert.equal(stats.coincidentBoundaryVertexPairs,0);}
  }
 }
 // Independent of Blender: weld runtime GLB vertices by exact position and count edge uses.
 for(const level of LEVELS)for(const lod of ['context','detail'] as const)for(const node of glbEdgeTopology(await readFile(new URL('public'+m.levels[level].representations[lod].url,root)))){
  const id=node.extras.entityId as string;if(policy.sourceSurfaces.includes(id))continue;
  assert.equal(node.nonManifoldEdges,0,`${level}/${lod}/${id}: coincident or non-manifold faces`);
  if(!policy.openings[id])assert.equal(node.boundaryEdges,0,`${level}/${lod}/${id}: unclassified opening in GLB bytes`);
 }
 // Saved-scene audits must describe the committed .blend bytes and report no failures.
 const receipt=JSON.parse(await readFile(new URL('assets/multiscale/muscle-pilot/build-receipt.json',root),'utf8'));
 for(const level of LEVELS){
  const audit=JSON.parse(await readFile(new URL(`validation/p2/blender-audit/${level}.json`,root),'utf8'));
  assert.equal(audit.blendSHA256,hash(await readFile(new URL(`assets/multiscale/muscle-pilot/blender/${level}.blend`,root))));
  assert.equal(audit.blendSHA256,receipt.blenderFiles[`${level}.blend`]);assert.equal(audit.topologyPolicyApplied,true);assert.deepEqual(audit.topologyFailures,[]);
 }
 assert.equal(receipt.determinism.identical,true);assert.ok(receipt.determinism.byteComparedFiles>=10);
});
test('collision and simulation derivatives are separate, hash-bound and watertight in their GLB bytes',async()=>{
 const index=JSON.parse(await readFile(new URL('assets/multiscale/muscle-pilot/derivatives/derivatives.json',root),'utf8')),m=await load();
 for(const level of LEVELS){
  const d=index.levels[level],bytes=await readFile(new URL(d.file,root));assert.equal(hash(bytes),d.sha256);assert.equal(d.kind,level==='muscle'?'simulation':'collision');
  const nodes=glbEdgeTopology(bytes);assert.deepEqual(nodes.map(n=>n.extras.derivedFrom).sort(),[...m.levels[level].representations.detail.entities].sort());
  for(const n of nodes){assert.equal(n.boundaryEdges,0,`${n.name} open`);assert.equal(n.nonManifoldEdges,0,`${n.name} non-manifold`);assert.equal(n.extras.entityId,undefined,'derivatives must not masquerade as display entities');}
  for(const r of d.objects)assert.ok(r.closedVolumeM3>0,r.object);
 }
 for(const lod of ['context','detail'] as const)for(const level of LEVELS)assert.ok(!m.levels[level].representations[lod].url.includes('derivative'));
});
test('source anatomy stays separate from representative cells and manifests reject unit or identity drift',async()=>{
 const m=await load();assert.equal(m.entities.find(e=>e.id==='FJ1442')!.evidence,'source-surface');assert.ok(m.entities.filter(e=>e.level!=='muscle').every(e=>e.evidence==='representative'));
 const wrong=structuredClone(m);wrong.metersPerAssetUnit=.001;assert.throws(()=>validateManifest(wrong),/physical scale/);
 const missing=structuredClone(m);missing.levels.fiber.representations.context.entities.pop();assert.throws(()=>validateManifest(missing),/identity/);
 const external=structuredClone(m);external.levels.muscle.representations.detail.url='https://invalid.test/model.glb';assert.throws(()=>validateManifest(external),/contract/);
 assert.equal(physicalLength(50e-6),'50.0 µm');assert.equal(physicalLength(.0012),'1.20 mm');assert.equal(physicalLength(15e-9),'15.0 nm');
});
test('independent GLB inspection rejects corrupted headers, indices and physical metadata',async()=>{
 const m=await load(),bytes=await readFile(new URL('public'+m.levels.fiber.representations.detail.url,root));
 const header=Buffer.from(bytes);header.writeUInt32LE(bytes.length+8,8);assert.throws(()=>inspectTissueGLB(header),/header/);
 const length=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+length).toString()),bad=Buffer.from(bytes),a=json.accessors[json.meshes[0].primitives[0].indices],v=json.bufferViews[a.bufferView],offset=20+length+8+(v.byteOffset??0)+(a.byteOffset??0);
 if(a.componentType===5123)bad.writeUInt16LE(65535,offset);else bad.writeUInt32LE(0xffffffff,offset);assert.throws(()=>inspectTissueGLB(bad),/Index outside/);
 const text=bytes.subarray(20,20+length).toString().replace('"metersPerUnit":1.0','"metersPerUnit":0.1');assert.notEqual(text,bytes.subarray(20,20+length).toString());const metadata=Buffer.from(bytes);metadata.write(text,20,'utf8');assert.throws(()=>inspectTissueGLB(metadata),/physical identity/);
});
test('tissue recordings preserve scale, selection and playhead while rejecting incompatible packages before loading',async()=>{
 const m=await load();const state:TissueRecording={level:'sarcomere',lod:'context',selection:{muscle:'FJ1442',fascicle:'pilot-fiber-12',fiber:'pilot-myonuclei',sarcomere:'pilot-thin-left'},showSheath:false,showBone:false,section:'cross',slice:.63,angle:'end',signal:true,time:901.25,sarcomereLength:2.1e-6,excitation:{enabled:true,config:{stimulus:'train',releaseScale:1},timeMs:107.5}};
 const text=exportTissueView(m,state);assert.deepEqual(importTissueView(m,text),state);
 const wrong=JSON.parse(text);wrong.package.hashes[0]='0'.repeat(64);assert.throws(()=>importTissueView(m,JSON.stringify(wrong)),/compatible/);
 const bad=JSON.parse(text);bad.selection.fiber='FJ1442';assert.throws(()=>importTissueView(m,JSON.stringify(bad)),/compatible/);
 assert.throws(()=>importTissueView(m,'{"format":"human-atlas/mechanism-experiment"}'),/compatible/);assert.equal(state.time,901.25);
 const badLength=JSON.parse(text);badLength.sarcomereLength=0;assert.throws(()=>importTissueView(m,JSON.stringify(badLength)),/inspection range/);
 const badModel=JSON.parse(text);badModel.excitationModel='wrong';assert.throws(()=>importTissueView(m,JSON.stringify(badModel)),/excitation model/);
 const badTime=JSON.parse(text);badTime.excitation.timeMs=501;assert.throws(()=>importTissueView(m,JSON.stringify(badTime)),/excitation view/);
 const badRelease=JSON.parse(text);badRelease.excitation.config.releaseScale=-1;assert.throws(()=>importTissueView(m,JSON.stringify(badRelease)),/excitation experiment/);
 const old=JSON.parse(text);delete old.excitation;delete old.excitationModel;delete old.excitationSolver;assert.deepEqual(importTissueView(m,JSON.stringify(old)).excitation,defaultExcitationView());
});
test('exported filament endpoints remain anchored while shortening changes overlap, not filament lengths',async()=>{
 const m=await load(),spec=JSON.parse(await readFile(new URL('assets/multiscale/muscle-pilot/spec.json',root),'utf8')).levels.sarcomere;
 assert.equal(spec.restLengthM,SARCOMERE.rest);assert.equal(spec.thickLengthM,SARCOMERE.thick);assert.equal(spec.thinLengthM,SARCOMERE.thin);
 const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-12,`${a} differs from ${b}`);
 for(const lod of ['context','detail'] as const){
  const bytes=await readFile(new URL('public'+m.levels.sarcomere.representations[lod].url,root)),asset=inspectTissueGLB(bytes);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const bounds=asset.entityBoundsM;
  near(bounds['pilot-thick-filaments'].max[1]-bounds['pilot-thick-filaments'].min[1],1.6e-6);
  for(const [label,side] of [['left',-1],['right',1]] as const){
   for(const id of [`pilot-thin-${label}`,`pilot-z-${label}`])assert.equal(json.nodes.find((n:{extras?:{entityId:string}})=>n.extras?.entityId===id).extras.slidingSide,side);
   const thin=bounds[`pilot-thin-${label}`],z=bounds[`pilot-z-${label}`];near(thin.max[1]-thin.min[1],1e-6);
   for(const length of [2e-6,2.5e-6,3.2e-6]){
    const offset=filamentTranslation(side,length),edge=(z.min[1]+z.max[1])/2+offset;
    near(edge,side*length/2);near((side===-1?thin.min[1]:thin.max[1])+offset,edge);
    near((thin.max[1]+offset)-(thin.min[1]+offset),1e-6);
   }
  }
 }
 near(sarcomereBands(2e-6).hZone,0);near(sarcomereBands(2.5e-6).hZone,.5e-6);near(sarcomereBands(3.2e-6).overlapPerSide,.2e-6);
 for(const length of [2e-6,2.5e-6,3.2e-6]){near(sarcomereBands(length).aBand,1.6e-6);near(filamentTranslation(0,length),0);}
 for(const invalid of [NaN,Infinity,0,1.9e-6,3.3e-6])assert.throws(()=>sarcomereBands(invalid));
});
test('every spec dimension has one honest parameter-ledger entry with pending human review',async()=>{
 const spec=JSON.parse(await readFile(new URL('assets/multiscale/muscle-pilot/spec.json',root),'utf8')),ledger=JSON.parse(await readFile(new URL('assets/multiscale/muscle-pilot/parameter-ledger.json',root),'utf8'));
 assert.equal(ledger.packageVersion,spec.version);
 const numeric=Object.entries(spec.levels as Record<string,Record<string,unknown>>).flatMap(([level,cfg])=>Object.entries(cfg).filter(([,v])=>typeof v==='number').map(([k,v])=>[`/levels/${level}/${k}`,v]));
 assert.deepEqual(ledger.entries.map((e:{specPointer:string})=>e.specPointer).sort(),numeric.map(([p])=>p).sort());
 for(const e of ledger.entries){
  const [,,level,key]=e.specPointer.split('/');assert.equal(e.value,spec.levels[level][key],e.id);
  assert.ok(ledger.policy.evidenceClasses.includes(e.evidenceClass),e.id);assert.ok(['m','1'].includes(e.unit),e.id);
  if(ledger.policy.evidenceClasses.indexOf(e.evidenceClass)<ledger.policy.evidenceClasses.indexOf('representative-choice'))assert.ok(e.source.locator&&e.uncertainty,`${e.id}: measured classes need a locator and uncertainty`);
  for(const r of Object.values(e.review) as {status:string;reviewer:string|null;date:string|null}[]){assert.ok(ledger.policy.reviewStatuses.includes(r.status));if(r.status==='approved'||r.status==='rejected')assert.ok(r.reviewer&&r.date,`${e.id}: verdicts need a named reviewer`);}
 }
});
