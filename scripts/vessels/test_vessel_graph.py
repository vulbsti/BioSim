"""Centerline extraction on synthetic vessels with known answers (numpy + scipy, no Blender).

Run: work/p1/venv/bin/python -m unittest discover -s scripts/vessels -p 'test_*.py'
"""
import unittest

import numpy as np

import vessel_graph as vg


def tube(a, b, radius, sides=10):
    """Closed, coarsely triangulated tube from a to b: long sliver sides like the source meshes."""
    a, b = np.array(a, float), np.array(b, float)
    axis = (b - a) / np.linalg.norm(b - a)
    u = np.cross(axis, [0, 0, 1] if abs(axis[2]) < 0.9 else [1, 0, 0])
    u /= np.linalg.norm(u)
    w = np.cross(axis, u)
    ring = [radius * (np.cos(t) * u + np.sin(t) * w) for t in np.linspace(0, 2 * np.pi, sides, endpoint=False)]
    v = np.array([a + r for r in ring] + [b + r for r in ring] + [a, b])
    f = []
    for i in range(sides):
        j = (i + 1) % sides
        f += [[i, j, sides + i], [j, sides + j, sides + i], [2 * sides, j, i], [2 * sides + 1, sides + i, sides + j]]
    return {"v": v, "f": np.array(f)}


def part(name, system, *tubes):
    v, f, base = [], [], 0
    for t in tubes:
        v.append(t["v"])
        f.append(t["f"] + base)
        base += len(t["v"])
    return {"id": name, "name": name, "system": system, "v": np.vstack(v), "f": np.vstack(f)}


class Extraction(unittest.TestCase):
    def test_straight_tube_gives_one_centred_path_with_its_radius(self):
        p, r, links = vg.prune(*vg.skeleton(vg.resample(*vg.weld(**tube([0, 0, 0], [0.08, 0, 0], 0.004)))))
        degree = np.bincount(links.ravel(), minlength=len(p))
        self.assertEqual(((degree == 1).sum(), (degree > 2).sum()), (2, 0))
        self.assertLess(np.abs(p[:, 1:]).max(), 0.001)
        self.assertAlmostEqual(np.median(r), 0.004, delta=0.0005)
        self.assertAlmostEqual(np.ptp(p[:, 0]), 0.08, delta=0.004)

    def test_trunk_with_two_branches_is_one_tree_that_conserves_flow(self):
        # An aorta-like trunk, two touching side branches of different width, and a duplicate
        # whole-vessel mesh laid over the trunk, as the source package does.
        trunk = tube([0, 1.32, 0], [0, 1.0, 0], 0.008)
        parts = [
            part("Ascending aorta", "arterial", trunk),
            part("Descending aorta", "arterial", tube([0, 1.32, 0], [0, 1.0, 0], 0.008)),
            part("Left renal artery", "arterial", tube([0.007, 1.1, 0], [0.06, 1.1, 0], 0.003)),
            part("Right femoral artery", "arterial", tube([0, 1.001, 0], [-0.03, 0.9, 0], 0.004)),
            part("Left femoral vein", "venous", tube([0.012, 1.3, 0], [0.012, 1.0, 0], 0.003)),
        ]
        g = vg.build(parts)
        self.assertEqual(len(g["duplicates"]), 1)
        arterial = [s for s in g["segments"] if s["circuit"] == "arterial"]
        self.assertEqual({parts[s["part"]]["name"] for s in arterial}, {"Ascending aorta", "Left renal artery", "Right femoral artery"})
        # The vein lies beside the trunk but is a different circuit: it must not be joined.
        self.assertFalse([s for s in g["segments"] if s["circuit"] == "venous" and s["parent"] is not None and g["segments"][s["parent"]]["circuit"] != "venous"])
        root = [s for s in arterial if s["parent"] is None]
        self.assertEqual(len(root), 1)
        self.assertAlmostEqual(root[0]["share"]["kidneys"], 1.0, places=6)
        self.assertAlmostEqual(root[0]["share"]["peripheral"], 1.0, places=6)
        renal = [s for s in arterial if parts[s["part"]]["name"] == "Left renal artery"]
        self.assertEqual(renal[0]["junction"], "contact")
        self.assertAlmostEqual(renal[0]["radius"], 0.003, delta=0.0006)
        # Below the renal branch the trunk no longer carries kidney flow.
        last = max((s for s in arterial if s["part"] == root[0]["part"]), key=lambda s: -g["positions"][s["nodes"][-1]][1])
        self.assertNotIn("kidneys", last["share"])


if __name__ == "__main__":
    unittest.main()
