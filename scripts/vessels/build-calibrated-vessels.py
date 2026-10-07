"""Re-inflate packaged vessels whose calibre is outside the published adult range.

Run: work/p1/venv/bin/python scripts/vessels/build-calibrated-vessels.py  (numpy and scipy)

For every vessel in models/vessel-calibre/ledger.json, measure the source mesh's lumen radius
along its own centerline. If it differs from the cited mean by more than the ledger tolerance,
move each vertex radially from the centerline by one factor, so the vessel keeps its course,
length and shape and takes the cited calibre. The archived source package is not modified: the
adjusted meshes go to a replacement package that the loaders apply by mesh ID.
"""
import gzip
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

sys.path.insert(0, str(Path(__file__).parent))
import atlas_io
import vessel_graph as vg

ROOT = Path(__file__).resolve().parents[2]
LEDGER = ROOT / "models/vessel-calibre/ledger.json"


def centerline(v, f):
    """Ordered centerline points and radii of a single unbranched vessel."""
    p, r, links = vg.prune(*vg.skeleton(vg.resample(*vg.weld(v, f))))
    nb = [[] for _ in p]
    for a, b in links:
        nb[a].append(b)
        nb[b].append(a)
    tips = [i for i, n in enumerate(nb) if len(n) == 1]
    if len(tips) != 2 or any(len(n) > 2 for n in nb):
        raise ValueError("calibre adjustment needs a single unbranched vessel")
    order = [tips[0]]
    while order[-1] != tips[1]:
        order.append([x for x in nb[order[-1]] if x not in order[-2:]][0])
    return p[order], r[order]


def lumen_radius(radii):
    """Radius of the full bands, leaving out the straight runs that stand in for the capped ends."""
    return float(np.median(radii[len(radii) // 5: len(radii) - len(radii) // 5]))


def inflate(v, path, factor):
    """Scale each vertex's offset from the nearest point of the centerline polyline."""
    a, b = path[:-1], path[1:]
    span = b - a
    _, near = cKDTree((a + b) / 2).query(v, k=min(4, len(a)))
    best, foot = np.full(len(v), np.inf), np.zeros_like(v)
    for k in near.T:
        t = np.clip(((v - a[k]) * span[k]).sum(1) / (span[k] ** 2).sum(1), 0, 1)
        q = a[k] + t[:, None] * span[k]
        d = np.linalg.norm(v - q, axis=1)
        closer = d < best
        best[closer], foot[closer] = d[closer], q[closer]
    return foot + (v - foot) * factor


def main():
    ledger = json.loads(LEDGER.read_text())
    wanted = {e["name"].lower(): e for e in ledger["vessels"]}
    source = {m: json.loads((atlas_io.MODELS / m).read_text()) for m in atlas_io.SOURCES}
    raw_chunks = {m: [(atlas_io.MODELS / Path(c["url"]).name).read_bytes() for c in a["chunks"]] for m, a in source.items()}
    blob, parts, records = bytearray(), [], []

    def append(data):
        while len(blob) % 4:
            blob.append(0)
        at = len(blob)
        blob.extend(data)
        return at

    for manifest in atlas_io.SOURCES:
        for p, v, f in atlas_io.read(manifest):
            entry = wanted.get(p["name"].lower())
            if not entry:
                continue
            path, radii = centerline(v, f)
            measured, target = 2000 * lumen_radius(radii), entry["diameterMm"]
            record = {"id": p["id"], "name": p["name"], "sourceDiameterMm": round(measured, 2), "citedDiameterMm": target, "doi": entry["doi"]}
            if abs(measured - target) / target <= ledger["tolerance"]:
                records.append({**record, "adjusted": False})
                continue
            factor = target / measured
            moved = inflate(v, path, factor).astype(np.float32)
            after = 2000 * lumen_radius(centerline(moved.astype(float), f)[1])
            b = raw_chunks[manifest][p["chunk"]]
            parts.append({
                **p, "sourceVersion": "calibre-adjusted", "chunk": 0, "positions": append(moved.tobytes()),
                # Radial scaling keeps surface directions, so the source normals and triangles are reused.
                "normals": append(b[p["normals"]: p["normals"] + p["vertexCount"] * 6]),
                "indices": append(b[p["indices"]: p["indices"] + p["indexCount"] * 4]),
                "bounds": [moved.min(0).astype(float).tolist(), moved.max(0).astype(float).tolist()],
            })
            records.append({**record, "adjusted": True, "radialFactor": round(factor, 4), "resultDiameterMm": round(after, 2),
                            "largestVertexMoveMm": round(float(np.linalg.norm(moved - v, axis=1).max()) * 1000, 2)})
    raw = bytes(blob)
    packed = gzip.compress(raw, mtime=0)
    (atlas_io.MODELS / "calibrated-vessels.bin").write_bytes(raw)
    (atlas_io.MODELS / "calibrated-vessels.bin.gz").write_bytes(packed)
    (atlas_io.MODELS / atlas_io.REPLACEMENTS).write_text(json.dumps({
        "version": "Calibre-adjusted vessels 1", "source": "BodyParts3D meshes re-inflated about their centerlines by scripts/vessels/build-calibrated-vessels.py",
        "parts": parts, "concepts": [], "triangles": sum(p["indexCount"] // 3 for p in parts),
        "chunks": [{"url": "/models/calibrated-vessels.bin", "bytes": len(raw), "gzip": "/models/calibrated-vessels.bin.gz", "gzipBytes": len(packed)}],
    }, separators=(",", ":")))
    (ROOT / "docs/vessel-calibre-audit.json").write_text(json.dumps({
        "scope": "Packaged vessels compared with models/vessel-calibre/ledger.json. Adjusted meshes keep their source ID, vertex count, triangles and normals; only vertex positions move, radially from the mesh's own centerline. The archived source package is unchanged.",
        "tolerance": ledger["tolerance"], "vessels": records,
        "ledger": hashlib.sha256(LEDGER.read_bytes()).hexdigest(), "generator": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "extractor": hashlib.sha256((Path(__file__).parent / "vessel_graph.py").read_bytes()).hexdigest(), "binarySHA256": hashlib.sha256(raw).hexdigest(),
    }, indent=2) + "\n")
    print(json.dumps(records, indent=1))


if __name__ == "__main__":
    main()
