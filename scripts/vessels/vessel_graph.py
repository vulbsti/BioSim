"""Vessel centerline graph from closed source surface meshes (numpy + scipy, no Blender).

Each surface is resampled to evenly spaced points, swept by surface distance from its two extreme
ends, and cut into bands. Every connected ring of a band becomes one centerline node, so a
branching mesh yields a branching skeleton (a discrete Reeb graph). Meshes are then joined where
a vessel end touches another vessel, and each circuit is oriented as a tree from its heart-side
root. Nothing here is fitted: the output is source geometry plus declared joining rules.
"""
import heapq
import re

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

STEP = 0.003  # band width along a vessel, m
SAMPLE = 0.001  # spacing of resampled surface points, m
CONTACT = 0.0012  # surfaces closer than this are touching, m
BRIDGE = 0.010  # largest end-to-surface gap bridged as an inferred junction, m


def weld(v, f, tol=1e-5):
    """Merge coincident vertices; source meshes duplicate them along normal seams."""
    _, first, inverse = np.unique(np.round(v / tol).astype(np.int64), axis=0, return_index=True, return_inverse=True)
    f = inverse.ravel()[f]
    return v[first], f[(f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 2] != f[:, 0])]


def resample(v, f, h=SAMPLE):
    """Surface points about h apart, independent of how the source was triangulated.

    Source vessels mix sliver triangles tens of millimetres long with dense caps, so mesh edges
    are useless as a distance graph. Each triangle is filled on its own grid, then one point is
    kept per h-sized cell. The result is deterministic.
    """
    a, ab, ac = v[f[:, 0]], v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]]
    n1 = np.maximum(1, np.ceil(np.linalg.norm(ab, axis=1) / h)).astype(int)
    n2 = np.maximum(1, np.ceil(np.linalg.norm(ac, axis=1) / h)).astype(int)
    points = [v]
    for shape in np.unique(np.c_[n1, n2], axis=0):
        i, j = np.meshgrid(np.arange(shape[0] + 1) / shape[0], np.arange(shape[1] + 1) / shape[1], indexing="ij")
        keep = i + j <= 1 + 1e-9
        s, u = i[keep], j[keep]
        t = (n1 == shape[0]) & (n2 == shape[1])
        points.append((a[t][:, None] + s[None, :, None] * ab[t][:, None] + u[None, :, None] * ac[t][:, None]).reshape(-1, 3))
    points = np.vstack(points)
    _, first = np.unique(np.floor(points / h).astype(np.int64), axis=0, return_index=True)
    return points[np.sort(first)]


def skeleton(v, step=STEP, sample=SAMPLE):
    """Centerline nodes of one resampled surface: (positions, radii, undirected node edges)."""
    n = len(v)
    e = cKDTree(v).query_pairs(2.2 * sample, output_type="ndarray")
    if not len(e):
        return np.zeros((0, 3)), np.zeros(0), np.zeros((0, 2), int)
    length = np.linalg.norm(v[e[:, 0]] - v[e[:, 1]], axis=1)
    g = coo_matrix((length, (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    g = g + g.T
    pieces, piece = connected_components(g, directed=False)
    positions, radii, links = [], [], []
    for c in range(pieces):
        members = np.where(piece == c)[0]
        if len(members) < 8:
            continue
        sub = g[members][:, members]
        # Distance from a single end point makes lopsided bands near that end (discs around the
        # point, not rings around the vessel). So sweep from both extreme ends and, near each end,
        # trust the distance measured from the other one.
        one = int(np.argmax(dijkstra(sub, indices=0)))
        d1 = dijkstra(sub, indices=one)
        d2 = dijkstra(sub, indices=int(np.argmax(d1)))
        w = d1 / np.maximum(d1 + d2, 1e-12)
        d = w * d1 + (1 - w) * (d1.max() - d2)
        band = np.floor((d - d.min()) / step).astype(int)
        coo = sub.tocoo()
        same = band[coo.row] == band[coo.col]
        rings, ring = connected_components(
            coo_matrix((np.ones(same.sum()), (coo.row[same], coo.col[same])), shape=sub.shape), directed=False
        )
        count = np.bincount(ring, minlength=rings)
        p = v[members]
        center = np.zeros((rings, 3))
        np.add.at(center, ring, p)
        center /= count[:, None]
        cross = ring[coo.row] != ring[coo.col]
        pair = np.unique(np.sort(np.c_[ring[coo.row[cross]], ring[coo.col[cross]]], axis=1), axis=0)
        neighbours = [[] for _ in range(rings)]
        for a, b in pair:
            neighbours[a].append(b)
            neighbours[b].append(a)
        # Radius is the mean distance from the local axis, so band width does not inflate it.
        axis = np.zeros((rings, 3))
        for i, nb in enumerate(neighbours):
            if len(nb) == 1:
                axis[i] = center[nb[0]] - center[i]
            elif len(nb) >= 2:
                axis[i] = center[nb[0]] - center[nb[1]]
        norm = np.linalg.norm(axis, axis=1)
        axis[norm > 0] /= norm[norm > 0, None]
        offset = p - center[ring]
        offset -= (offset * axis[ring]).sum(1)[:, None] * axis[ring]
        radius = np.zeros(rings)
        np.add.at(radius, ring, np.linalg.norm(offset, axis=1))
        radius /= count
        base = sum(len(x) for x in positions)
        # Bands within a diameter of a closed end are cut off by the cap and sit off-axis. Drop
        # them and put one node on the axis at the true end instead.
        keep, ends = np.ones(rings, bool), []
        for i, nb in enumerate(neighbours):
            if len(nb) != 1:
                continue
            chain, travelled = [i], 0.0
            while True:
                at = chain[-1]
                inward = [x for x in neighbours[at] if x not in chain[-2:]]
                if len(neighbours[at]) > 2 or not inward:
                    break
                if travelled >= 2 * radius[at] and radius[at] >= 0.8 * radius[inward[0]]:
                    break
                travelled += np.linalg.norm(center[inward[0]] - center[at])
                chain.append(inward[0])
            anchor = chain[-1]
            inward = [x for x in neighbours[anchor] if x not in chain]
            if len(chain) < 2 or len(inward) != 1 or len(neighbours[anchor]) > 2:
                continue
            out = center[anchor] - center[inward[0]]
            out /= np.linalg.norm(out)
            cut = np.isin(ring, chain)
            ends.append((anchor, center[anchor] + out * max(0.0, ((p[cut] - center[anchor]) @ out).max())))
            keep[chain[:-1]] = False
        # A piece shorter than its own end zones keeps its bands as they are.
        if any(not keep[anchor] for anchor, _ in ends):
            keep[:], ends = True, []
        index = np.cumsum(keep) - 1
        pair = index[pair[keep[pair[:, 0]] & keep[pair[:, 1]]]] if len(pair) else pair.reshape(0, 2)
        tail = int(keep.sum())
        tip_radius = [radius[anchor] for anchor, _ in ends]
        center, radius = list(center[keep]), list(radius[keep])
        for (anchor, end), r in zip(ends, tip_radius):
            # Straight run of evenly spaced nodes from the last full band out to the end.
            start, last = center[index[anchor]], index[anchor]
            steps = max(1, int(np.ceil(np.linalg.norm(end - start) / step)))
            for k in range(1, steps + 1):
                center.append(start + (end - start) * k / steps)
                radius.append(r)
                pair = np.vstack([pair, [last, tail]])
                last, tail = tail, tail + 1
        positions.append(np.array(center))
        radii.append(np.array(radius))
        links.append(pair + base)
    if not positions:
        return np.zeros((0, 3)), np.zeros(0), np.zeros((0, 2), int)
    return np.vstack(positions), np.concatenate(radii), np.vstack(links)


def prune(positions, radii, links):
    """Drop side spurs shorter than the vessel is wide; they are surface bumps, not branches."""
    n = len(positions)
    alive = np.ones(n, bool)
    while True:
        nb = [[] for _ in range(n)]
        for a, b in links:
            if alive[a] and alive[b]:
                nb[a].append(b)
                nb[b].append(a)
        removed = False
        for tip in range(n):
            if not alive[tip] or len(nb[tip]) != 1:
                continue
            chain, travelled, at, before = [tip], 0.0, nb[tip][0], tip
            while len(nb[at]) == 2:
                travelled += np.linalg.norm(positions[at] - positions[before])
                chain.append(at)
                before, at = at, [x for x in nb[at] if x != before][0]
            travelled += np.linalg.norm(positions[at] - positions[before])
            if len(nb[at]) >= 3 and travelled < 1.5 * radii[at]:
                alive[chain] = False
                removed = True
                break
        if not removed:
            break
    index = np.cumsum(alive) - 1
    keep = alive[links[:, 0]] & alive[links[:, 1]] if len(links) else np.zeros(0, bool)
    return positions[alive], radii[alive], index[links[keep]]


def classify(name, system):
    """Circuit of a source mesh: systemic/pulmonary arteries and veins, or the portal system."""
    n = name.lower()
    lung = re.search(r"pulmonary|lobar (artery|vein)|segmental (artery|vein)", n) and not re.search(r"hepatic|renal|portal", n)
    if system == "arterial":
        return "pulmonary-arterial" if lung else "arterial"
    if lung:
        return "pulmonary-venous"
    if re.search(r"portal vein|mesenteric vein|splenic vein|colic vein|(?<!epi)gastric vein|gastroepiploic vein|pancreaticoduodenal vein|sigmoid vein|superior rectal vein|ileal vein|jejunal vein", n):
        return "portal"
    return "venous"


DISTRIBUTING_PORTAL = re.compile(r"(left|right) portal vein", re.I)
BEDS = (
    ("heart", r"coronary|cardiac vein|coronary sinus|interventricular|ventricular branch|marginal branch|conus branch|diagonal branch"),
    ("kidneys", r"renal|suprarenal"),
    ("liver", r"hepatic|hepatovenous|cystic"),
    ("brain", r"cerebr|cerebell|basilar|choroid|communicating|callos|sulcus|striate|thalam|pontine|labyrinth|ophthalmic|insular|occipital artery|temporal artery|temporal branch|frontal|parietal|calcarine|hypophys|central branch|sinus|vein of (galen|labb|trolard)|internal carotid|vertebral artery"),
    ("gut", r"celiac|coeliac|mesenteric|(?<!epi)gastr|splenic|colic|pancrea|ileal|jejunal|sigmoid|rectal|oesophageal|esophageal"),
)


def bed_of(name, circuit):
    """Simulated vascular bed an end branch supplies or drains."""
    if circuit.startswith("pulmonary"):
        return "lungs"
    if circuit == "portal":
        return "gut"
    for bed, pattern in BEDS:
        if re.search(pattern, name, re.I):
            # Hepatic veins return hepatic arterial plus portal blood.
            return "hepatic" if bed == "liver" and circuit == "venous" else bed
    return "peripheral"


HEART = np.array([0.022, 1.32, 0.036])
LIVER = np.array([-0.065, 1.16, 0.005])
ROOTS = {
    "arterial": r"^ascending aorta$",
    "pulmonary-arterial": r"^pulmonary trunk$",
    "venous": r"^(superior vena cava|inferior vena cava|coronary sinus)$",
    "pulmonary-venous": r"^(left|right) (superior|inferior) pulmonary vein$",
    "portal": r"^hepatic portal vein$",
}


def build(parts, step=STEP, sample=SAMPLE, contact=CONTACT, bridge=BRIDGE, log=lambda *_: None):
    """parts: [{id, name, system, v, f}]. Returns the oriented vessel graph as plain data."""
    count = len(parts)
    surfaces = [resample(*weld(p["v"], p["f"]), h=sample) for p in parts]
    circuit = np.array([classify(p["name"], p["system"]) for p in parts])
    P, R, owner, E = [np.zeros((0, 3))], [np.zeros(0)], [], []
    for index in range(count):
        p, r, links = prune(*skeleton(surfaces[index], step, sample))
        base = sum(len(x) for x in P)
        P.append(p)
        R.append(r)
        owner += [index] * len(p)
        E += [(a + base, b + base, "source") for a, b in links]
    P, R, owner = np.vstack(P), np.concatenate(R), np.array(owner)
    nodes_of = [np.where(owner == i)[0] for i in range(count)]
    paths = [cKDTree(P[n]) if len(n) else None for n in nodes_of]
    low, high = np.array([s.min(0) for s in surfaces]), np.array([s.max(0) for s in surfaces])
    close = []
    for name in sorted(set(circuit)):
        members = [i for i in np.where(circuit == name)[0] if paths[i]]
        for x, a in enumerate(members):
            for b in members[x + 1:]:
                if not ((low[a] > high[b] + contact).any() or (low[b] > high[a] + contact).any()):
                    close.append((a, b))
    # The source package also ships whole vessels laid over their own named pieces. One mesh is a
    # copy of another where its centerline runs inside the other's lumen. Keep one copy.
    within = [[] for _ in range(count)]
    for a, b in close:
        for inner, outer in ((a, b), (b, a)):
            d, i = paths[outer].query(P[nodes_of[inner]])
            if (d < 0.6 * R[nodes_of[outer]][i] + step / 2).mean() > 0.6:
                back, _ = paths[inner].query(P[nodes_of[outer]])
                within[outer].append((inner, (back < 0.6 * R[nodes_of[outer]] + step / 2).mean()))
    dropped = {}
    for outer in sorted(range(count), key=lambda i: -len(nodes_of[i])):
        pieces = [(i, c) for i, c in within[outer] if i not in dropped]
        if not pieces or outer in dropped:
            continue
        # A heart-side root vessel is never the copy that goes.
        rooted = lambda i: bool(re.search(ROOTS[circuit[i]], parts[i]["name"], re.I))
        if sum(c for _, c in pieces) >= 0.6 and not rooted(outer):
            dropped[outer] = [parts[i]["id"] for i, _ in pieces]
        else:
            for i, _ in pieces:
                if not rooted(i):
                    dropped[i] = [parts[outer]["id"]]
    log("duplicate meshes dropped", len(dropped))
    live = ~np.isin(owner, list(dropped))
    E = [e for e in E if live[e[0]]]
    nodes_of = [n if i not in dropped else n[:0] for i, n in enumerate(nodes_of)]
    degree = np.zeros(len(P), int)
    for a, b, _ in E:
        degree[a] += 1
        degree[b] += 1
    tip = (degree <= 1) & live
    # A junction is where a vessel END touches another vessel. Vessels running side by side also
    # touch, but not at an end, and are left apart.
    trees, touching = {}, {}
    for a, b in close:
        if a in dropped or b in dropped:
            continue
        for mine, other in ((a, b), (b, a)):
            ends = nodes_of[mine][tip[nodes_of[mine]]]
            if not len(ends):
                continue
            if other not in trees:
                trees[other] = cKDTree(surfaces[other])
            # An end may stop at the other vessel's wall or sit inside its lumen.
            gap, _ = trees[other].query(P[ends])
            axis, near = paths[other].query(P[ends])
            gap = np.minimum(gap, axis - R[nodes_of[other]][near])
            for k in np.where(gap <= 1.5 * R[ends] + contact)[0]:
                touching.setdefault(int(ends[k]), []).append(int(nodes_of[other][near[k]]))
    joined, touched = np.zeros(len(P), bool), np.zeros(len(P), bool)
    for end, others in touching.items():
        # A branch end among several wider vessels belongs to the widest: its trunk.
        wider = [n for n in others if R[n] >= R[end]]
        for n in [x for x in others if R[x] < R[end]] + ([max(wider, key=lambda n: R[n])] if wider else []):
            E.append((end, n, "contact"))
            joined[end] = touched[end] = touched[n] = True
    log("contact junctions", sum(k == "contact" for *_, k in E))

    def grow(roots):
        nb = [[] for _ in range(len(P))]
        for a, b, kind in E:
            # Short paths through wide vessels are preferred, so the tree follows trunks.
            w = np.linalg.norm(P[a] - P[b]) / max(1e-4, (R[a] + R[b]) / 2)
            nb[a].append((b, w, kind))
            nb[b].append((a, w, kind))
        cost, parent, via = np.full(len(P), np.inf), np.full(len(P), -1), {}
        heap = [(0.0, r) for r in roots]
        for r in roots:
            cost[r] = 0
        while heap:
            c, a = heapq.heappop(heap)
            if c > cost[a]:
                continue
            for b, w, kind in nb[a]:
                if circuit[owner[b]] == circuit[owner[a]] and c + w < cost[b]:
                    cost[b], parent[b], via[b] = c + w, a, kind
                    heapq.heappush(heap, (c + w, b))
        return cost, parent, via

    def roots_of(name):
        """One root per named heart-side vessel: its end nearest the heart (or liver)."""
        best = {}
        # The portal trunk ends where its intrahepatic branches begin.
        hepatic = [surfaces[j] for j in range(count) if circuit[j] == "portal" and DISTRIBUTING_PORTAL.search(parts[j]["name"]) and j not in dropped]
        liver = np.vstack(hepatic).mean(0) if hepatic else LIVER
        arch = [j for j in range(count) if parts[j]["name"].lower() == "arch of aorta"]
        for i in np.where(circuit == name)[0]:
            if not re.search(ROOTS[name], parts[i]["name"], re.I):
                continue
            for n in nodes_of[i][tip[nodes_of[i]]]:
                # The aortic root is the end away from the arch.
                if name == "arterial" and arch:
                    score = -np.linalg.norm(P[n] - surfaces[arch[0]].mean(0))
                elif name == "portal":
                    score = np.linalg.norm(P[n] - liver)
                else:
                    # The heart end is the free one: chambers are not vessel meshes.
                    score = np.linalg.norm(P[n] - HEART) + (1.0 if touched[n] else 0.0)
                key = parts[i]["name"].lower()
                if key not in best or score < best[key][0]:
                    best[key] = (score, int(n))
        return [n for _, n in best.values()]

    roots = {name: roots_of(name) for name in ROOTS}
    every_root = [r for rs in roots.values() for r in rs]
    cost, parent, via = grow(every_root)
    # Remaining pieces: bridge small end-to-surface gaps, and say so in the output.
    bridged = 0
    while True:
        reached, found = np.isfinite(cost), []
        for name in ROOTS:
            members = [i for i in np.where(circuit == name)[0] if len(nodes_of[i])]
            near = [i for i in members if reached[nodes_of[i]].all()]
            if not near:
                continue
            target = cKDTree(np.vstack([surfaces[i] for i in near]))
            label = np.concatenate([[i] * len(surfaces[i]) for i in near])
            for o in members:
                ends = nodes_of[o][tip[nodes_of[o]] & ~reached[nodes_of[o]]]
                if not len(ends):
                    continue
                d, i = target.query(P[ends], distance_upper_bound=bridge + R[ends].max())
                gap = d - R[ends]
                k = int(np.argmin(gap))
                if np.isfinite(d[k]) and gap[k] <= bridge:
                    into = nodes_of[label[i[k]]]
                    found.append((int(ends[k]), int(into[np.argmin(np.linalg.norm(P[into] - P[ends[k]], axis=1))])))
        if not found:
            break
        E += [(a, b, "inferred") for a, b in found]
        joined[[a for a, _ in found]] = True
        bridged += len(found)
        cost, parent, via = grow(every_root)
    log("inferred bridges", bridged)
    # Islands the source never connects to a trunk (e.g. intracranial arteries without their
    # cervical supply) are animated from their end nearest that trunk and reported as detached.
    reached = np.isfinite(cost)
    link = np.array([(a, b) for a, b, _ in E if circuit[owner[a]] == circuit[owner[b]]])
    _, island = connected_components(coo_matrix((np.ones(len(link)), (link[:, 0], link[:, 1])), shape=(len(P), len(P))), directed=False)
    detached = []
    for i in np.unique(island[~reached]):
        ends = np.where((island == i) & tip)[0]
        trunk = np.where(reached & (circuit[owner] == circuit[owner[ends[0]]]))[0] if len(ends) >= 2 else []
        if len(trunk):
            detached.append(int(ends[np.argmin(cKDTree(P[trunk]).query(P[ends])[0])]))
    every_root += detached
    cost, parent, via = grow(every_root)
    log("detached islands", len(detached))

    # Oriented segments: chains of one source mesh between forks, listed from the root outward.
    # Blood runs along that order where `away` is true and against it otherwise.
    reached = np.isfinite(cost)
    children = [[] for _ in range(len(P))]
    for n in np.argsort(cost):
        if reached[n] and parent[n] >= 0:
            children[parent[n]].append(n)
    segments = []
    stack = [(r, None) for r in every_root]
    while stack:
        start, up = stack.pop()
        for first in children[start]:
            chain, at = [start, first], first
            while len(children[at]) == 1 and owner[children[at][0]] == owner[first]:
                at = children[at][0]
                chain.append(at)
            part = owner[first]
            name = circuit[part]
            away = name in ("arterial", "pulmonary-arterial") or (name == "portal" and bool(DISTRIBUTING_PORTAL.search(parts[part]["name"])))
            segments.append({
                "part": int(part), "circuit": str(name), "away": bool(away), "parent": up,
                "junction": "detached" if up is None and start in detached else via[first],
                # A chain that stops at an end already joined elsewhere is an overlap stub.
                "nodes": [int(n) for n in chain], "leaf": not children[at] and not joined[at],
                "radius": float(max(2e-4, np.median(R[chain[1:]]))),
                "bed": bed_of(parts[part]["name"], name), "share": {},
            })
            stack.append((at, len(segments) - 1))
    # Flow shares: every end branch belongs to one simulated bed, weighted by radius cubed.
    totals = {}
    for s in segments:
        if s["leaf"]:
            key = (s["circuit"], s["away"], s["bed"])
            totals[key] = totals.get(key, 0) + s["radius"] ** 3
    for s in segments:
        if s["leaf"]:
            s["share"] = {s["bed"]: s["radius"] ** 3 / totals[(s["circuit"], s["away"], s["bed"])]}
    for i in sorted(range(len(segments)), key=lambda i: -cost[segments[i]["nodes"][-1]]):
        s, up = segments[i], segments[i]["parent"]
        # Collecting and distributing halves of the portal tree are separate flow trees.
        if up is not None and segments[up]["away"] == s["away"]:
            for bed, share in s["share"].items():
                segments[up]["share"][bed] = segments[up]["share"].get(bed, 0) + share
    return {
        "positions": P, "radii": R, "segments": segments,
        "unreached": sorted(parts[i]["id"] for i in range(count) if i not in dropped and not (len(nodes_of[i]) and reached[nodes_of[i]].any())),
        "duplicates": {parts[i]["id"]: v for i, v in sorted(dropped.items())},
    }
