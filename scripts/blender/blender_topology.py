"""Blender-side topology statistics shared by the build gate and the read-only audit."""
import bmesh
from mathutils import Vector
from mathutils.kdtree import KDTree

from muscle_geometry import topology


def mesh_stats(obj):
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    loose_edges = sum(1 for edge in bm.edges if not edge.link_faces)
    loose_verts = sum(1 for vert in bm.verts if not vert.link_edges)
    degenerate_faces = sum(1 for face in bm.faces if face.calc_area() <= 1e-24)
    boundary_verts = [vert for vert in {v for edge in bm.edges if edge.is_boundary for v in edge.verts}]
    if bm.verts:
        mins = [min(vert.co[i] for vert in bm.verts) for i in range(3)]
        maxs = [max(vert.co[i] for vert in bm.verts) for i in range(3)]
        weld_tolerance = max((Vector(maxs) - Vector(mins)).length * 1e-9, 1e-18)
    else:
        weld_tolerance = 1e-18
    tree = KDTree(len(boundary_verts))
    for index, vert in enumerate(boundary_verts):
        tree.insert(vert.co, index)
    tree.balance()
    coincident_pairs = set()
    for index, vert in enumerate(boundary_verts):
        for _, other, distance in tree.find_range(vert.co, weld_tolerance):
            if other != index and distance <= weld_tolerance:
                coincident_pairs.add(tuple(sorted((index, other))))
    topo = topology([tuple(v.co) for v in mesh.vertices], [tuple(p.vertices) for p in mesh.polygons])
    volume = None
    if topo["boundaryEdges"] == 0 and topo["nonManifoldEdges"] == 0 and bm.faces:
        volume = abs(bm.calc_volume(signed=True))
    bm.free()
    return {
        "vertices": len(mesh.vertices),
        "edges": len(mesh.edges),
        "polygons": len(mesh.polygons),
        "triangles": sum(max(0, len(poly.vertices) - 2) for poly in mesh.polygons),
        "components": topo["components"],
        "boundaryEdges": topo["boundaryEdges"],
        "boundaryLoops": topo["boundaryLoops"],
        "loopsPerComponent": topo["loopsPerComponent"],
        "nonManifoldEdges": topo["nonManifoldEdges"],
        "looseEdges": loose_edges,
        "looseVertices": loose_verts,
        "degenerateFaces": degenerate_faces,
        "boundaryWeldToleranceM": weld_tolerance,
        "coincidentBoundaryVertexPairs": len(coincident_pairs),
        "closedVolumeM3": volume,
        "hasUV": bool(mesh.uv_layers),
        "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
    }


def summarize(stats):
    """Compact form for manifests; the full per-component list stays in audit reports."""
    counts = {}
    for n in stats["loopsPerComponent"]:
        counts[str(n)] = counts.get(str(n), 0) + 1
    out = {k: v for k, v in stats.items() if k not in ("loopsPerComponent", "materials", "hasUV", "edges")}
    out["componentsByBoundaryLoops"] = counts
    return out
