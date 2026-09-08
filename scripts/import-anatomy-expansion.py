"""Import selected official BodyParts3D 4.3 files into an additive atlas.
Usage: python3 scripts/import-anatomy-expansion.py SOURCE_ZIP OFFICIAL_FMA2OBJ
Keeps 4.0 binaries immutable. See docs/PHYSICAL_ANATOMY.md for provenance.
"""
import sys,json,zipfile,re,gzip,hashlib,math
from pathlib import Path
from array import array
root=Path(__file__).resolve().parents[1];out=root/'public/models';base=json.loads((out/'atlas.json').read_text())
archive=Path(sys.argv[1]);membership=Path(sys.argv[2]).read_text();assert '# Objects set\t4.3' in membership
valid=set(re.findall(r'FJ\d+[A-Z]*',membership));existing={p['id'] for p in base['parts']};parts=[];concepts={};blob=bytearray();records=[]
with zipfile.ZipFile(archive) as z:
 for filename in sorted(z.namelist()):
  if not filename.endswith('.obj'):continue
  raw=z.read(filename);text=raw.decode();headers=dict(re.findall(r'^# ([^:]+?)\s*:\s*(.+)$',text,re.M));id=headers['File ID'];assert id in valid and id not in existing
  name=headers['English name'];concept=headers['Concept ID'];vertices=[];source_normals=[];faces=[]
  for line in text.splitlines():
   fields=line.split()
   if not fields:continue
   if fields[0]=='v':
    x,y,h=map(float,fields[1:4]);vertices.append((x*.001,h*.001+.0781112,-y*.001-.1))
   elif fields[0]=='f':
    f=[int(a.split('/')[0])-1 for a in fields[1:]]
    for k in range(1,len(f)-1):faces.append((f[0],f[k],f[k+1]))
  # Weld duplicate positions; area-weighted normals retain smooth anatomical contours.
  lookup={};positions=[];remap=[]
  for p in vertices:
   if p not in lookup:lookup[p]=len(positions);positions.append(p)
   remap.append(lookup[p])
  indices=[];normal=[[0.,0.,0.] for _ in positions]
  for f in faces:
   a,b,c=[remap[i] for i in f]
   if len({a,b,c})<3:continue
   indices.extend((a,b,c));p,q,r=positions[a],positions[b],positions[c];u=[q[i]-p[i] for i in range(3)];v=[r[i]-p[i] for i in range(3)];n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
   for j in (a,b,c):
    for k in range(3):normal[j][k]+=n[k]
  normals=[]
  for n in normal:
   length=math.sqrt(sum(a*a for a in n)) or 1
   normals.extend(round(a/length*32767) for a in n)
  def append(values,fmt):
   while len(blob)%4:blob.append(0)
   offset=len(blob);blob.extend(array(fmt,values).tobytes());return offset
  p={'id':id,'name':name,'conceptId':concept,'system':'endocrine' if 'gland' in name else 'venous','sourceVersion':'4.3','chunk':0,'positions':append([a for p in positions for a in p],'f'),'normals':append(normals,'h'),'indices':append(indices,'I'),'vertexCount':len(positions),'indexCount':len(indices),'bounds':[[min(p[i] for p in positions) for i in range(3)],[max(p[i] for p in positions) for i in range(3)]]}
  parts.append(p);c=concepts.setdefault(concept,{'id':concept,'name':name.lower(),'elements':[]});c['elements'].append(id)
  records.append({'id':id,'name':name,'conceptId':concept,'compatibilityVersion':headers.get('Compatibility version'),'sourceFile':Path(filename).name,'sourceSHA256':hashlib.sha256(raw).hexdigest(),'triangles':len(indices)//3,'bounds':p['bounds']})
# The thyroid's three source lobes/isthmus form an explicit compound selection.
thyroid=[p['id'] for p in parts if 'thyroid gland' in p['name'].lower() and 'parathyroid' not in p['name'].lower()]
if thyroid:concepts['FMA9603']={'id':'FMA9603','name':'thyroid gland','elements':thyroid}
assert len(parts)==34
(out/'expansion-4.3.bin').write_bytes(blob);(out/'expansion-4.3.bin.gz').write_bytes(gzip.compress(bytes(blob),mtime=0))
manifest={'version':'BodyParts3D 4.3 additions','sex':'male','source':'BodyParts3D / Anatomography','parts':parts,'concepts':list(concepts.values()),'triangles':sum(p['indexCount']//3 for p in parts),'chunks':[{'url':'/models/expansion-4.3.bin','bytes':len(blob),'gzip':'/models/expansion-4.3.bin.gz','gzipBytes':(out/'expansion-4.3.bin.gz').stat().st_size}]}
(out/'expansion.json').write_text(json.dumps(manifest,separators=(',',':')))
report={'source':'https://lifesciencedb.jp/bp3d/','manifestURL':'https://lifesciencedb.jp/bp3d/get-info.cgi?version=4.3&cmd=concept-objfiles-list','manifestSHA256':hashlib.sha256(membership.encode()).hexdigest(),'archiveSHA256':hashlib.sha256(archive.read_bytes()).hexdigest(),'coordinateTransform':'[x_mm/1000, z_mm/1000 + 0.0781112, -y_mm/1000 - 0.1] (same transform as base atlas)','geometryChanges':'Coincident vertices welded; area-weighted normals recalculated; normals quantized to int16. Source positions and triangles retained, excluding degenerate faces.','records':records}
(root/'docs/anatomy-expansion-provenance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'meshes':len(parts),'triangles':manifest['triangles'],'compressedBytes':manifest['chunks'][0]['gzipBytes']}))
