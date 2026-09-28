"""Read-only diagnostic render suite for a saved multiscale-muscle-pilot Blender scene.

Never saves the .blend (no bpy.ops.wm.save_mainfile / save_as_mainfile call anywhere below).
All scene mutation (normalization parenting, mesh copies for sections/wireframe/normals,
camera, lights, scale bar) lives only in the running Blender process's memory and is
discarded when the process exits.

Invocation
----------
    blender --background --factory-startup FILE.blend --python scripts/blender/render-diagnostics.py -- \
        --out DIR [--size 360] [--samples 12] [--frames 8]

Argument order matters: --background and --factory-startup are *general* Blender options
and must come before the positional .blend path (or be omitted). Blender parses
"blender [options] file.blend [-- python-args]" -- options placed after the filename but
before "--" are still accepted by this Blender build (tested on 4.4.3), but upstream docs
say general options belong before the file, so keep them there for portability across
Blender versions. Everything after the lone "--" is passed through to sys.argv for this
script and is never interpreted by Blender itself.

Outputs written into DIR:
  turntable-00.png .. turntable-NN.png   -- N orbit frames around the specimen's long axis
  section-cross.png, section-longitudinal.png -- cut-away views on mesh copies (bisected)
  wireframe.png                          -- Cycles wireframe-shader diagnostic on copies
  normals.png                            -- world-space normal visualization on copies
  contact-sheet.png                      -- tiled grid of all of the above
  diagnostics.json                       -- machine-readable receipt (see build_receipt())

Every render shares: locked sRGB/Standard color management, a fixed world background,
an opaque film, Cycles seed=0 with denoising off (determinism), FIXED/4 threads, and a
visible camera-facing scale bar + text label sized to a "nice" (1/2/5 x 10^k meters)
round length near 25% of the specimen's real-world span.
"""
import bpy, bmesh, sys, os, json, math, hashlib, random
from pathlib import Path
from mathutils import Vector, Matrix

# ---------------------------------------------------------------------------
# Argument parsing (everything after the lone "--")
# ---------------------------------------------------------------------------
def parse_args():
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    opts = {'out': None, 'size': 360, 'samples': 12, 'frames': 8}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--out':
            opts['out'] = argv[i + 1]; i += 2
        elif a == '--size':
            opts['size'] = int(argv[i + 1]); i += 2
        elif a == '--samples':
            opts['samples'] = int(argv[i + 1]); i += 2
        elif a == '--frames':
            opts['frames'] = int(argv[i + 1]); i += 2
        else:
            i += 1
    if not opts['out']:
        raise SystemExit('render-diagnostics.py: --out DIR is required (pass it after "--")')
    return opts

OPTS = parse_args()
OUT = Path(OPTS['out']); OUT.mkdir(parents=True, exist_ok=True)
SIZE = OPTS['size']; SAMPLES = OPTS['samples']; FRAMES = OPTS['frames']
ROOT = Path(bpy.data.filepath).resolve()
try:
    REPO_ROOT = ROOT.parents[list(ROOT.parents).index([p for p in ROOT.parents if p.name == 'human_atlas'][0])]
except Exception:
    REPO_ROOT = Path(__file__).resolve().parents[2]
LEVEL = ROOT.stem
AXES = ['X', 'Y', 'Z']
AXIS_VEC = {'X': Vector((1, 0, 0)), 'Y': Vector((0, 1, 0)), 'Z': Vector((0, 0, 1))}

def sha256(p):
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()

# ---------------------------------------------------------------------------
# Specimen discovery
# ---------------------------------------------------------------------------
def specimen_objects():
    return [o for o in bpy.context.scene.objects if o.type == 'MESH' and o.get('kind') != 'bone']

def world_bounds(objs):
    mn = Vector((math.inf,) * 3); mx = Vector((-math.inf,) * 3)
    for o in objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            w = mw @ v.co
            mn.x = min(mn.x, w.x); mn.y = min(mn.y, w.y); mn.z = min(mn.z, w.z)
            mx.x = max(mx.x, w.x); mx.y = max(mx.y, w.y); mx.z = max(mx.z, w.z)
    return mn, mx

SPECIMEN = specimen_objects()
if not SPECIMEN:
    raise SystemExit(f'render-diagnostics.py: no non-bone mesh objects found in {ROOT}')
BMIN, BMAX = world_bounds(SPECIMEN)
CENTER = (BMIN + BMAX) / 2
DIMS = BMAX - BMIN
LONG_IDX = max(range(3), key=lambda i: DIMS[i])
OTHER_IDX = sorted([i for i in range(3) if i != LONG_IDX], key=lambda i: DIMS[i])
MINOR_IDX, MID_IDX = OTHER_IDX[0], OTHER_IDX[1]
LONG_LETTER, MINOR_LETTER, MID_LETTER = AXES[LONG_IDX], AXES[MINOR_IDX], AXES[MID_IDX]
SPAN_M = max(DIMS)  # real-world meters, pre-normalization
NORM_SCALE = 1.0 / SPAN_M

# ---------------------------------------------------------------------------
# Scene-wide setup: color management, render engine, world, normalization empty
# ---------------------------------------------------------------------------
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = False
scene.cycles.seed = 0
scene.render.threads_mode = 'FIXED'
scene.render.threads = 4
scene.render.resolution_x = SIZE
scene.render.resolution_y = SIZE
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = 'PNG'

scene.display_settings.display_device = 'sRGB'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
scene.sequencer_colorspace_settings.name = 'sRGB'

if not scene.world:
    scene.world = bpy.data.worlds.new('DiagnosticWorld')
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get('Background')
if bg is None:
    bg = scene.world.node_tree.nodes.new('ShaderNodeBackground')
bg.inputs[0].default_value = (0.05, 0.06, 0.07, 1.0)
bg.inputs[1].default_value = 0.6
scene.world.color = (0.05, 0.06, 0.07)

random.seed(0)

NORM = bpy.data.objects.new('DiagnosticNormalization', None)
bpy.context.collection.objects.link(NORM)
NORM.scale = (NORM_SCALE,) * 3
NORM.location = -(CENTER * NORM_SCALE)
for o in SPECIMEN:
    if o.parent is None:
        o.parent = NORM
        o.matrix_parent_inverse = Matrix.Identity(4)
for o in bpy.context.scene.objects:
    if o.type == 'MESH' and o.get('kind') == 'bone':
        o.hide_render = True

# ---------------------------------------------------------------------------
# Scale bar sizing (real-world meters -> normalized units)
# ---------------------------------------------------------------------------
def nice_round(target):
    if target <= 0:
        return 1e-9
    exp = math.floor(math.log10(target))
    candidates = [m * (10 ** e) for e in (exp - 1, exp, exp + 1) for m in (1, 2, 5)]
    return min(candidates, key=lambda c: abs(math.log(c / target)))

BAR_LENGTH_M = nice_round(0.25 * SPAN_M)

def format_length(l_m):
    units = [(1.0, 'm'), (1e-2, 'cm'), (1e-3, 'mm'), (1e-6, 'µm'), (1e-9, 'nm')]
    for factor, name in units:
        if l_m >= factor * 0.999:
            v = l_m / factor
            v = round(v, 6)
            if abs(v - round(v)) < 1e-6:
                v = int(round(v))
            return f'{v} {name}'
    return f'{l_m} m'

BAR_LABEL = format_length(BAR_LENGTH_M)
BAR_LENGTH_NORM = BAR_LENGTH_M * NORM_SCALE

# ---------------------------------------------------------------------------
# Camera helpers (orthographic, fits the given object set, adaptive per shot)
# ---------------------------------------------------------------------------
CAMERA = bpy.data.objects.new('DiagnosticCamera', bpy.data.cameras.new('DiagnosticCameraData'))
bpy.context.collection.objects.link(CAMERA)
CAMERA.data.type = 'ORTHO'
CAMERA.data.clip_start = 0.001
CAMERA.data.clip_end = 100
scene.camera = CAMERA

def orient_camera(forward, up_letter):
    """Point the camera along `forward` (world-space direction the camera looks),
    keeping the world axis named by `up_letter` pointing up on screen. Built by hand
    (rather than Vector.to_track_quat, whose 2-axis form always aligns to global Z)
    so any specimen axis can be the on-screen "up"."""
    forward_n = Vector(forward).normalized()
    world_up = AXIS_VEC[up_letter]
    if abs(forward_n.dot(world_up)) > 0.999:
        world_up = AXIS_VEC['Y'] if up_letter != 'Y' else AXIS_VEC['X']
    z_local = -forward_n  # camera-local +Z (points toward the viewer, out of screen)
    x_local = world_up.cross(z_local)
    if x_local.length < 1e-9:
        x_local = Vector((1, 0, 0))
    x_local.normalize()
    y_local = z_local.cross(x_local).normalized()
    rot = Matrix((x_local, y_local, z_local)).transposed()
    CAMERA.rotation_euler = rot.to_euler()
    return rot.to_quaternion()

def fit_camera(objs, forward, up_letter, target=None, margin=1.35):
    """Frame `objs` (mesh objects with evaluated world verts) for the current camera
    orientation; sets ortho_scale and location so the geometry fills most of frame."""
    target = Vector(target) if target is not None else Vector((0, 0, 0))
    quat = orient_camera(forward, up_letter)
    inv = quat.inverted()
    minx = miny = minz = math.inf
    maxx = maxy = maxz = -math.inf
    any_v = False
    for o in objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            w = mw @ v.co
            local = inv @ (w - target)
            minx = min(minx, local.x); maxx = max(maxx, local.x)
            miny = min(miny, local.y); maxy = max(maxy, local.y)
            minz = min(minz, local.z); maxz = max(maxz, local.z)
            any_v = True
    if not any_v:
        minx = maxx = miny = maxy = minz = maxz = 0.0
    extent_x = max(maxx - minx, 1e-6)
    extent_y = max(maxy - miny, 1e-6)
    depth = max(maxz - minz, 1e-6)
    ortho_scale = max(extent_x, extent_y) * margin
    distance = max(depth, ortho_scale) * 1.5 + 1.0
    CAMERA.data.ortho_scale = ortho_scale
    forward_world = quat @ Vector((0, 0, -1))
    CAMERA.location = target - forward_world * distance
    CAMERA.data.clip_end = distance * 4 + 4
    return ortho_scale, distance

# ---------------------------------------------------------------------------
# Lighting (fixed, world-space, identical for every render)
# ---------------------------------------------------------------------------
def add_lights():
    lights = []
    for loc, power, size in [((2.4, -2.8, 2.6), 6, 3), ((-2.2, -0.8, 1.4), 3.5, 2.5), ((0, 2.2, 1.4), 5.5, 2.5)]:
        bpy.ops.object.light_add(type='AREA', location=loc)
        light = bpy.context.object
        light.data.energy = power
        light.data.shape = 'DISK'
        light.data.size = size
        light.rotation_euler = (-Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        lights.append(light)
    return lights

LIGHTS = add_lights()

# ---------------------------------------------------------------------------
# Scale bar + text label, parented to the camera (camera-facing by construction,
# orthographic so its screen size/position is independent of depth placement)
# ---------------------------------------------------------------------------
def emission_material(name, color):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    emit = nt.nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = color
    emit.inputs['Strength'].default_value = 4.0
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return m

BAR_MATERIAL = emission_material('ScaleBarWhite', (1, 1, 1, 1))
LABEL_MATERIAL = emission_material('ScaleBarLabel', (1, 1, 1, 1))

bpy.ops.mesh.primitive_cube_add(size=1)
BAR_OBJ = bpy.context.object
BAR_OBJ.name = 'DiagnosticScaleBar'
BAR_OBJ.data.materials.append(BAR_MATERIAL)

BAR_CURVE = bpy.data.curves.new('DiagnosticScaleLabel', type='FONT')
BAR_CURVE.align_x = 'CENTER'
BAR_CURVE.align_y = 'TOP'
LABEL_OBJ = bpy.data.objects.new('DiagnosticScaleLabel', BAR_CURVE)
bpy.context.collection.objects.link(LABEL_OBJ)
LABEL_OBJ.data.materials.append(LABEL_MATERIAL)

BAR_RIG = bpy.data.objects.new('DiagnosticScaleBarRig', None)
bpy.context.collection.objects.link(BAR_RIG)
BAR_OBJ.parent = BAR_RIG
LABEL_OBJ.parent = BAR_RIG
BAR_RIG.parent = CAMERA

DEPSGRAPH = bpy.context.evaluated_depsgraph_get()

def set_scale_bar(length_norm, label_text):
    """(Re)size the bar to `length_norm` (camera-local/world units) and set its label,
    auto-shrinking the text so its rendered width never exceeds the bar's own length."""
    thickness = length_norm * 0.09
    BAR_OBJ.dimensions = (length_norm, thickness, thickness)
    BAR_OBJ.location = (0, 0, 0)
    BAR_CURVE.body = label_text
    BAR_CURVE.size = length_norm * 0.32
    LABEL_OBJ.location = (0, -thickness * 1.8, 0)
    bpy.context.view_layer.update()
    DEPSGRAPH.update()
    text_width = LABEL_OBJ.evaluated_get(DEPSGRAPH).dimensions.x
    max_width = length_norm * 1.05
    if text_width > 1e-9 and text_width > max_width:
        BAR_CURVE.size *= max_width / text_width

def place_scale_bar(ortho_scale, length_m=None):
    """Bottom-center-ish, in camera-local space; ortho camera => depth doesn't affect
    apparent size/position, only x/y (as a fraction of ortho_scale) do. If `length_m`
    is omitted, sizes the bar to ~25% of the CURRENT view's width instead of the whole
    specimen's span (used for close-up section cuts, so the bar still fits the frame)."""
    if length_m is None:
        length_m = nice_round(0.25 * ortho_scale / NORM_SCALE)
    label = format_length(length_m)
    set_scale_bar(length_m * NORM_SCALE, label)
    x = 0.0
    y = -ortho_scale * 0.36
    z = -(CAMERA.data.clip_start * 4)
    BAR_RIG.location = (x, y, z)
    BAR_RIG.rotation_euler = (0, 0, 0)
    return length_m, label

# ---------------------------------------------------------------------------
# Render helper
# ---------------------------------------------------------------------------
RENDERS = []

def do_render(filename, kind):
    path = OUT / filename
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(str(path))
    w, h = img.size[0], img.size[1]
    bpy.data.images.remove(img)
    RENDERS.append({'file': filename, 'kind': kind, 'sha256': sha256(path), 'width': w, 'height': h})
    return path

# ---------------------------------------------------------------------------
# 1. Turntable
# ---------------------------------------------------------------------------
ELEVATION_DEG = 22.0

def orbit_forward(angle_rad, elevation_deg):
    up = AXIS_VEC[LONG_LETTER]
    u = AXIS_VEC[MINOR_LETTER]
    v = AXIS_VEC[MID_LETTER]
    elev = math.radians(elevation_deg)
    horiz = math.cos(angle_rad) * u + math.sin(angle_rad) * v
    # camera "forward" = direction the camera looks (from camera into the scene),
    # i.e. the reverse of the direction we place the camera along.
    outward = math.cos(elev) * horiz + math.sin(elev) * up
    return -outward  # forward = toward center

# Fixed framing for the whole turntable: rotation-invariant bounding-sphere fit so
# every frame uses the same ortho_scale/distance (consistent, non-jittery orbit).
def sphere_radius(objs, center):
    r = 0.0
    for o in objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            w = mw @ v.co
            r = max(r, (w - center).length)
    return r

TURNTABLE_TARGET = Vector((0, 0, 0))  # specimen is centered at world origin after normalization
RADIUS_NORM = sphere_radius(SPECIMEN, TURNTABLE_TARGET)
TURNTABLE_ORTHO = RADIUS_NORM * 2.1

for i in range(FRAMES):
    angle = 2 * math.pi * i / FRAMES
    forward = orbit_forward(angle, ELEVATION_DEG)
    orient_camera(forward, LONG_LETTER)
    CAMERA.data.ortho_scale = TURNTABLE_ORTHO
    distance = RADIUS_NORM * 3 + 1.0
    forward_world = forward
    CAMERA.location = TURNTABLE_TARGET - forward_world * distance
    CAMERA.data.clip_end = distance * 4 + 4
    place_scale_bar(TURNTABLE_ORTHO, BAR_LENGTH_M)
    do_render(f'turntable-{i:02d}.png', 'turntable')

# ---------------------------------------------------------------------------
# Copy helpers for sections / wireframe / normals (never touch originals)
# ---------------------------------------------------------------------------
def make_copies(name_suffix):
    copies = []
    rig = bpy.data.objects.new(f'DiagnosticCopies-{name_suffix}', None)
    bpy.context.collection.objects.link(rig)
    rig.matrix_world = NORM.matrix_world
    for o in SPECIMEN:
        c = o.copy()
        c.data = o.data.copy()
        c.name = f'{o.name}-{name_suffix}'
        bpy.context.collection.objects.link(c)
        c.parent = rig
        c.matrix_parent_inverse = Matrix.Identity(4)
        c.matrix_local = o.matrix_local.copy()
        c.hide_render = False
        copies.append(c)
    return rig, copies

def cleanup_copies(rig, copies):
    for c in copies:
        mesh = c.data
        bpy.data.objects.remove(c, do_unlink=True)
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    bpy.data.objects.remove(rig, do_unlink=True)

def hide_originals(hidden):
    for o in SPECIMEN:
        o.hide_render = hidden

# ---------------------------------------------------------------------------
# 2. Section views (bisect copies, keep the far half, view straight at the cut)
# ---------------------------------------------------------------------------
def bisect_keep_far(obj, plane_co_world, plane_no_world):
    mw_inv = obj.matrix_world.inverted()
    local_co = mw_inv @ plane_co_world
    local_no = (mw_inv.to_3x3() @ plane_no_world).normalized()
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
                            plane_co=local_co, plane_no=local_no,
                            clear_inner=True, clear_outer=False)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()

def render_section(filename, cut_letter, view_up_letter, center_world):
    rig, copies = make_copies(f'section-{filename}')
    hide_originals(True)
    normal_world = AXIS_VEC[cut_letter]
    forward = normal_world  # camera looks along the same direction as the plane normal
    # kept half must be the one the camera ends up looking INTO: remove the half
    # nearer the camera (between camera and plane), i.e. remove side opposite forward.
    for c in copies:
        if len(c.data.vertices) == 0:
            continue
        bisect_keep_far(c, center_world, -normal_world)
    orient_camera(forward, view_up_letter)
    ortho_scale, distance = fit_camera(copies, forward, view_up_letter, target=center_world, margin=1.3)
    place_scale_bar(ortho_scale)
    do_render(filename, 'section')
    hide_originals(False)
    cleanup_copies(rig, copies)
    return ortho_scale

render_section('section-cross.png', LONG_LETTER, MINOR_LETTER, TURNTABLE_TARGET)
render_section('section-longitudinal.png', MINOR_LETTER, LONG_LETTER, TURNTABLE_TARGET)

# ---------------------------------------------------------------------------
# 3. Wireframe diagnostic
# ---------------------------------------------------------------------------
def wireframe_material():
    m = bpy.data.materials.new('DiagnosticWireframe')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    wire = nt.nodes.new('ShaderNodeWireframe')
    wire.use_pixel_size = True  # constant on-screen line width regardless of world-space zoom
    wire.inputs['Size'].default_value = 1.6
    fill = nt.nodes.new('ShaderNodeEmission')
    fill.inputs['Color'].default_value = (0.05, 0.05, 0.06, 1)
    fill.inputs['Strength'].default_value = 0.4
    edge = nt.nodes.new('ShaderNodeEmission')
    edge.inputs['Color'].default_value = (0.15, 0.95, 0.55, 1)
    edge.inputs['Strength'].default_value = 3.0
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(wire.outputs['Fac'], mix.inputs['Fac'])
    nt.links.new(fill.outputs['Emission'], mix.inputs[1])
    nt.links.new(edge.outputs['Emission'], mix.inputs[2])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(mix.outputs['Shader'], out.inputs['Surface'])
    return m

WIRE_MATERIAL = wireframe_material()
rig, copies = make_copies('wireframe')
hide_originals(True)
for c in copies:
    c.data.materials.clear()
    c.data.materials.append(WIRE_MATERIAL)
forward = orbit_forward(math.radians(35), ELEVATION_DEG)
orient_camera(forward, LONG_LETTER)
ortho_scale, distance = fit_camera(copies, forward, LONG_LETTER, target=TURNTABLE_TARGET, margin=1.3)
place_scale_bar(ortho_scale, BAR_LENGTH_M)
do_render('wireframe.png', 'wireframe')
hide_originals(False)
cleanup_copies(rig, copies)

# ---------------------------------------------------------------------------
# 4. Normal visualization
# ---------------------------------------------------------------------------
def normals_material():
    m = bpy.data.materials.new('DiagnosticNormals')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mapping = nt.nodes.new('ShaderNodeVectorMath')
    mapping.operation = 'MULTIPLY_ADD'
    mapping.inputs[1].default_value = (0.5, 0.5, 0.5)
    mapping.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs['Normal'], mapping.inputs[0])
    back_mix = nt.nodes.new('ShaderNodeMixRGB')
    back_mix.inputs['Color2'].default_value = (1.0, 0.1, 0.6, 1)  # backfacing = magenta
    nt.links.new(mapping.outputs['Vector'], back_mix.inputs['Color1'])
    nt.links.new(geo.outputs['Backfacing'], back_mix.inputs['Fac'])
    emit = nt.nodes.new('ShaderNodeEmission')
    emit.inputs['Strength'].default_value = 1.0
    nt.links.new(back_mix.outputs['Color'], emit.inputs['Color'])
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return m

NORMALS_MATERIAL = normals_material()
rig, copies = make_copies('normals')
hide_originals(True)
for c in copies:
    c.data.materials.clear()
    c.data.materials.append(NORMALS_MATERIAL)
forward = orbit_forward(math.radians(35), ELEVATION_DEG)
orient_camera(forward, LONG_LETTER)
ortho_scale, distance = fit_camera(copies, forward, LONG_LETTER, target=TURNTABLE_TARGET, margin=1.3)
place_scale_bar(ortho_scale, BAR_LENGTH_M)
do_render('normals.png', 'normals')
hide_originals(False)
cleanup_copies(rig, copies)

# ---------------------------------------------------------------------------
# 5. Contact sheet (numpy-composited grid, kept small)
# ---------------------------------------------------------------------------
def build_contact_sheet():
    import numpy as np
    files = [r['file'] for r in RENDERS]
    tile = 160
    cols = 4
    rows = math.ceil(len(files) / cols)
    sheet = np.zeros((rows * tile, cols * tile, 4), dtype=np.float32)
    sheet[..., 3] = 1.0
    for idx, fname in enumerate(files):
        img = bpy.data.images.load(str(OUT / fname))
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
        bpy.data.images.remove(img)
        # nearest-neighbor downsample to tile x tile
        ys = (np.linspace(0, h - 1, tile)).astype(int)
        xs = (np.linspace(0, w - 1, tile)).astype(int)
        small = px[ys][:, xs]
        grid_row = idx // cols  # 0 = intended top row, reading order
        # Both `px` (loaded) and `sheet` (about to be saved) use Blender's bottom-up
        # pixel convention, so tiles need no internal flip -- only the grid row order
        # must be inverted so grid_row 0 lands at the visual top once saved.
        r0 = (rows - 1 - grid_row) * tile
        c0 = (idx % cols) * tile
        sheet[r0:r0 + tile, c0:c0 + tile] = small
    out_img = bpy.data.images.new('ContactSheet', width=cols * tile, height=rows * tile, alpha=True)
    out_img.pixels = sheet.reshape(-1).tolist()
    path = OUT / 'contact-sheet.png'
    out_img.filepath_raw = str(path)
    out_img.file_format = 'PNG'
    out_img.save()
    bpy.data.images.remove(out_img)
    return path, sha256(path)

CONTACT_SHEET_PATH, CONTACT_SHEET_SHA = build_contact_sheet()
RENDERS.append({
    'file': 'contact-sheet.png', 'kind': 'contact-sheet', 'sha256': CONTACT_SHEET_SHA,
    'width': (4 * 160), 'height': math.ceil(len(RENDERS) / 4) * 160,
})

# ---------------------------------------------------------------------------
# 6. Receipt
# ---------------------------------------------------------------------------
try:
    blend_repo_relative = str(ROOT.relative_to(REPO_ROOT))
except ValueError:
    blend_repo_relative = str(ROOT)

receipt = {
    'schemaVersion': 1,
    'blenderVersion': bpy.app.version_string,
    'blendPath': blend_repo_relative,
    'blendSHA256': sha256(ROOT),
    'level': LEVEL,
    'colorManagement': {
        'displayDevice': scene.display_settings.display_device,
        'viewTransform': scene.view_settings.view_transform,
        'look': scene.view_settings.look,
        'exposure': scene.view_settings.exposure,
        'gamma': scene.view_settings.gamma,
        'sequencerColorspace': scene.sequencer_colorspace_settings.name,
        'filmTransparent': scene.render.film_transparent,
        'worldColor': list(scene.world.color),
        'cyclesSeed': scene.cycles.seed,
        'denoising': scene.cycles.use_denoising,
        'threadsMode': scene.render.threads_mode,
        'threads': scene.render.threads,
    },
    'camera': {'type': 'ORTHO', 'orthoScale': TURNTABLE_ORTHO, 'elevationDeg': ELEVATION_DEG},
    'samples': SAMPLES,
    'size': SIZE,
    'scaleBar': {'lengthM': BAR_LENGTH_M, 'label': BAR_LABEL},
    'renders': RENDERS,
    'normalizationScale': NORM_SCALE,
}
(OUT / 'diagnostics.json').write_text(json.dumps(receipt, indent=2) + '\n')
print('RENDER_DIAGNOSTICS_DONE', json.dumps({'level': LEVEL, 'out': str(OUT), 'renders': len(RENDERS)}))
