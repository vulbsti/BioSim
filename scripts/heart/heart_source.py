"""Read the packaged heart meshes for the Blender heart build. Runs inside Blender's Python (numpy only)."""
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / "public/models"
CAVITY = {"la": "Cavity of left atrium", "lv": "Cavity of left ventricle", "ra": "Cavity of right atrium", "rv": "Cavity of right ventricle"}
#: Valve -> (upstream chamber, downstream chamber or great vessel, leaflet name pattern)
VALVES = {
    "mitral": ("la", "lv", "mitral valve"),
    "tricuspid": ("ra", "rv", "tricuspid valve"),
    "aortic": ("lv", "Ascending aorta", "aortic valve"),
    "pulmonary": ("rv", "Pulmonary trunk", "pulmonary valve"),
}
NEIGHBOURS = ("Ascending aorta", "Pulmonary trunk", "Superior vena cava", "Inferior vena cava", "Coronary sinus")


def load():
    """Return {name: [(part, vertices m, faces)]} for the heart concept and the vessels used as landmarks."""
    atlas = json.loads((MODELS / "atlas.json").read_text())
    heart = set(next(c for c in atlas["concepts"] if c["name"].lower() == "heart")["elements"]) | {"FJ2428"}
    chunks = {}
    out = {}
    for p in atlas["parts"]:
        if p["id"] not in heart and p["name"] not in NEIGHBOURS:
            continue
        if p["chunk"] not in chunks:
            chunks[p["chunk"]] = (MODELS / Path(atlas["chunks"][p["chunk"]]["url"]).name).read_bytes()
        b = chunks[p["chunk"]]
        v = np.frombuffer(b, np.float32, p["vertexCount"] * 3, p["positions"]).reshape(-1, 3).astype(float)
        f = np.frombuffer(b, np.uint32, p["indexCount"], p["indices"]).reshape(-1, 3).astype(np.int64)
        out.setdefault(p["name"], []).append((p, v, f))
    return out


def one(meshes, name):
    found = meshes[name]
    if len(found) != 1:
        raise ValueError(f"expected one mesh named {name}, found {len(found)}")
    return found[0]


def volume_centre(v, f):
    a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
    signed = np.einsum("ij,ij->i", a, np.cross(b, c)) / 6
    return abs(signed.sum()), (signed[:, None] * (a + b + c) / 4).sum(0) / signed.sum()
