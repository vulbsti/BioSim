"""Before/after render of the neck arteries: reconstructed curves against courses registered from imaging.

Run: blender -b --python scripts/vessels/render-neck-registration.py -- OUT_DIR
Writes neck-registration-preview.png: top row the reconstructed segments (yellow), bottom row the
registered ones (green); left column from the front, right column from the subject's left. Source
arteries are red and bone is translucent. Blender is used for rendering only.
"""
import re
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import atlas_io

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[sys.argv.index("--") + 1]) if "--" in sys.argv else ROOT / "outputs/vessels"
LOOK = (0.0, 1.475, -0.005)
VIEWS = {"front": (0.0, 1.475, 0.62), "left": (0.62, 1.475, -0.005)}
ARTERIES = r"(left|right) (common carotid|internal carotid|vertebral|subclavian) artery|arch of aorta|brachiocephalic artery|basilar artery"
SIZE = (900, 1150)


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
    shader.inputs["Roughness"].default_value = 0.55
    if emission:
        shader.inputs["Emission Color"].default_value = (*color, 1)
        shader.inputs["Emission Strength"].default_value = emission
    return m


def add(name, v, f, look, group):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(blender(v).tolist(), [], f.tolist())
    mesh.materials.append(look)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    item = bpy.data.objects.new(name, mesh)
    group.objects.link(item)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    groups = {}
    for name in ("shared", "before", "after"):
        groups[name] = bpy.data.collections.new(name)
        scene.collection.children.link(groups[name])
    bone, artery = material("bone", (0.85, 0.8, 0.68), 0.5), material("artery", (0.75, 0.1, 0.08))
    for p, v, f in atlas_io.read("atlas.json"):
        low, high = p["bounds"][0][1], p["bounds"][1][1]
        if p["system"] == "skeletal" and high > 1.40 and low < 1.60 and not re.search("rib|clavicle|scapula|sternum|manubrium|mandible|tooth|maxilla|gingiva|zygomatic|nasal|palatine|vomer", p["name"], re.I):
            add(p["id"], v, f, bone, groups["shared"])
        elif re.fullmatch(ARTERIES, p["name"], re.I):
            add(p["id"], v, f, artery, groups["shared"])
    reconstructed = {p["id"]: (v, f) for p, v, f in atlas_io.read("reconstructed-vessels.json")}
    registered = {p["id"]: (v, f) for p, v, f in atlas_io.read(atlas_io.REGISTERED)}
    was, now = material("reconstructed", (1.0, 0.8, 0.05), 1.0, 0.6), material("registered", (0.1, 0.9, 0.45), 1.0, 0.6)
    for id, (v, f) in reconstructed.items():
        add(f"before-{id}", v, f, was, groups["before"])
        # A segment the registration left out is still the reconstructed curve afterwards.
        add(f"after-{id}", *registered.get(id, (v, f)), now if id in registered else was, groups["after"])

    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == "OPTIX"
    scene.cycles.device = "GPU"
    scene.cycles.samples = 96
    scene.cycles.transparent_max_bounces = 32
    scene.render.resolution_x, scene.render.resolution_y = SIZE
    scene.world = bpy.data.worlds.new("world")
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.03, 0.04, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    for at in ((1.0, 1.9, 1.5), (-1.2, 1.6, 0.8), (1.2, 1.5, -0.6)):
        light = bpy.data.objects.new("light", bpy.data.lights.new("light", "AREA"))
        light.data.energy, light.data.size = 60, 0.6
        light.location = blender(at)[0]
        scene.collection.objects.link(light)
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    camera.data.lens = 85
    scene.collection.objects.link(camera)
    scene.camera = camera
    target = bpy.data.objects.new("target", None)
    target.location = blender(LOOK)[0]
    scene.collection.objects.link(target)
    track = camera.constraints.new("TRACK_TO")
    track.target, track.track_axis, track.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
    for light in [o for o in scene.collection.objects if o.type == "LIGHT"]:
        aim = light.constraints.new("TRACK_TO")
        aim.target, aim.track_axis, aim.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"

    OUT.mkdir(parents=True, exist_ok=True)
    tiles = {}
    for state in ("before", "after"):
        groups["before"].hide_render, groups["after"].hide_render = state != "before", state != "after"
        for view, eye in VIEWS.items():
            camera.location = blender(eye)[0]
            scene.render.filepath = str(OUT / f"neck-registration-{state}-{view}.png")
            bpy.ops.render.render(write_still=True)
            image = bpy.data.images.load(scene.render.filepath)
            tiles[state, view] = np.array(image.pixels[:]).reshape(SIZE[1], SIZE[0], 4)
            Path(scene.render.filepath).unlink()
    # Image rows run bottom to top, so the "after" row is stacked first to sit underneath.
    sheet = np.vstack([np.hstack([tiles[state, view] for view in VIEWS]) for state in ("after", "before")])
    out = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0], alpha=True)
    out.pixels = sheet.ravel().tolist()
    out.filepath_raw, out.file_format = str(OUT / "neck-registration-preview.png"), "PNG"
    out.save()


main()
