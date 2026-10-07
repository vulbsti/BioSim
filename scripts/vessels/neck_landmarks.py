"""Landmark rules shared by the scan and the atlas side of the neck registration (numpy + scipy).

Both sides must find a landmark by the same rule or the pairing means nothing. Everything here
works in millimetres with atlas axes: +x left, +y up, +z anterior.
"""
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

CELL = 1.5  # raster cell of the foramen magnum search, mm (the scan's voxel size)
CANAL_ENTRY = 3.0  # an artery this close to skull bone has reached its bony canal, mm
REACH, RISE = 30.0, 48.0  # radius and height above C1 of the foramen magnum search, mm


def at_level(path, y):
    """Point where an ascending polyline crosses height y, or None if it never does."""
    below = np.where((path[:-1, 1] - y) * (path[1:, 1] - y) <= 0)[0]
    if not len(below):
        return None
    a, b = path[below[0]], path[below[0] + 1]
    t = 0.0 if a[1] == b[1] else (y - a[1]) / (b[1] - a[1])
    return a + t * (b - a)


def canal_entry(path, skull, floor):
    """First point of an ascending artery path, above height `floor`, within CANAL_ENTRY of skull bone.

    The floor is the height of C1's centroid. Lower down the artery can pass close to the jaw,
    which is skull bone too but not its canal.
    """
    near = (cKDTree(skull).query(path)[0] < CANAL_ENTRY) & (path[:, 1] > floor)
    return path[np.argmax(near)] if near.any() else None


def foramen_magnum(skull, c1, c2):
    """Centre of the narrowest opening between the spinal canal and the cranial cavity.

    `skull` is a cloud of bone points no more than CELL apart (voxel centres or surface samples).
    The search stays inside a cylinder about the canal's own axis, taken through the centroids of
    C2 and C1. The widest bone-free route up that cylinder is pinched hardest at the foramen
    magnum, whatever the tilt of the head, so the pinch is found and its middle returned.
    """
    axis = (c1 - c2) / np.linalg.norm(c1 - c2)
    u = np.cross(axis, [0, 0, 1])
    u /= np.linalg.norm(u)
    w = np.cross(u, axis)
    frame = np.c_[u, axis, w]
    half, top = int(REACH / CELL), int(RISE / CELL)
    ij = np.round((skull - c1) @ frame / CELL).astype(int) + [half, 0, half]
    ij = ij[((ij >= 0) & (ij < [2 * half + 1, top + 1, 2 * half + 1])).all(1)]
    solid = np.zeros((2 * half + 1, top + 1, 2 * half + 1), bool)
    solid[tuple(ij.T)] = True
    i, _, k = np.indices(solid.shape)
    wall = (i - half) ** 2 + (k - half) ** 2 > half**2
    room = ndi.distance_transform_edt(~(ndi.binary_closing(solid, iterations=1) | wall)) * CELL
    # The centroid of C1 lies on the dens; the canal is the widest free cell behind it.
    span = 5
    behind = np.unravel_index(np.argmax(room[half - span:half + span + 1, 0, :half]), (2 * span + 1, half))
    below = (half - span + behind[0], 0, behind[1])
    above = np.unravel_index(np.argmax(room[:, top, :]), room[:, top, :].shape)
    above = (above[0], top, above[1])
    joined = lambda least: (lambda parts: parts[below] and parts[below] == parts[above])(ndi.label(room >= least)[0])
    lo, hi = CELL, float(min(room[below], room[above]))
    if not joined(lo) or joined(hi):
        return None
    while hi - lo > 0.1:
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if joined(mid) else (lo, mid)
    # Just too tight to pass: the two sides part at the pinch. Its middle lies between them.
    parts, _ = ndi.label(room >= hi + 0.1)
    under, over = np.argwhere(parts == parts[below]), np.argwhere(parts == parts[above])
    gap, nearest = cKDTree(over).query(under)
    centre = (under[np.argmin(gap)] + over[nearest[np.argmin(gap)]]) / 2 - [half, 0, half]
    return c1 + CELL * frame @ centre
