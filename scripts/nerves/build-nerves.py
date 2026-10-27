"""Build the spinal cord and body nerves package from Z-Anatomy, fitted inside this atlas's body.

Run: work/p1/venv/bin/python scripts/nerves/build-nerves.py   (numpy and scipy)
after scripts/nerves/export-z-anatomy.py has written work/nerves/za-*.npz.

What comes from where:
- Z-Anatomy (CC BY-SA 4.0, built on BodyParts3D): the course of every nerve, the spinal cord and
  the spinal ganglia. Nerve curves are taken as bare centrelines and rebuilt as tubes here, so each
  nerve also has a path a signal can travel along.
- Authored here, because Z-Anatomy stops short of them: the muscular branches of the femoral nerve
  into the four heads of quadriceps, and of the sciatic nerve into the three hamstrings. Each starts
  on its parent nerve and runs down the inside of its muscle (see BRANCHES).

Every centreline is moved onto the atlas by register.Warp, then eased so the tube stays clear of
bone and at least SKIN_DEPTH under the skin. Writes:
  public/models/nerves.json, nerves.bin(.gz)   an additive atlas package (ids ZA-..., system nervous)
  public/models/nerve-paths.json               centrelines and radii per part, and the knee-jerk route
  docs/nerves-provenance.json                  registration fits, clearances, what was authored
"""
import gzip
import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "scripts/vessels"))
import atlas_io
import register

WORK = ROOT / "work/nerves"
MODELS = ROOT / "public/models"
STEP = 0.003  # centreline spacing, m
BONE_GAP = 0.0006  # least gap between a nerve wall and bone, m
SKIN_DEPTH = 0.002  # least depth of a nerve wall under the skin, m
RADIUS = (0.0005, 0.005)  # tube radius limits, m
LEAVE_OUT = re.compile(r"^(Olfactory|Optic|Oculomotor|Trochlear|Abducens|Vestibul|Cochlear|Ciliary body|Central canal)", re.I)
# Muscles the atlas files under skeletal; nerves may run inside them.
NOT_BONE = re.compile(r"fibularis|iliotibial|levator scapulae|subscapularis|tibialis", re.I)
# Nerves that run inside bone, in a canal of their own: not eased out of it.
IN_BONE = re.compile(r"^(Inferior alveolar|Mental) nerve", re.I)
CORD = ("White matter of spinal cord", "Spinal ganglion.r", "Spinal ganglion.l")
# Authored muscular branches: (parent nerve, how far down the parent they leave as a share of its
# length, muscle). Quadriceps branches leave the femoral nerve a few centimetres below the
# inguinal ligament; hamstring branches leave the sciatic nerve in the upper thigh.
BRANCHES = {
    "femoral": [("rectus femoris", 0.0), ("vastus lateralis", 0.0), ("vastus intermedius", 0.0), ("vastus medialis", 0.0)],
    "sciatic": [("long head of {side} biceps femoris", 0.0), ("{side} semitendinosus", 0.0), ("{side} semimembranosus", 0.0)],
}


def vessel_helper():
    spec = importlib.util.spec_from_file_location("registered", ROOT / "scripts/vessels/build-registered-vessels.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


closest_on_triangles = vessel_helper().closest_on_triangles


class Surface:
    """Nearest point on a set of closed triangle meshes, and which side of them a point is on.

    Inside is decided per mesh by the generalized winding number, so overlapping meshes (a disc
    pressed into a vertebra) and small holes do not flip the answer, and no face orientation is
    trusted.
    """

    def __init__(self, meshes, by_normals=False, reach=0.012):
        self.meshes = [(v[f], v.min(0), v.max(0)) for v, f in meshes]
        self.tri = np.vstack([t for t, _, _ in self.meshes])
        n = np.cross(self.tri[:, 1] - self.tri[:, 0], self.tri[:, 2] - self.tri[:, 0])
        self.normal = n / np.maximum(np.linalg.norm(n, axis=1), 1e-12)[:, None]
        self.tree, self.by_normals, self.reach = cKDTree(self.tri.mean(1)), by_normals, reach

    def inside(self, points):
        out = np.zeros(len(points), bool)
        for tri, lo, hi in self.meshes:
            near = np.flatnonzero(np.all((points >= lo) & (points <= hi), axis=1) & ~out)
            for chunk in np.array_split(near, max(1, len(near) * len(tri) // 4_000_000 + 1)):
                if len(chunk):
                    out[chunk] = winding(points[chunk], tri) > 0.5
        return out

    def signed(self, points, k=16, check=None):
        """(signed distance, foot, outward direction at the foot): negative inside."""
        _, candidates = self.tree.query(points, k=k)
        best, foot, face = np.full(len(points), np.inf), np.zeros_like(points), np.zeros(len(points), int)
        for column in candidates.T:
            q = closest_on_triangles(points, self.tri[column])
            d = np.linalg.norm(points - q, axis=1)
            closer = d < best
            best[closer], foot[closer], face[closer] = d[closer], q[closer], column[closer]
        if self.by_normals:  # a single consistently wound surface (the skin): the face normal says which side
            inside = np.einsum("ij,ij->i", points - foot, self.normal[face]) < 0
        else:  # only points near a surface can be inside a bone after registration
            inside = np.zeros(len(points), bool)
            near = (best < self.reach) & (True if check is None else check)
            inside[near] = self.inside(points[near])
        away = (points - foot) / np.maximum(best, 1e-9)[:, None]
        away[inside] *= -1
        return np.where(inside, -best, best), foot, away


def winding(p, tri):
    """Generalized winding number of each point with respect to a triangle soup (Jacobson et al. 2013)."""
    a = tri[None, :, 0] - p[:, None]
    b = tri[None, :, 1] - p[:, None]
    c = tri[None, :, 2] - p[:, None]
    la, lb, lc = (np.linalg.norm(x, axis=2) for x in (a, b, c))
    det = np.einsum("ijk,ijk->ij", a, np.cross(b, c))
    div = la * lb * lc + np.einsum("ijk,ijk->ij", a, b) * lc + np.einsum("ijk,ijk->ij", b, c) * la + np.einsum("ijk,ijk->ij", c, a) * lb
    return np.abs(2 * np.arctan2(det, div).sum(1) / (4 * np.pi))


def outer_shell(v, f):
    """Drop connected pieces that sit inside another piece's box (the skin's inner layer)."""
    parent = np.arange(len(v))

    def root(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for a, b, c in f:
        ra, rb, rc = root(a), root(b), root(c)
        parent[rb] = ra
        parent[root(rc)] = ra
    roots = np.array([root(i) for i in range(len(v))])
    boxes = {r: (v[roots == r].min(0), v[roots == r].max(0)) for r in np.unique(roots)}
    inner = {r for r, (lo, hi) in boxes.items() if any(o != r and np.all(lo >= boxes[o][0]) and np.all(hi <= boxes[o][1]) for o in boxes)}
    return f[~np.isin(roots[f[:, 0]], list(inner))]


def load_npz(name):
    z = np.load(WORK / f"{name}.npz")
    return z, json.loads((WORK / f"{name}.npz.json").read_text())


def polylines(v, e):
    """Edge list to chains of points, end to end."""
    adj = {}
    for a, b in e:
        adj.setdefault(int(a), []).append(int(b))
        adj.setdefault(int(b), []).append(int(a))
    seen, chains = set(), []
    for start in sorted(adj, key=lambda s: len(adj[s]) != 1):
        if start in seen:
            continue
        chain, cur = [start], start
        seen.add(start)
        while True:
            nxt = [n for n in adj[cur] if n not in seen]
            if not nxt:
                break
            cur = nxt[0]
            seen.add(cur)
            chain.append(cur)
        if len(chain) > 1:
            chains.append(v[chain].astype(float))
    return chains


def resample(path, step=STEP):
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))])
    n = max(2, int(np.ceil(s[-1] / step)) + 1)
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, path[:, k]) for k in range(3)], 1)


def smooth(path, rounds=3):
    for _ in range(rounds):
        path[1:-1] = 0.5 * path[1:-1] + 0.25 * (path[:-2] + path[2:])
    return path


def fit_inside(paths, radii, bone, skin, fixed=0, canal=None):
    """Ease centrelines until each wall clears bone by BONE_GAP and sits SKIN_DEPTH under the skin.

    All paths move together (one nearest-surface query per round). The ends of each path stay put,
    so joined nerves stay joined (by default ends move too: a nerve end sunk in bone must come out); smoothing in the early rounds lets a path bend round an obstacle
    instead of stepping over it. Which points are inside bone is worked out in full (winding
    numbers, the slow part) only at the start of each pass; within a pass only those points are
    rechecked, since pushes only ever move points out of bone. Paths flagged in `canal` run inside
    bone in life (the mandibular canal) and are only kept under the skin.
    """
    lengths = [len(p) for p in paths]
    at = np.concatenate([[0], np.cumsum(lengths)])
    p, r = np.vstack(paths).copy(), np.concatenate(radii)
    end = np.zeros(len(p), bool)
    canal = np.repeat(np.asarray(canal if canal is not None else [False] * len(paths), bool), lengths)
    for a, b in zip(at[:-1], at[1:]):
        if fixed:
            end[a:a + fixed] = end[b - fixed:b] = True
    inner = np.concatenate([np.arange(a + 1, b - 1) for a, b in zip(at[:-1], at[1:]) if b - a > 2])
    for rounds, smoothing in ((40, 25), (25, 0), (15, 0)):
        inside = bone.signed(p)[0] < 0
        for step in range(rounds):
            d, _, n = bone.signed(p, check=inside)
            s, _, sn = skin.signed(p)
            inside = d < 0
            need = r + BONE_GAP - d
            deep = -s - r - SKIN_DEPTH
            push = np.zeros_like(p)
            hit, out = (need > 0) & ~canal, deep < 0
            push[hit] += n[hit] * need[hit, None]
            push[out] += sn[out] * deep[out, None]
            moving = (hit | out) & ~end
            if not moving.any():
                break
            p[moving] += push[moving]
            if step < smoothing:
                p[inner] = 0.6 * p[inner] + 0.2 * (p[inner - 1] + p[inner + 1])
    d = bone.signed(p)[0]
    r = np.where(canal, r, np.clip(np.minimum(r, d - BONE_GAP), RADIUS[0] * 0.6, None))
    return [p[a:b] for a, b in zip(at[:-1], at[1:])], [r[a:b] for a, b in zip(at[:-1], at[1:])]


def sweep(path, radius, sides):
    tangent = np.gradient(path, axis=0)
    tangent /= np.maximum(np.linalg.norm(tangent, axis=1), 1e-12)[:, None]
    u = np.cross(tangent[0], [0.3, 0.2, 0.93])
    v, n, faces = [], [], []
    for i, (c, tg, r) in enumerate(zip(path, tangent, radius)):
        u = u - tg * (u @ tg)
        u /= np.linalg.norm(u)
        w = np.cross(tg, u)
        for k in range(sides):
            a = 2 * np.pi * k / sides
            normal = np.cos(a) * u + np.sin(a) * w
            v.append(c + r * normal)
            n.append(normal)
        if i:
            for k in range(sides):
                a, b = (i - 1) * sides + k, (i - 1) * sides + (k + 1) % sides
                faces += [[a, b, a + sides], [b, b + sides, a + sides]]
    first, top = len(v), len(path) * sides - sides
    v += [path[0], path[-1]]
    n += [-tangent[0], tangent[-1]]
    for k in range(sides):
        faces += [[first, (k + 1) % sides, k], [first + 1, top + k, top + (k + 1) % sides]]
    return np.array(v), np.array(n), np.array(faces)


def display_name(name):
    m = re.match(r"(.*)\.([lr])$", name)
    base, side = (m[1], dict(l="left", r="right")[m[2]]) if m else (name, None)
    base = re.sub(r"\s*\((?:[IVX]+)\)", "", base).strip("() ")
    if not side:
        return base[0].upper() + base[1:]
    words = base[0].lower() + base[1:]
    # "Femoral nerve" -> "Right femoral nerve"; "Muscular branches of radial nerve" -> "Muscular branches of right radial nerve"
    m = re.match(r"(.* of )(.*)", words)
    out = f"{m[1]}{side} {m[2]}" if m else f"{side} {words}"
    return out[0].upper() + out[1:]


def radius_of(path, tube):
    """Thickness of a Z-Anatomy nerve tube along its own centreline."""
    if tube is None or len(tube) < 8:
        return np.full(len(path), RADIUS[0] * 1.5)
    d, _ = cKDTree(tube).query(path, k=min(12, len(tube)))
    return np.clip(np.median(d, axis=1), *RADIUS)


def muscle_axis(v, start):
    """Points down the middle of a muscle, from its end nearest `start` to 45% of its length (where its nerve spreads)."""
    c = v.mean(0)
    axis = np.linalg.svd(v - c)[2][0]
    if (v[np.argmax((v - c) @ axis)] - start) @ (v[np.argmax((v - c) @ axis)] - start) < (v[np.argmin((v - c) @ axis)] - start) @ (v[np.argmin((v - c) @ axis)] - start):
        axis = -axis
    t = (v - c) @ axis
    lo, hi = t.min(), t.max()
    out = []
    for q in np.linspace(0.1, 0.45, 7):
        at = lo + q * (hi - lo)
        ring = v[np.abs(t - at) < 0.02 * (hi - lo) + 0.004]
        out.append(ring.mean(0) if len(ring) else c + axis * at)
    return np.array(out)


def build():
    meshes, mesh_meta = load_npz("za-meshes")
    lines, line_meta = load_npz("za-lines")
    za = {m["name"]: (meshes[k + "_v"].astype(float), meshes[k + "_t"], m) for k, m in mesh_meta.items()}
    atlas = {}
    for p, v, f in atlas_io.meshes(("atlas.json", "expansion.json")):
        atlas.setdefault(p["name"], []).append((p, v, f))
    warp = register.Warp(za, atlas)
    bone = Surface([(v, f) for parts in atlas.values() for p, v, f in parts if p["system"] == "skeletal" and not NOT_BONE.search(p["name"])])
    skin_v, skin_f = atlas["Skin"][0][1], atlas["Skin"][0][2]
    skin = Surface([(skin_v, outer_shell(skin_v, skin_f))], by_normals=True)

    nerves, records = [], []
    for k, m in line_meta.items():
        name = m["name"]
        if "Nerves" not in m["cols"] or LEAVE_OUT.match(name) or name.endswith(register_helpers()):
            continue
        tube = za.get(name, (None,))[0]
        for i, chain in enumerate(polylines(lines[k + "_v"], lines[k + "_e"])):
            if np.linalg.norm(np.diff(chain, axis=0), axis=1).sum() < 0.004:
                continue
            path = resample(chain)
            nerves.append({"source": name, "spline": i, "path": path, "radius": radius_of(path, tube), "authored": False})
    # Carry every centreline across in one pass, then even out the spacing again.
    at = np.cumsum([0] + [len(n["path"]) for n in nerves])
    moved = warp(np.vstack([n["path"] for n in nerves]))
    for n, a, b in zip(nerves, at[:-1], at[1:]):
        path = smooth(resample(moved[a:b]), 2)
        n["radius"] = np.interp(np.linspace(0, 1, len(path)), np.linspace(0, 1, b - a), n["radius"])
        n["path"] = path

    # Authored muscular branches.
    def chain_of(source, longest=True):
        c = [n for n in nerves if n["source"] == source]
        return max(c, key=lambda n: len(n["path"])) if c else None
    for side, s in (("right", "r"), ("left", "l")):
        for parent, targets in (("Femoral nerve", BRANCHES["femoral"]), ("Sciatic nerve", BRANCHES["sciatic"])):
            trunk = chain_of(f"{parent}.{s}")
            if trunk is None:
                continue
            for muscle, _ in targets:
                mname = muscle.format(side=side)
                mname = mname if mname.lower().startswith(("long head", side)) else f"{side} {mname}"
                mesh = next((parts for n, parts in atlas.items() if n.lower() == mname.lower()), None)
                if mesh is None:
                    continue
                mv = np.vstack([v for _, v, _ in mesh])
                axis = muscle_axis(mv, trunk["path"][0])
                # Leave the trunk at the point nearest the muscle's upper end, then follow the muscle's core.
                j = int(np.argmin(np.linalg.norm(trunk["path"] - axis[0], axis=1)))
                j = max(2, min(j, len(trunk["path"]) - 3))
                start = trunk["path"][j]
                path = resample(np.vstack([start, start + 0.5 * (axis[0] - start), axis]), STEP)
                path = smooth(path, 6)
                path[0] = start
                r = np.linspace(trunk["radius"][j] * 0.55, RADIUS[0], len(path))
                nerves.append({"source": f"{parent}.{s}", "name": f"Muscular branch of {side} {parent.lower()} to {re.sub(r'^(left|right) ', '', mname.replace('long head of ' + side + ' ', 'long head of '))}",
                               "path": path, "radius": r, "authored": True, "muscle": mname, "parent": f"{parent}.{s}", "from": j})

    # Fit every centreline inside the body.
    fitted, radii = fit_inside([n["path"] for n in nerves], [n["radius"] for n in nerves], bone, skin,
                                canal=[bool(IN_BONE.search(n.get("name") or n["source"])) for n in nerves])
    for n, path, r in zip(nerves, fitted, radii):
        n["path"], n["radius"] = path, r
    return za, atlas, warp, bone, skin, nerves


def register_helpers():
    return (".j", ".i", ".t", ".g")


def cord_parts(za, warp, bone):
    """The spinal cord and ganglia: Z-Anatomy meshes, every vertex carried by the warp."""
    out = []
    for name in CORD:
        if name not in za:
            continue
        v, f, _ = za[name]
        moved = warp(v)
        # Registration leaves a few vertices a fraction of a millimetre into a vertebra; lift them out.
        d, foot, n = bone.signed(moved)
        inside = d < BONE_GAP
        moved[inside] = foot[inside] + n[inside] * BONE_GAP
        d = bone.signed(moved)[0]
        out.append({"source": name, "vertices": moved, "faces": f, "insideBone": int((d < 0).sum()), "closestBoneMm": round(float(d.min() * 1000), 2)})
    return out


def nearest_index(path, point):
    return int(np.argmin(np.linalg.norm(path - point, axis=1)))


def joined(*pieces):
    """One polyline from pieces laid end to end; a gap between pieces is bridged straight."""
    out = [pieces[0]]
    for piece in pieces[1:]:
        if np.linalg.norm(out[-1][-1] - piece[0]) > 1e-6:
            out.append(resample(np.vstack([out[-1][-1], piece[0]]))[1:-1])
        out.append(piece)
    return resample(np.vstack([p for p in out if len(p)]))


def knee_jerk(nerves, cord, side="r"):
    """The reflex loop on one side, as polylines a signal travels.

    Stretch receptors in each head of quadriceps -> its branch -> femoral nerve -> the femoral
    nerve's L3 root -> posterior (sensory) root -> spinal cord. There the signal crosses one synapse
    to the motor neurons, which send it back out the anterior (motor) root and down the same nerve
    to the same muscle. A second path through one more synapse (an inhibitory interneuron) runs
    down the cauda equina and the sciatic nerve to the hamstrings, which relax.
    """
    by = lambda source: [n for n in nerves if n["source"] == source]
    trunk = max([n for n in by(f"Femoral nerve.{side}") if not n["authored"]], key=lambda n: len(n["path"]))
    roots = [n for n in by(f"Femoral nerve.{side}") if not n["authored"] and n is not trunk]
    anterior, posterior = by(f"Anterior root of spinal nerve.{side}"), by(f"Posterior root of spinal nerve.{side}")
    # The femoral nerve's L3 root: the root strand whose top meets an anterior root.
    def meets(strand, chains):
        return min(chains, key=lambda c: min(np.linalg.norm(c["path"][[0, -1]] - strand["path"][0], axis=1)))
    best = min(roots, key=lambda r: min(np.linalg.norm(meets(r, anterior)["path"][[0, -1]] - r["path"][0], axis=1)))
    motor, sensory = meets(best, anterior), meets(best, posterior)
    # Orient both spinal roots from the cord outwards.
    toward = lambda c, end: c["path"] if np.linalg.norm(c["path"][-1] - end) < np.linalg.norm(c["path"][0] - end) else c["path"][::-1]
    motor_out, sensory_out = toward(motor, best["path"][0]), toward(sensory, best["path"][0])
    joins = nearest_index(trunk["path"], best["path"][-1])
    routes = {"afferent": [], "efferent": [], "inhibitory": []}
    for b in [n for n in nerves if n.get("parent") == f"Femoral nerve.{side}"]:
        j = b["from"]
        down = trunk["path"][min(joins, j):max(joins, j) + 1]
        down = down if joins <= j else down[::-1]
        out = joined(best["path"], down, b["path"])
        routes["afferent"].append({"to": b["muscle"], "points": joined(out[::-1], sensory_out[::-1])})
        routes["efferent"].append({"to": b["muscle"], "points": joined(motor_out, out)})
    sciatic = max([n for n in by(f"Sciatic nerve.{side}") if not n["authored"]], key=lambda n: len(n["path"]))
    cauda = max(by("Cauda equina"), key=lambda n: len(n["path"]))
    start = sensory_out[0]
    c0, c1 = nearest_index(cauda["path"], start), nearest_index(cauda["path"], sciatic["path"][0])
    down_cauda = cauda["path"][min(c0, c1):max(c0, c1) + 1]
    down_cauda = down_cauda if c0 <= c1 else down_cauda[::-1]
    for b in [n for n in nerves if n.get("parent") == f"Sciatic nerve.{side}"]:
        routes["inhibitory"].append({"to": b["muscle"], "points": joined(down_cauda, sciatic["path"][:b["from"] + 1], b["path"])})
    return routes


def joints(atlas):
    """Hip, knee and ankle centres and the big toe tip of each leg, for posing the leg in the app."""
    v = lambda name: np.vstack([x[1] for x in atlas[name]])
    out = {}
    for side in ("right", "left"):
        femur, tibia, talus = v(f"{side.capitalize()} femur"), v(f"{side.capitalize()} tibia"), v(f"{side.capitalize()} talus")
        top = femur[femur[:, 1] > femur[:, 1].max() - 0.05]
        medial = top[np.abs(top[:, 0]) <= np.median(np.abs(top[:, 0]))]  # the head, not the greater trochanter
        knee = np.vstack([femur[femur[:, 1] < femur[:, 1].min() + 0.025], tibia[tibia[:, 1] > tibia[:, 1].max() - 0.015]])
        toe = v(f"Distal phalanx of {side} big toe")
        out[side] = {"hip": np.round(medial.mean(0), 4).tolist(), "knee": np.round(knee.mean(0), 4).tolist(),
                     "ankle": np.round(talus.mean(0), 4).tolist(), "toe": np.round(toe[np.argmax(toe[:, 2])], 4).tolist()}
    return out


def package(nerves, cord):
    blob, parts, records = bytearray(), [], []

    def append(values, kind):
        while len(blob) % 4:
            blob.append(0)
        at = len(blob)
        blob.extend(np.asarray(values, kind).tobytes())
        return at

    def add(pid, name, v, n, f, kind):
        v32 = v.astype(np.float32)
        parts.append({"id": pid, "name": name, "conceptId": pid, "system": "nervous", "sourceVersion": kind, "chunk": 0,
                      "positions": append(v32.ravel(), "<f4"), "normals": append(np.round(np.clip(n, -1, 1).ravel() * 32767), "<i2"),
                      "indices": append(np.asarray(f).ravel(), "<u4"), "vertexCount": len(v), "indexCount": int(np.asarray(f).size),
                      "bounds": [v32.min(0).astype(float).tolist(), v32.max(0).astype(float).tolist()]})

    paths, groups = {}, {}
    for n in nerves:
        n["name"] = n.get("name") or display_name(n["source"])
        groups.setdefault(n["name"], []).append(n)
    for name, members in groups.items():
        pid = "ZA-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        vs, ns, fs, at = [], [], [], 0
        for n in members:
            top = n["radius"].max()
            v, nn, f = sweep(n["path"], n["radius"], 6 if top < 0.0012 else 8 if top < 0.0025 else 12)
            vs.append(v), ns.append(nn), fs.append(f + at)
            at += len(v)
            n["id"] = pid
        add(pid, name, np.vstack(vs), np.vstack(ns), np.vstack(fs), "authored" if members[0]["authored"] else "z-anatomy")
        paths[pid] = [{"points": np.round(n["path"], 5).ravel().tolist(), "radius": np.round(n["radius"], 5).tolist()} for n in members]
    for c in cord:
        v, f = c["vertices"], c["faces"]
        normal = np.zeros_like(v)
        fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
        for k in range(3):
            np.add.at(normal, f[:, k], fn)
        normal /= np.maximum(np.linalg.norm(normal, axis=1), 1e-12)[:, None]
        name = "Spinal cord" if c["source"].startswith("White matter") else display_name(c["source"]).replace("ganglion", "ganglia")
        pid = "ZA-" + re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        add(pid, name, v, normal, f, "z-anatomy")
        c["id"] = pid
    return bytes(blob), parts, paths


def main():
    za, atlas, warp, bone, skin, nerves = build()
    cord = cord_parts(za, warp, bone)
    raw, parts, paths = package(nerves, cord)
    reflex = knee_jerk(nerves, cord)
    packed = gzip.compress(raw, mtime=0)
    (MODELS / "nerves.bin").write_bytes(raw)
    (MODELS / "nerves.bin.gz").write_bytes(packed)
    concepts = {}
    for p in parts:
        concepts.setdefault(p["name"], []).append(p["id"])
    (MODELS / "nerves.json").write_text(json.dumps({
        "version": "Z-Anatomy spinal cord and nerves, registered 1",
        "source": "Z-Anatomy (CC BY-SA 4.0, built on BodyParts3D) cord and nerve courses, carried onto the atlas by scripts/nerves/build-nerves.py; muscular branches into quadriceps and hamstrings authored there",
        "parts": parts, "concepts": [{"id": f"ZA-C{i}", "name": name, "elements": ids} for i, (name, ids) in enumerate(sorted(concepts.items()))],
        "triangles": sum(p["indexCount"] // 3 for p in parts),
        "chunks": [{"url": "/models/nerves.bin", "bytes": len(raw), "gzip": "/models/nerves.bin.gz", "gzipBytes": len(packed)}],
    }, separators=(",", ":")))
    rounded = lambda a: np.round(a, 5).ravel().tolist()
    (MODELS / "nerve-paths.json").write_text(json.dumps({
        "paths": paths,
        "kneeJerk": {k: [{"to": r["to"], "points": rounded(r["points"])} for r in v] for k, v in reflex.items()},
        "cord": next(c["id"] for c in cord if c["source"].startswith("White")),
        "joints": joints(atlas),
    }, separators=(",", ":")))
    fits = [r["rmsMm"] for r in warp.report if r["used"]]
    report = {
        "scope": "Spinal cord, spinal ganglia and body nerves from Z-Anatomy, registered onto the BodyParts3D atlas. Nerve tubes are rebuilt from Z-Anatomy centrelines; thickness is read from Z-Anatomy's own tubes. Quadriceps and hamstring muscular branches are authored (Z-Anatomy has none).",
        "source": {"name": "Z-Anatomy", "url": "https://github.com/Z-Anatomy/Models-of-human-anatomy", "file": "Z-Anatomy.zip / Startup.blend", "licence": "CC BY-SA 4.0", "licenceUrl": "https://creativecommons.org/licenses/by-sa/4.0/",
                   "blendSHA256": hashlib.sha256((WORK / "Startup.blend").read_bytes()).hexdigest() if (WORK / "Startup.blend").exists() else None},
        "registration": {"method": register.__doc__.strip(), "anchorsUsed": len(fits), "anchorsTried": len(warp.report), "fitRmsMm": {"median": round(float(np.median(fits)), 2), "greatest": round(float(max(fits)), 2)},
                         "anchors": warp.report},
        "rules": {"centrelineStepMm": STEP * 1000, "boneGapMm": BONE_GAP * 1000, "skinDepthMm": SKIN_DEPTH * 1000, "radiusMm": [r * 1000 for r in RADIUS]},
        "parts": [{"id": p["id"], "name": p["name"], "kind": p["sourceVersion"], "triangles": p["indexCount"] // 3} for p in parts],
        "cord": [{k: c[k] for k in ("id", "source", "insideBone", "closestBoneMm")} for c in cord],
        "authored": [{"id": n["id"], "name": n["name"], "parent": n["parent"], "muscle": n["muscle"], "lengthMm": round(float(np.linalg.norm(np.diff(n["path"], axis=0), axis=1).sum() * 1000), 1)} for n in nerves if n["authored"]],
        "kneeJerkRoutesMm": {k: [{"to": r["to"], "lengthMm": round(float(np.linalg.norm(np.diff(r["points"], axis=0), axis=1).sum() * 1000), 1)} for r in v] for k, v in reflex.items()},
        "generator": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(), "binarySHA256": hashlib.sha256(raw).hexdigest(),
    }
    (ROOT / "docs/nerves-provenance.json").write_text(json.dumps(report, indent=1) + "\n")
    print(json.dumps({"parts": len(parts), "triangles": sum(p["indexCount"] // 3 for p in parts), "bytes": len(raw), "gzipBytes": len(packed), "anchors": len(fits), "fitRmsMm": report["registration"]["fitRmsMm"], "cord": report["cord"], "kneeJerk": report["kneeJerkRoutesMm"]}, indent=1))


if __name__ == "__main__":
    main()
