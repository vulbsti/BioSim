"""Read-only Blender audit for the saved muscle-pilot authoring scenes.

Run with:
  blender --background FILE.blend --python scripts/blender/audit-muscle-pilot.py -- OUTPUT.json
"""
import bpy
import bmesh
import hashlib
import json
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.kdtree import KDTree


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mesh_stats(obj):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()
    boundary = sum(1 for edge in bm.edges if edge.is_boundary)
    non_manifold = sum(1 for edge in bm.edges if not edge.is_manifold)
    loose_edges = sum(1 for edge in bm.edges if not edge.link_faces)
    loose_verts = sum(1 for vert in bm.verts if not vert.link_edges)
    degenerate_faces = sum(1 for face in bm.faces if face.calc_area() <= 1e-24)
    boundary_verts = {vert for edge in bm.edges if edge.is_boundary for vert in edge.verts}
    if bm.verts:
        mins = [min(vert.co[i] for vert in bm.verts) for i in range(3)]
        maxs = [max(vert.co[i] for vert in bm.verts) for i in range(3)]
        weld_tolerance = max((Vector(maxs) - Vector(mins)).length * 1e-9, 1e-18)
    else:
        weld_tolerance = 1e-18
    tree = KDTree(len(boundary_verts))
    indexed_boundary = list(boundary_verts)
    for index, vert in enumerate(indexed_boundary):
        tree.insert(vert.co, index)
    tree.balance()
    coincident_pairs = set()
    for index, vert in enumerate(indexed_boundary):
        for _, other_index, distance in tree.find_range(vert.co, weld_tolerance):
            if other_index != index and distance <= weld_tolerance:
                coincident_pairs.add(tuple(sorted((index, other_index))))
    seen = set()
    components = 0
    for vert in bm.verts:
        if vert.index in seen:
            continue
        components += 1
        stack = [vert]
        seen.add(vert.index)
        while stack:
            current = stack.pop()
            for edge in current.link_edges:
                other = edge.other_vert(current)
                if other.index not in seen:
                    seen.add(other.index)
                    stack.append(other)
    volume = None
    if non_manifold == 0 and bm.faces:
        volume = abs(bm.calc_volume(signed=True))
    bm.free()
    return {
        "vertices": len(mesh.vertices),
        "edges": len(mesh.edges),
        "polygons": len(mesh.polygons),
        "triangles": sum(max(0, len(poly.vertices) - 2) for poly in mesh.polygons),
        "components": components,
        "boundaryEdges": boundary,
        "nonManifoldEdges": non_manifold,
        "looseEdges": loose_edges,
        "looseVertices": loose_verts,
        "degenerateFaces": degenerate_faces,
        "boundaryWeldToleranceM": weld_tolerance,
        "coincidentBoundaryVertexPairs": len(coincident_pairs),
        "closedVolumeM3": volume,
        "hasUV": bool(mesh.uv_layers),
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
    }


blend_path = Path(bpy.data.filepath).resolve()
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(args) != 1:
    raise SystemExit("Expected one output JSON path after --")
output_path = Path(args[0]).resolve()
objects = []
for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name):
    record = {
        "name": obj.name,
        "type": obj.type,
        "entityId": obj.get("entityId"),
        "kind": obj.get("kind"),
        "evidence": obj.get("evidence"),
        "metersPerUnit": obj.get("metersPerUnit"),
        "location": list(obj.location),
        "rotationEuler": list(obj.rotation_euler),
        "scale": list(obj.scale),
        "parent": obj.parent.name if obj.parent else None,
    }
    if obj.type == "MESH":
        record["mesh"] = mesh_stats(obj)
        corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        record["worldBounds"] = {
            "min": [min(corner[i] for corner in corners) for i in range(3)],
            "max": [max(corner[i] for corner in corners) for i in range(3)],
        }
    objects.append(record)

report = {
    "schemaVersion": 1,
    "blenderVersion": bpy.app.version_string,
    "blendPath": str(blend_path),
    "blendSHA256": sha256(blend_path),
    "sceneUnitSystem": bpy.context.scene.unit_settings.system,
    "sceneScaleLength": bpy.context.scene.unit_settings.scale_length,
    "objects": objects,
}
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(report, indent=2) + "\n")
print("BLENDER_AUDIT", json.dumps({"blend": str(blend_path), "objects": len(objects)}))
