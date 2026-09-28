"""Regression tests for generated muscle-pilot topology (no Blender required).

Run: python3 -m unittest discover -s scripts/blender -p 'test_*.py'
"""
import math
import unittest

from muscle_geometry import Mesh, classify, coincident_vertices, topology


def closed(mesh):
    t = topology(mesh.v, mesh.f)
    return t["boundaryEdges"] == 0 and t["nonManifoldEdges"] == 0, t


class ClosedPrimitives(unittest.TestCase):
    def test_closed_tube_is_watertight_without_seam_duplicates(self):
        for segments in (5, 6, 12, 24):
            for steps in (1, 2, 3):
                m = Mesh()
                m.tube(1e-5, -2e-5, 25e-6, 1.2e-3, segments, steps)
                ok, t = closed(m)
                self.assertTrue(ok, (segments, steps, t))
                self.assertEqual(t["components"], 1)
                self.assertEqual(coincident_vertices(m.v, 1e-12), 0)
                self.assertEqual(len(m.v), segments * (steps + 1) + 2)

    def test_seam_uv_split_is_kept_in_face_corners(self):
        m = Mesh()
        m.tube(0, 0, 1, 2, 8, 1)
        # Seam vertex 0 is shared geometrically but keeps u=0 and u=1 per corner.
        us = {c[0] for face, uv in zip(m.f, m.uv) if len(face) == 4 for v, c in zip(face, uv) if v == 0}
        self.assertEqual(us, {0.0, 1.0})

    def test_links_are_watertight_in_every_direction(self):
        for b in [(0, 0, 1), (0, 0, -1), (1, 0, 0), (0, 1, 0), (1, 1, 1), (-3, 2, -1)]:
            m = Mesh()
            m.link((0.2, -0.1, 0.3), tuple(0.2 * c for c in b), 0.01, 6)
            ok, t = closed(m)
            self.assertTrue(ok, (b, t))
            ends = sorted(m.v[-2:])
            want = sorted([(0.2, -0.1, 0.3), tuple(0.2 * c for c in b)])
            for p, q in zip(ends, want):
                self.assertLess(math.dist(p, q), 1e-12, b)

    def test_ellipsoids_are_watertight(self):
        for biconcave in (False, True):
            m = Mesh()
            m.ellipsoid((0, 0, 0), (1, 1, 0.4), 16, 8, biconcave)
            ok, t = closed(m)
            self.assertTrue(ok, t)


class NamedWindows(unittest.TestCase):
    def test_arc_tube_has_exactly_one_boundary_loop(self):
        for steps in (1, 2, 3):
            m = Mesh()
            m.tube(0, 0, 1, 2, 24, steps, arc=(-.9, 4.04))
            t = topology(m.v, m.f)
            self.assertEqual(t["boundaryLoops"], 1, t)
            self.assertEqual(t["nonManifoldEdges"], 0)
            self.assertEqual(t["boundaryEdges"], 2 * 24 + 2 * steps)

    def test_many_tubes_stay_separate_closed_components(self):
        m = Mesh()
        for i in range(7):
            m.tube(i * 3.0, 0, 1, 2, 10)
        ok, t = closed(m)
        self.assertTrue(ok)
        self.assertEqual(t["components"], 7)


class Classification(unittest.TestCase):
    policy = {"sourceSurfaces": ["FJ1"], "openings": {"sheet": {"name": "window", "loopsPerComponent": 1}}}

    def stats(self, mesh):
        return topology(mesh.v, mesh.f)

    def test_closed_opening_and_source_verdicts(self):
        tube, sheet = Mesh(), Mesh()
        tube.tube(0, 0, 1, 2, 8)
        sheet.tube(0, 0, 1, 2, 8, arc=(0, 3))
        self.assertEqual(classify("tube", self.stats(tube), self.policy)["status"], "closed")
        self.assertEqual(classify("sheet", self.stats(sheet), self.policy)["status"], "classified-openings")
        self.assertEqual(classify("FJ1", self.stats(sheet), self.policy)["status"], "source-preserved")

    def test_unclassified_opening_fails(self):
        sheet = Mesh()
        sheet.tube(0, 0, 1, 2, 8, arc=(0, 3))
        verdict = classify("tube", self.stats(sheet), self.policy)
        self.assertEqual(verdict["status"], "fail")
        self.assertIn("unclassified", verdict["reasons"][0])

    def test_old_duplicated_seam_is_rejected(self):
        # Reproduce the pre-fix construction: segments+1 ring vertices, not welded.
        m = Mesh()
        for j in range(2):
            for i in range(9):
                a = math.tau * i / 8
                m.v.append((math.cos(a), math.sin(a), j))
        for i in range(8):
            m.face([i, i + 1, i + 10, i + 9], [(0, 0)] * 4)
        stats = self.stats(m)
        self.assertEqual(stats["boundaryLoops"], 1)
        self.assertEqual(classify("tube", stats, self.policy)["status"], "fail")

    def test_opening_with_extra_hole_fails(self):
        sheet = Mesh()
        sheet.tube(0, 0, 1, 2, 8, arc=(0, 3))
        sheet.tube(5, 0, 1, 2, 8, arc=(0, 3))
        sheet.tube(9, 0, 1, 2, 8)
        stats = self.stats(sheet)
        self.assertEqual(stats["loopsPerComponent"], [0, 1, 1])
        self.assertEqual(classify("sheet", stats, self.policy)["status"], "fail")


if __name__ == "__main__":
    unittest.main()
