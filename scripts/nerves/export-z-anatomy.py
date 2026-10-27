"""Read the cord, nerves and the registration anchors out of the Z-Anatomy Blender file.

Run with Blender's Python (bpy), from the repository root:
  blender -b -P scripts/nerves/export-z-anatomy.py -- work/nerves/Startup.blend work/nerves
  or: python -I scripts/nerves/export-z-anatomy.py work/nerves/Startup.blend work/nerves   (pip install bpy)

Startup.blend comes from Z-Anatomy.zip in https://github.com/Z-Anatomy/Models-of-human-anatomy
(CC BY-SA 4.0). Writes two files into the output folder:
  za-meshes.npz(.json)  evaluated meshes in world space: bones and muscles (the anchors that carry
                        Z-Anatomy onto this atlas), the spinal cord and ganglia, and every nerve tube
                        (only used to read each nerve's thickness)
  za-lines.npz(.json)   each nerve curve as polylines with no bevel: the centrelines the nerves are
                        rebuilt from
"""
import json
import re
import sys

import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
blend, out = args[0], args[1]
bpy.ops.wm.open_mainfile(filepath=blend)

BONES = {"Femur", "Tibia", "Fibula", "Hip bone", "Sacrum", "Coccyx", "Atlas (C1)", "Axis (C2)", "Occipital bone", "Humerus", "Scapula", "Clavicle",
         "Mandible", "Body of sternum", "Manubrium of sternum", "Calcaneus", "Radius", "Ulna", "Frontal bone", "Patella"}
HELPERS = (".j", ".i", ".t", ".g")  # Z-Anatomy label lines, insertion marks and group proxies


def top(o):
    return o.users_collection[0].name if o.users_collection else ""


def wanted_mesh(o):
    n, t = o.name, top(o)
    if n.endswith(HELPERS):
        return False
    if re.sub(r"\.[lr]$", "", n) in BONES or re.match(r"Vertebra [CTL]\d+$|.*rib\.[lr]$", n):
        return True
    if t.startswith("4"):
        return not re.search(r"bursa|fascia|retinacul|sheath", n, re.I)
    return t.startswith("7")


def world(o, mesh):
    v = np.empty(len(mesh.vertices) * 3, np.float32)
    mesh.vertices.foreach_get("co", v)
    m = np.array(o.matrix_world, np.float64)
    return (v.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]).astype(np.float32)


def save(name, data, meta):
    np.savez_compressed(f"{out}/{name}.npz", **data)
    with open(f"{out}/{name}.npz.json", "w") as f:
        json.dump(meta, f)


# Meshes, with modifiers applied (the cord is an arrayed profile bent along a curve).
graph = bpy.context.evaluated_depsgraph_get()
data, meta = {}, {}
for o in bpy.data.objects:
    if o.type not in ("MESH", "CURVE") or not wanted_mesh(o):
        continue
    e = o.evaluated_get(graph)
    m = e.to_mesh()
    if m is None or not len(m.vertices):
        e.to_mesh_clear()
        continue
    m.calc_loop_triangles()
    t = np.empty(len(m.loop_triangles) * 3, np.int32)
    m.loop_triangles.foreach_get("vertices", t)
    k = f"o{len(meta)}"
    data[k + "_v"], data[k + "_t"] = world(o, m), t.reshape(-1, 3)
    meta[k] = {"name": o.name, "type": o.type, "cols": [c.name for c in o.users_collection]}
    e.to_mesh_clear()
save("za-meshes", data, meta)

# Nerve curves as bare polylines: drop bevel and modifiers on every curve first, then evaluate once.
curves = []
for o in bpy.data.objects:
    if o.type == "CURVE" and top(o).startswith("7"):
        o.data.bevel_depth, o.data.extrude, o.data.bevel_object = 0, 0, None
        for md in o.modifiers:
            md.show_viewport = False
        curves.append(o)
graph = bpy.context.evaluated_depsgraph_get()
data, meta = {}, {}
for o in curves:
    e = o.evaluated_get(graph)
    m = e.to_mesh()
    if m is None or not len(m.vertices):
        e.to_mesh_clear()
        continue
    edges = np.empty(len(m.edges) * 2, np.int32)
    m.edges.foreach_get("vertices", edges)
    k = f"c{len(meta)}"
    data[k + "_v"], data[k + "_e"] = world(o, m), edges.reshape(-1, 2)
    meta[k] = {"name": o.name, "cols": [c.name for c in o.users_collection]}
    e.to_mesh_clear()
save("za-lines", data, meta)
print(json.dumps({"meshes": len(json.load(open(f"{out}/za-meshes.npz.json"))), "curves": len(meta)}))
