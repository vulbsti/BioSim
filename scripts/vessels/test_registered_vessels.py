"""Registered neck arteries: the building blocks on known answers, and the packaged tubes against bone.

Run: work/p1/venv/bin/python -m unittest discover -s scripts/vessels -p 'test_*.py'
"""
import importlib.util
import json
import unittest
from pathlib import Path

import numpy as np

import atlas_io
import neck_landmarks as nl

spec = importlib.util.spec_from_file_location("registered", Path(__file__).parent / "build-registered-vessels.py")
registered = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registered)

ROOT = Path(__file__).resolve().parents[2]
FAILING_CLEARANCE = 0.3  # a packaged vertebral wall closer to a vertebra than this fails, mm


class Distance(unittest.TestCase):
    def test_distance_to_a_sliver_triangle_is_to_its_surface_not_its_corners(self):
        # One triangle 80 mm long, as source bone has. Its nearest corner is 40 mm from the point.
        sliver = (np.array([[0, 0, 0], [80, 0, 0], [40, 6, 0]], float), np.array([[0, 1, 2]]))
        surface = registered.Surface([sliver])
        d, foot = surface.nearest(np.array([[40.0, 2.0, 1.25], [40.0, -3.0, 0.0], [-3.0, -4.0, 0.0]]))
        np.testing.assert_allclose(d, [1.25, 3.0, 5.0], atol=1e-9)
        np.testing.assert_allclose(foot, [[40, 2, 0], [40, 0, 0], [0, 0, 0]], atol=1e-9)


class Registration(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(7)
        self.source = {f"p{i}": p for i, p in enumerate(rng.uniform(-60, 60, (18, 3)))}
        # A smaller, rotated, shifted neck with a gentle bend: what the spline has to recover.
        turn = np.array([[0.98, -0.17, 0.0], [0.17, 0.98, 0.0], [0.0, 0.0, 1.0]])
        self.truth = lambda p: 0.9 * p @ turn.T + [5.0, 1400.0, -20.0] + 0.0008 * np.c_[p[:, 1] ** 2, np.zeros(len(p)), np.zeros(len(p))]
        self.target = {n: self.truth(p[None])[0] for n, p in self.source.items()}

    def test_spline_recovers_a_bent_affine_map_between_landmarks(self):
        warp, residual = registered.fit(self.source, self.target)
        probe = np.random.default_rng(8).uniform(-40, 40, (50, 3))
        self.assertLess(np.linalg.norm(warp(probe) - self.truth(probe), axis=1).max(), 1.0)
        self.assertEqual(residual["dropped"], {})
        self.assertLess(max(residual["leftOut"].values()), registered.WORST_LANDMARK)

    def test_a_misplaced_landmark_is_dropped_not_fitted(self):
        self.target["p3"] = self.target["p3"] + [0.0, 40.0, 0.0]
        warp, residual = registered.fit(self.source, self.target)
        self.assertEqual(list(residual["dropped"]), ["p3"])
        self.assertLess(np.linalg.norm(warp(self.source["p5"][None])[0] - self.target["p5"]), 1.0)


class Pinning(unittest.TestCase):
    def test_a_pinned_path_ends_exactly_on_both_targets_and_keeps_its_bend(self):
        t = np.linspace(0, 1, 80)[:, None]
        warped = np.c_[10 * np.sin(np.pi * t), 100 * t, np.zeros_like(t)]
        start, end = np.array([3.0, 10.0, 2.0]), np.array([-2.0, 90.0, 4.0])
        path, miss = registered.pinned(warped, start, end)
        np.testing.assert_allclose(path[0], start, atol=1e-9)
        np.testing.assert_allclose(path[-1], end, atol=1e-9)
        self.assertTrue(all(1.0 < m < 8.0 for m in miss))
        # The bulge to +x at mid-height survives the move.
        self.assertGreater(path[len(path) // 2, 0], 0.5 * (path[0, 0] + path[-1, 0]) + 5)

    def test_level_crossing_interpolates_between_points(self):
        path = np.array([[0.0, 0.0, 0.0], [2.0, 10.0, 0.0], [2.0, 20.0, 4.0]])
        np.testing.assert_allclose(nl.at_level(path, 15.0), [2.0, 15.0, 2.0])
        self.assertIsNone(nl.at_level(path, 25.0))


class PackagedClearance(unittest.TestCase):
    """Recomputed from the shipped buffers and the atlas bone, not read from the provenance file."""

    @classmethod
    def setUpClass(cls):
        bone = {p["name"].lower(): (v * 1000, f) for p, v, f in atlas_io.read("atlas.json") if p["system"] == "skeletal"}
        cls.spine = registered.Surface([bone[name] for name in registered.VERTEBRAE])
        cls.tubes = {p["name"]: v * 1000 for p, v, f in atlas_io.read(atlas_io.REGISTERED)}
        cls.report = json.loads((ROOT / "docs/registered-vessels-provenance.json").read_text())

    def test_every_neck_segment_is_registered_or_declared_kept(self):
        expected = {f"{part} of {side} {artery}" for side in ("left", "right") for part, artery in (("Cervical part", "internal carotid artery"), ("Prevertebral part", "vertebral artery"))}
        self.assertEqual(set(self.tubes) | set(self.report["keptReconstructed"]), expected)
        self.assertEqual({s["name"] for s in self.report["segments"]}, set(self.tubes))
        for s in self.report["segments"]:
            self.assertEqual((s["label"], s["licence"], s["scan"]), ("registered from imaging", "CC BY 4.0", self.report["scan"]["subject"]))

    def test_vertebral_walls_keep_clear_of_the_vertebrae(self):
        for name, wall in self.tubes.items():
            rings = wall[:-2].reshape(-1, registered.SIDES, 3)
            centre = rings.mean(1)
            radius = np.linalg.norm(rings - centre[:, None], axis=2).mean(1)
            gap = self.spine.nearest(wall)[0].min()
            with self.subTest(name):
                # The axis is further from bone than its own wall, so the wall does not straddle a surface.
                self.assertTrue((self.spine.nearest(centre)[0] > radius).all())
                self.assertGreaterEqual(gap, FAILING_CLEARANCE, f"{name}: wall {gap:.2f} mm from a vertebra")
                recorded = next(s for s in self.report["segments"] if s["name"] == name)["minimumVertebraClearanceMm"]
                self.assertGreaterEqual(recorded, registered.CLEARANCE)
                self.assertAlmostEqual(gap, recorded, delta=0.02)

    def test_the_check_fails_a_wall_moved_into_the_gap(self):
        name = "Prevertebral part of left vertebral artery"
        if name not in self.tubes:
            self.skipTest("left vertebral segment kept as reconstructed")
        wall = self.tubes[name]
        d, foot = self.spine.nearest(wall)
        nearest = int(d.argmin())
        # Slide the whole tube toward the bone until its closest point is 0.2 mm away.
        moved = wall + (foot[nearest] - wall[nearest]) / d[nearest] * (d[nearest] - 0.2)
        self.assertLess(self.spine.nearest(moved)[0].min(), FAILING_CLEARANCE)


if __name__ == "__main__":
    unittest.main()
