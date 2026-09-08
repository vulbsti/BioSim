import {readFile,writeFile} from 'node:fs/promises';
import {auditBrainVessels} from '../app/simulation/brain-coverage';
const atlas=JSON.parse(await readFile(new URL('../public/models/atlas.json',import.meta.url),'utf8'));
const audit=auditBrainVessels(atlas);
await writeFile(new URL('../docs/brain-vessel-coverage.json',import.meta.url),JSON.stringify({source:'BodyParts3D atlas.json',...audit},null,2)+'\n');
console.log(JSON.stringify({candidateMeshes:audit.vessels.length,counts:audit.counts,missingVenousGeometry:audit.missingVenousGeometry},null,2));
