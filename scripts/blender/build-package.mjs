// Clean-room build of the muscle-pilot package.
// Builds twice into fresh staging roots with the pinned Blender, audits every saved scene against
// spec.topology, requires byte-identical runtime outputs across both builds, compares the semantic
// manifest with the canonical package, then promotes by write-to-temp + rename and writes a receipt.
//
//   node scripts/blender/build-package.mjs [--blender PATH] [--allow-entity-change] [--dry-run]
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,readdir,rename,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';

const ROOT=join(dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),flag=name=>args.includes(name),option=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const BLENDER=option('--blender',join(ROOT,'work/tools/blender-4.4.3-linux-x64/blender'));
const PINNED={version:'4.4.3',archive:'work/tools/blender-4.4.3-linux-x64.tar.xz',archiveSHA256:'8d3be07d2bc412b502c6bfe3cfe3e22195a4164076867da987ce148d73c27946'};
const PACKAGE='assets/multiscale/muscle-pilot',RUNTIME='public/models/multiscale/muscle-pilot';
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
const fail=message=>{console.error(`BUILD_PACKAGE_FAILED ${message}`);process.exit(1);};
const run=(file,argv)=>execFileSync(file,argv,{cwd:ROOT,encoding:'utf8',maxBuffer:1<<28,stdio:['ignore','pipe','pipe']});
async function files(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else out.push(p);}return out.sort();}

// 1. Pinned toolchain.
if(!existsSync(BLENDER))fail(`Blender not found at ${BLENDER}; install ${PINNED.version} under work/tools (see ${PACKAGE}/README.md).`);
const version=run(BLENDER,['--version']).split('\n')[0].trim();
if(!version.startsWith(`Blender ${PINNED.version}`))fail(`expected Blender ${PINNED.version}, found "${version}"`);
const archive=join(ROOT,PINNED.archive),archiveSHA256=existsSync(archive)?await sha(archive):null;
if(archiveSHA256&&archiveSHA256!==PINNED.archiveSHA256)fail('Blender archive checksum differs from the pinned official checksum.');
const environment={blender:version,blenderExecutableSHA256:await sha(BLENDER),blenderArchiveSHA256:archiveSHA256,archiveChecksumVerified:archiveSHA256===PINNED.archiveSHA256,platform:`${os.platform()} ${os.release()} ${os.arch()}`,node:process.version};

// 2. Two fresh staging builds; only the first renders previews.
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),staging=join(ROOT,'work/staging',stamp);
const build=async(name,previews)=>{const out=join(staging,name);await mkdir(out,{recursive:true});
 const log=run(BLENDER,['--background','--factory-startup','--python','scripts/blender/build-muscle-pilot.py','--','--out-root',out,...(previews?[]:['--no-previews'])]);
 await writeFile(join(staging,`${name}.log`),log);if(!log.includes('MUSCLE_PILOT_EXPORTED'))fail(`build ${name} did not complete; see ${relative(ROOT,staging)}/${name}.log`);return out;};
console.log(`Staging in ${relative(ROOT,staging)}`);
const A=await build('a',true),B=await build('b',false);

// 3. Read-only topology audit of every saved scene against spec.topology.
const spec=join(ROOT,PACKAGE,'spec.json'),audits={};
for(const [name,root] of [['a',A],['b',B]])for(const blend of (await files(join(root,PACKAGE,'blender'))).filter(p=>p.endsWith('.blend'))){
 const level=blend.split('/').pop().replace('.blend',''),out=join(staging,`audit-${name}`,`${level}.json`);
 try{run(BLENDER,['--background','--factory-startup',blend,'--python','scripts/blender/audit-muscle-pilot.py','--',out,spec]);}catch(error){fail(`topology audit failed for ${name}/${level}: ${error.stdout?.split('\n').find(l=>l.startsWith('TOPOLOGY_FAILURES'))??error.message}`);}
 const report=JSON.parse(await readFile(out,'utf8'));(audits[level]??={})[name]=report;
}
const semantic=report=>JSON.stringify(report.objects);
for(const [level,{a,b}] of Object.entries(audits))if(semantic(a)!==semantic(b))fail(`saved ${level}.blend differs semantically between identical builds`);

// 4. Byte determinism for everything except .blend containers (embedded pointers) and previews.
const outputs=async root=>Object.fromEntries(await Promise.all((await files(root)).filter(p=>!p.includes('/previews/')).map(async p=>[relative(root,p),await sha(p)])));
const hashesA=await outputs(A),hashesB=await outputs(B);
const compared=Object.keys(hashesA).filter(p=>!p.endsWith('.blend'));
const differing=compared.filter(p=>hashesA[p]!==hashesB[p]);
if(differing.length||Object.keys(hashesA).length!==Object.keys(hashesB).length)fail(`nondeterministic outputs: ${differing.join(', ')||'file sets differ'}`);

// 5. Semantic comparison with the canonical package.
const staged=JSON.parse(await readFile(join(A,RUNTIME,'manifest.json'),'utf8'));
const canonicalPath=join(ROOT,RUNTIME,'manifest.json'),canonical=existsSync(canonicalPath)?JSON.parse(await readFile(canonicalPath,'utf8')):null;
const identity=m=>JSON.stringify({entities:m.entities.map(({id,name,kind,level,evidence})=>({id,name,kind,level,evidence})),levels:Object.fromEntries(Object.entries(m.levels).map(([k,v])=>[k,Object.fromEntries(Object.entries(v.representations).map(([lod,r])=>[lod,r.entities]))]))});
const changes=[];
if(canonical){
 if(identity(canonical)!==identity(staged)){if(!flag('--allow-entity-change'))fail('entity identity differs from the canonical package; rerun with --allow-entity-change after review.');changes.push('entity identity changed (allowed)');}
 for(const [level,v] of Object.entries(staged.levels))for(const [lod,r] of Object.entries(v.representations)){const old=canonical.levels[level]?.representations[lod];if(!old)changes.push(`${level}/${lod}: new`);else if(old.sha256!==r.sha256)changes.push(`${level}/${lod}: ${old.triangles} -> ${r.triangles} triangles`);}
 if(canonical.version!==staged.version)changes.push(`version ${canonical.version} -> ${staged.version}`);
}
console.log(JSON.stringify({semanticChanges:changes},null,2));
if(flag('--dry-run')){console.log('Dry run: nothing promoted.');process.exit(0);}

// 6. Promote: copy every file beside its destination, then rename into place.
const promote=[...Object.keys(hashesA).map(p=>[join(A,p),join(ROOT,p)]),...(await files(join(A,'previews'))).map(p=>[p,join(ROOT,'outputs/verification/p2',p.split('/').pop())])];
for(const [level,{a}] of Object.entries(audits)){const out=join(staging,'audit-a',`${level}.json`);a.blendPath=`${PACKAGE}/blender/${level}.blend`;await writeFile(out,JSON.stringify(a,null,2)+'\n');promote.push([out,join(ROOT,'validation/p2/blender-audit',`${level}.json`)]);}
const temps=[];
for(const [from,to] of promote){await mkdir(dirname(to),{recursive:true});const temp=`${to}.promote-${process.pid}`;await copyFile(from,temp);temps.push([temp,to]);}
for(const [temp,to] of temps)await rename(temp,to);

// 7. Receipt.
const rel=p=>relative(ROOT,p),promoted=Object.fromEntries(await Promise.all(temps.map(async([,to])=>[rel(to),await sha(to)])));
const inputs=Object.fromEntries(await Promise.all(['scripts/blender/build-muscle-pilot.py','scripts/blender/muscle_geometry.py','scripts/blender/blender_topology.py','scripts/blender/audit-muscle-pilot.py','scripts/blender/build-package.mjs',`${PACKAGE}/spec.json`,'public/models/atlas.json',...Object.keys(staged.provenance.sourceHashes)].map(async p=>[p,await sha(join(ROOT,p))])));
const receipt={schemaVersion:2,command:'node scripts/blender/build-package.mjs'+(args.length?' '+args.join(' '):''),environment,inputs,
 determinism:{builds:2,byteComparedFiles:compared.length,identical:true,blendComparison:'saved scenes compared by audit semantics; .blend containers embed pointers and are not byte-stable'},
 topologyAudit:{policy:`${PACKAGE}/spec.json#topology`,reports:'validation/p2/blender-audit/',failures:0},
 semanticChanges:changes,manifestSHA256:promoted[`${RUNTIME}/manifest.json`],
 blenderFiles:Object.fromEntries(Object.entries(promoted).filter(([p])=>p.endsWith('.blend')).map(([p,h])=>[p.split('/').pop(),h])),
 previews:Object.fromEntries(Object.entries(promoted).filter(([p])=>p.endsWith('-blender.png')).map(([p,h])=>[p.split('/').pop(),h])),
 outputs:Object.fromEntries(Object.entries(promoted).filter(([p])=>!p.endsWith('-blender.png'))),
 excluded:['*.blend1 backups (never written: save_version=0)','staging directories under work/staging']};
await writeFile(join(ROOT,PACKAGE,'build-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
const stale=(await files(join(ROOT,PACKAGE,'blender'))).filter(p=>p.endsWith('.blend1'));
if(stale.length)console.warn(`Stale ignored Blender backups remain and are not part of the package: ${stale.map(rel).join(', ')}`);
console.log(JSON.stringify({promoted:Object.keys(promoted).length,receipt:`${PACKAGE}/build-receipt.json`,staging:rel(staging)},null,2));
