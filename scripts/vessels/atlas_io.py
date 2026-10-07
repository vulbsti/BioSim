"""Read packaged atlas meshes for the vessel scripts, with replacement packages applied by mesh ID."""
import json
from pathlib import Path

import numpy as np

MODELS = Path(__file__).resolve().parents[2] / "public/models"
SOURCES = ("atlas.json", "expansion.json")
REPLACEMENTS = "calibrated-vessels.json"
REGISTERED = "registered-vessels.json"


def read(manifest):
    """Yield (part, vertices, faces) for every mesh of one package."""
    atlas = json.loads((MODELS / manifest).read_text())
    chunks = [(MODELS / Path(c["url"]).name).read_bytes() for c in atlas["chunks"]]
    for p in atlas["parts"]:
        b = chunks[p["chunk"]]
        yield (
            p,
            np.frombuffer(b, np.float32, p["vertexCount"] * 3, p["positions"]).reshape(-1, 3).astype(float),
            np.frombuffer(b, np.uint32, p["indexCount"], p["indices"]).reshape(-1, 3).astype(np.int64),
        )


def meshes(manifests, replaced=True):
    """Meshes of several packages; a replacement with the same ID takes the source mesh's place."""
    swap = {p["id"]: (p, v, f) for package in (REPLACEMENTS, REGISTERED) if replaced and (MODELS / package).exists() for p, v, f in read(package)}
    for manifest in manifests:
        for p, v, f in read(manifest):
            yield swap.get(p["id"], (p, v, f))
