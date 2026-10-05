"""Give the reconstructed neck arteries a course measured from imaging.

Run: work/p1/venv/bin/python scripts/vessels/build-registered-vessels.py  (numpy and scipy)

build-reconstructed-vessels.py closes four gaps in the atlas with smooth curves that match the
source vessel ends and invent everything between. This script replaces those courses with the
centerlines of one real neck CT angiogram (models/neck-registration/, written by
extract-neck-scan.py), carried onto the atlas by a thin-plate spline fitted to paired landmarks.
What is measured is the course. The lumen calibre is not taken from the scan: it comes from
models/vessel-calibre/ledger.json.

Each warped centerline is then pinned to the two source vessels it joins, eased off bone, and
swept into a tube. The result is a replacement package: it carries the reconstructed segments'
IDs, and loaders swap it in by ID. A segment that fails a check below is left out, so the
reconstructed curve stays in place for it.
"""
import gzip
import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
from scipy.interpolate import RBFInterpolator
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent))
import atlas_io
import neck_landmarks as nl
import vessel_graph as vg

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "public/models"
SCAN = ROOT / "models/neck-registration/s0504.json"
LEDGER = ROOT / "models/vessel-calibre/ledger.json"
SIDES, SPACING, OVERLAP = 16, 1.5, 4.0  # tube sides; ring spacing and run inside a source vessel, mm
CLEARANCE = 0.5  # least gap required between a registered wall and bone, mm
MARGIN = 0.25  # extra gap the path is eased to, so rounding cannot eat into CLEARANCE, mm
TAPER = 8.0  # length over which the calibre eases to a source vessel's own at a join, mm
INSET = 10.0  # furthest up a source vessel the join may move to find room beside bone, mm
NARROWEST = 0.8  # least radius a registered tube may be narrowed to where bone leaves no more room, mm
WORST_LANDMARK = 12.0  # a landmark predicted worse than this by the others is left out, mm
SMOOTHING = (0.0, 1.0, 10.0, 100.0, 1000.0, 10000.0)
VERTEBRAE = ("atlas", "axis", "third cervical vertebra", "fourth cervical vertebra", "fifth cervical vertebra", "sixth cervical vertebra",
             "seventh cervical vertebra", "first thoracic vertebra", "second thoracic vertebra")
LEVELS = dict(zip(("C1", "C2", "C3", "C4", "C5", "C6", "C7", "T1", "T2"), VERTEBRAE))


def helper(file):
    spec = importlib.util.spec_from_file_location(file.replace("-", "_"), Path(__file__).parent / f"{file}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def centroid(v, f):
    """Centroid of the volume a closed mesh encloses, as a voxel mask's centroid would be."""
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    volume = np.einsum("ij,ij->i", a, np.cross(b, c))
    return ((a + b + c) * volume[:, None]).sum(0) / (4 * volume.sum())


def course(v, f):
    """Longest tip-to-tip centerline of a source vessel, ascending, in mm."""
    p, _, links = vg.prune(*vg.skeleton(vg.resample(*vg.weld(v, f))))
    near = [[] for _ in p]
    for a, b in links:
        near[a].append(b)
        near[b].append(a)

    def furthest(start):
        seen, order = {start: None}, [start]
        for at in order:
            for nxt in near[at]:
                if nxt not in seen:
                    seen[nxt] = at
                    order.append(nxt)
        length = {start: 0.0}
        for at in order[1:]:
            length[at] = length[seen[at]] + np.linalg.norm(p[at] - p[seen[at]])
        end = max(length, key=length.get)
        path = [end]
        while seen[path[-1]] is not None:
            path.append(seen[path[-1]])
        return path

    path = furthest(furthest(0)[0])
    line = p[path] * 1000
    return line if line[0, 1] < line[-1, 1] else line[::-1]


class Surface:
    """Exact distance from points to a triangle mesh.

    Source bone has sliver triangles tens of millimetres long, so the nearest vertex says little
    about the nearest surface. Triangles are split until none is longer than `edge`, indexed by
    centroid, and the exact point-to-triangle distance is taken over the nearest few.
    """

    def __init__(self, meshes, edge=1.5):
        tri = np.vstack([v[f] for v, f in meshes])
        while True:
            sides = np.linalg.norm(tri - np.roll(tri, -1, axis=1), axis=2)
            long = sides.max(1) > edge
            if not long.any():
                break
            t, k = tri[long], sides[long].argmax(1)
            rows = np.arange(len(t))
            a, b, c = t[rows, k], t[rows, (k + 1) % 3], t[rows, (k + 2) % 3]
            mid = (a + b) / 2
            tri = np.vstack([tri[~long], np.stack([a, mid, c], 1), np.stack([mid, b, c], 1)])
        self.tri, self.tree = tri, cKDTree(tri.mean(1))

    def nearest(self, points, k=24):
        """(distance, closest surface point) for each query point."""
        _, candidates = self.tree.query(points, k=k)
        best, foot = np.full(len(points), np.inf), np.zeros_like(points)
        for column in candidates.T:
            q = closest_on_triangles(points, self.tri[column])
            d = np.linalg.norm(points - q, axis=1)
            closer = d < best
            best[closer], foot[closer] = d[closer], q[closer]
        return best, foot


def closest_on_triangles(p, tri):
    """Closest point of triangle i to point i (Ericson, Real-Time Collision Detection 5.1.5)."""
    a, b, c = tri[:, 0], tri[:, 1], tri[:, 2]
    ab, ac = b - a, c - a
    dot = lambda x, y: np.einsum("ij,ij->i", x, y)
    d1, d2 = dot(ab, p - a), dot(ac, p - a)
    d3, d4 = dot(ab, p - b), dot(ac, p - b)
    d5, d6 = dot(ab, p - c), dot(ac, p - c)
    va, vb, vc = d3 * d6 - d5 * d4, d5 * d2 - d1 * d6, d1 * d4 - d3 * d2
    safe = lambda n, d: n / np.where(np.abs(d) < 1e-30, 1, d)
    total = va + vb + vc
    out = a + ab * safe(vb, total)[:, None] + ac * safe(vc, total)[:, None]
    edge_bc = (va <= 0) & (d4 - d3 >= 0) & (d5 - d6 >= 0)
    out[edge_bc] = (b + (c - b) * safe(d4 - d3, d4 - d3 + d5 - d6)[:, None])[edge_bc]
    edge_ac = (vb <= 0) & (d2 >= 0) & (d6 <= 0)
    out[edge_ac] = (a + ac * safe(d2, d2 - d6)[:, None])[edge_ac]
    edge_ab = (vc <= 0) & (d1 >= 0) & (d3 <= 0)
    out[edge_ab] = (a + ab * safe(d1, d1 - d3)[:, None])[edge_ab]
    for corner, inside in ((c, (d6 >= 0) & (d5 <= d6)), (b, (d3 >= 0) & (d4 <= d3)), (a, (d1 <= 0) & (d2 <= 0))):
        out[inside] = corner[inside]
    return out


def fit(source, target):
    """Thin-plate spline from scan to atlas, and how well each landmark is predicted by the rest.

    The smoothing is the one that predicts left-out landmarks best. A landmark the others miss
    by more than WORST_LANDMARK is dropped and the fit repeated: it is more likely a bad landmark
    than a real local difference between two necks.
    """
    names, dropped = sorted(source), {}
    spline = lambda keep, smoothing: RBFInterpolator(np.array([source[n] for n in keep]), np.array([target[n] for n in keep]), kernel="thin_plate_spline", smoothing=smoothing, degree=1)
    while True:
        def left_out(smoothing):
            return {n: float(np.linalg.norm(spline([m for m in names if m != n], smoothing)(np.array([source[n]]))[0] - target[n])) for n in names}
        trials = {s: left_out(s) for s in SMOOTHING}
        smoothing = min(SMOOTHING, key=lambda s: np.sqrt(np.mean(np.square(list(trials[s].values())))))
        worst = max(names, key=trials[smoothing].get)
        if trials[smoothing][worst] <= WORST_LANDMARK:
            break
        dropped[worst] = round(trials[smoothing][worst], 2)
        names.remove(worst)
    warp = spline(names, smoothing)
    fitted = {n: float(np.linalg.norm(warp(np.array([source[n]]))[0] - target[n])) for n in names}
    # A plain affine map for comparison: what is left is how differently shaped the two necks are.
    A = np.c_[np.array([source[n] for n in names]), np.ones(len(names))]
    B = np.array([target[n] for n in names])
    affine = np.linalg.norm(A @ np.linalg.lstsq(A, B, rcond=None)[0] - B, axis=1)
    return warp, {"names": names, "smoothing": smoothing, "leftOut": trials[smoothing], "fitted": fitted, "affine": dict(zip(names, affine.tolist())), "dropped": dropped}


def arclength(path):
    return np.r_[0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]


def resample(path, step=SPACING):
    s = arclength(path)
    at = np.linspace(0, s[-1], max(8, int(np.ceil(s[-1] / step))) + 1)
    return np.c_[[np.interp(at, s, path[:, k]) for k in range(3)]].T


def smoothstep(t):
    t = np.clip(t, 0, 1)
    return 3 * t**2 - 2 * t**3


def pinned(warped, start, end):
    """The stretch of a warped centerline between two atlas points, moved to end exactly on them.

    The spline leaves each end a few millimetres from the source vessel it should join. That miss
    is spread along the whole stretch, so both ends land exactly and the shape between is kept.
    Returns the path and the two misses.
    """
    first, last = int(np.argmin(np.linalg.norm(warped - start, axis=1))), int(np.argmin(np.linalg.norm(warped - end, axis=1)))
    if last - first < 5:
        raise ValueError("the warped centerline does not span the gap")
    path = resample(warped[first:last + 1])
    share = smoothstep(arclength(path) / arclength(path)[-1])[:, None]
    miss = start - path[0], end - path[-1]
    return path + miss[0] * (1 - share) + miss[1] * share, [float(np.linalg.norm(m)) for m in miss]


def arrive(path, direction, at_end, length=TAPER):
    """Bend the last `length` of a path so it meets a source vessel along that vessel's axis."""
    path = path if at_end else path[::-1]
    s = arclength(path)
    cut = int(np.searchsorted(s, s[-1] - length))
    if cut < 2:
        return path if at_end else path[::-1]
    p0, p1 = path[cut], path[-1]
    t0 = (path[cut] - path[cut - 1]) / np.linalg.norm(path[cut] - path[cut - 1])
    reach = np.linalg.norm(p1 - p0)
    t = np.linspace(0, 1, len(path) - cut)[:, None]
    bend = (2 * t**3 - 3 * t**2 + 1) * p0 + (t**3 - 2 * t**2 + t) * reach * t0 + (-2 * t**3 + 3 * t**2) * p1 + (t**3 - t**2) * reach * direction
    path = np.vstack([path[:cut], bend])
    return path if at_end else path[::-1]


def eased_off(path, radius, bone, fixed=2):
    """Move a path away from bone until its wall clears it by CLEARANCE + MARGIN; ends stay put.

    Returns the path and the radius, narrowed wherever the move could not make enough room.

    Each pass pushes every point that is too close straight away from the nearest bone. The early
    passes also smooth the path, so it bends round an obstacle instead of stepping over it; the
    last passes do not, because in a tight passage smoothing pulls a point back in.
    """
    path = path.copy()
    for step in range(300):
        gap, foot = bone.nearest(path)
        short = np.maximum(0, CLEARANCE + MARGIN + radius - gap)
        short[:fixed] = short[-fixed:] = 0
        if not short.any():
            break
        path += (path - foot) / np.maximum(gap, 1e-6)[:, None] * short[:, None]
        if step < 200:
            path[fixed:-fixed] = 0.5 * path[fixed:-fixed] + 0.25 * (path[fixed - 1:-fixed - 1] + path[fixed + 1:len(path) - fixed + 1])
    # Where bone still leaves less room than the calibre asks for, the lumen is narrowed to fit.
    return path, np.minimum(radius, np.maximum(NARROWEST, bone.nearest(path)[0] - CLEARANCE - MARGIN))


def sweep(path, radius):
    """Closed tube of SIDES-gon rings along a path: (vertices, normals, triangles)."""
    tangent = np.gradient(path, axis=0)
    tangent /= np.linalg.norm(tangent, axis=1)[:, None]
    # Carry one frame along the curve so the rings do not twist.
    u = np.cross(tangent[0], [0, 0, 1])
    v, n, faces = [], [], []
    for i, (c, tg, r) in enumerate(zip(path, tangent, radius)):
        u = u - tg * (u @ tg)
        u /= np.linalg.norm(u)
        w = np.cross(tg, u)
        for k in range(SIDES):
            a = 2 * np.pi * k / SIDES
            normal = np.cos(a) * u + np.sin(a) * w
            v.append(c + r * normal)
            n.append(normal)
        if i:
            for k in range(SIDES):
                a, b = (i - 1) * SIDES + k, (i - 1) * SIDES + (k + 1) % SIDES
                faces += [[a, b, a + SIDES], [b, b + SIDES, a + SIDES]]
    first, last, top = len(v), len(v) + 1, len(path) * SIDES - SIDES
    v += [path[0], path[-1]]
    n += [-tangent[0], tangent[-1]]
    for k in range(SIDES):
        faces += [[first, (k + 1) % SIDES, k], [last, top + k, top + (k + 1) % SIDES]]
    return np.array(v), np.array(n), np.array(faces)


def calibre(ledger, name):
    entry = next(e for e in ledger["vessels"] if e["name"] == name)
    return entry["diameterMm"] / 2, {"vessel": name, "diameterMm": entry["diameterMm"], "doi": entry["doi"]}


def build():
    scan = json.loads(SCAN.read_text())
    ledger = json.loads(LEDGER.read_text())
    reconstructed = {p["name"]: p for p in json.loads((MODELS / "reconstructed-vessels.json").read_text())["parts"]}
    ends_of = helper("build-reconstructed-vessels").ends_of
    part = {p["name"].lower(): (p, v, f) for p, v, f in atlas_io.meshes(("atlas.json",))}
    mesh = lambda name: (part[name][1] * 1000, part[name][2])
    skeletal = [(p, v * 1000, f) for p, v, f in part.values() if p["system"] == "skeletal"]

    # The same landmarks on the atlas, each found by the rule the scan side used.
    atlas = {level: centroid(*mesh(name)) for level, name in LEVELS.items()}
    atlas |= {"hyoid": centroid(*mesh("hyoid bone")), "thyroid cartilage": centroid(*mesh("thyroid cartilage")), "cricoid cartilage": centroid(*mesh("cricoid cartilage"))}
    head = [(v, f) for p, v, f in skeletal if p["bounds"][1][1] * 1000 > atlas["C1"][1] and "vertebra" not in p["name"].lower() and p["name"].lower() not in ("atlas", "axis", "hyoid bone") and "cartilage" not in p["name"].lower()]
    skull = np.vstack([vg.resample(*vg.weld(v, f), h=1.0) for v, f in head])
    atlas["foramen magnum"] = nl.foramen_magnum(skull, atlas["C1"], atlas["C2"])
    stubs = {}
    for side in ("left", "right"):
        internal, vertebral = course(*part[f"{side} internal carotid artery"][1:]), course(*part[f"{side} vertebral artery"][1:])
        atlas[f"{side} carotid canal entry"] = nl.canal_entry(internal, skull, atlas["C1"][1])
        for level in ("C3", "C4", "C5", "C6"):
            atlas[f"{side} vertebral artery at {level}"] = nl.at_level(vertebral, atlas[level][1])
        for vessel in ("common carotid artery", "internal carotid artery", "vertebral artery", "subclavian artery"):
            ends, nodes = ends_of(*part[f"{side} {vessel}"][1:])
            stubs[side, vessel] = [(e[0] * 1000, e[1], e[2] * 1000) for e in ends], nodes * 1000
        stubs[side, "vertebral course"] = vertebral
    paired = sorted(n for n in scan["landmarks"] if atlas.get(n) is not None)
    warp, residual = fit({n: np.array(scan["landmarks"][n]) for n in paired}, {n: atlas[n] for n in paired})
    residual["unpaired"] = sorted(set(scan["landmarks"]) - set(paired))

    neck = [(v, f) for p, v, f in skeletal if p["bounds"][1][1] > 1.36 and p["bounds"][0][1] < 1.60]
    bone = Surface(neck)
    spine = Surface([mesh(name) for name in VERTEBRAE])
    built, skipped = [], {}
    for side in ("left", "right"):
        up = lambda ends: max(ends, key=lambda e: e[0][1])
        down = lambda ends: min(ends, key=lambda e: e[0][1])
        # Carotid: from the top of the source common carotid to the bottom of the source internal carotid.
        name = f"Cervical part of {side} internal carotid artery"
        try:
            line = scan["centerlines"][f"{side} carotid"]
            warped = warp(np.array(line["points"]))
            low, high = up(stubs[side, "common carotid artery"][0]), down(stubs[side, "internal carotid artery"][0])
            path, miss = pinned(warped, low[0], high[0])
            path = arrive(arrive(path, -high[1], True), -low[1], False)
            # Below the scan's own fork this stretch is common carotid, above it internal carotid.
            fork = warp(np.array([line["fork"]]))[0]
            s = arclength(path)
            fork_at = float(s[np.argmin(np.linalg.norm(path - fork, axis=1))])
            (wide, wide_source), (narrow, narrow_source) = calibre(ledger, "Common carotid artery"), calibre(ledger, "Internal carotid artery, cervical part")
            radius = wide + (narrow - wide) * smoothstep((s - fork_at) / 10 + 0.5)
            radius = low[2] + (radius - low[2]) * smoothstep(s / TAPER)
            radius = high[2] + (radius - high[2]) * smoothstep((s[-1] - s) / TAPER)
            path, radius = eased_off(path, radius, bone)
            lead = low[0] - low[1] * np.linspace(OVERLAP, SPACING, 3)[:, None]
            tail = high[0] - high[1] * np.linspace(SPACING, OVERLAP, 3)[:, None]
            built.append({"name": name, "side": side, "path": np.vstack([lead, path, tail]), "radius": np.r_[[low[2]] * 3, radius, [high[2]] * 3], "miss": miss, "inside": (3, 3),
                          "calibre": [wide_source, narrow_source], "forkAtMm": round(fork_at, 1), "joinInsetMm": 0.0})
        except (ValueError, KeyError, StopIteration) as problem:
            skipped[name] = str(problem)
        # Vertebral: from the subclavian artery to the source vertebral artery inside C6.
        name = f"Prevertebral part of {side} vertebral artery"
        try:
            warped = warp(np.array(scan["centerlines"][f"{side} vertebral"]["points"]))
            radius_mm, source = calibre(ledger, f"{side.capitalize()} vertebral artery, extracranial part")
            stub, own = stubs[side, "vertebral course"], down(stubs[side, "vertebral artery"][0])
            # The source vertebral artery's own lower end is partly sunk in bone. Join it at the
            # lowest point of its centerline that has room for its full wall, not at its very tip;
            # failing that, where it has the most room, entering it narrowed.
            up_stub = resample(stub[arclength(stub) <= INSET + SPACING], 0.5)
            room = bone.nearest(up_stub)[0] - own[2] - CLEARANCE - MARGIN
            at = int(np.argmax(room >= 0)) if (room >= 0).any() else int(np.argmax(room))
            join, inset = up_stub[at], float(arclength(up_stub)[at])
            entry = own[2] + min(0.0, room[at])
            if entry < NARROWEST:
                raise ValueError("no room beside bone within reach of the source vertebral artery")
            subclavian = stubs[side, "subclavian artery"][1]
            origin = subclavian[np.argmin(np.linalg.norm(subclavian - warped[0], axis=1))]
            path, miss = pinned(warped, origin, join)
            s = arclength(path)
            radius = entry + (radius_mm - entry) * smoothstep((s[-1] - s) / TAPER)
            path, radius = eased_off(path, radius, bone)
            built.append({"name": name, "side": side, "path": path, "radius": radius, "miss": miss, "inside": (0, 0), "calibre": [source], "joinInsetMm": round(inset, 1)})
        except (ValueError, KeyError, StopIteration) as problem:
            skipped[name] = str(problem)

    blob, parts, records = bytearray(), [], []

    def append(values, kind):
        while len(blob) % 4:
            blob.append(0)
        at = len(blob)
        blob.extend(np.asarray(values, kind).tobytes())
        return at

    for item in built:
        v, n, f = sweep(item["path"], item["radius"])
        v32 = (v / 1000).astype(np.float32)
        # Clearance of the packaged wall itself, every vertex, by exact distance to the bone surface.
        wall = v32.astype(float) * 1000
        to_spine, to_bone = spine.nearest(wall)[0], bone.nearest(wall)[0]
        axis_gap = bone.nearest(item["path"])[0] - item["radius"]
        clear = float(min(to_spine.min(), axis_gap.min()))
        if clear < CLEARANCE:
            skipped[item["name"]] = f"wall clearance {clear:.2f} mm is under {CLEARANCE} mm"
            continue
        old = reconstructed[item["name"]]
        parts.append({
            "id": old["id"], "name": item["name"], "conceptId": "REGISTERED", "system": "arterial", "sourceVersion": "registered-from-imaging",
            "chunk": 0, "positions": append(v32.ravel(), "<f4"), "normals": append(np.round(n.ravel() * 32767), "<i2"),
            "indices": append(f.ravel(), "<u4"), "vertexCount": len(v), "indexCount": int(f.size),
            "bounds": [v32.min(0).astype(float).tolist(), v32.max(0).astype(float).tolist()],
        })
        body = item["radius"][item["inside"][0]:len(item["radius"]) - item["inside"][1]]
        records.append({
            "id": old["id"], "name": item["name"], "label": "registered from imaging",
            "scan": scan["subject"], "dataset": scan["dataset"], "licence": "CC BY 4.0",
            "lengthMm": round(float(arclength(item["path"])[-1]), 1),
            "radiusMm": {"least": round(float(body.min()), 2), "median": round(float(np.median(body)), 2), "greatest": round(float(body.max()), 2), "source": "calibre ledger; eased to the source vessel's own radius over the last %g mm at a join" % TAPER, "ledger": item["calibre"]},
            **({"commonToInternalCarotidAtMm": item["forkAtMm"]} if "forkAtMm" in item else {}),
            "endMissBeforePinningMm": [round(m, 2) for m in item["miss"]],
            "joinInsetMm": item["joinInsetMm"],
            "minimumVertebraClearanceMm": round(float(to_spine.min()), 2),
            "minimumBoneClearanceMm": round(float(min(to_bone.min(), axis_gap.min())), 2),
        })
    raw = bytes(blob)
    packed = gzip.compress(raw, mtime=0)
    (MODELS / "registered-vessels.bin").write_bytes(raw)
    (MODELS / "registered-vessels.bin.gz").write_bytes(packed)
    (MODELS / atlas_io.REGISTERED).write_text(json.dumps({
        "version": "Registered neck arteries 1", "source": f"Centerlines of TotalSegmentator CT dataset subject {scan['subject']} (CC BY 4.0) warped onto the atlas by scripts/vessels/build-registered-vessels.py; not BodyParts3D geometry",
        "parts": parts, "concepts": [], "triangles": sum(p["indexCount"] // 3 for p in parts),
        "chunks": [{"url": "/models/registered-vessels.bin", "bytes": len(raw), "gzip": "/models/registered-vessels.bin.gz", "gzipBytes": len(packed)}],
    }, separators=(",", ":")))
    spread = lambda values: {"median": round(float(np.median(values)), 2), "rootMeanSquare": round(float(np.sqrt(np.mean(np.square(values)))), 2), "greatest": round(float(np.max(values)), 2)}
    report = {
        "scope": "Neck artery segments whose course is registered from imaging. Each replaces, by ID, the reconstructed segment of the same name in reconstructed-vessels.json; a reconstructed segment with no entry here is still the smooth curve described in reconstructed-vessels-provenance.json. The course comes from one scan of one person warped onto the atlas, so it is a real anatomical course, not this atlas subject's own. Calibre is from the ledger, not the scan.",
        "scan": {"subject": scan["subject"], "dataset": scan["dataset"], "licence": "CC BY 4.0", "licenceUrl": "https://creativecommons.org/licenses/by/4.0/", "ctSHA256": scan["ctSHA256"], "voxelMm": scan["voxelMm"], "method": scan["method"], "quality": scan["quality"]},
        "registration": {
            "method": "thin-plate spline (scipy RBFInterpolator, affine part included) from scan to atlas on paired landmarks; smoothing chosen to predict left-out landmarks best",
            "smoothing": residual["smoothing"], "landmarks": len(residual["names"]),
            "leftOutResidualMm": spread(list(residual["leftOut"].values())), "fittedResidualMm": spread(list(residual["fitted"].values())), "affineOnlyResidualMm": spread(list(residual["affine"].values())),
            "perLandmarkMm": {n: {"leftOut": round(residual["leftOut"][n], 2), "fitted": round(residual["fitted"][n], 2), "affineOnly": round(residual["affine"][n], 2)} for n in residual["names"]},
            "droppedAsOutliersMm": residual["dropped"], "withoutAtlasCounterpart": residual["unpaired"],
        },
        "rules": {"sides": SIDES, "ringSpacingMm": SPACING, "overlapMm": OVERLAP, "requiredClearanceMm": CLEARANCE, "easedToClearanceMm": CLEARANCE + MARGIN, "calibreTaperMm": TAPER, "greatestJoinInsetMm": INSET, "narrowestRadiusMm": NARROWEST,
                  "narrowing": "where the atlas's bone leaves less room than the ledger calibre plus the eased clearance, the registered lumen is narrowed to fit, never below narrowestRadiusMm",
                  "clearance": "exact distance from every packaged wall vertex to the bone surface; vertebrae are C1 to T2, bone is every skeletal mesh of the neck",
                  "joinInset": "the source vertebral artery's lower tip is partly sunk in bone, so the registered segment joins its centerline this far above the tip, at the lowest point with room for the wall"},
        "segments": records, "keptReconstructed": skipped,
        "generator": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "landmarkRules": hashlib.sha256((Path(__file__).parent / "neck_landmarks.py").read_bytes()).hexdigest(),
        "scanExtract": hashlib.sha256(SCAN.read_bytes()).hexdigest(), "ledger": hashlib.sha256(LEDGER.read_bytes()).hexdigest(),
        "sourceAtlas": hashlib.sha256((MODELS / "atlas.json").read_bytes()).hexdigest(), "binarySHA256": hashlib.sha256(raw).hexdigest(),
    }
    (ROOT / "docs/registered-vessels-provenance.json").write_text(json.dumps(report, indent=2) + "\n")
    return report


if __name__ == "__main__":
    report = build()
    print(json.dumps({"registration": {k: v for k, v in report["registration"].items() if k != "method"}, "segments": report["segments"], "keptReconstructed": report["keptReconstructed"]}, indent=1))
