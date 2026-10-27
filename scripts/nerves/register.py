"""Carry Z-Anatomy geometry onto this atlas.

Z-Anatomy is built from BodyParts3D too, but it is remeshed, mirrored left to right and posed a
little differently, so its nerves cannot be copied across as they are. They are moved by the
bones and muscles around them:

1. One similarity transform from the centroids of every bone both atlases name (axes, units, scale).
2. For each bone and muscle both atlases have, a rigid fit (with at most 10% scale) of the Z-Anatomy
   surface onto the atlas one, by symmetric iterative closest point. A pair that does not fit to
   within FIT_MM is not used.
3. A point is moved by a blend of the fits of the structures nearest to it, weighted by
   exp(-(distance/REACH)^2) and by how well each fitted. A nerve in the thigh therefore moves with
   the femur and the muscles it runs between; the cord moves with the vertebrae around it.
"""
import json
import re

import numpy as np
from scipy.spatial import cKDTree

FIT_MM = 12.0  # worst surface RMS a bone or muscle fit may have and still carry nerves
REACH = 0.025  # metres over which a structure's fit fades
ORDINAL = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"]


def atlas_name(name):
    """The atlas's name for a Z-Anatomy bone, or None."""
    m = re.match(r"Vertebra ([CTL])(\d+)$", name)
    if m:
        return f"{ORDINAL[int(m[2])].capitalize()} {dict(C='cervical', T='thoracic', L='lumbar')[m[1]]} vertebra"
    if name in ("Atlas (C1)", "Axis (C2)"):
        return name.split()[0]
    m = re.match(r"(.*)\.([lr])$", name)
    if m:
        return f"{dict(l='Left', r='Right')[m[2]]} {m[1][0].lower()}{m[1][1:]}"
    return name


def key(name):
    """Side and words of a structure name, ignoring order and filler words: matches 'Psoas major.r' to 'Right psoas major'."""
    n, side = name.lower(), None
    m = re.match(r"(.*)\.([lr])$", n)
    if m:
        n, side = m[1], dict(l="left", r="right")[m[2]]
    for s in ("left", "right"):
        if re.search(rf"\b{s}\b", n):
            side, n = s, re.sub(rf"\b{s}\b", "", n)
    n = re.sub(r"\(.*?\)", "", n)
    return side, frozenset(t for t in re.findall(r"[a-z0-9]+", n) if t not in ("muscle", "muscles", "of", "the", "bone", "part"))


def pairs(za, atlas):
    """(Z-Anatomy name, atlas name) for every bone and muscle that both have exactly once."""
    by_key = {}
    for name in atlas:
        by_key.setdefault(key(name), []).append(name)
    out = []
    for name, (v, f, meta) in za.items():
        top = meta["cols"][0] if meta["cols"] else ""
        if meta["type"] != "MESH" or not (top.startswith("1") or top.startswith("4")):
            continue
        if atlas_name(name) in atlas:
            out.append((name, atlas_name(name)))
        elif len(by_key.get(key(name), [])) == 1:
            out.append((name, by_key[key(name)][0]))
    return out


def similarity(a, b, w=None):
    """Scale s, rotation r, shift t minimising sum w |s r a + t - b|^2."""
    w = np.ones(len(a)) if w is None else w
    w = w / w.sum()
    ca, cb = w @ a, w @ b
    a0, b0 = a - ca, b - cb
    u, s, vt = np.linalg.svd((w[:, None] * a0).T @ b0)
    d = np.diag([1, 1, np.sign(np.linalg.det(u @ vt))])
    r = (u @ d @ vt).T
    scale = (s * np.diag(d)).sum() / (w @ (a0 ** 2).sum(1))
    return scale, r, cb - scale * r @ ca


def apply(t, p):
    s, r, shift = t
    return s * p @ r.T + shift


def icp(src, dst, rounds=40):
    """Symmetric, robustly weighted ICP; returns the transform and the surface RMS after it, metres."""
    tree, t = cKDTree(dst), (1.0, np.eye(3), np.zeros(3))
    cur = src
    for _ in range(rounds):
        d, j = tree.query(cur)
        d2, j2 = cKDTree(cur).query(dst)
        a, b, gap = np.vstack([src, src[j2]]), np.vstack([dst[j], dst]), np.concatenate([d, d2])
        s, r, shift = similarity(a, b, np.exp(-(gap / max(np.median(gap) * 3, 1e-3)) ** 2))
        s = float(np.clip(s, 0.9, 1.1))
        t = (s, r, shift)
        cur = apply(t, src)
    gap = np.concatenate([tree.query(cur)[0], cKDTree(cur).query(dst)[0]])
    return t, float(np.sqrt(np.mean(gap ** 2)))


class Warp:
    def __init__(self, za, atlas):
        named = [(za[z][0].mean(0), np.vstack([v for _, v, _ in atlas[a]]).mean(0)) for z, a in pairs(za, atlas) if za[z][2]["cols"][0].startswith("1")]
        self.globe = similarity(np.array([a for a, _ in named]), np.array([b for _, b in named]))
        self.anchors, self.report = [], []
        rng = np.random.default_rng(0)
        for z, a in pairs(za, atlas):
            src, dst = apply(self.globe, za[z][0]), np.vstack([v for _, v, _ in atlas[a]])
            if len(src) < 30 or len(dst) < 30 or np.linalg.norm(src.mean(0) - dst.mean(0)) > 0.08:
                continue
            src = src[rng.choice(len(src), min(len(src), 1500), replace=False)]
            dst = dst[rng.choice(len(dst), min(len(dst), 3000), replace=False)]
            t, rms = icp(src, dst)
            self.report.append({"zAnatomy": z, "atlas": a, "rmsMm": round(rms * 1000, 2), "used": rms * 1000 <= FIT_MM})
            if rms * 1000 <= FIT_MM:
                self.anchors.append((t, rms, cKDTree(src)))

    def __call__(self, points):
        p = apply(self.globe, np.asarray(points, float))
        move, weight = np.zeros_like(p), np.zeros(len(p))
        for t, rms, tree in self.anchors:
            d = tree.query(p, distance_upper_bound=0.25)[0]
            w = np.exp(-(np.minimum(d, 1.0) / REACH) ** 2) / (rms + 0.002)
            move += w[:, None] * (apply(t, p) - p)
            weight += w
        held = weight > 1e-20
        p[held] += move[held] / weight[held, None]
        return p
