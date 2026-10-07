"""Write public/models/molecules/manifest.json from the ledger, the build report and the built GLB.

  python3 scripts/molecules/package.py
"""
import hashlib, json, pathlib, struct

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACKAGE, RUNTIME = ROOT / 'assets/molecules', ROOT / 'public/models/molecules'
ledger, build = json.loads((PACKAGE / 'ledger.json').read_text()), json.loads((PACKAGE / 'build.json').read_text())
glb = (RUNTIME / 'molecules.glb').read_bytes()
# Counts and radii are read back from the exported file, which is what the app loads: the exporter
# drops the degenerate triangles decimation can leave behind.
size = struct.unpack_from('<I', glb, 12)[0]; gltf = json.loads(glb[20:20 + size]); binary = glb[20 + size + 8:]
def read(accessor, fmt, width):
    a = gltf['accessors'][accessor]; view = gltf['bufferViews'][a['bufferView']]
    return struct.unpack_from(f"<{a['count'] * width}{fmt}", binary, view.get('byteOffset', 0) + a.get('byteOffset', 0))
built = {}
for node in gltf['nodes']:
    primitive, = gltf['meshes'][node['mesh']]['primitives']; xyz = read(primitive['attributes']['POSITION'], 'f', 3)
    built[node['name']] = {'triangles': gltf['accessors'][primitive['indices']]['count'] // 3,
                           'meshRadiusNm': round(max((xyz[i] ** 2 + xyz[i + 1] ** 2 + xyz[i + 2] ** 2) ** .5 for i in range(0, len(xyz), 3)), 4)}
molecules = [{'id': m['id'], 'name': m['name'], 'kind': m['kind'], 'style': m['style'], 'source': m['accession'] if m['database'] == 'computed' else f"{'PubChem CID' if m['database'] == 'pubchem' else 'PDB'} {m['accession']}",
              'method': m['method'], 'standIn': m['standIn'], 'note': m['note'], 'radiusNm': built[m['id']]['meshRadiusNm'], 'massDa': m['massDa'], 'triangles': built[m['id']]['triangles']} for m in ledger['molecules']]
manifest = {'id': ledger['id'], 'version': ledger['version'], 'unit': 'nm', 'url': '/models/molecules/molecules.glb', 'bytes': len(glb), 'sha256': hashlib.sha256(glb).hexdigest(),
            'triangles': sum(m['triangles'] for m in molecules), 'licenses': ledger['licenses'], 'blender': build['blender'], 'molecules': molecules}
(RUNTIME / 'manifest.json').write_text(json.dumps(manifest, indent=1) + '\n')
print(f"MANIFEST {len(molecules)} molecules, {manifest['triangles']} triangles, {len(glb)} bytes")
