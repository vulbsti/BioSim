"""Heart package: open shapes for the valve leaflets, and a modelled conduction system.

Runs in Blender (built with 5.2.2 LTS on uxserver; numpy and mathutils only):

    blender -b --factory-startup --python scripts/heart/build-heart-package.py -- [--no-renders]

Reads the packaged source heart meshes. The source leaflets and cusps are all in the closed pose,
and the atrioventricular leaflet meshes include their chordae. Writes:

    assets/heart/valves.{json,bin}              per-vertex displacement from closed to open (shape key data)
    public/models/heart-conduction.{json,bin}   new meshes: nodes, bundle, branches, Purkinje fibres
    docs/heart-package-provenance.json          landmarks, parameters and measurements
    assets/heart/blender/heart.blend            leaflets with an "open" shape key, and the new meshes
    assets/heart/previews/*.png                 closed and open valves, conduction system

The open shapes are constructed (a hinge at the annulus, or flattening against the vessel wall) and
the conduction system follows landmarks on the source meshes. Neither comes from imaging.
"""
import hashlib
import heapq
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from heart_source import CAVITY, MODELS, ROOT, VALVES, load, one, volume_centre  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
PARAMETERS = {
    "attachedMm": 1.2,  # a leaflet vertex this close to a wall is attached
    "sheetDepth": 0.45,  # a closed leaflet lies within this share of the annulus radius below the ring
    "hingeZone": 0.25,  # share of the leaflet length over which the hinge bends
    "openMarginDeg": 15,  # an open atrioventricular leaflet stays this far off the flow direction
    "maxHingeDeg": 80,
    "cuspThickness": 0.5,  # an open semilunar cusp keeps this share of its depth from the wall
    "tubeSides": 8,
    "radiusMm": {"his": 1.0, "branch": 0.8, "fascicle": 0.7, "purkinje": 0.45, "internodal": 0.6},
    "nodeMm": {"sa": (7.0, 2.0, 1.3), "av": (3.0, 1.5, 0.8)},  # semi-axes
    "septalMm": 14,  # a cavity vertex this close to the other ventricle's cavity lies on the septum
    "offSeptumCost": 4,
}
meshes = load()
unit = lambda x: x / np.linalg.norm(x)


def bvh(v, f):
    return BVHTree.FromPolygons([tuple(p) for p in v], [tuple(int(i) for i in t) for t in f])


def distance(tree, points):
    return np.array([tree.find_nearest(tuple(p))[3] for p in points])


def welded(v, f):
    """Source meshes repeat vertices along seams. Returns unique points, the map onto them, and edges."""
    _, first, inverse = np.unique(np.round(v, 6), axis=0, return_index=True, return_inverse=True)
    inverse = inverse.ravel()
    w = v[first]
    faces = inverse[f]
    edges = np.unique(np.sort(np.vstack([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]]), axis=1), axis=0)
    edges = edges[edges[:, 0] != edges[:, 1]]
    graph = [[] for _ in w]
    for a, b in edges:
        d = float(np.linalg.norm(w[a] - w[b]))
        graph[a].append((b, d))
        graph[b].append((a, d))
    return w, inverse, graph


def dijkstra(graph, sources, cost=None):
    """Distance along mesh edges from the nearest source, the source reached, and the previous vertex."""
    dist = np.full(len(graph), np.inf)
    root = np.full(len(graph), -1)
    prev = np.full(len(graph), -1)
    heap = []
    for s in sources:
        dist[s] = 0
        root[s] = s
        heap.append((0.0, int(s)))
    heapq.heapify(heap)
    while heap:
        d, a = heapq.heappop(heap)
        if d > dist[a]:
            continue
        for b, length in graph[a]:
            step = length * (cost[b] if cost is not None else 1)
            if d + step < dist[b]:
                dist[b] = d + step
                root[b] = root[a]
                prev[b] = a
                heapq.heappush(heap, (d + step, b))
    return dist, root, prev


WALLS = {n: bvh(*one(meshes, n)[1:]) for n in ("Wall of ventricle", "Wall of left atrium", "Wall of right atrium", "Ascending aorta", "Pulmonary trunk")}
PAPILLARY = {n: x[0] for n, x in meshes.items() if "papillary" in n.lower()}
PAPILLARY_TREES = [bvh(v, f) for _, v, f in PAPILLARY.values()]
CENTRE = {k: volume_centre(*one(meshes, n)[1:])[1] for k, n in CAVITY.items()}
wall_distance = lambda points: np.min([distance(t, points) for t in WALLS.values()], axis=0)

# ---------------------------------------------------------------------------------------------
# Valves
# ---------------------------------------------------------------------------------------------
valve_report, valve_delta, valve_frames = {}, {}, {}
for valve, (up, down, pattern) in VALVES.items():
    names = sorted(n for n in meshes if pattern in n.lower())
    leaflets = {n: one(meshes, n) for n in names}
    walls = {n: wall_distance(v) for n, (_, v, _) in leaflets.items()}
    attached = np.vstack([v[walls[n] < PARAMETERS["attachedMm"] / 1000] for n, (_, v, _) in leaflets.items()])
    flow = unit((CENTRE[down] if down in CENTRE else np.vstack([x[1] for x in meshes[down]]).mean(0)) - CENTRE[up])
    semilunar = down not in CENTRE
    # Annulus: centre, plane normal pointing with the flow, and mean radius.
    centre = attached.mean(0)
    normal = np.linalg.svd(attached - centre)[2][2]
    normal = normal if normal @ flow > 0 else -normal
    if not semilunar:
        # Atrioventricular leaflets also touch the wall through their chordae; keep only the ring near the plane.
        height = (attached - centre) @ normal
        # The ring is not flat enough for a fitted plane to be trusted; the flow direction is the valve's axis.
        ring = attached[np.abs(height - np.median(height)) < 0.006]
        centre = ring.mean(0)
        normal = flow
        attached = ring
    radial = lambda p: (p - centre) - np.outer((p - centre) @ normal, normal)
    radius = float(np.linalg.norm(radial(attached), axis=1).mean())
    valve_frames[valve] = {"centre": centre, "normal": normal, "radius": radius}
    report = {"leaflets": {}, "annulusRadiusMm": round(radius * 1000, 2), "kind": "semilunar" if semilunar else "atrioventricular"}

    if semilunar:
        # An open cusp lies flat against the vessel wall. In the cusp's own frame, `outward` points at the
        # middle of its wall and `lateral` runs along its chord. At each place along the chord and along the
        # vessel, the cusp's outermost surface is where it meets the wall; every vertex closes most of its gap to that surface,
        # so the attached face stays and the free face follows it out.
        gaps = {}
        for n, (part, v, f) in leaflets.items():
            r_vec = radial(v)
            outward = unit(r_vec.mean(0))
            lateral = np.cross(normal, outward)
            along, depth = r_vec @ lateral, r_vec @ outward
            level = (v - centre) @ normal
            cell = lambda x, n: np.clip(np.floor((x - x.min()) / max(np.ptp(x), 1e-9) * n).astype(int), 0, n - 1)
            column, row = cell(along, 14), cell(level, 6)
            outermost = np.array([[depth[(np.abs(column - c) <= 1) & (np.abs(row - r) <= 1)].max(initial=-np.inf) for r in range(6)] for c in range(14)])
            delta = outward * (np.maximum(outermost[column, row] - depth, 0) * (1 - PARAMETERS["cuspThickness"]))[:, None]
            valve_delta[part["id"]] = (valve, n, delta)
            gaps[n] = (v, v + delta)
            moved = np.linalg.norm(delta, axis=1)
            report["leaflets"][n] = {"id": part["id"], "maxMoveMm": round(float(moved.max()) * 1000, 2), "stillShare": round(float(np.mean(moved < 1e-4)), 3)}
    else:
        gaps = {}
        for n, (part, v, f) in leaflets.items():
            w, inverse, graph = welded(v, f)
            d_wall = wall_distance(w)
            height = (w - centre) @ normal
            near = PARAMETERS["attachedMm"] / 1000
            ring = np.where((d_wall < near) & (height < 0.35 * radius))[0]
            if len(ring) < 8:
                ring = np.argsort(height)[: max(8, len(w) // 12)]
            tips = np.where((np.min([distance(t, w) for t in PAPILLARY_TREES], axis=0) < 0.0015) | ((d_wall < near) & (height >= 0.35 * radius)))[0]
            from_ring = dijkstra(graph, ring)[0]
            if len(tips) < 3:
                tips = np.argsort(np.where(np.isfinite(from_ring), from_ring, -1))[-max(3, len(w) // 30) :]
            from_tips = dijkstra(graph, tips)[0]
            # Closed, the leaflet is a sheet lying near the annulus plane, and its chordae drop away below it.
            # The sheet's reach from the ring is the leaflet length. (The source leaflets do not touch along
            # their closing edges, so the edge cannot be found by contact.)
            body = np.isfinite(from_ring) & (height < PARAMETERS["sheetDepth"] * radius)
            length = float(np.quantile(from_ring[body], 0.9))
            # Hinge: every vertex turns about the ring point it hangs from. The axis there lies along the
            # ring, so a positive turn swings the leaflet from pointing inward to pointing downstream.
            root = dijkstra(graph, ring)[1]
            anchor = w[np.maximum(root, 0)]
            inward = centre - anchor
            inward -= np.outer(inward @ normal, normal)
            inward /= np.maximum(np.linalg.norm(inward, axis=1), 1e-9)[:, None]
            axes = np.cross(inward, normal)
            reach = w - anchor
            # Each point turns as far as it needs to hang just off the flow direction, so the open leaflets
            # form a skirt below the ring whatever angle the closed sheet lay at.
            elevation = np.arctan2(reach @ normal, np.einsum("ij,ij->i", reach, inward))
            turn = np.clip(np.radians(90 - PARAMETERS["openMarginDeg"]) - elevation, 0, np.radians(PARAMETERS["maxHingeDeg"]))
            t = np.clip(from_ring / (PARAMETERS["hingeZone"] * length), 0, 1)
            bend = np.where(body, t * t * (3 - 2 * t), 0.0) * turn
            c, sn = np.cos(bend)[:, None], np.sin(bend)[:, None]
            moved = anchor + reach * c + np.cross(axes, reach) * sn + axes * np.einsum("ij,ij->i", axes, reach)[:, None] * (1 - c)
            delta = np.where(body[:, None], moved - w, 0.0)
            # Chordae follow the point of the leaflet they hang from, easing to nothing at the papillary muscle.
            edge = np.where(body & (from_ring >= 0.85 * length))[0]
            if body.any():
                root = dijkstra(graph, np.where(body)[0])[1]
                cords = np.where(~body & (root >= 0) & np.isfinite(from_tips))[0]
                share = np.clip(from_tips[cords] / np.maximum(from_tips[root[cords]], 1e-6), 0, 1)
                delta[cords] = delta[root[cords]] * share[:, None]
            delta[tips] = 0
            valve_delta[part["id"]] = (valve, n, delta[inverse])
            gaps[n] = (w[body], w[body] + delta[body])
            report["leaflets"][n] = {
                "id": part["id"],
                "lengthMm": round(length * 1000, 2),
                "medianTurnDeg": round(float(np.degrees(np.median(bend[body & (from_ring > PARAMETERS["hingeZone"] * length)]))), 1),
                "ringVertices": int(len(ring)),
                "tipVertices": int(len(tips)),
                "freeEdgeVertices": int(len(edge)),
                "maxMoveMm": round(float(np.linalg.norm(delta, axis=1).max()) * 1000, 2),
            }
    # The opening: looking along the flow, how far from the axis the nearest leaflet tissue is, around the ring.
    side = unit(np.cross(normal, [0.0, 1.0, 0.0]))
    clear = []
    for which in (0, 1):
        points = np.vstack([g[which] for g in gaps.values()])
        r_vec = radial(points)
        sector = np.floor((np.arctan2(r_vec @ np.cross(normal, side), r_vec @ side) + np.pi) / (2 * np.pi) * 36).astype(int) % 36
        r = np.linalg.norm(r_vec, axis=1)
        clear.append(float(np.mean([r[sector == b].min() for b in range(36) if (sector == b).any()])))
    report["clearRadiusMm"] = {"closed": round(clear[0] * 1000, 2), "open": round(clear[1] * 1000, 2)}
    report["openAreaShareOfAnnulus"] = round((clear[1] / radius) ** 2, 3)
    valve_report[valve] = report

# ---------------------------------------------------------------------------------------------
# Conduction system
# ---------------------------------------------------------------------------------------------
def frame_tube(path, radius):
    """A closed tube of `tubeSides` sides swept along a polyline, with flat caps."""
    path = np.asarray(path)
    tangent = np.gradient(path, axis=0)
    tangent /= np.linalg.norm(tangent, axis=1)[:, None]
    side = unit(np.cross(tangent[0], [0.3, 0.5, 0.8]))
    rings = []
    for p, t in zip(path, tangent):
        side = unit(side - (side @ t) * t)  # carry the frame along without twisting
        up = np.cross(t, side)
        angle = np.arange(PARAMETERS["tubeSides"]) * 2 * np.pi / PARAMETERS["tubeSides"]
        rings.append(p + radius * (np.outer(np.cos(angle), side) + np.outer(np.sin(angle), up)))
    n, k = len(rings), PARAMETERS["tubeSides"]
    v = np.vstack(rings + [path[:1], path[-1:]])
    f = []
    for i in range(n - 1):
        for j in range(k):
            a, b, c, d = i * k + j, i * k + (j + 1) % k, (i + 1) * k + (j + 1) % k, (i + 1) * k + j
            f += [(a, b, c), (a, c, d)]
    for j in range(k):
        f += [(n * k, (j + 1) % k, j), (n * k + 1, (n - 1) * k + j, (n - 1) * k + (j + 1) % k)]
    return v, np.array(f)


def smooth(path, spacing=0.0015):
    """Resample a vertex chain evenly and round its corners."""
    path = np.asarray(path)
    along = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    if along[-1] < spacing * 2:
        return path
    s = np.linspace(0, along[-1], max(3, int(along[-1] / spacing)))
    out = np.stack([np.interp(s, along, path[:, i]) for i in range(3)], axis=1)
    for _ in range(24):
        out[1:-1] = (out[:-2] + 2 * out[1:-1] + out[2:]) / 4
    return out


def ellipsoid(centre, long_axis, normal, semi, around=16, along=9):
    """A flattened ellipsoid lying in a wall: `long_axis` along the wall, `normal` through it."""
    polar = np.linspace(0, np.pi, along + 1)[1:-1]
    turn = np.arange(around) * 2 * np.pi / around
    v = [[0.0, 0.0, 1.0]] + [[np.sin(q) * np.cos(t), np.sin(q) * np.sin(t), np.cos(q)] for q in polar for t in turn] + [[0.0, 0.0, -1.0]]
    f = [(0, 1 + j, 1 + (j + 1) % around) for j in range(around)]
    for i in range(len(polar) - 1):
        for j in range(around):
            a, b = 1 + i * around + j, 1 + i * around + (j + 1) % around
            f += [(a, a + around, b + around), (a, b + around, b)]
    last = 1 + (len(polar) - 1) * around
    f += [(len(v) - 1, last + (j + 1) % around, last + j) for j in range(around)]
    axis = unit(long_axis - (long_axis @ normal) * normal)
    basis = np.stack([np.cross(normal, axis), normal, axis], axis=1)  # the sphere's poles lie along the node
    return centre + (np.array(v) * np.array([semi[1], semi[2], semi[0]]) / 1000) @ basis.T, np.array(f)


def merge(parts):
    v, f, offset = [], [], 0
    for pv, pf in parts:
        v.append(pv)
        f.append(pf + offset)
        offset += len(pv)
    return np.vstack(v), np.vstack(f)


def surface(name):
    """A source mesh as a graph, with outward vertex normals."""
    _, v, f = one(meshes, name)
    w, inverse, graph = welded(v, f)
    faces = inverse[f]
    n = np.zeros_like(w)
    face_normal = np.cross(w[faces[:, 1]] - w[faces[:, 0]], w[faces[:, 2]] - w[faces[:, 0]])
    for i in range(3):
        np.add.at(n, faces[:, i], face_normal)
    n /= np.maximum(np.linalg.norm(n, axis=1), 1e-12)[:, None]
    centre = volume_centre(w, faces)[1]
    if np.mean(np.einsum("ij,ij->i", n, w - centre)) < 0:
        n = -n
    return w, graph, n


def trace(prev, target):
    chain = [int(target)]
    while prev[chain[-1]] >= 0:
        chain.append(int(prev[chain[-1]]))
    return chain[::-1]


R = PARAMETERS["radiusMm"]
landmarks, conduction = {}, []
nearest_vertex = lambda w, p: int(np.argmin(np.linalg.norm(w - p, axis=1)))

# Atria. The sinoatrial node lies in the right atrial wall where the superior vena cava enters,
# with its long axis toward the inferior vena cava; the atrioventricular node lies low in the
# right atrium between the coronary sinus and the septal leaflet of the tricuspid valve.
ra_wall, ra_graph, ra_normal = surface("Wall of right atrium")
svc = np.vstack([x[1] for x in meshes["Superior vena cava"]])
ivc = np.vstack([x[1] for x in meshes["Inferior vena cava"]])
sinus = one(meshes, "Coronary sinus")[1]
entry = lambda vessel: ra_wall[np.argsort(np.min(np.linalg.norm(ra_wall[:, None] - vessel[None, :: max(1, len(vessel) // 400)], axis=2), axis=1))[:25]].mean(0)
svc_entry, ivc_entry = entry(svc), entry(ivc)
# Lateral side of the caval junction: away from the atrial septum, which faces the left atrium.
lateral = unit(CENTRE["ra"] - CENTRE["la"])
sa_vertex = nearest_vertex(ra_wall, svc_entry + lateral * 0.008)
septal_leaflet = one(meshes, "Septal leaflet of tricuspid valve")[1]
septal_ring = septal_leaflet[wall_distance(septal_leaflet) < PARAMETERS["attachedMm"] / 1000]
septal_ring = septal_ring if len(septal_ring) else septal_leaflet
sinus_mouth = sinus[np.argmin(np.linalg.norm(sinus - CENTRE["ra"], axis=1))]
av_vertex = nearest_vertex(ra_wall, (septal_ring.mean(0) + sinus_mouth) / 2)
sa, av = ra_wall[sa_vertex], ra_wall[av_vertex]
landmarks.update({"superiorVenaCavaEntry": svc_entry, "inferiorVenaCavaEntry": ivc_entry, "sinoatrialNode": sa, "coronarySinusMouth": sinus_mouth, "atrioventricularNode": av})
conduction.append(("COND-SA", "Sinoatrial node", ellipsoid(sa, ivc_entry - svc_entry, ra_normal[sa_vertex], PARAMETERS["nodeMm"]["sa"]), "sa"))
_, _, prev = dijkstra(ra_graph, [sa_vertex])
internodal = smooth(ra_wall[trace(prev, av_vertex)])
conduction.append(("COND-INTERNODAL", "Internodal atrial conduction path", frame_tube(internodal, R["internodal"] / 1000), "atrial"))
conduction.append(("COND-AV", "Atrioventricular node", ellipsoid(av, unit(CENTRE["rv"] - CENTRE["ra"]), ra_normal[av_vertex], PARAMETERS["nodeMm"]["av"]), "av"))

# Ventricles. The cavity meshes are the endocardial surfaces the branches run on.
lv, lv_graph, lv_normal = surface(CAVITY["lv"])
rv, rv_graph, rv_normal = surface(CAVITY["rv"])
lv_septal = np.min(np.linalg.norm(lv[:, None] - rv[None], axis=2), axis=1) < PARAMETERS["septalMm"] / 1000
rv_septal = np.min(np.linalg.norm(rv[:, None] - lv[None], axis=2), axis=1) < PARAMETERS["septalMm"] / 1000
lv_axis = unit(CENTRE["lv"] - valve_frames["mitral"]["centre"])
rv_axis = unit(CENTRE["rv"] - valve_frames["tricuspid"]["centre"])
lv_height = (lv - valve_frames["mitral"]["centre"]) @ lv_axis
rv_height = (rv - valve_frames["tricuspid"]["centre"]) @ rv_axis
lv_top = int(np.where(lv_septal)[0][np.argmin(np.linalg.norm(lv[lv_septal] - av, axis=1))])
rv_top = int(np.where(rv_septal)[0][np.argmin(np.linalg.norm(rv[rv_septal] - av, axis=1))])
fork = (lv[lv_top] + rv[rv_top]) / 2
landmarks.update({"bundleFork": fork, "leftBranchStart": lv[lv_top], "rightBranchStart": rv[rv_top]})
conduction.append(("COND-HIS", "Atrioventricular bundle (of His)", frame_tube(smooth(np.linspace(av, fork, 12)), R["his"] / 1000), "his"))

lift = lambda w, n, chain, by: w[chain] + n[chain] * by  # sit just proud of the endocardium
septum_cost = lambda septal: np.where(septal, 1.0, PARAMETERS["offSeptumCost"])
papillary_foot = lambda w, name: nearest_vertex(w, PAPILLARY[name][1].mean(0))

# Left: a trunk a third of the way down the septum, then a fascicle to each papillary muscle.
lv_dist, _, lv_prev = dijkstra(lv_graph, [lv_top], septum_cost(lv_septal))
lv_apex = int(np.argmax(lv_height))
down_septum = trace(lv_prev, int(np.where(lv_septal)[0][np.argmax(lv_height[lv_septal])]))
split = down_septum[max(1, len(down_septum) // 3)]
left_trunk = [lv[lv_top] * 0.5 + fork * 0.5, *lift(lv, lv_normal, down_septum[: down_septum.index(split) + 1], 0.0008)]
conduction.append(("COND-LBB", "Left bundle branch", frame_tube(smooth(np.vstack([fork, *left_trunk])), R["branch"] / 1000), "branch"))
_, _, from_split = dijkstra(lv_graph, [split])
left_feet = {n: papillary_foot(lv, n) for n in PAPILLARY if "left ventricle" in n.lower()}
ordered = sorted(left_feet, key=lambda n: -(lv[left_feet[n]] @ np.array([0.0, 0.0, 1.0])))  # front first
left_ends = []
for label, name in zip(("anterior", "posterior"), (ordered[0], ordered[-1])):
    chain = trace(from_split, left_feet[name])
    left_ends.append(chain[-1])
    conduction.append((f"COND-LF-{label[0].upper()}", f"Left {label} fascicle", frame_tube(smooth(lift(lv, lv_normal, chain, 0.0008)), R["fascicle"] / 1000), "fascicle"))
    landmarks[f"left{label.capitalize()}FascicleEnd"] = lv[chain[-1]]


def purkinje(w, graph, normal, height, septal, starts, count):
    """Fibres from the branch ends up the free wall, to targets spread around it at mid height."""
    free = np.where(~septal & (height > np.quantile(height, 0.35)) & (height < np.quantile(height, 0.7)))[0]
    axis = unit(w[np.argmax(height)] - w[np.argmin(height)])
    centre = w.mean(0)
    side = unit(np.cross(axis, [0.0, 1.0, 0.0]))
    angle = np.arctan2((w[free] - centre) @ np.cross(axis, side), (w[free] - centre) @ side)
    targets = [int(free[np.argmin(np.abs(angle - q))]) for q in np.quantile(angle, np.linspace(0.08, 0.92, count))]
    _, _, prev = dijkstra(graph, starts)
    fibres = [frame_tube(smooth(lift(w, normal, trace(prev, t), 0.0006)), R["purkinje"] / 1000) for t in dict.fromkeys(targets) if prev[t] >= 0]
    return merge(fibres), len(fibres)


left_fibres, left_count = purkinje(lv, lv_graph, lv_normal, lv_height, lv_septal, left_ends + [lv_apex], 7)
conduction.append(("COND-PURKINJE-L", "Left ventricular Purkinje fibres", left_fibres, "purkinje"))

# Right: one branch down the septum to the anterior papillary muscle, then fibres over the free wall.
_, _, rv_prev = dijkstra(rv_graph, [rv_top], septum_cost(rv_septal))
right_foot = papillary_foot(rv, "Anterior papillary muscle of right ventricle")
right_chain = trace(rv_prev, right_foot)
conduction.append(("COND-RBB", "Right bundle branch", frame_tube(smooth(np.vstack([fork, rv[rv_top] * 0.5 + fork * 0.5, *lift(rv, rv_normal, right_chain, 0.0008)])), R["branch"] / 1000), "branch"))
right_fibres, right_count = purkinje(rv, rv_graph, rv_normal, rv_height, rv_septal, [right_foot], 6)
conduction.append(("COND-PURKINJE-R", "Right ventricular Purkinje fibres", right_fibres, "purkinje"))
landmarks["rightBranchEnd"] = rv[right_foot]

# ---------------------------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------------------------
def vertex_normals(v, f):
    n = np.zeros_like(v)
    face = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    for i in range(3):
        np.add.at(n, f[:, i], face)
    return n / np.maximum(np.linalg.norm(n, axis=1), 1e-12)[:, None]


sha = lambda b: hashlib.sha256(b).hexdigest()
blob = bytearray()


def append(array, dtype):
    while len(blob) % 4:
        blob.append(0)
    at = len(blob)
    blob.extend(np.ascontiguousarray(array, dtype).tobytes())
    return at


heart_concept = next(c for c in json.loads((MODELS / "atlas.json").read_text())["concepts"] if c["name"].lower() == "heart")
parts = []
for part_id, name, (v, f), stage in conduction:
    v32 = v.astype(np.float32)
    parts.append(
        {
            "id": part_id, "name": name, "conceptId": "MODELLED-CONDUCTION", "system": "cardiac", "sourceVersion": "modelled", "stage": stage, "chunk": 0,
            "positions": append(v32.ravel(), "<f4"), "normals": append(np.round(vertex_normals(v, f).ravel() * 32767), "<i2"), "indices": append(f.ravel(), "<u4"),
            "vertexCount": len(v), "indexCount": int(f.size), "bounds": [v32.min(0).tolist(), v32.max(0).tolist()],
        }
    )
(MODELS / "heart-conduction.bin").write_bytes(bytes(blob))
conduction_json = {
    "version": "Modelled cardiac conduction system 1",
    "source": "Generated by scripts/heart/build-heart-package.py from landmarks on BodyParts3D heart meshes; not BodyParts3D geometry and not from imaging",
    "parts": parts,
    "concepts": [
        {"id": heart_concept["id"], "name": heart_concept["name"], "elements": [p["id"] for p in parts]},
        {"id": "MODELLED-CONDUCTION", "name": "cardiac conduction system", "elements": [p["id"] for p in parts]},
    ],
    "triangles": sum(p["indexCount"] // 3 for p in parts),
    "chunks": [{"url": "/models/heart-conduction.bin", "bytes": len(blob)}],
}
(MODELS / "heart-conduction.json").write_text(json.dumps(conduction_json))

valve_blob = bytearray()
valve_parts = {}
for part_id, (valve, name, delta) in sorted(valve_delta.items()):
    valve_parts[part_id] = {"valve": list(VALVES).index(valve), "name": name, "offset": len(valve_blob) // 12, "count": len(delta)}
    valve_blob.extend(delta.astype("<f4").tobytes())
ASSETS = ROOT / "assets/heart"
ASSETS.mkdir(parents=True, exist_ok=True)
(ASSETS / "valves.bin").write_bytes(bytes(valve_blob))
(ASSETS / "valves.json").write_text(json.dumps({"version": "heart-valves-1", "valves": list(VALVES), "binSHA256": sha(bytes(valve_blob)), "parts": valve_parts}))

clean = lambda x: [round(float(i), 6) for i in x]
provenance = {
    "builder": "scripts/heart/build-heart-package.py",
    "blender": bpy.app.version_string,
    "status": "constructed; not from imaging; not reviewed by an anatomist",
    "sourcePose": "All eleven source leaflets and cusps are in the closed pose. The atrioventricular leaflet meshes include their chordae.",
    "parameters": PARAMETERS,
    "valves": valve_report,
    "conduction": {
        "parts": {p["id"]: {"name": p["name"], "stage": p["stage"], "vertices": p["vertexCount"]} for p in parts},
        "landmarksM": {k: clean(v) for k, v in landmarks.items()},
        "purkinjeFibres": {"left": left_count, "right": right_count},
        "notModelled": ["Bachmann's bundle and other interatrial paths", "the three separate internodal tracts", "septal fascicle of the left bundle", "the subendocardial Purkinje network beyond the fibres drawn"],
    },
    "outputs": {"assets/heart/valves.bin": sha((ASSETS / "valves.bin").read_bytes()), "public/models/heart-conduction.bin": sha((MODELS / "heart-conduction.bin").read_bytes())},
}
(ROOT / "docs").mkdir(exist_ok=True)
(ROOT / "docs/heart-package-provenance.json").write_text(json.dumps(provenance, indent=1) + "\n")

# Blender scene: leaflets with an "open" shape key, plus the new meshes.
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def material(name, rgba):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    shader = m.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = rgba
    shader.inputs["Alpha"].default_value = rgba[3]
    return m


def add(name, v, f, mat, collection):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(p) for p in v], [], [tuple(int(i) for i in t) for t in f])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
    return obj


collections = {n: bpy.data.collections.new(n) for n in ("valves", "conduction", "context")}
for c in collections.values():
    scene.collection.children.link(c)
tints = [(0.86, 0.25, 0.22, 1), (0.22, 0.48, 0.86, 1), (0.25, 0.72, 0.36, 1)]
leaflet_objects = {}
for valve, (_, _, pattern) in VALVES.items():
    for i, n in enumerate(sorted(x for x in meshes if pattern in x.lower())):
        part, v, f = one(meshes, n)
        obj = add(n, v, f, material(n, tints[i % 3]), collections["valves"])
        obj.shape_key_add(name="Basis")
        key = obj.shape_key_add(name="open")
        key.data.foreach_set("co", (v + valve_delta[part["id"]][2]).ravel())
        obj["sourceId"] = part["id"]
        leaflet_objects.setdefault(valve, []).append(obj)
stage_colour = {"sa": (1, 0.85, 0.2, 1), "atrial": (1, 0.7, 0.3, 1), "av": (1, 0.55, 0.15, 1), "his": (0.95, 0.4, 0.2, 1), "branch": (0.3, 0.75, 0.95, 1), "fascicle": (0.3, 0.75, 0.95, 1), "purkinje": (0.55, 0.9, 0.6, 1)}
conduction_objects = [add(name, v, f, material(name, stage_colour[stage]), collections["conduction"]) for _, name, (v, f), stage in conduction]
glass = material("context", (0.8, 0.55, 0.5, 0.16))
context_objects = [add(n, *one(meshes, n)[1:], glass, collections["context"]) for n in (*CAVITY.values(),)]
blend = ROOT / "assets/heart/blender/heart.blend"
blend.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend), compress=True)

if "--no-renders" not in ARGS:
    previews = ROOT / "assets/heart/previews"
    previews.mkdir(parents=True, exist_ok=True)
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 64
    try:
        preferences = bpy.context.preferences.addons["cycles"].preferences
        preferences.compute_device_type = "OPTIX"
        preferences.get_devices()
        for device in preferences.devices:
            device.use = True
        scene.cycles.device = "GPU"
    except Exception as error:  # a render check still works on the CPU
        print("HEART_RENDER_CPU", error)
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("world")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.92, 0.92, 0.92, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 1.2
    camera = bpy.data.objects.new("camera", bpy.data.cameras.new("camera"))
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera.data.type = "ORTHO"

    def shoot(target, direction, scale, path):
        camera.data.ortho_scale = scale
        camera.location = Vector(target + np.asarray(direction) * 0.4)
        camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)

    everything = [o for group in leaflet_objects.values() for o in group] + conduction_objects + context_objects
    for valve, objects in leaflet_objects.items():
        for o in everything:
            o.hide_render = o not in objects
        frame = valve_frames[valve]
        towards = frame["normal"] if VALVES[valve][1] not in CENTRE else -frame["normal"]  # look at the closing side
        for pose, value in (("closed", 0.0), ("open", 1.0)):
            for o in objects:
                o.data.shape_keys.key_blocks["open"].value = value
            shoot(frame["centre"], towards, 0.075, previews / f"valve-{valve}-{pose}.png")
            shoot(frame["centre"] + frame["normal"] * 0.012, unit(np.cross(frame["normal"], [0.0, 1.0, 0.0])), 0.09, previews / f"valve-{valve}-{pose}-side.png")
    for o in everything:
        o.hide_render = o not in conduction_objects and o not in context_objects
    heart_centre = np.mean(list(CENTRE.values()), axis=0)
    for view, direction in (("front", (0.25, 0.1, 1)), ("left", (1, 0.1, 0.1)), ("back", (-0.25, 0.1, -1))):
        shoot(heart_centre, unit(np.array(direction, float)), 0.16, previews / f"conduction-{view}.png")

print("HEART_PACKAGE_BUILT", json.dumps({"valves": {k: {key: v[key] for key in v if key != "leaflets"} for k, v in valve_report.items()}, "conductionParts": len(parts), "purkinje": [left_count, right_count], "outputs": provenance["outputs"]}))
