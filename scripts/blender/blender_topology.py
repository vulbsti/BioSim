"""Blender-side topology statistics shared by the build gate and the read-only audit."""
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

from muscle_geometry import topology


def self_intersecting_face_pairs(bm):
    """Count pairs of non-adjacent faces whose geometry actually intersects, via a BVH
    self-overlap test. Adjacent faces (sharing a vertex) legitimately touch at a shared
    edge/corner and are excluded, matching the task's 'excluding adjacent faces' rule."""
    if not bm.faces:
        return 0
    bm.faces.ensure_lookup_table()
    tree = BVHTree.FromBMesh(bm, epsilon=0.0)
    seen = set()
    count = 0
    for a, b in tree.overlap(tree):
        if a == b:
            continue
        key = (a, b) if a < b else (b, a)
        if key in seen:
            continue
        seen.add(key)
        verts_a = {v.index for v in bm.faces[a].verts}
        verts_b = {v.index for v in bm.faces[b].verts}
        if verts_a & verts_b:
            continue
        count += 1
    return count


def winding_consistency(obj):
    """Diagnostic only: count faces whose current winding disagrees with a consistent
    recalculation (bmesh.ops.recalc_face_normals), WITHOUT modifying obj.data -- the bmesh
    is discarded, never written back. Used to quantify backfacing/inconsistently wound
    source-surface faces that policy forbids repairing in place."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    before = [Vector(face.normal) for face in bm.faces]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.faces.ensure_lookup_table()
    total = len(bm.faces)
    inconsistent = sum(
        1 for face, was in zip(bm.faces, before)
        if was.length > 1e-12 and face.normal.length > 1e-12 and was.dot(face.normal) < 0
    )
    bm.free()
    return {
        "totalFaces": total,
        "inconsistentFaces": inconsistent,
        "fraction": (inconsistent / total) if total else 0.0,
    }


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
    self_intersections = self_intersecting_face_pairs(bm)
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
        "selfIntersectingFacePairs": self_intersections,
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
