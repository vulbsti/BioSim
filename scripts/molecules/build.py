"""Build the blood-molecule meshes from assets/molecules/source and export one GLB.

  blender --background --factory-startup --python scripts/molecules/build.py -- --root . [--preview]

Geometry is in nanometres. Small molecules are ball-and-stick with hydrogens, short peptides are
heavy-atom sticks, and larger peptides and proteins are a smooth blob surface over their heavy atoms.
Writes public/models/molecules/molecules.glb, assets/molecules/build.json and, with --preview,
assets/molecules/previews/contact-sheet.png.
"""
import colorsys, json, math, pathlib, sys
import bpy, bmesh
from mathutils import Vector, kdtree

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOT = pathlib.Path(argv[argv.index('--root') + 1] if '--root' in argv else '.').resolve()
PREVIEW = '--preview' in argv
PACKAGE, RUNTIME = ROOT / 'assets/molecules', ROOT / 'public/models/molecules'
NM = .1  # angstrom to nanometre

ELEMENT = {'H': '#f4f4f0', 'C': '#a4a9ad', 'N': '#3f6ff2', 'O': '#ea4335', 'S': '#f2c531', 'I': '#a043c9', 'SE': '#f09a2a', 'P': '#f08a2a'}
VDW = {'H': 1.1, 'C': 1.7, 'N': 1.55, 'O': 1.52, 'S': 1.8, 'I': 1.98, 'SE': 1.9, 'P': 1.8}
COVALENT = {'C': .76, 'N': .71, 'O': .66, 'S': 1.05, 'SE': 1.2, 'P': 1.07, 'I': 1.39, 'H': .31}

def linear(hex_or_rgb):
    rgb = [int(hex_or_rgb[i:i + 2], 16) / 255 for i in (1, 3, 5)] if isinstance(hex_or_rgb, str) else hex_or_rgb
    return [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]

def template_sphere(subdivisions):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1)
    verts = [v.co.copy() for v in bm.verts]; faces = [[v.index for v in f.verts] for f in bm.faces]; bm.free()
    return verts, faces

class Builder:
    """Accumulates triangles with one colour per vertex."""
    def __init__(self): self.verts, self.faces, self.colors = [], [], []
    def sphere(self, centre, radius, color, template):
        base = len(self.verts)
        for v in template[0]: self.verts.append(centre + v * radius); self.colors.append(color)
        self.faces += [[base + i for i in f] for f in template[1]]
    def stick(self, a, b, radius, color, sides=8):
        axis = (b - a).normalized(); side = axis.orthogonal().normalized(); other = axis.cross(side); base = len(self.verts)
        for end in (a, b):
            for i in range(sides):
                t = 2 * math.pi * i / sides
                self.verts.append(end + (side * math.cos(t) + other * math.sin(t)) * radius); self.colors.append(color)
        for i in range(sides):
            j = (i + 1) % sides
            self.faces.append([base + i, base + j, base + sides + j, base + sides + i])
    def mesh(self, name):
        me = bpy.data.meshes.new(name); me.from_pydata([v * NM for v in self.verts], [], self.faces); me.update()
        paint(me, self.colors); return me

def paint(me, colors):
    layer = me.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(colors): layer.data[i].color = (*c, 1)
    me.color_attributes.active_color = layer; me.color_attributes.render_color_index = 0
    for p in me.polygons: p.use_smooth = True

def inferred_bonds(atoms):
    tree = kdtree.KDTree(len(atoms))
    for i, a in enumerate(atoms): tree.insert(a[1:4], i)
    tree.balance(); bonds = []
    for i, a in enumerate(atoms):
        for _, j, d in tree.find_range(a[1:4], 2.4):
            if j > i and d < COVALENT.get(a[0], .8) + COVALENT.get(atoms[j][0], .8) + .45: bonds.append([i, j, 1])
    return bonds

def ball_stick(m, hue):
    atoms, b = m['atoms'], Builder()
    small = len(atoms) <= 3
    ball, stick, template = (.62, .3, template_sphere(3)) if small else (.3, .17, template_sphere(2))
    light = template_sphere(1)  # hydrogens are small enough that an icosahedron reads as round
    for a in atoms: b.sphere(Vector(a[1:4]), VDW.get(a[0], 1.7) * ball, linear(ELEMENT.get(a[0], '#d070c0')), light if a[0] == 'H' and not small else template)
    for i, j, order in m['bonds']:
        p, q = Vector(atoms[i][1:4]), Vector(atoms[j][1:4]); mid = (p + q) / 2; r = stick * (1.45 if order > 1 else 1)
        b.stick(p, mid, r, linear(ELEMENT.get(atoms[i][0], '#d070c0')), 6); b.stick(mid, q, r, linear(ELEMENT.get(atoms[j][0], '#d070c0')), 6)
    return b.mesh(m['id'])

def sticks(m, hue):
    atoms, b, template = m['atoms'], Builder(), template_sphere(1)
    carbon = linear(list(colorsys.hls_to_rgb(hue, .68, .55)))
    tint = lambda e: carbon if e == 'C' else linear(ELEMENT.get(e, '#d070c0'))
    for a in atoms: b.sphere(Vector(a[1:4]), .4 if a[0] == 'C' else .56, tint(a[0]), template)
    for i, j, _ in inferred_bonds(atoms):
        p, q = Vector(atoms[i][1:4]), Vector(atoms[j][1:4]); mid = (p + q) / 2
        b.stick(p, mid, .34, tint(atoms[i][0]), 6); b.stick(mid, q, .34, tint(atoms[j][0]), 6)
    return b.mesh(m['id'])

def surface(m, hue):
    atoms = m['atoms']
    mb = bpy.data.metaballs.new(m['id'] + '-field'); mb.resolution = .85 if len(atoms) < 600 else 1.15 if len(atoms) < 4000 else 2.2; mb.render_resolution = mb.resolution; mb.threshold = 1.15
    for a in atoms:
        e = mb.elements.new(type='BALL'); e.co = a[1:4]; e.radius = 2.05 * VDW.get(a[0], 1.7)
    field = bpy.data.objects.new(m['id'] + '-field', mb); bpy.context.scene.collection.objects.link(field)
    bpy.context.view_layer.update()
    raw = bpy.data.meshes.new_from_object(field.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(field); bpy.data.metaballs.remove(mb)
    # Decimate to a triangle budget that grows with the molecule.
    target = max(900, min(4200, len(atoms) * 4)) if len(atoms) < 4000 else 2600
    bm = bmesh.new(); bm.from_mesh(raw); bmesh.ops.triangulate(bm, faces=bm.faces); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4); bm.to_mesh(raw); bm.free()
    holder = bpy.data.objects.new(m['id'] + '-raw', raw); bpy.context.scene.collection.objects.link(holder)
    if len(raw.polygons) > target:
        mod = holder.modifiers.new('budget', 'DECIMATE'); mod.ratio = target / len(raw.polygons)
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(holder.evaluated_get(bpy.context.evaluated_depsgraph_get())); me.name = m['id']
    bpy.data.objects.remove(holder); bpy.data.meshes.remove(raw)
    # Colour: the molecule's own hue per chain, nudged toward blue near nitrogen and red near oxygen,
    # and darkened in hollows so the fold reads without lighting.
    tree = kdtree.KDTree(len(atoms))
    for i, a in enumerate(atoms): tree.insert(a[1:4], i)
    tree.balance()
    neighbours = [[] for _ in me.vertices]
    for e in me.edges: a, c = e.vertices; neighbours[a].append(c); neighbours[c].append(a)
    hollow = [0.0] * len(me.vertices)
    for i, v in enumerate(me.vertices):
        if neighbours[i]: hollow[i] = (sum((me.vertices[j].co for j in neighbours[i]), Vector()) / len(neighbours[i]) - v.co).dot(v.normal)
    for _ in range(3): hollow = [(hollow[i] + sum(hollow[j] for j in n)) / (1 + len(n)) if n else hollow[i] for i, n in enumerate(neighbours)]
    scale = max(1e-6, sorted(abs(h) for h in hollow)[int(len(hollow) * .95)])
    colors = []
    for i, v in enumerate(me.vertices):
        _, index, _ = tree.find(v.co); element, chain = atoms[index][0], atoms[index][4] if len(atoms[index]) > 4 else 0
        rgb = list(colorsys.hls_to_rgb((hue + .045 * chain) % 1, .6 - .07 * chain, .62))
        accent = {'N': (.25, .42, 1), 'O': (1, .3, .25), 'S': (1, .85, .2)}.get(element)
        if accent: rgb = [c * .74 + t * .26 for c, t in zip(rgb, accent)]
        shade = 1 - .34 * max(-1, min(1, hollow[i] / scale))
        colors.append(linear([max(0, min(1, c * shade)) for c in rgb]))
    for v in me.vertices: v.co *= NM
    paint(me, colors); return me

def ion(m, hue):
    b = Builder(); b.sphere(Vector((0, 0, 0)), m['radiusA'], linear(m['color']), template_sphere(3)); return b.mesh(m['id'])

def cell(m, hue):
    """Cells from published dimensions, in angstrom like everything else here (1 um = 10000 A)."""
    um, verts, faces, colors = 1e4, [], [], []
    if m['shape'] == 'red-cell':
        # Evans & Fung (1972): half-thickness z(r) = 0.5 sqrt(1 - x^2) (C0 + C2 x^2 + C4 x^4), x = r / R0.
        R0, C0, C2, C4, around, rings = 3.91, .81, 7.83, -4.39, 22, 7
        half = lambda x: .5 * math.sqrt(max(0, 1 - x * x)) * (C0 + C2 * x * x + C4 * x ** 4)
        xs = [math.sin(math.pi / 2 * i / rings) for i in range(rings + 1)]  # denser toward the rim
        for side in (1, -1):
            base = len(verts)
            for x in xs:
                for j in range(around):
                    t = 2 * math.pi * j / around
                    verts.append(Vector((R0 * x * math.cos(t), R0 * x * math.sin(t), side * half(x))) * um)
                    shade = .62 + .38 * min(1, half(x) / 1.28)  # the thin centre reads darker
                    colors.append(linear([.78 * shade, .09 * shade, .08 * shade]))
            for i in range(rings):
                for j in range(around):
                    a, c, d, e = base + i * around + j, base + i * around + (j + 1) % around, base + (i + 1) * around + (j + 1) % around, base + (i + 1) * around + j
                    faces.append([a, c, d, e] if side > 0 else [e, d, c, a])
    else:
        sphere = template_sphere(3 if m['shape'] == 'platelet' else 4)
        for v in sphere[0]:
            if m['shape'] == 'platelet': verts.append(Vector((v.x * 1.25, v.y * 1.25, v.z * .45)) * um); colors.append(linear('#e9dfb4'))
            else:
                ruffle = 1 + .035 * math.sin(9 * v.x + 2) * math.sin(11 * v.y) * math.sin(8 * v.z + 1)
                verts.append(v * 4.425 * ruffle * um); colors.append(linear([.80 * (.9 + .1 * ruffle), .78, .88]))
        faces = sphere[1]
    b = Builder(); b.verts, b.faces, b.colors = verts, faces, colors
    return b.mesh(m['id'])

source = lambda mid: json.loads((PACKAGE / 'source' / f'{mid}.json').read_text())
ledger = json.loads((PACKAGE / 'ledger.json').read_text())
for datablock in list(bpy.data.objects): bpy.data.objects.remove(datablock)
built, surfaces = [], [e['id'] for e in ledger['molecules'] if e['style'] in ('sticks', 'surface')]
for entry in ledger['molecules']:
    # Hues are spread by the golden angle over the molecules that are not coloured by element alone.
    hue = (.02 + .61803398875 * surfaces.index(entry['id'])) % 1 if entry['id'] in surfaces else 0
    me = {'ball-stick': ball_stick, 'sticks': sticks, 'surface': surface, 'ion': ion, 'cell': cell}[entry['style']](source(entry['id']), hue)
    obj = bpy.data.objects.new(entry['id'], me); bpy.context.scene.collection.objects.link(obj)
    me.calc_loop_triangles()
    radius = max(v.co.length for v in me.vertices)
    built.append({'id': entry['id'], 'triangles': len(me.loop_triangles), 'vertices': len(me.vertices), 'meshRadiusNm': round(radius, 4)})
    print(f"MOLECULE {entry['id']:15s} {entry['style']:10s} tris {len(me.loop_triangles):5d} radius {radius:.3f} nm")

RUNTIME.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=str(RUNTIME / 'molecules.glb'), export_format='GLB', export_yup=True, export_apply=True, export_materials='NONE',
                          export_vertex_color='ACTIVE', export_active_vertex_color_when_no_material=True, export_normals=True, export_texcoords=False,
                          export_animations=False, export_cameras=False, export_lights=False)
(PACKAGE / 'build.json').write_text(json.dumps({'blender': bpy.app.version_string, 'unit': 'nm', 'molecules': built}, indent=1) + '\n')
print('MOLECULES_EXPORTED', len(built), sum(b['triangles'] for b in built))

if PREVIEW:
    scene = bpy.context.scene; columns = 6; rows = math.ceil(len(built) / columns)
    mat = bpy.data.materials.new('vertex-colour'); mat.use_nodes = True; nodes = mat.node_tree.nodes
    attribute = nodes.new('ShaderNodeVertexColor'); attribute.layer_name = 'Color'; shader = nodes['Principled BSDF']
    mat.node_tree.links.new(attribute.outputs['Color'], shader.inputs['Base Color']); shader.inputs['Roughness'].default_value = .45
    label = bpy.data.materials.new('label'); label.use_nodes = True; label.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.85, .88, .9, 1); label.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 0
    for i, (entry, b) in enumerate(zip(ledger['molecules'], built)):
        obj = bpy.data.objects[entry['id']]; obj.data.materials.append(mat)
        x, y = (i % columns) * 2.6, -(i // columns) * 3.0
        obj.scale = (1 / b['meshRadiusNm'],) * 3; obj.location = (x, y, 0); obj.rotation_euler = (math.radians(20), math.radians(25), 0)
        curve = bpy.data.curves.new(entry['id'] + '-label', 'FONT'); curve.body = f"{entry['name']}\n{entry['database']} {entry['accession']}{' (stand-in)' if entry['standIn'] else ''} · {2 * b['meshRadiusNm']:.3g} nm"
        curve.size = .2; curve.align_x = 'CENTER'; curve.space_line = 1.1
        text = bpy.data.objects.new(entry['id'] + '-label', curve); text.location = (x, y - 1.3, 0); text.data.materials.append(label); scene.collection.objects.link(text)
    width, height = columns * 2.6, rows * 3.0
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera')); camera.data.type = 'ORTHO'; camera.data.ortho_scale = max(width, height) + .3
    camera.location = (width / 2 - 1.3, -height / 2 + 1.2, 20); scene.collection.objects.link(camera); scene.camera = camera
    for at, energy in (((-.6, -.5, 0), 3.2), ((.9, .4, 0), 1.2)):
        sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = energy; sun.rotation_euler = at; scene.collection.objects.link(sun)
    world = bpy.data.worlds.new('world'); world.use_nodes = True; world.node_tree.nodes['Background'].inputs['Color'].default_value = (.008, .014, .02, 1); world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1; scene.world = world
    scene.render.resolution_x = 1600; scene.render.resolution_y = int(1600 * height / width); scene.render.film_transparent = False
    scene.view_settings.view_transform = 'Standard'
    try:
        scene.render.engine = 'CYCLES'; scene.cycles.samples = 48; scene.cycles.device = 'GPU'
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind; prefs.get_devices()
                for d in prefs.devices: d.use = True
                break
            except Exception: continue
    except Exception as error: print('PREVIEW_ENGINE', error)
    (PACKAGE / 'previews').mkdir(exist_ok=True); scene.render.filepath = str(PACKAGE / 'previews/contact-sheet.png'); bpy.ops.render.render(write_still=True)
    print('PREVIEW_RENDERED')
