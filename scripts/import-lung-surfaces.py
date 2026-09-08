"""Add the five separately identified BodyParts3D 3.0 reference lung lobes.
Usage: python3 scripts/import-lung-surfaces.py DIRECTORY COMMIT_SHA
Expected files: human-atlas-FMA7333.stl, FMA7337, FMA7370, FMA7371, FMA7383.
These retain their own source version: they are an approximate reference overlay,
not evidence of exact registration with the 4.0 airway tree. See PHYSICAL_ANATOMY.md.
"""
import json,struct,gzip,hashlib,math,sys
from pathlib import Path
from array import array
root=Path(__file__).resolve().parents[1];source=Path(sys.argv[1]);commit=sys.argv[2];out=root/'public/models'
names={'FMA7333':'Upper lobe of right lung','FMA7337':'Lower lobe of right lung','FMA7370':'Upper lobe of left lung','FMA7371':'Lower lobe of left lung','FMA7383':'Middle lobe of right lung'}
parts=[];concepts=[];records=[];blob=bytearray()
for id,name in names.items():
 raw=(source/f'human-atlas-{id}.stl').read_bytes();n=struct.unpack_from('<I',raw,80)[0];assert len(raw)==84+50*n
 positions=[];lookup={};indices=[];normal=[]
 for i in range(n):
  values=struct.unpack_from('<12f',raw,84+50*i);face=[]
  for j in range(3):
   x,y,z=values[3+3*j:6+3*j];p=(x*.001,z*.001+.0781112,-y*.001-.1)
   if p not in lookup:lookup[p]=len(positions);positions.append(p);normal.append([0.,0.,0.])
   face.append(lookup[p])
  if len(set(face))<3:continue
  indices.extend(face);a,b,c=[positions[j] for j in face];u=[b[j]-a[j] for j in range(3)];v=[c[j]-a[j] for j in range(3)];vn=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
  for vi in face:
   for j in range(3):normal[vi][j]+=vn[j]
 normals=[]
 for v in normal:
  length=math.sqrt(sum(x*x for x in v)) or 1;normals.extend(round(x/length*32767) for x in v)
 def append(values,fmt):
  while len(blob)%4:blob.append(0)
  pos=len(blob);blob.extend(array(fmt,values).tobytes());return pos
 p={'id':'BP3D3-'+id,'name':name+' surface','conceptId':id,'system':'respiratory','sourceVersion':'3.0 reference surface','chunk':0,'positions':append([a for p in positions for a in p],'f'),'normals':append(normals,'h'),'indices':append(indices,'I'),'vertexCount':len(positions),'indexCount':len(indices),'bounds':[[min(p[j] for p in positions) for j in range(3)],[max(p[j] for p in positions) for j in range(3)]]};parts.append(p);concepts.append({'id':id,'name':name.lower(),'elements':[p['id']]})
 records.append({'id':p['id'],'name':name,'version':'BodyParts3D 3.0','sourceURL':f'https://raw.githubusercontent.com/Kevin-Mattheus-Moerman/BodyParts3D/{commit}/assets/BodyParts3D_data/stl/{id}.stl','sourceSHA256':hashlib.sha256(raw).hexdigest(),'sourceTriangles':n,'triangles':len(indices)//3,'bounds':p['bounds']})
for side,cid in [('right','FMA7309'),('left','FMA7310')]:concepts.append({'id':cid,'name':side+' lung','elements':[p['id'] for p in parts if side in p['name']]})
(out/'lung-surfaces.bin').write_bytes(blob);compressed=gzip.compress(bytes(blob),mtime=0);(out/'lung-surfaces.bin.gz').write_bytes(compressed)
manifest={'version':'BodyParts3D 3.0 reference lung surfaces','source':'BodyParts3D; STL conversion by Kevin Mattheus Moerman','parts':parts,'concepts':concepts,'triangles':sum(p['indexCount']//3 for p in parts),'chunks':[{'url':'/models/lung-surfaces.bin','bytes':len(blob),'gzip':'/models/lung-surfaces.bin.gz','gzipBytes':len(compressed)}]}
(out/'lung-surfaces.json').write_text(json.dumps(manifest,separators=(',',':')))
report={'scope':'Five 3.0 lung lobe reference surfaces. Approximate overlay with the 4.0 anatomy; no claim of exact airway/surface registration. No warp or fit was applied.','coordinateTransform':'[x_mm/1000,z_mm/1000+0.0781112,-y_mm/1000-0.1]','license':'CC BY-SA 2.1 Japan, as distributed by the STL source','sourceCommit':commit,'landmarkCheck':json.loads((source/'human-atlas-lung-registration.json').read_text()),'records':records}
(root/'docs/lung-surface-provenance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'parts':len(parts),'triangles':manifest['triangles'],'gzipBytes':len(compressed)}))
