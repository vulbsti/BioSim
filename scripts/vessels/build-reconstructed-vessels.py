"""Build the neck artery segments that the source atlas leaves out.

Run: work/p1/venv/bin/python scripts/vessels/build-reconstructed-vessels.py  (numpy and scipy)

The packaged atlas has the common carotids and the intracranial internal carotids but nothing
between them, and its vertebral arteries stop short of the subclavians. These four tubes close
those gaps so the brain's arteries are supplied from the aorta. They are RECONSTRUCTED: each is a
smooth curve between two existing source vessel ends, matching their directions and radii. No
imaging was used, so their course between the ends is plausible, not measured.
"""
import gzip
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent))
import atlas_io
import vessel_graph as vg

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "public/models"
SIDES, SPACING, OVERLAP = 16, 0.0015, 0.004
CLEARANCE = 0.001  # least gap kept between a reconstructed wall and bone, m
# Share of the common carotid's radius given to the internal carotid where it leaves the fork.
FORK_RADIUS = 0.75


def source_parts():
    return atlas_io.meshes(("atlas.json",))


def ends_of(v, f):
    """Each end of a source vessel: (position, unit direction pointing out of the vessel, radius)."""
    p, r, links = vg.prune(*vg.skeleton(vg.resample(*vg.weld(v, f))))
    nb = [[] for _ in p]
    for a, b in links:
        nb[a].append(b)
        nb[b].append(a)
    out = []
    for tip in [i for i, n in enumerate(nb) if len(n) == 1]:
        # Direction over the last centimetre, and the radius of the full bands behind the end.
        chain = [tip]
        while len(nb[chain[-1]]) <= 2 and np.linalg.norm(p[chain[-1]] - p[tip]) < 0.012:
            following = [x for x in nb[chain[-1]] if x not in chain]
            if not following:
                break
            chain.append(following[0])
        direction = p[tip] - p[chain[-1]]
        out.append((p[tip], direction / np.linalg.norm(direction), float(np.median(r[chain]))))
    return out, p


def tube(start, d0, r0, end, d1, r1, bone, arrive=0.5):
    """Closed tube along a cubic Hermite curve; d0 leaves the first vessel, d1 enters the second.

    `arrive` is how far back, as a fraction of the gap, the curve lines up with the second vessel.
    """
    reach = 0.5 * np.linalg.norm(end - start)
    t = np.linspace(0, 1, max(8, int(np.ceil(np.linalg.norm(end - start) * 1.15 / SPACING))) + 1)[:, None]
    h = (2 * t**3 - 3 * t**2 + 1, t**3 - 2 * t**2 + t, -2 * t**3 + 3 * t**2, t**3 - t**2)
    path = h[0] * start + h[1] * reach * d0 + h[2] * end + h[3] * 2 * arrive * reach * d1
    ease = (3 * t**2 - 2 * t**3).ravel()
    radius = r0 + (r1 - r0) * ease
    # Ease the curve off any bone it would touch, keeping both ends where the source put them.
    for _ in range(60):
        gap, nearest = bone.query(path)
        short = np.maximum(0, CLEARANCE + radius - gap)
        short[[0, 1, -2, -1]] = 0
        if not short.any():
            break
        path = path + (path - bone.data[nearest]) / np.maximum(gap, 1e-6)[:, None] * short[:, None]
        path[2:-2] = 0.5 * path[2:-2] + 0.25 * (path[1:-3] + path[3:-1])
    # Run a little way inside both source vessels so the lumens overlap as source pieces do.
    lead = start - d0 * np.linspace(OVERLAP, SPACING, 3)[:, None]
    tail = end + d1 * np.linspace(SPACING, OVERLAP, 3)[:, None]
    path = np.vstack([lead, path, tail])
    radius = np.concatenate([[r0] * 3, radius, [r1] * 3])
    tangent = np.gradient(path, axis=0)
    tangent /= np.linalg.norm(tangent, axis=1)[:, None]
    # Carry one frame along the curve so the rings do not twist.
    u = np.cross(tangent[0], [0, 0, 1])
    u /= np.linalg.norm(u)
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
    first, last = len(v), len(v) + 1
    v += [path[0], path[-1]]
    n += [-tangent[0], tangent[-1]]
    for k in range(SIDES):
        faces += [[first, (k + 1) % SIDES, k], [last, len(path) * SIDES - SIDES + k, len(path) * SIDES - SIDES + (k + 1) % SIDES]]
    return np.array(v), np.array(n), np.array(faces), path, radius


def main():
    wanted = r"common carotid artery|internal carotid artery|vertebral artery|subclavian artery"
    vessels, bone = {}, []
    for p, v, f in source_parts():
        if p["system"] == "skeletal" and p["bounds"][1][1] > 1.38 and p["bounds"][0][1] < 1.56:
            bone.append(v)
        if re.fullmatch(rf"(left|right) ({wanted})", p["name"], re.I):
            vessels[p["name"].lower()] = (p, *ends_of(v, f))
    bone = cKDTree(np.vstack(bone))
    built = []
    for side in ("left", "right"):
        up = lambda ends: max(ends, key=lambda e: e[0][1])
        down = lambda ends: min(ends, key=lambda e: e[0][1])
        common, internal = up(vessels[f"{side} common carotid artery"][1]), down(vessels[f"{side} internal carotid artery"][1])
        built.append((f"Cervical part of {side} internal carotid artery", f"RECON-ICA-{side[0].upper()}",
                      vessels[f"{side} common carotid artery"][0]["id"], vessels[f"{side} internal carotid artery"][0]["id"],
                      tube(common[0], common[1], common[2] * FORK_RADIUS, internal[0], -internal[1], internal[2], bone)))
        vertebral = down(vessels[f"{side} vertebral artery"][1])
        subclavian = vessels[f"{side} subclavian artery"][2]
        # The source vertebral artery begins inside the C6 transverse foramen, so the missing part
        # must rise along its axis. It leaves the subclavian where that axis, continued downward,
        # passes closest.
        along = (subclavian - vertebral[0]) @ vertebral[1]
        off = np.linalg.norm(subclavian - vertebral[0] - along[:, None] * vertebral[1], axis=1)
        origin = subclavian[np.argmin(np.where(along > 0, off, np.inf))]
        leave = vertebral[0] - origin
        built.append((f"Prevertebral part of {side} vertebral artery", f"RECON-VA-{side[0].upper()}",
                      vessels[f"{side} subclavian artery"][0]["id"], vessels[f"{side} vertebral artery"][0]["id"],
                      tube(origin, leave / np.linalg.norm(leave), vertebral[2], vertebral[0], -vertebral[1], vertebral[2], bone, arrive=1.0)))
    blob, parts, records = bytearray(), [], []

    def append(values, kind):
        while len(blob) % 4:
            blob.append(0)
        at = len(blob)
        blob.extend(np.asarray(values, kind).tobytes())
        return at

    for name, id, lower, upper, (v, n, f, path, radius) in built:
        v32 = v.astype(np.float32)
        parts.append({
            "id": id, "name": name, "conceptId": "RECONSTRUCTED", "system": "arterial", "sourceVersion": "reconstructed",
            "chunk": 0, "positions": append(v32.ravel(), "<f4"), "normals": append(np.round(n.ravel() * 32767), "<i2"),
            "indices": append(f.ravel(), "<u4"), "vertexCount": len(v), "indexCount": int(f.size),
            "bounds": [v32.min(0).astype(float).tolist(), v32.max(0).astype(float).tolist()],
        })
        # Measured outside the overlap, which lies within the source vessels themselves.
        clearance, _ = bone.query(path[3:-3])
        radius_between = radius[3:-3]
        records.append({
            "id": id, "name": name, "joins": [lower, upper],
            "lengthMm": round(float(np.linalg.norm(np.diff(path, axis=0), axis=1).sum()) * 1000, 1),
            "radiusMm": [round(float(radius[0]) * 1000, 2), round(float(radius[-1]) * 1000, 2)],
            # Distance from the wall to the nearest bone vertex; negative would mean the tube crosses bone.
            "minimumBoneClearanceMm": round(float((clearance - radius_between).min()) * 1000, 2),
        })
    raw = bytes(blob)
    packed = gzip.compress(raw, mtime=0)
    (MODELS / "reconstructed-vessels.bin").write_bytes(raw)
    (MODELS / "reconstructed-vessels.bin.gz").write_bytes(packed)
    manifest = {
        "version": "Reconstructed neck arteries 1", "source": "Generated by scripts/vessels/build-reconstructed-vessels.py; not BodyParts3D geometry",
        "parts": parts, "concepts": [], "triangles": sum(p["indexCount"] // 3 for p in parts),
        "chunks": [{"url": "/models/reconstructed-vessels.bin", "bytes": len(raw), "gzip": "/models/reconstructed-vessels.bin.gz", "gzipBytes": len(packed)}],
    }
    (MODELS / "reconstructed-vessels.json").write_text(json.dumps(manifest, separators=(",", ":")))
    report = {
        "scope": "Four reconstructed arterial segments closing gaps in the packaged atlas between the aortic branches and the intracranial arteries. Each is a cubic Hermite tube between two existing source vessel ends, matching their end directions and radii. No imaging or registration was used; the course between the ends is plausible, not measured.",
        "rules": {"sides": SIDES, "ringSpacingMm": SPACING * 1000, "overlapMm": OVERLAP * 1000, "boneClearanceMm": CLEARANCE * 1000, "internalCarotidStartRadius": f"{FORK_RADIUS} x common carotid end radius", "vertebralOrigin": "subclavian centerline point nearest the downward continuation of the source vertebral artery's axis"},
        "segments": records,
        "generator": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "extractor": hashlib.sha256((Path(__file__).parent / "vessel_graph.py").read_bytes()).hexdigest(),
        "sourceAtlas": hashlib.sha256((MODELS / "atlas.json").read_bytes()).hexdigest(),
        "binarySHA256": hashlib.sha256(raw).hexdigest(),
    }
    (ROOT / "docs/reconstructed-vessels-provenance.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(records, indent=1))


if __name__ == "__main__":
    main()
