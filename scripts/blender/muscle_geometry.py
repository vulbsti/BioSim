"""Pure-Python geometry for the muscle pilot, testable without Blender.

Closed tubes share one geometric vertex per ring angle. The periodic UV split is
kept in per-face (loop/corner) UVs, so the seam no longer opens the surface.
Only arc tubes (named inspection windows) have boundary loops by construction.
"""
import math


def _rotate_z_to(direction):
    """Rotation matrix taking +Z onto a unit direction along the shortest arc."""
    x, y, z = direction
    c = z
    if c > 1 - 1e-15:
        return ((1, 0, 0), (0, 1, 0), (0, 0, 1))
    if c < -1 + 1e-15:
        return ((1, 0, 0), (0, -1, 0), (0, 0, -1))
    # axis = Z x d, normalised; Rodrigues with sin = |axis|
    ax, ay = -y, x
    s = math.hypot(ax, ay)
    ax, ay = ax / s, ay / s
    t = 1 - c
    return (
        (c + ax * ax * t, ax * ay * t, ay * s),
        (ax * ay * t, c + ay * ay * t, -ax * s),
        (-ay * s, ax * s, c),
    )


class Mesh:
    def __init__(self):
        self.v = []
        self.f = []
        self.uv = []
        self.smooth = []

    def face(self, ids, uv, smooth=True):
        self.f.append(tuple(ids))
        self.uv.append(uv)
        self.smooth.append(smooth)

    def tube(self, x, y, r, length, segments=16, steps=1, arc=None, zoffset=0, period=None, phase=0):
        start = len(self.v)
        a0, a1 = arc or (0, math.tau)
        closed = arc is None
        ring = segments if closed else segments + 1
        for j in range(steps + 1):
            z = (j / steps - .5) * length + zoffset
            for i in range(ring):
                # `phase` rotates every ring vertex by a constant angle. For a closed ring
                # (arc is None) this keeps every vertex's antipodal partner (angle a+pi) in
                # the sampled set, so the ring's bounding extent stays exactly symmetric
                # about its axis -- while letting a caller steer ring vertices away from a
                # specific world direction (see the sarcomere lattice links, which use this
                # to avoid a ring vertex landing exactly on a shared coplanar symmetry plane
                # that otherwise makes the exact boolean solver produce non-manifold slivers).
                a = a0 + (a1 - a0) * i / segments + phase
                self.v.append((x + r * math.cos(a), y + r * math.sin(a), z))
        vid = lambda j, i: start + j * ring + (i % ring if closed else i)
        for j in range(steps):
            v0 = ((j / steps - .5) * length + zoffset) / (period or length)
            v1 = (((j + 1) / steps - .5) * length + zoffset) / (period or length)
            for i in range(segments):
                self.face([vid(j, i), vid(j, i + 1), vid(j + 1, i + 1), vid(j + 1, i)],
                          [(i / segments, v0), ((i + 1) / segments, v0), ((i + 1) / segments, v1), (i / segments, v1)])
        if closed:
            for j in [0, steps]:
                center = len(self.v)
                self.v.append((x, y, (j / steps - .5) * length + zoffset))
                for i in range(segments):
                    ids = [center, vid(j, i + 1), vid(j, i)] if j == 0 else [center, vid(j, i), vid(j, i + 1)]
                    uv = [(.5, .5)] + [(.5 + .45 * math.cos(a0 + (a1 - a0) * n / segments), .5 + .45 * math.sin(a0 + (a1 - a0) * n / segments))
                                       for n in ([i + 1, i] if j == 0 else [i, i + 1])]
                    self.face(ids, uv, False)

    def ellipsoid(self, center, radii, segments=12, rings=6, biconcave=False):
        start = len(self.v)
        x, y, z = center
        rx, ry, rz = radii
        self.v.append((x, y, z + rz * (.3 if biconcave else 1)))
        for j in range(1, rings):
            phi = math.pi * j / rings
            for i in range(segments):
                a = math.tau * i / segments
                s = math.sin(phi)
                q = math.cos(phi) * (.3 + .7 * s * s if biconcave else 1)
                self.v.append((x + rx * s * math.cos(a), y + ry * s * math.sin(a), z + rz * q))
        bottom = len(self.v)
        self.v.append((x, y, z - rz * (.3 if biconcave else 1)))
        for i in range(segments):
            self.face([start, start + 1 + i, start + 1 + (i + 1) % segments], [(0, 0)] * 3)
            last = start + 1 + (rings - 2) * segments
            self.face([bottom, last + (i + 1) % segments, last + i], [(0, 0)] * 3)
        for j in range(rings - 2):
            for i in range(segments):
                a = start + 1 + j * segments + i
                b = start + 1 + j * segments + (i + 1) % segments
                self.face([a, a + segments, b + segments, b], [(0, 0)] * 4)

    def link(self, a, b, r, segments=6, phase=0):
        start = len(self.v)
        axis = tuple(q - p for p, q in zip(a, b))
        length = math.sqrt(sum(c * c for c in axis))
        self.tube(0, 0, r, length, segments, phase=phase)
        m = _rotate_z_to(tuple(c / length for c in axis))
        center = tuple((p + q) / 2 for p, q in zip(a, b))
        for i in range(start, len(self.v)):
            p = self.v[i]
            self.v[i] = tuple(sum(m[row][k] * p[k] for k in range(3)) + center[row] for row in range(3))


def topology(vertices, faces):
    """Edge-use topology: components, boundary loops and non-manifold edges."""
    uses = {}
    for face in faces:
        for i in range(len(face)):
            e = tuple(sorted((face[i], face[(i + 1) % len(face)])))
            uses[e] = uses.get(e, 0) + 1
    boundary = [e for e, n in uses.items() if n == 1]
    nonmanifold = [e for e, n in uses.items() if n > 2]
    parent = list(range(len(vertices)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for a, b in uses:
        parent[find(a)] = find(b)
    used = {v for face in faces for v in face}
    components = len({find(v) for v in used})
    adjacency = {}
    for a, b in boundary:
        adjacency.setdefault(a, []).append(b)
        adjacency.setdefault(b, []).append(a)
    seen, loops = set(), []
    for start in adjacency:
        if start in seen:
            continue
        stack, loop = [start], []
        seen.add(start)
        while stack:
            v = stack.pop()
            loop.append(v)
            for w in adjacency[v]:
                if w not in seen:
                    seen.add(w)
                    stack.append(w)
        loops.append(loop)
    per_component = {}
    for loop in loops:
        root = find(loop[0])
        per_component[root] = per_component.get(root, 0) + 1
    return {
        "components": components,
        "boundaryEdges": len(boundary),
        "nonManifoldEdges": len(nonmanifold),
        "boundaryLoops": len(loops),
        # Loop count of each component, including zero for closed components.
        "loopsPerComponent": sorted(per_component.get(r, 0) for r in {find(v) for v in used}),
        "looseVertices": len(vertices) - len(used),
    }


def classify(entity_id, stats, policy):
    """Topology verdict against the spec's named openings and source surfaces."""
    if entity_id in policy.get("sourceSurfaces", []):
        return {"status": "source-preserved", "reasons": []}
    reasons = []
    for key in ("nonManifoldEdges", "looseVertices", "looseEdges", "degenerateFaces", "coincidentBoundaryVertexPairs"):
        if stats.get(key, 0):
            reasons.append(f"{key}={stats[key]}")
    pairs = stats.get("selfIntersectingFacePairs", 0)
    if pairs:
        allowed = policy.get("selfIntersection", {}).get("allowlist", {}).get(entity_id)
        limit = allowed["maxPairs"] if allowed else 0
        if pairs > limit:
            reasons.append(
                f"selfIntersectingFacePairs={pairs}"
                + (f" exceeds allowlisted maxPairs={limit} ({allowed['reason']})" if allowed else " (not declared in topology.selfIntersection.allowlist)")
            )
    opening = policy.get("openings", {}).get(entity_id)
    if opening:
        want = opening["loopsPerComponent"]
        bad = [n for n in stats["loopsPerComponent"] if n != want]
        if bad:
            reasons.append(f"components with {sorted(set(bad))} boundary loops; '{opening['name']}' declares {want}")
        status = "classified-openings"
    else:
        if stats["boundaryEdges"]:
            reasons.append(f"unclassified boundary loops={stats['boundaryLoops']} edges={stats['boundaryEdges']}")
        status = "closed"
    return {"status": "fail" if reasons else status, "reasons": reasons, **({"opening": opening["name"]} if opening else {})}


def coincident_vertices(vertices, tolerance):
    """Count vertex pairs closer than tolerance (grid hashing, pure Python)."""
    cell = tolerance * 2 or 1e-30
    grid = {}
    pairs = 0
    for index, p in enumerate(vertices):
        key = tuple(int(math.floor(c / cell)) for c in p)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for other in grid.get((key[0] + dx, key[1] + dy, key[2] + dz), ()):
                        q = vertices[other]
                        if math.dist(p, q) <= tolerance:
                            pairs += 1
        grid.setdefault(key, []).append(index)
    return pairs


def weld(vertices, faces, tolerance):
    """Merge vertices within `tolerance` (grid hashing, same technique as
    coincident_vertices) to their lowest-index cluster member, remap faces onto the merged
    indices, then drop any face that degenerates (repeats a vertex) or exactly duplicates
    an earlier face's vertex set. Used to clean up sub-feature-scale slivers a boolean union
    can leave (e.g. two near-coincident microscopic triangles sharing one long edge, which
    read as locally non-manifold once positions are compared exactly) without relying on
    Blender's own dissolve/remove-doubles operators, whose distance semantics are not
    reliably in the caller's chosen coordinate frame. Returns (vertices, faces); indices are
    compacted to only the vertices actually used by a kept face."""
    cell = tolerance * 2 or 1e-30
    grid = {}
    canonical = list(range(len(vertices)))
    for index, p in enumerate(vertices):
        key = tuple(int(math.floor(c / cell)) for c in p)
        found = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for other in grid.get((key[0] + dx, key[1] + dy, key[2] + dz), ()):
                        if math.dist(p, vertices[other]) <= tolerance:
                            if found is None or other < found:
                                found = other
        if found is not None:
            canonical[index] = canonical[found]
        grid.setdefault(key, []).append(index)
    kept_faces = []
    seen_faces = set()
    for face in faces:
        remapped = [canonical[v] for v in face]
        if len(set(remapped)) != len(remapped):
            continue  # degenerate: a boolean-union sliver collapsed onto itself
        key = tuple(sorted(remapped))
        if key in seen_faces:
            continue  # exact duplicate face left by the union
        seen_faces.add(key)
        kept_faces.append(tuple(remapped))
    used = sorted({v for face in kept_faces for v in face})
    reindex = {old: new for new, old in enumerate(used)}
    out_vertices = [vertices[i] for i in used]
    out_faces = [tuple(reindex[v] for v in face) for face in kept_faces]
    return out_vertices, out_faces
