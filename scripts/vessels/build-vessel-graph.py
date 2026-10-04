"""Build public/models/vessel-graph.json from the packaged atlas artery and vein meshes.

Run: work/p1/venv/bin/python scripts/vessels/build-vessel-graph.py  (needs numpy and scipy)
"""
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import atlas_io
import vessel_graph as vg

MODELS = atlas_io.MODELS


def load(manifests):
    for p, v, f in atlas_io.meshes(manifests):
        # "Hepatovenous segment" meshes are liver territories, not vessel lumens.
        if p["system"] in ("arterial", "venous") and not p["name"].startswith("Hepatovenous segment"):
            yield {"id": p["id"], "name": p["name"], "system": p["system"], "v": v, "f": f}


def main():
    manifests = ["atlas.json", "expansion.json", "reconstructed-vessels.json"]
    parts = list(load(manifests))
    g = vg.build(parts, log=lambda *a: print(*a, file=sys.stderr))
    P, R = g["positions"], g["radii"]
    segments = []
    for s in g["segments"]:
        n = s["nodes"]
        segments.append({
            "part": parts[s["part"]]["id"], "circuit": s["circuit"], "away": s["away"], "parent": s["parent"],
            "junction": s["junction"], "radiusMm": round(s["radius"] * 1000, 3),
            # 0.1 mm integers keep the file small and exactly reproducible.
            "points": np.round(P[n] * 10000).astype(int).ravel().tolist(),
            "share": {k: float(f"{v:.6g}") for k, v in sorted(s["share"].items())},
        })
    source = {m: hashlib.sha256((MODELS / m).read_bytes()).hexdigest() for m in manifests + [atlas_io.REPLACEMENTS]}
    code = hashlib.sha256((Path(__file__).parent / "vessel_graph.py").read_bytes()).hexdigest()
    out = {
        "version": "vessel-graph-1",
        "units": {"points": "0.1 mm, atlas coordinates", "share": "fraction of the named bed's blood flow"},
        "method": {"bandMm": vg.STEP * 1000, "sampleMm": vg.SAMPLE * 1000, "contactMm": vg.CONTACT * 1000, "bridgeMm": vg.BRIDGE * 1000, "split": "radius cubed", "extractor": code},
        "source": source,
        "summary": {
            "sourceMeshes": len(parts), "duplicateMeshes": len(g["duplicates"]), "unreachedMeshes": len(g["unreached"]), "segments": len(segments),
            "contactJunctions": sum(s["junction"] == "contact" for s in segments),
            "inferredJunctions": sum(s["junction"] == "inferred" for s in segments),
            "detachedRoots": sum(s["junction"] == "detached" for s in segments),
        },
        "unreached": g["unreached"],
        "duplicates": g["duplicates"],
        "segments": segments,
    }
    (MODELS / "vessel-graph.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
    print(json.dumps(out["summary"]))
    return g, parts


if __name__ == "__main__":
    main()
