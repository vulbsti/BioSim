import {readFile,writeFile} from 'node:fs/promises';
import {combineAtlases} from '../app/atlas-loader';
import {auditBrainVessels} from '../app/simulation/brain-coverage';
const [base,expansion,lungs]=await Promise.all(['atlas.json','expansion.json','lung-surfaces.json'].map(async name=>JSON.parse(await readFile(new URL(`../public/models/${name}`,import.meta.url),'utf8'))));
const atlas=combineAtlases(combineAtlases(base,expansion),lungs);
const audit=auditBrainVessels(atlas);
await writeFile(new URL('../docs/brain-vessel-coverage.json',import.meta.url),JSON.stringify({source:'BodyParts3D reference assembly: atlas.json + expansion.json + lung-surfaces.json',...audit},null,2)+'\n');
console.log(JSON.stringify({candidateMeshes:audit.vessels.length,counts:audit.counts,missingVenousGeometry:audit.missingVenousGeometry},null,2));
