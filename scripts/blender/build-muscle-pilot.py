"""Build a reproducible, metric, representative muscle inspection package.
Run: blender --background --factory-startup --python scripts/blender/build-muscle-pilot.py
Original source buffers remain untouched. No human microstructure registration is implied.
"""
import bpy, math, json, struct, hashlib, random, itertools
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'assets/multiscale/muscle-pilot'
OUT=ROOT/'public/models/multiscale/muscle-pilot'
PREVIEW=ROOT/'outputs/verification/p2'
for p in [SOURCE/'blender',OUT,PREVIEW]:p.mkdir(parents=True,exist_ok=True)
SPEC=json.loads((SOURCE/'spec.json').read_text())
ATLAS=json.loads((ROOT/'public/models/atlas.json').read_text())
entities={}; levels={}; sources={}
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def color(h):
    rgb=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
def material(name,h,rough=.5,alpha=1):
    m=bpy.data.materials.new(name);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color(h);p.inputs['Roughness'].default_value=rough;p.inputs['Alpha'].default_value=alpha
    m.diffuse_color=color(h)[:3]+(alpha,)
    if alpha<1:m.surface_render_method='DITHERED'
    return m
def prepare():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for m in list(bpy.data.materials):bpy.data.materials.remove(m)
    sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1
    return {'muscle':material('Muscle tissue','#a9504c',.52),'fiber':material('Myofiber','#be7664',.53),'sheath':material('Connective sheath','#dfc3a9',.63),'bone':material('Cortical bone','#d9d1b7',.7),'nucleus':material('Myonuclei','#756581',.48),'mito':material('Mitochondria','#a07540',.5),'capillary':material('Capillary wall','#ad5459',.47),'blood':material('Erythrocyte','#a73546',.39),'glut4':material('Membrane transport sites','#83c4ae',.35)}
class Mesh:
    def __init__(self):self.v=[];self.f=[];self.uv=[];self.smooth=[]
    def face(self,ids,uv,smooth=True):self.f.append(tuple(ids));self.uv.append(uv);self.smooth.append(smooth)
    def tube(self,x,y,r,length,segments=16,steps=1,arc=None,zoffset=0,period=None):
        start=len(self.v);a0,a1=arc or (0,math.tau);closed=arc is None
        # Duplicate seam vertices for unambiguous periodic UVs.
        for j in range(steps+1):
            z=(j/steps-.5)*length+zoffset
            for i in range(segments+1):
                a=a0+(a1-a0)*i/segments
                self.v.append((x+r*math.cos(a),y+r*math.sin(a),z))
        for j in range(steps):
            v0=((j/steps-.5)*length+zoffset)/(period or length);v1=(((j+1)/steps-.5)*length+zoffset)/(period or length)
            for i in range(segments):
                a=start+j*(segments+1)+i;b=a+segments+1
                self.face([a,a+1,b+1,b],[(i/segments,v0),((i+1)/segments,v0),((i+1)/segments,v1),(i/segments,v1)])
        if closed:
            for j in [0,steps]:
                center=len(self.v);self.v.append((x,y,(j/steps-.5)*length+zoffset))
                for i in range(segments):
                    a=start+j*(segments+1)+i
                    ids=[center,a+1,a] if j==0 else [center,a,a+1]
                    uv=[(.5,.5)]+[(.5+.45*math.cos(a0+(a1-a0)*n/segments),.5+.45*math.sin(a0+(a1-a0)*n/segments)) for n in ([i+1,i] if j==0 else [i,i+1])]
                    self.face(ids,uv,False)
    def ellipsoid(self,center,radii,segments=12,rings=6,biconcave=False):
        start=len(self.v);x,y,z=center;rx,ry,rz=radii
        self.v.append((x,y,z+rz*(.3 if biconcave else 1)))
        for j in range(1,rings):
            phi=math.pi*j/rings
            for i in range(segments):
                a=math.tau*i/segments;s=math.sin(phi);q=math.cos(phi)*(.3+.7*s*s if biconcave else 1)
                self.v.append((x+rx*s*math.cos(a),y+ry*s*math.sin(a),z+rz*q))
        bottom=len(self.v);self.v.append((x,y,z-rz*(.3 if biconcave else 1)))
        for i in range(segments):
            self.face([start,start+1+i,start+1+(i+1)%segments],[(0,0)]*3)
            last=start+1+(rings-2)*segments
            self.face([bottom,last+(i+1)%segments,last+i],[(0,0)]*3)
        for j in range(rings-2):
            for i in range(segments):
                a=start+1+j*segments+i;b=start+1+j*segments+(i+1)%segments
                self.face([a,a+segments,b+segments,b],[(0,0)]*4)
    def link(self,a,b,r,segments=6):
        start=len(self.v);a,b=Vector(a),Vector(b);axis=b-a
        self.tube(0,0,r,axis.length,segments)
        rotation=Vector((0,0,1)).rotation_difference(axis.normalized())
        center=(a+b)/2
        for i in range(start,len(self.v)):self.v[i]=tuple(rotation@Vector(self.v[i])+center)
    def object(self,id,name,mat,kind,level,description,**extra):
        mesh=bpy.data.meshes.new(id);mesh.from_pydata(self.v,[],self.f);mesh.update()
        uv=mesh.uv_layers.new(name='UVMap')
        for poly,coords,smooth in zip(mesh.polygons,self.uv,self.smooth):
            poly.use_smooth=smooth
            for loop,coord in zip(poly.loop_indices,coords):uv.data[loop].uv=coord
        obj=bpy.data.objects.new(id,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(mat)
        obj['entityId']=id;obj['kind']=kind;obj['evidence']='source-surface' if id.startswith('FJ') else 'representative';obj['metersPerUnit']=1.0
        entities[id]={'id':id,'name':name,'kind':kind,'level':level,'description':description,'evidence':obj['evidence'],**extra}
        return obj

def hexgrid(rings,pitch):
    out=[]
    for q in range(-rings,rings+1):
        for r in range(-rings,rings+1):
            if max(abs(q),abs(r),abs(q+r))<=rings:out.append((pitch*(q+r/2),pitch*math.sqrt(3)/2*r))
    return sorted(out,key=lambda xy:xy[0]**2+xy[1]**2)

def source_part(id,mat,origin):
    p=next(p for p in ATLAS['parts'] if p['id']==id);chunk=ROOT/'public'/ATLAS['chunks'][p['chunk']]['url'].lstrip('/')
    data=chunk.read_bytes();positions=struct.unpack_from('<'+'f'*p['vertexCount']*3,data,p['positions']);indices=struct.unpack_from('<'+'I'*p['indexCount'],data,p['indices'])
    m=Mesh();m.v=[(positions[i]-origin[0],-(positions[i+2]-origin[2]),positions[i+1]-origin[1]) for i in range(0,len(positions),3)]
    for i in range(0,len(indices),3):m.face(indices[i:i+3],[(0,0)]*3)
    obj=m.object(id,p['name'],mat,'bone' if id!='FJ1442' else 'muscle','muscle','BodyParts3D 4.0 source surface; local translation only.',sourceConcept=p['conceptId'])
    sources[str(chunk.relative_to(ROOT))]=sha(chunk)
    return obj

def build_muscle(detail):
    mats=prepare();p=next(p for p in ATLAS['parts'] if p['id']=='FJ1442');origin=[(a+b)/2 for a,b in zip(*p['bounds'])]
    for id in ['FJ1442','FJ3365','FJ3381']:source_part(id,mats['muscle' if id=='FJ1442' else 'bone'],origin)
    return {'localToAtlasTranslationM':origin,'spanM':p['bounds'][1][1]-p['bounds'][0][1],'description':'Right vastus lateralis with femur and patella context; original surface topology retained.'}

def build_fascicle(detail):
    mats=prepare();seg=24 if detail else 12
    for i,(x,y) in enumerate(hexgrid(3,55e-6)):
        m=Mesh();length=.0012+(0.00013 if i==0 else 0)
        m.tube(x,y,25e-6,length,seg,2,zoffset=.000065 if i==0 else 0)
        m.object(f'pilot-fiber-{i:02d}',f'Muscle fiber {i+1:02d}',mats['fiber'],'myofiber','fascicle','One representative fiber segment; the population is not a counted source fascicle.',diameterM=50e-6)
    m=Mesh();m.tube(0,0,.000195,.00113,seg*2,3,arc=(-.9,4.04));m.object('pilot-perimysium','Perimysium',mats['sheath'],'sheath','fascicle','Connective sheath opened along a longitudinal teaching window.')
    centers=hexgrid(3,55e-6);voids=[]
    for triple in itertools.combinations(centers,3):
        if all(abs(math.dist(a,b)-55e-6)<1e-10 for a,b in itertools.combinations(triple,2)):
            voids.append(tuple(sum(p[i] for p in triple)/3 for i in [0,1]))
    capillary_centers=sorted(voids,key=lambda xy:xy[0]**2+xy[1]**2)[:5]
    assert all(math.dist(c,f)>28.5e-6 for c in capillary_centers for f in centers), 'Capillaries must remain outside fibers'
    m=Mesh()
    for x,y in capillary_centers:m.tube(x,y,3.5e-6,.00132,10 if detail else 6)
    m.object('pilot-fascicle-capillaries','Capillary segments',mats['capillary'],'capillary','fascicle','Representative longitudinal capillary segments; no vascular connectivity or perfusion solution.',diameterM=7e-6)
    return {'spanM':.00139,'layout':{'fiberCentersM':[[x,0,-y] for x,y in centers],'capillaryCentersM':[[x,0,-y] for x,y in capillary_centers],'fiberRadiusM':25e-6,'capillaryRadiusM':3.5e-6},'description':'37 representative fiber segments, perimysium window and capillary segments; 400 µm nominal fascicle diameter.'}

def striated(mat):
    image=bpy.data.images.new('Representative sarcomere banding',width=16,height=128)
    rng=random.Random(84);pixels=[]
    for y in range(128):
        t=y/128
        base=(.50,.225,.18) if t<.035 or t>.965 else (.69,.38,.29) if .25<t<.75 else (.84,.55,.40)
        for x in range(16):
            noise=1+rng.uniform(-.04,.04);pixels.extend([v*noise for v in base]+[1])
    image.pixels.foreach_set(pixels);image.filepath_raw=str(SOURCE/'sarcomere-bands.png');image.file_format='PNG';image.save();image.pack()
    node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image;node.extension='REPEAT';mat.node_tree.links.new(node.outputs['Color'],mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

def build_fiber(detail):
    mats=prepare();striated(mats['fiber']);seg=12 if detail else 6
    m=Mesh();m.tube(0,0,25e-6,.00024,48 if detail else 24,2,arc=(-.8,3.94));m.object('pilot-sarcolemma','Sarcolemma',mats['muscle'],'membrane','fiber','Representative 50 µm fiber with a longitudinal inspection window; only a 240 µm segment is shown.')
    m=Mesh();count=0
    for x,y in hexgrid(14,1.65e-6):
        if math.hypot(x,y)>19.9e-6:continue
        m.tube(x,y,.6e-6,.000248,seg,1,period=2.5e-6);count+=1
    m.object('pilot-myofibrils','Striated myofibrils',mats['fiber'],'myofibrils','fiber','Representative packed myofibrils. Painted repeats illustrate sarcomeres; filaments and contraction are not simulated.',representedCount=count,diameterM=1.2e-6,sarcomereRepeatM=2.5e-6)
    m=Mesh()
    for i in range(8):
        a=-.65+i*math.tau/8;r=22.6e-6;m.ellipsoid((r*math.cos(a),r*math.sin(a),(i%4-1.5)*58e-6),(1.8e-6,1.8e-6,5.4e-6),16 if detail else 10)
    m.object('pilot-myonuclei','Peripheral myonuclei',mats['nucleus'],'nuclei','fiber','Illustrative peripheral nuclei in a multinucleated skeletal muscle fiber.',representedCount=8)
    m=Mesh()
    for i in range(40):
        a=i*2.399963;r=22.2e-6;z=((i*17)%37/37-.5)*.00022
        # Keep peripheral mitochondria away from the selected nuclear volumes.
        if any((z-(j%4-1.5)*58e-6)**2+(r*math.cos(a)-22.6e-6*math.cos(-.65+j*math.tau/8))**2+(r*math.sin(a)-22.6e-6*math.sin(-.65+j*math.tau/8))**2<(7e-6)**2 for j in range(8)):continue
        m.ellipsoid((r*math.cos(a),r*math.sin(a),z),(.65e-6,.65e-6,2.2e-6),10 if detail else 6,4)
    m.object('pilot-mitochondria','Peripheral mitochondria',mats['mito'],'mitochondria','fiber','Representative organelles; density and ATP production are not measured or simulated.')
    m=Mesh();m.tube(-33e-6,0,4e-6,.000268,20 if detail else 10,2,arc=(-.8,3.94));m.object('pilot-fiber-capillary','Adjacent capillary',mats['capillary'],'capillary','fiber','Opened representative capillary beside the fiber; geometry is not a registered vascular domain.',diameterM=8e-6)
    m=Mesh()
    for i in range(9):m.ellipsoid((-33e-6,0,(i-4)*27e-6),(3.2e-6,3.2e-6,1.15e-6),16 if detail else 8,8 if detail else 4,True)
    m.object('pilot-erythrocytes','Erythrocytes',mats['blood'],'erythrocytes','fiber','Representative biconcave cells inside the capillary; their positions are illustrative.',representedCount=9)
    m=Mesh()
    for i in range(24):
        a=-.72+(i%6)/5*4.58;r=25.2e-6;z=(i//6-1.5)*45e-6;m.ellipsoid((r*math.cos(a),r*math.sin(a),z),(.6e-6,.6e-6,1.3e-6),8,4)
    m.object('pilot-glut4-sites','GLUT4 display sites',mats['glut4'],'glut4','fiber','Representative display markers; geometry and marker count are not molecular structures or measured transporter inventory.',representedCount=24)
    return {'spanM':.000268,'description':'Representative 240 µm muscle-fiber segment: opened sarcolemma, packed striated myofibrils, nuclei, mitochondria and adjacent capillary.'}

def build_sarcomere(detail):
    prepare()
    thin=material('Actin-rich thin filaments','#d3ad77',.48)
    thick=material('Myosin-rich thick filaments','#b85f65',.42)
    anchor=material('Z disc lattice','#8fabb4',.6)
    mid=material('M line links','#9c8cab',.6)
    cfg=SPEC['levels']['sarcomere'];length=cfg['restLengthM'];pitch=cfg['thickLatticePitchM']
    centers=hexgrid(5,pitch);radius=5*pitch+15e-9
    # Thin filaments occupy triangular interstices of the thick-filament lattice.
    # This is a cropped lattice, not a full myofibril or a protein reconstruction.
    thin_centers=set()
    for x,y in centers:
        for dx,dy in [(pitch/2,pitch*math.sqrt(3)/6),(0,pitch*math.sqrt(3)/3)]:
            p=(x+dx,y+dy)
            if math.hypot(*p)<radius-8e-9:thin_centers.add(p)
    m=Mesh()
    for x,y in centers:
        m.tube(x,y,7.5e-9,cfg['thickLengthM'],10 if detail else 6)
        if detail:
            # Sparse heads communicate bipolar organization; no head kinetics.
            for side in [-1,1]:
                for j in range(6):
                    z=side*(.15+j*.11)*1e-6;a=j*2.399963
                    m.link((x+7e-9*math.cos(a),y+7e-9*math.sin(a),z),(x+18e-9*math.cos(a),y+18e-9*math.sin(a),z-side*12e-9),2.5e-9)
    m.object('pilot-thick-filaments','Thick filaments · myosin',thick,'thick-filament','sarcomere','Central bipolar filaments with sparse illustrative heads. Filament length stays fixed during sliding; no ATP or cross-bridge kinetics.',representedCount=len(centers),diameterM=15e-9)
    for side,label in [(-1,'left'),(1,'right')]:
        m=Mesh()
        for x,y in sorted(thin_centers):m.tube(x,y,3.5e-9,cfg['thinLengthM'],8 if detail else 5,zoffset=side*(length-cfg['thinLengthM'])/2)
        obj=m.object(f'pilot-thin-{label}',f'Thin filaments · {label} Z disc',thin,'thin-filament','sarcomere','Actin-rich filaments anchored to this Z disc. Translate toward the M line without changing filament length. Troponin and tropomyosin are unresolved.',representedCount=len(thin_centers),diameterM=7e-9)
        obj['slidingSide']=side
        m=Mesh()
        for i in range(-7,8):
            v=i*radius/8;extent=math.sqrt(radius*radius-v*v)
            m.link((-extent,v,side*length/2),(extent,v,side*length/2),4e-9,8 if detail else 6)
            m.link((v,-extent,side*length/2),(v,extent,side*length/2),4e-9,8 if detail else 6)
        obj=m.object(f'pilot-z-{label}',f'Z disc · {label}',anchor,'z-disc','sarcomere','Representative cross-linked anchoring lattice marking this sarcomere boundary. Not a resolved alpha-actinin structure.')
        obj['slidingSide']=side
    m=Mesh()
    for x,y in centers:
        for dx,dy in [(pitch,0),(pitch/2,pitch*math.sqrt(3)/2)]:
            if any(math.hypot(x+dx-a,y+dy-b)<1e-12 for a,b in centers):m.link((x,y,0),(x+dx,y+dy,0),2e-9,6 if detail else 4)
    m.object('pilot-m-line','M line',mid,'m-line','sarcomere','Representative links at the sarcomere midpoint, anchoring the thick-filament array; remains fixed during symmetric sliding.')
    return {'spanM':length+8e-9,'description':'Cropped representative sarcomere lattice: fixed-length thick and thin filaments, two Z discs and an M line. Manual length-controlled kinematics, not a force or biochemical simulation.'}

def export(level,lod):
    bpy.ops.object.select_all(action='SELECT')
    path=OUT/f'{level}-{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    bpy.context.view_layer.update()
    triangles=sum(len(o.data.loop_triangles) or (o.data.calc_loop_triangles() or len(o.data.loop_triangles)) for o in bpy.context.scene.objects if o.type=='MESH')
    return {'url':'/'+str(path.relative_to(ROOT/'public')),'bytes':path.stat().st_size,'sha256':sha(path),'triangles':triangles,'entities':sorted(o['entityId'] for o in bpy.context.scene.objects if o.type=='MESH')}

def preview(level,span):
    # Normalize only the disposable preview scene, after metric GLB and blend saves.
    objects=list(bpy.context.scene.objects)
    if level=='muscle':
        for o in objects:
            if o.get('kind')=='bone':o.hide_render=True
    parent=bpy.data.objects.new('Preview-only normalization',None);bpy.context.collection.objects.link(parent)
    for o in objects:o.parent=parent
    parent.scale=(1/span,)*3
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=4
    scene.render.resolution_x=900;scene.render.resolution_y=900;scene.render.resolution_percentage=100
    scene.world.color=(.08,.08,.08);scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.065,.09,.10,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
    bpy.ops.object.camera_add(location=(1.05,-1.8,.8));camera=bpy.context.object;camera.rotation_euler=(-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=1.22;scene.camera=camera
    for loc,power,size in [((2,-3,3),420,3),((-2,-1,1),220,2),((0,2,1),400,2)]:
        bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
    scene.render.image_settings.file_format='PNG';scene.render.filepath=str(PREVIEW/f'{level}-blender.png');bpy.ops.render.render(write_still=True)

for level,builder in [('muscle',build_muscle),('fascicle',build_fascicle),('fiber',build_fiber),('sarcomere',build_sarcomere)]:
    levels[level]={'representations':{}}
    for lod in ['context','detail']:
        info=builder(lod=='detail');levels[level].update(info);levels[level]['representations'][lod]=export(level,lod)
        if lod=='detail':
            bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'blender'/f'{level}.blend'),compress=True)
            preview(level,info['spanM'])
manifest={'id':SPEC['id'],'version':SPEC['version'],'status':SPEC['status'],'metersPerAssetUnit':1,'sourceSpace':'glTF right-handed Y-up, meters; muscle translation retained separately','levels':levels,'entities':list(entities.values()),'provenance':{'blenderVersion':bpy.app.version_string,'generator':'scripts/blender/build-muscle-pilot.py','generatorSHA256':sha(Path(__file__)),'specSHA256':sha(SOURCE/'spec.json'),'sourceHashes':sources,'license':'Source muscle/bone CC-BY-4.0; generated microstructure and texture MIT','referenceURL':SPEC['references'][0]['url'],'registration':'Representative microstructure is not spatially registered to the source muscle'},'validation':'Requires independent byte, bounds, identity and browser checks. No anatomical expert review or full phase completion is claimed.'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(SOURCE/'build-receipt.json').write_text(json.dumps({'manifestSHA256':sha(OUT/'manifest.json'),'blenderVersion':bpy.app.version_string,'blenderFiles':{p.name:sha(p) for p in sorted((SOURCE/'blender').glob('*.blend'))},'previews':{p.name:sha(p) for p in sorted(PREVIEW.glob('*-blender.png'))}},indent=2)+'\n')
print('MUSCLE_PILOT_EXPORTED',json.dumps({k:v['representations']['detail']['triangles'] for k,v in levels.items()}))
