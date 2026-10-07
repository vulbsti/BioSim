"""Regression tests for generated muscle-pilot topology (no Blender required).

Run: python3 -m unittest discover -s scripts/blender -p 'test_*.py'
"""
import math
import unittest

from muscle_geometry import Mesh, classify, coincident_vertices, topology, weld


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

    def test_link_phase_keeps_ring_bounds_symmetric_and_shifts_angles(self):
        # Any constant ring phase must keep the tube's bounding extent exactly symmetric
        # about its own axis (every ring vertex keeps an angle+pi antipodal partner), while
        # actually moving the sampled angles (this is what lets the sarcomere lattice avoid a
        # ring vertex landing exactly on a shared coplanar symmetry plane during boolean union).
        for phase in (0, math.pi / 8, math.pi / 6):
            m = Mesh()
            m.link((-1.0, 0.0, 0.0), (1.0, 0.0, 0.0), 0.05, 8, phase=phase)
            ys = [v[1] for v in m.v]
            self.assertAlmostEqual(min(ys), -max(ys), places=12)
        unshifted = Mesh(); unshifted.link((-1.0, 0.0, 0.0), (1.0, 0.0, 0.0), 0.05, 8, phase=0)
        shifted = Mesh(); shifted.link((-1.0, 0.0, 0.0), (1.0, 0.0, 0.0), 0.05, 8, phase=math.pi / 8)
        self.assertNotEqual(sorted(unshifted.v), sorted(shifted.v))

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

    def test_self_intersecting_face_pairs_fail_unless_allowlisted(self):
        tube = Mesh()
        tube.tube(0, 0, 1, 2, 8)
        clean = self.stats(tube)
        clean["selfIntersectingFacePairs"] = 0
        self.assertEqual(classify("tube", clean, self.policy)["status"], "closed")
        dirty = dict(clean)
        dirty["selfIntersectingFacePairs"] = 3
        verdict = classify("tube", dirty, self.policy)
        self.assertEqual(verdict["status"], "fail")
        self.assertIn("selfIntersectingFacePairs=3", verdict["reasons"][0])
        self.assertIn("not declared", verdict["reasons"][0])
        policy_with_allowlist = dict(self.policy, selfIntersection={"allowlist": {"tube": {"maxPairs": 5, "reason": "test exception"}}})
        allowed = classify("tube", dirty, policy_with_allowlist)
        self.assertNotEqual(allowed["status"], "fail")
        over_limit = dict(clean)
        over_limit["selfIntersectingFacePairs"] = 9
        over_verdict = classify("tube", over_limit, policy_with_allowlist)
        self.assertEqual(over_verdict["status"], "fail")
        self.assertIn("exceeds allowlisted maxPairs=5", over_verdict["reasons"][0])

    def test_source_surface_self_intersection_is_never_checked(self):
        stats = {"selfIntersectingFacePairs": 999, "loopsPerComponent": []}
        self.assertEqual(classify("FJ1", stats, self.policy)["status"], "source-preserved")


class Weld(unittest.TestCase):
    def test_welds_near_duplicate_sliver_and_stays_manifold(self):
        # Two closed tubes that touch at one shared edge whose two ends are ALMOST but not
        # exactly duplicated (reproducing a boolean-union sliver): after welding within
        # tolerance the result must be a single closed, manifold, non-self-intersecting mesh.
        a, b = Mesh(), Mesh()
        a.tube(0, 0, 1, 2, 8)
        b.tube(0, 0, 1, 2, 8)
        offset = 1e-13
        b.v = [(x + offset, y, z) for x, y, z in b.v]
        vertices = a.v + [(x, y, z) for x, y, z in b.v]
        faces = list(a.f) + [tuple(v + len(a.v) for v in f) for f in b.f]
        welded_v, welded_f = weld(vertices, faces, 1e-10)
        # Welding two near-identical closed tubes onto each other collapses every face to a
        # duplicate of its counterpart, so the whole thing should shrink back to one tube.
        self.assertEqual(len(welded_v), len(a.v))
        self.assertEqual(len(welded_f), len(a.f))
        t = topology(welded_v, welded_f)
        self.assertEqual(t["boundaryEdges"], 0)
        self.assertEqual(t["nonManifoldEdges"], 0)

    def test_leaves_genuinely_distinct_geometry_untouched(self):
        m = Mesh()
        m.tube(0, 0, 1, 2, 8)
        m.tube(5, 0, 1, 2, 8)
        welded_v, welded_f = weld(m.v, m.f, 1e-10)
        self.assertEqual(len(welded_v), len(m.v))
        self.assertEqual(len(welded_f), len(m.f))


if __name__ == "__main__":
    unittest.main()
