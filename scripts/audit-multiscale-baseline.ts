import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {combineAtlases} from '../app/atlas-loader';
import {createAnatomyIndex} from '../app/physical/anatomy-view';
import {createBody, MODEL_VERSION} from '../app/simulation/engine';
import {HORMONES, SUBSTANCES} from '../app/simulation/types';
import {brainNodes, brainEdges} from '../app/simulation/brain';
import {auditBrainVessels} from '../app/simulation/brain-coverage';
import type {Atlas} from '../app/anatomy';

const root = new URL('../', import.meta.url);
const manifests = ['public/models/atlas.json', 'public/models/expansion.json', 'public/models/lung-surfaces.json'];
const sources = [
  ...manifests, 'app/atlas-loader.ts', 'app/physical/anatomy-view.ts',
  'app/physical/motion.ts', 'app/physical/flow-routes.ts', 'app/simulation/types.ts',
  'app/simulation/transport.ts', 'app/simulation/endocrine.ts', 'app/simulation/engine.ts',
  'app/simulation/brain.ts', 'app/simulation/brain-coverage.ts', 'scripts/audit-multiscale-baseline.ts',
];
const loaded = await Promise.all(manifests.map(async path => JSON.parse(await readFile(new URL(path, root), 'utf8')) as Atlas));
const atlas = loaded.reduce(combineAtlases);
const index = createAnatomyIndex(atlas);
const body = createBody();
const coverage = auditBrainVessels(atlas);
const audit = {
  schemaVersion: 1,
  auditedOn: new Date().toISOString().slice(0, 10),
  sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
  invocation: 'npx tsx scripts/audit-multiscale-baseline.ts',
  method: 'Imported live atlas assembly and simulation modules; constructed baseline state; reran cerebral candidate classification. No time integration, rendering, anatomical review or biological validation was performed for this audit. Source hashes identify working-tree inputs independently of the commit.',
  modelVersion: MODEL_VERSION,
  geometry: {
    meshes: atlas.parts.length, namedConcepts: atlas.concepts.length, triangles: atlas.triangles,
    meshesByDisplaySystem: Object.fromEntries([...new Set(atlas.parts.map(p => p.system))].map(k => [k, atlas.parts.filter(p => p.system === k).length])),
    curatedBrainGroupMeshes: index.groups.brain.size,
    scope: 'Mixed-version BodyParts3D adult male reference assembly. Display-system counts are neither anatomical completeness nor verified topology.',
  },
  simulation: {
    compartments: Object.keys(body.transport.compartments).length,
    compartmentsByKind: Object.fromEntries(['blood', 'tissue', 'lymph'].map(k => [k, Object.values(body.transport.compartments).filter(c => c.kind === k).length])),
    transportedSubstances: [...SUBSTANCES], relativeEndocrineSignals: [...HORMONES],
    digestiveEnzymeProxies: Object.keys(body.enzymes),
  },
  brain: {
    schematicNodes: brainNodes.length, schematicPaths: brainEdges.length,
    vascularCandidateMeshes: coverage.vessels.length, candidateCounts: coverage.counts,
    scope: coverage.scope, labelAssociationIsVerifiedConnectivity: false,
  },
  sourceHashes: Object.fromEntries(await Promise.all(sources.map(async path => [path, createHash('sha256').update(await readFile(new URL(path, root))).digest('hex')]))),
};
await writeFile(new URL('docs/multiscale-baseline-audit.json', root), JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify({audit: 'docs/multiscale-baseline-audit.json', meshes: audit.geometry.meshes, nervousMeshes: audit.geometry.meshesByDisplaySystem.nervous, compartments: audit.simulation.compartments, brain: audit.brain}, null, 2));
