"""Build a reproducible, metric, representative muscle inspection package.
Run through the staging driver, which audits, compares and promotes the outputs:
  node scripts/blender/build-package.mjs
Direct use writes only into a staging root:
  blender --background --factory-startup --python scripts/blender/build-muscle-pilot.py -- --out-root DIR [--no-previews]
Original source buffers remain untouched. No human microstructure registration is implied.
"""
import bpy, math, json, struct, hashlib, random, itertools, sys
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from muscle_geometry import Mesh, classify, weld
from blender_topology import mesh_stats, summarize, winding_consistency
ROOT=Path(__file__).resolve().parents[2]
ARGS=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if '--out-root' not in ARGS:raise SystemExit('Pass -- --out-root STAGING_DIR; canonical outputs are promoted by build-package.mjs.')
STAGE=Path(ARGS[ARGS.index('--out-root')+1]).resolve();PREVIEWS='--no-previews' not in ARGS
if STAGE==ROOT or ROOT in STAGE.parents and not str(STAGE.relative_to(ROOT)).startswith('work/'):raise SystemExit('The staging root must be outside the repository or under work/.')
SPEC_PATH=ROOT/'assets/multiscale/muscle-pilot/spec.json'
SOURCE=STAGE/'assets/multiscale/muscle-pilot'
OUT=STAGE/'public/models/multiscale/muscle-pilot'
DERIVED=SOURCE/'derivatives'
PREVIEW=STAGE/'previews'
for p in [SOURCE/'blender',OUT,DERIVED,PREVIEW]:p.mkdir(parents=True,exist_ok=True)
SPEC=json.loads(SPEC_PATH.read_text())
ATLAS=json.loads((ROOT/'public/models/atlas.json').read_text())
# Never write Blender .blend1 backups; they are not part of the package.
bpy.context.preferences.filepaths.save_version=0
entities={}; levels={}; sources={}; topology_report={}; derivatives={}; cross_entity_report={}
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
def to_object(self,id,name,mat,kind,level,description,**extra):
    mesh=bpy.data.meshes.new(id);mesh.from_pydata(self.v,[],self.f);mesh.update()
    uv=mesh.uv_layers.new(name='UVMap')
    for poly,coords,smooth in zip(mesh.polygons,self.uv,self.smooth):
        poly.use_smooth=smooth
        for loop,coord in zip(poly.loop_indices,coords):uv.data[loop].uv=coord
    obj=bpy.data.objects.new(id,mesh);bpy.context.collection.objects.link(obj);mesh.materials.append(mat)
    obj['entityId']=id;obj['kind']=kind;obj['evidence']='source-surface' if id.startswith('FJ') else 'representative';obj['metersPerUnit']=1.0
    entities[id]={'id':id,'name':name,'kind':kind,'level':level,'description':description,'evidence':obj['evidence'],**extra}
    return obj
Mesh.object=to_object

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
        # Crossing horizontal/vertical links interpenetrate as separate closed tubes; boolean
        # UNION them (in a unit-normalized frame, see union_components) into one non-self-
        # intersecting solid rather than leaving overlapping components.
        links=[]
        for i in range(-7,8):
            v=i*radius/8;extent=math.sqrt(radius*radius-v*v)
            zseg=8 if detail else 6
            for a,b in [((-extent,v,side*length/2),(extent,v,side*length/2)),((v,-extent,side*length/2),(v,extent,side*length/2))]:
                # Every link in this lattice lies exactly on the shared z=side*length/2 plane;
                # with phase=0 two ring vertices per link would land exactly on that plane too,
                # which makes the exact boolean solver produce non-manifold slivers at the many
                # coplanar link/link crossings (verified empirically). A quarter-turn ring phase
                # avoids that exact coincidence while keeping the segment count EVEN, so every
                # ring vertex still has its antipodal (angle+pi) partner in the ring and the
                # union's bounding extent on that axis stays exactly symmetric about the plane
                # (the sliding tests require the Z-disc bound midpoint to equal side*length/2
                # to float precision; odd segments broke that symmetry). The added +0.011 rad
                # steers away from one further near-tangent configuration at exactly pi/segments
                # that still left an exact-solver sub-picometre sliver pair at one lattice
                # crossing (invisible to Blender's own index-based topology check, but caught by
                # the independent GLB byte-level weld-by-position check); verified empirically.
                lk=Mesh();lk.link(a,b,4e-9,zseg,phase=math.pi/zseg+0.011);links.append(lk)
        merged=union_components(links)
        obj=merged.object(f'pilot-z-{label}',f'Z disc · {label}',anchor,'z-disc','sarcomere','Representative cross-linked anchoring lattice marking this sarcomere boundary, boolean-unioned into one non-self-intersecting solid. Not a resolved alpha-actinin structure.')
        obj['slidingSide']=side
    # M-line links and their lattice-node spheres interpenetrate at each node by construction
    # (the link end is trimmed short of the sphere surface, not to it); UNION every link and
    # node sphere into one non-self-intersecting solid instead of leaving overlapping parts.
    parts=[]
    for x,y in centers:
        for dx,dy in [(pitch,0),(pitch/2,pitch*math.sqrt(3)/2)]:
            if any(math.hypot(x+dx-a,y+dy-b)<1e-12 for a,b in centers):
                u=(dx/math.hypot(dx,dy),dy/math.hypot(dx,dy));t=1.8e-9;mseg=6 if detail else 4
                # Same ring-phase reasoning as the Z-disc links above: this whole lattice is
                # planar at z=0, and an unphased even ring puts two vertices per link exactly
                # on that plane. This lattice's two link directions are 60 degrees apart
                # (rather than the Z-disc's 90 degrees), so a full pi/segments phase step
                # (verified empirically) still lands a vertex on a shared coincidence for
                # some segment counts; pi/(2*segments) is clear for both context and detail.
                lk=Mesh();lk.link((x+u[0]*t,y+u[1]*t,0),(x+dx-u[0]*t,y+dy-u[1]*t,0),2e-9,mseg,phase=math.pi/12);parts.append(lk)
        sp=Mesh();sp.ellipsoid((x,y,0),(3e-9,3e-9,3e-9),8 if detail else 6,4);parts.append(sp)
    merged=union_components(parts)
    merged.object('pilot-m-line','M line',mid,'m-line','sarcomere','Representative links and lattice nodes at the sarcomere midpoint, boolean-unioned into one non-self-intersecting solid anchoring the thick-filament array; remains fixed during symmetric sliding.')
    return {'spanM':length+8e-9,'description':'Cropped representative sarcomere lattice: fixed-length thick and thin filaments, two Z discs and an M line. Manual length-controlled kinematics, not a force or biochemical simulation.'}

def export(level,lod):
    bpy.ops.object.select_all(action='SELECT')
    path=OUT/f'{level}-{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    bpy.context.view_layer.update()
    triangles=sum(len(o.data.loop_triangles) or (o.data.calc_loop_triangles() or len(o.data.loop_triangles)) for o in bpy.context.scene.objects if o.type=='MESH')
    return {'url':f'/models/multiscale/muscle-pilot/{level}-{lod}.glb','bytes':path.stat().st_size,'sha256':sha(path),'triangles':triangles,'entities':sorted(o['entityId'] for o in bpy.context.scene.objects if o.type=='MESH')}

def evaluated(obj,modifier):
    """Apply one modifier without operators: replace the mesh with its evaluated copy."""
    dg=bpy.context.evaluated_depsgraph_get();mesh=bpy.data.meshes.new_from_object(obj.evaluated_get(dg));old=obj.data
    obj.modifiers.remove(modifier);obj.data=mesh;bpy.data.meshes.remove(old)
    return obj

def union_components(components):
    """Exact-solver boolean UNION of possibly-overlapping closed component meshes into one
    non-self-intersecting 2-manifold. Runs in a unit-normalized frame (component coordinates
    are nm-scale) for float robustness, then scales the result back. Merges pairwise in a
    balanced binary tree (log2(n) passes touching the largest mesh) rather than one growing
    accumulator, which keeps the build reasonably fast for lattices with hundreds of parts."""
    all_v=[v for m in components for v in m.v]
    if not all_v:return Mesh()
    center=tuple(sum(c[i] for c in all_v)/len(all_v) for i in range(3))
    extent=max((abs(c[i]-center[i]) for c in all_v for i in range(3)),default=1) or 1
    scale=1.0/extent
    def to_obj(m,name):
        data=bpy.data.meshes.new(name)
        data.from_pydata([tuple((c[i]-center[i])*scale for i in range(3)) for c in m.v],[],m.f);data.update()
        o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
        return o
    def free(o):
        mesh=o.data;bpy.data.objects.remove(o,do_unlink=True);bpy.data.meshes.remove(mesh)
    def merge(objs):
        if len(objs)==1:return objs[0]
        mid=len(objs)//2
        a=merge(objs[:mid]);b=merge(objs[mid:])
        mod=a.modifiers.new('Union','BOOLEAN');mod.operation='UNION';mod.solver='EXACT';mod.use_self=False;mod.object=b
        evaluated(a,mod);free(b)
        return a
    final=merge([to_obj(m,f'union-tmp-{i}') for i,m in enumerate(components)])
    # The exact solver can leave a handful of zero-area sliver faces at coarser (context-LOD)
    # resolutions; dissolve them and weld any resulting near-duplicate verts (still in the
    # unit-normalized frame, so a small absolute epsilon here is a safe relative tolerance).
    import bmesh
    bm=bmesh.new();bm.from_mesh(final.data)
    bmesh.ops.dissolve_degenerate(bm,dist=1e-6,edges=bm.edges)
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-6)
    bm.to_mesh(final.data);final.data.update();bm.free()
    result=Mesh()
    vertices=[tuple(v.co[k]/scale+center[k] for k in range(3)) for v in final.data.vertices]
    faces=[tuple(poly.vertices) for poly in final.data.polygons]
    free(final)
    # Extra safety net beyond the bmesh cleanup above: weld any vertices the exact boolean
    # solver left within a real-world hair's breadth of each other (comfortably above float
    # noise, comfortably below the smallest real feature here -- the thinnest tube/link
    # radius is ~2e-9 m) and drop whatever faces that collapses to degenerate or duplicate.
    # Blender's own vertex-index topology check can miss this class of defect (two distinct
    # indices at/near the same position read as manifold in index space); the independent
    # byte-level GLB check, which welds by exact exported position, does not.
    result.v,result.f=weld(vertices,faces,1e-11)
    result.uv=[[(0,0)]*len(f) for f in result.f]
    result.smooth=[True]*len(result.f)
    return result

def make_normals_consistent(obj):
    """Recompute consistent, outward-facing winding on this display/derivative mesh only
    (never applied to the source-preserved detail representation). Equivalent to Blender's
    Mesh > Normals > Recalculate Outside operator, run without an active operator context."""
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    bm.to_mesh(obj.data);obj.data.update();bm.free()
    return obj

def decimate_context():
    ratio=SPEC['lod']['muscleContext']['ratio']
    for o in [o for o in bpy.context.scene.objects if o.type=='MESH']:
        m=o.modifiers.new('Context LOD','DECIMATE');m.decimate_type='COLLAPSE';m.ratio=ratio;evaluated(o,m)
        # The BodyParts3D source surfaces have inconsistently wound (backfacing) faces (see
        # docs/BLENDER_ASSET_REVIEW_2026-09-22.md); the source itself is never repaired, but
        # this display-only decimated derivative is made normals-consistent so it renders
        # without ambiguous backfaces.
        make_normals_consistent(o)
    return {'derivation':f"Decimate collapse ratio {ratio} of each source surface, then recalculated to consistent outward normals; display-only LOD, not source bytes or source winding."}

def gate(level,lod):
    """Every generated mesh must be closed or a named opening; stop the build otherwise."""
    report={};failures=[]
    for o in sorted((o for o in bpy.context.scene.objects if o.type=='MESH'),key=lambda o:o['entityId']):
        stats=mesh_stats(o);verdict=classify(o['entityId'],stats,SPEC['topology'])
        if lod=='context' and level=='muscle':verdict={'status':'source-derived-lod','reasons':[]}
        entry={'verdict':verdict,'stats':summarize(stats)}
        # Diagnostic-only winding check on the untouched source surfaces (never on generated
        # geometry): quantifies backfacing/inconsistently wound faces without repairing them.
        if o['entityId'] in SPEC['topology']['sourceSurfaces']:entry['normalsConsistency']=winding_consistency(o)
        report[o['entityId']]=entry
        if verdict['status']=='fail':failures.append((o['entityId'],verdict['reasons']))
    if failures:raise SystemExit(f'Topology gate failed for {level}/{lod}: {failures}')
    topology_report.setdefault(level,{})[lod]=report
    counts={}
    for r in report.values():counts[r['verdict']['status']]=counts.get(r['verdict']['status'],0)+1
    return counts

def cross_entity_overlaps():
    """Informational, non-failing count of intersecting face pairs between DIFFERENT entities
    in the current scene (e.g. thin filaments anchored inside their Z disc, or the thick-filament
    array inside the M line, both by design). Same BVH self-overlap technique as the per-entity
    self-intersection check, applied pairwise between entities instead of within one."""
    import bmesh
    from mathutils.bvhtree import BVHTree
    trees={}
    for o in bpy.context.scene.objects:
        if o.type!='MESH':continue
        bm=bmesh.new();bm.from_mesh(o.data);bm.transform(o.matrix_world)
        trees[o['entityId']]=BVHTree.FromBMesh(bm,epsilon=0.0);bm.free()
    out={}
    ids=sorted(trees)
    for i,a in enumerate(ids):
        for b in ids[i+1:]:
            n=len(trees[a].overlap(trees[b]))
            if n:out[f'{a}|{b}']=n
    return out

def hull_components(obj,out):
    """Convex hull per connected component, computed in a unit-normalized frame for float safety."""
    import bmesh
    bm=bmesh.new();bm.from_mesh(obj.data);bm.verts.ensure_lookup_table();seen=set()
    for v in bm.verts:
        if v.index in seen:continue
        stack=[v];comp=[];seen.add(v.index)
        while stack:
            c=stack.pop();comp.append(c.co.copy())
            for e in c.link_edges:
                w=e.other_vert(c)
                if w.index not in seen:seen.add(w.index);stack.append(w)
        center=sum(comp,Vector())/len(comp);scale=max((p-center).length for p in comp) or 1
        h=bmesh.new();vs=[h.verts.new((p-center)/scale) for p in comp]
        r=bmesh.ops.convex_hull(h,input=vs,use_existing_faces=False)
        bmesh.ops.delete(h,geom=list({g for g in r['geom_interior']+r['geom_unused'] if isinstance(g,bmesh.types.BMVert)}),context='VERTS')
        h.verts.ensure_lookup_table();base=len(out.v)
        out.v.extend(tuple(center+p.co*scale) for p in h.verts)
        for f in h.faces:out.face([base+q.index for q in f.verts],[(0,0)]*len(f.verts),False)
        h.free()
    bm.free()

def derive(level,span):
    """Closed collision/simulation derivatives, exported apart from display meshes, then removed."""
    cfg=SPEC['derivatives'];made=[];records=[]
    kind='simulation' if level=='muscle' else 'collision'
    mat=material('Derivative diagnostic','#6f8f9a',.6)
    for o in [o for o in bpy.context.scene.objects if o.type=='MESH']:
        eid=o['entityId']
        if level=='muscle':
            d=o.copy();d.data=o.data.copy();bpy.context.collection.objects.link(d)
            m=d.modifiers.new('Simulation domain','REMESH');m.mode='VOXEL';m.voxel_size=cfg['muscleSimulationDomain']['voxelSizeM'];m.use_smooth_shade=False;evaluated(d,m)
            # Voxel remeshing over the source's inconsistently wound faces (see
            # docs/BLENDER_ASSET_REVIEW_2026-09-22.md) can still leave stray backfacing
            # triangles; make this derivative explicitly outward-consistent. The source
            # detail mesh above is untouched.
            make_normals_consistent(d)
            method=f"voxel remesh {cfg['muscleSimulationDomain']['voxelSizeM']} m, normals made outward-consistent"
        elif eid in SPEC['topology']['openings']:
            d=o.copy();d.data=o.data.copy();bpy.context.collection.objects.link(d)
            m=d.modifiers.new('Collision shell','SOLIDIFY');m.thickness=span*cfg['collision']['shellThicknessFractionOfSpan'];m.offset=0;m.use_rim=True;m.use_even_offset=True;evaluated(d,m)
            method='solidified shell of named opening'
        else:
            mesh=Mesh();hull_components(o,mesh);mesh_data=bpy.data.meshes.new(eid+'--'+kind);mesh_data.from_pydata(mesh.v,[],mesh.f);mesh_data.update()
            d=bpy.data.objects.new(eid+'--'+kind,mesh_data);bpy.context.collection.objects.link(d)
            method='convex hull per connected component'
        d.name=eid+'--'+kind;d.data.materials.clear();d.data.materials.append(mat)
        for key in list(d.keys()):del d[key]
        d['derivedFrom']=eid;d['derivative']=kind;d['metersPerUnit']=1.0
        stats=mesh_stats(d)
        if stats['boundaryEdges'] or stats['nonManifoldEdges'] or stats['degenerateFaces'] or stats['looseVertices']:
            raise SystemExit(f'Derivative {d.name} is not a closed manifold: {summarize(stats)}')
        made.append(d);records.append({'object':d.name,'derivedFrom':eid,'method':method,'components':stats['components'],'triangles':stats['triangles'],'closedVolumeM3':stats['closedVolumeM3']})
    display=[o for o in bpy.context.scene.objects if o not in made]
    for o in display:o.select_set(False)
    for o in made:o.select_set(True)
    path=DERIVED/f'{level}-{kind}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_extras=True,export_yup=True,export_animations=False,export_cameras=False,export_lights=False,export_materials='NONE',export_normals=False,export_texcoords=False)
    for o in made:bpy.data.objects.remove(o)
    bpy.data.materials.remove(mat)
    derivatives[level]={'kind':kind,'file':str(path.relative_to(STAGE)),'bytes':path.stat().st_size,'sha256':sha(path),'objects':records}

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
        info=builder(lod=='detail');extra=decimate_context() if level=='muscle' and lod=='context' else {'derivation':'Source surface topology retained.' if level=='muscle' else 'Generated representative geometry.'}
        levels[level].update(info);levels[level]['representations'][lod]={**export(level,lod),**extra,'topology':gate(level,lod)}
        cross_entity_report.setdefault(level,{})[lod]=cross_entity_overlaps()
        if lod=='detail':
            derive(level,info['spanM'])
            bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'blender'/f'{level}.blend'),compress=True)
            if PREVIEWS:preview(level,info['spanM'])
modules={f'scripts/blender/{n}':sha(Path(__file__).parent/n) for n in ['muscle_geometry.py','blender_topology.py']}
manifest={'id':SPEC['id'],'version':SPEC['version'],'status':SPEC['status'],'metersPerAssetUnit':1,'sourceSpace':'glTF right-handed Y-up, meters; muscle translation retained separately','levels':levels,'entities':list(entities.values()),'provenance':{'blenderVersion':bpy.app.version_string,'generator':'scripts/blender/build-muscle-pilot.py','generatorSHA256':sha(Path(__file__)),'generatorModules':modules,'specSHA256':sha(SPEC_PATH),'sourceHashes':sources,'license':'Source muscle/bone CC-BY-4.0; generated microstructure and texture MIT','referenceURL':SPEC['references'][0]['url'],'registration':'Representative microstructure is not spatially registered to the source muscle'},'validation':'Requires independent byte, bounds, identity and browser checks. No anatomical expert review or full phase completion is claimed.'}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(SOURCE/'topology-report.json').write_text(json.dumps({'schemaVersion':2,'policy':SPEC['topology'],'levels':topology_report,'crossEntityOverlaps':{'note':'Informational only, never failing: intersecting face pairs between DIFFERENT entities in the same level/lod (e.g. thin filaments anchored inside their Z disc by design).','byLevel':cross_entity_report}},indent=2)+'\n')
(DERIVED/'derivatives.json').write_text(json.dumps({'schemaVersion':1,'policy':SPEC['derivatives'],'levels':derivatives},indent=2)+'\n')
print('MUSCLE_PILOT_EXPORTED',json.dumps({k:{lod:v['representations'][lod]['triangles'] for lod in v['representations']} for k,v in levels.items()}))
