"""Diagnostic render: extracted centerlines inside the translucent source vessel meshes.

Run: blender -b --python scripts/vessels/render-vessel-graph.py -- OUT_DIR
Arteries red, veins blue, portal violet; inferred bridges yellow and detached roots magenta so
every non-source junction can be found by eye. Blender is used for rendering only.
"""
import json
import sys
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "public/models"
OUT = Path(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else ROOT / "outputs/vessels"
VIEWS = {
    # name: (camera position, look-at) in atlas metres (y up); converted to Blender z-up below.
    "body": ((0.0, 0.87, 4.6), (0.0, 0.87, 0.0)),
    "trunk": ((0.0, 1.2, 1.7), (0.0, 1.2, 0.0)),
    "head": ((0.55, 1.6, 0.75), (0.0, 1.58, 0.0)),
    "leg": ((-0.1, 0.55, 1.5), (-0.1, 0.55, 0.0)),
}
COLORS = {
    "arterial": (0.9, 0.08, 0.06), "pulmonary-venous": (0.9, 0.25, 0.2), "venous": (0.1, 0.3, 0.95),
    "pulmonary-arterial": (0.2, 0.5, 0.95), "portal": (0.55, 0.25, 0.8),
    "inferred": (1.0, 0.85, 0.0), "detached": (1.0, 0.0, 0.8),
}


def blender(p):
    """Atlas (x, y up, z front) to Blender (x, y back, z up)."""
    p = np.asarray(p, float).reshape(-1, 3)
    return np.c_[p[:, 0], -p[:, 2], p[:, 1]]


def material(name, color, alpha=1.0, emission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    shader = m.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Alpha"].default_value = alpha
    shader.inputs["Roughness"].default_value = 0.6
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return m


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    graph = json.loads((MODELS / "vessel-graph.json").read_text())
    used = {s["part"] for s in graph["segments"]}
    glass = {k: material(f"wall-{k}", c, 0.16) for k, c in (("arterial", (0.9, 0.5, 0.45)), ("venous", (0.45, 0.6, 0.95)))}
    for manifest in ("atlas.json", "expansion.json"):
        atlas = json.loads((MODELS / manifest).read_text())
        chunks = [(MODELS / Path(c["url"]).name).read_bytes() for c in atlas["chunks"]]
        for p in atlas["parts"]:
            if p["id"] not in used:
                continue
            b = chunks[p["chunk"]]
            v = blender(np.frombuffer(b, np.float32, p["vertexCount"] * 3, p["positions"]))
            f = np.frombuffer(b, np.uint32, p["indexCount"], p["indices"]).reshape(-1, 3)
            mesh = bpy.data.meshes.new(p["id"])
            mesh.from_pydata(v.tolist(), [], f.tolist())
            mesh.materials.append(glass[p["system"]])
            bpy.context.scene.collection.objects.link(bpy.data.objects.new(p["id"], mesh))
    # One curve object per colour keeps the scene small.
    curves = {}
    for s in graph["segments"]:
        key = s["junction"] if s["junction"] in ("inferred", "detached") else s["circuit"]
        if key not in curves:
            data = bpy.data.curves.new(key, "CURVE")
            data.dimensions = "3D"
            data.bevel_depth = 0.0011 if key in ("inferred", "detached") else 0.0006
            data.materials.append(material(f"path-{key}", COLORS[key], 1.0, 2.5))
            bpy.context.scene.collection.objects.link(bpy.data.objects.new(f"path-{key}", data))
            curves[key] = data
        points = blender(np.array(s["points"]) / 10000)
        spline = curves[key].splines.new("POLY")
        spline.points.add(len(points) - 1)
        spline.points.foreach_set("co", np.c_[points, np.ones(len(points))].ravel())
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    scene.cycles.device = "GPU"
    scene.cycles.samples = 96
    scene.cycles.max_bounces = 16
    scene.cycles.transparent_max_bounces = 32
    scene.render.resolution_x, scene.render.resolution_y = 1500, 2400
    scene.world = bpy.data.worlds.new("world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.03, 0.04, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    target = bpy.data.objects.new("target", None)
    scene.collection.objects.link(target)
    track = camera.constraints.new("TRACK_TO")
    track.target, track.track_axis, track.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (eye, look) in VIEWS.items():
        camera.location, target.location = blender(eye)[0], blender(look)[0]
        camera.data.lens = 85 if name == "body" else 60
        scene.render.filepath = str(OUT / f"vessel-graph-{name}.png")
        bpy.ops.render.render(write_still=True)
    devices = [d.name for d in prefs.devices if d.use]
    (OUT / "render-receipt.json").write_text(json.dumps({
        "blender": bpy.app.version_string, "engine": "CYCLES", "devices": devices,
        "graph": graph["version"], "extractor": graph["method"]["extractor"], "segments": len(graph["segments"]),
    }, indent=1) + "\n")


main()
