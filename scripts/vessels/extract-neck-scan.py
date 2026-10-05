"""Landmarks and artery centerlines of one neck CT angiogram, for registration onto the atlas.

Run where the imaging tools live (nibabel, scikit-image, vmtk):
  python scripts/vessels/extract-neck-scan.py <subject dir> <TotalSegmentator dir> <out.json>

<subject dir> holds ct.nii.gz of one TotalSegmentator-dataset subject; <TotalSegmentator dir>
holds `total/` and `hn/`, the outputs of tasks `total` and `headneck_bones_vessels`. The carotids
come from those labels, bridged across the unlabelled bifurcation. The vertebral arteries have no
open label, so each is traced through the contrast from the subclavian artery up to the C2-C3
level and then centred with VMTK. The output is small and is committed, so the atlas-side build
(build-registered-vessels.py) needs neither the scan nor these tools.

Output coordinates are millimetres in atlas axes (+x left, +y up, +z anterior) but still in the
scan's own position and size.
"""
import glob
import hashlib
import json
import os
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage as ndi
from skimage.graph import MCP_Geometric
from skimage.measure import marching_cubes

sys.path.insert(0, str(Path(__file__).parent))
import neck_landmarks as nl

BONES = ("vertebrae", "rib_", "clavicula", "skull", "sternum", "scapula", "costal")
UP = 3  # lumen masks are resampled this many times finer before surfacing


def load(path):
    return np.asarray(nib.load(path).dataobj)


def blood(hu):
    """1 for contrast-filled lumen, 0 for soft tissue and for dense cortical bone."""
    return np.clip((hu - 150) / 120, 0, 1) * np.clip((720 - hu) / 140, 0, 1)


def route(cost, starts, ends):
    """Least-cost voxel path from any start to the cheapest-to-reach end."""
    mcp = MCP_Geometric(cost, fully_connected=True)
    total, _ = mcp.find_costs([tuple(p) for p in starts], [tuple(p) for p in ends])
    return np.array(mcp.traceback(tuple(min(ends, key=lambda p: total[tuple(p)]))))


def centred(path, lumen, world):
    """VMTK centerline along a voxel path: (points mm, inscribed radii mm).

    `lumen(box)` returns the vessel as a mask over a finer copy of the scan cropped to `box`. A
    thin core along the path is always added, so the surface stays in one piece where a
    two-voxel artery fades between samples.
    """
    import vtk
    from vmtk import vmtkscripts
    from vtk.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray, vtk_to_numpy

    lo = path.min(0) - 5
    box = tuple(slice(a, b) for a, b in zip(lo, path.max(0) + 6))
    to_fine = lambda ijk: (ijk - lo + 0.5) * UP - 0.5
    shape = tuple(UP * (s.stop - s.start) for s in box)
    line = np.zeros(shape, bool)
    for a, b in zip(to_fine(path[:-1]), to_fine(path[1:])):
        line[tuple(np.round(np.linspace(a, b, 2 * UP + 1)).astype(int).T)] = True
    reach = ndi.distance_transform_edt(~line)  # fine cells from the path
    fine = ndi.gaussian_filter((lumen(box, reach) | (reach <= 1.5)).astype(float), 1.0)
    v, f, _, _ = marching_cubes(fine, 0.5)
    # Vertex positions of the fine grid back to voxel indices of the scan, then to millimetres.
    v = world((v + 0.5) / UP - 0.5 + lo)
    surface = vtk.vtkPolyData()
    points = vtk.vtkPoints()
    points.SetData(numpy_to_vtk(v, deep=True))
    surface.SetPoints(points)
    cells = vtk.vtkCellArray()
    cells.SetCells(len(f), numpy_to_vtkIdTypeArray(np.c_[np.full(len(f), 3), f].ravel().astype(np.int64), deep=True))
    surface.SetPolys(cells)
    keep = vtk.vtkPolyDataConnectivityFilter()
    keep.SetInputData(surface)
    keep.SetExtractionModeToLargestRegion()
    smooth = vtk.vtkWindowedSincPolyDataFilter()
    smooth.SetInputConnection(keep.GetOutputPort())
    smooth.SetNumberOfIterations(30)
    smooth.SetPassBand(0.1)
    clean = vtk.vtkCleanPolyData()
    clean.SetInputConnection(smooth.GetOutputPort())
    clean.Update()
    lines = vmtkscripts.vmtkCenterlines()
    lines.Surface = clean.GetOutput()
    lines.SeedSelectorName = "pointlist"
    lines.SourcePoints = world(path[:1].astype(float))[0].tolist()
    lines.TargetPoints = world(path[-1:].astype(float))[0].tolist()
    lines.Resampling = 1
    lines.ResamplingStepLength = 1.0
    lines.Execute()
    out = lines.Centerlines
    return vtk_to_numpy(out.GetPoints().GetData()).astype(float), vtk_to_numpy(out.GetPointData().GetArray("MaximumInscribedSphereRadius")).astype(float)


def main(subject, seg, out):
    image = nib.load(f"{subject}/ct.nii.gz")
    if nib.aff2axcodes(image.affine) != ("R", "A", "S"):
        raise SystemExit("expected a scan stored right-anterior-superior")
    hu = np.asarray(image.dataobj).astype(float)
    total = lambda name: load(f"{seg}/total/{name}.nii.gz") > 0
    headneck = lambda name: load(f"{seg}/hn/{name}.nii.gz") > 0

    def world(ijk):
        """Voxel indices to millimetres in atlas axes: scanner (right, anterior, superior) -> (left, up, anterior)."""
        ras = ijk @ image.affine[:3, :3].T + image.affine[:3, 3]
        return np.c_[-ras[:, 0], ras[:, 2], ras[:, 1]]

    centroid = lambda mask: world(np.argwhere(mask).mean(0)[None])[0]
    bone = np.zeros(hu.shape, bool)
    for path in glob.glob(f"{seg}/total/*.nii.gz"):
        if os.path.basename(path).startswith(BONES):
            bone |= load(path) > 0
    vertebra = {f"C{i}": total(f"vertebrae_C{i}") for i in range(1, 8)} | {f"T{i}": total(f"vertebrae_T{i}") for i in (1, 2)}
    landmarks = {name: centroid(mask) for name, mask in vertebra.items()}
    landmarks |= {"hyoid": centroid(headneck("hyoid")), "thyroid cartilage": centroid(headneck("thyroid_cartilage")), "cricoid cartilage": centroid(headneck("cricoid_cartilage"))}
    skull = world(np.argwhere(total("skull")).astype(float))
    magnum = nl.foramen_magnum(skull, landmarks["C1"], landmarks["C2"])
    if magnum is not None:
        landmarks["foramen magnum"] = magnum

    carotid = {s: (total(f"common_carotid_artery_{s}"), headneck(f"internal_carotid_artery_{s}")) for s in ("left", "right")}
    veins = headneck("internal_jugular_vein_left") | headneck("internal_jugular_vein_right")
    arteries = total("aorta") | total("brachiocephalic_trunk")
    for common, internal in carotid.values():
        arteries |= common | internal
    middle = int(round(np.argwhere(vertebra["C2"]).mean(0)[0]))
    like = blood(hu)
    finer = lambda volume, box: ndi.zoom(volume[box].astype(float), UP, order=1)
    centerlines, quality = {}, {}
    for side, (common, internal) in carotid.items():
        # Carotid: free inside its two labels, through bright voxels across the unlabelled fork.
        cost = 1 + 40 * (1 - like) + 6 * bone
        cost[common | internal] = 1
        cost[veins] = -1
        low, high = np.argwhere(common), np.argwhere(internal)
        path = route(cost, low[low[:, 2] <= low[:, 2].min() + 1], high[high[:, 2] >= high[:, 2].max() - 1])
        gap = path[~(common | internal)[tuple(path.T)]]
        # The labels where they exist; across the fork, bright lumen within 3 mm of the path.
        points, radii = centred(path, lambda box, reach: (finer(common | internal, box) > 0.5) | ((reach <= 3 / image.header.get_zooms()[0] * UP) & (finer(like, box) > 0.5) & (finer(bone, box) < 0.5)), world)
        fork = world(path[np.argmax(~common[tuple(path.T)])][None].astype(float))[0]
        entry = nl.canal_entry(points if points[0, 1] < points[-1, 1] else points[::-1], skull, landmarks["C1"][1])
        if entry is not None:
            landmarks[f"{side} carotid canal entry"] = entry
        centerlines[f"{side} carotid"] = {"points": points, "inscribedRadius": radii, "fork": fork}
        quality[f"{side} carotid"] = {"unlabelledVoxelsBridged": int(len(gap)), "medianHU": float(np.median(hu[tuple(path.T)]))}

        # Vertebral: from the subclavian label up to the brightest lumen beside the C2-C3 joint.
        cost = 1 + 40 * (1 - like) + 6 * bone
        cost[ndi.binary_dilation(arteries, iterations=2)] = -1
        other_side = np.zeros(hu.shape, bool)
        if side == "left":  # voxel index rises toward the patient's right
            other_side[middle - 1:] = True
            columns = range(middle - 15, middle - 4)
        else:
            other_side[:middle + 2] = True
            columns = range(middle + 5, middle + 16)
        cost[other_side] = -1
        level = int(round((np.argwhere(vertebra["C2"]).mean(0)[2] + np.argwhere(vertebra["C3"]).mean(0)[2]) / 2))
        depth = int(round(np.argwhere(vertebra["C3"]).mean(0)[1]))
        window = np.zeros(hu.shape, bool)
        window[columns.start:columns.stop, depth - 4:depth + 10, level] = True
        score = np.where(window & (cost > 0), 1000 * like + hu / 10 - 500 * bone, -np.inf)
        top = np.array(np.unravel_index(np.argmax(score), hu.shape))
        origin = np.argwhere(total(f"subclavian_artery_{side}") & ~other_side)
        path = route(cost, origin, [top])
        # Bright lumen within 2.5 mm of the path. Inside the bony canal this also takes in some
        # bone, which the scan cannot tell from a two-voxel artery; the reach bounds the error.
        points, radii = centred(path, lambda box, reach: (reach <= 2.5 / image.header.get_zooms()[0] * UP) & (finer(like, box) > 0.5), world)
        centerlines[f"{side} vertebral"] = {"points": points, "inscribedRadius": radii}
        along = hu[tuple(path.T)]
        quality[f"{side} vertebral"] = {"voxels": int(len(path)), "medianHU": float(np.median(along)), "minimumHU": float(along.min()), "voxelsInsideBoneLabel": int(bone[tuple(path.T)].sum())}
        sub = np.argwhere(total(f"subclavian_artery_{side}")).astype(float)
        centerlines[f"{side} vertebral"]["subclavianLabel"] = world(sub[:: max(1, len(sub) // 400)])

    for line in centerlines.values():
        if line["points"][0, 1] > line["points"][-1, 1]:
            line["points"], line["inscribedRadius"] = line["points"][::-1], line["inscribedRadius"][::-1]
    for side in ("left", "right"):
        for level in ("C3", "C4", "C5", "C6"):
            crossing = nl.at_level(centerlines[f"{side} vertebral"]["points"], landmarks[level][1])
            if crossing is not None:
                landmarks[f"{side} vertebral artery at {level}"] = crossing

    rounded = lambda a: np.round(np.asarray(a, float), 2).tolist()
    report = {
        "subject": os.path.basename(os.path.normpath(subject)),
        "dataset": "TotalSegmentator CT dataset v3.0.0, https://doi.org/10.5281/zenodo.6802613, CC BY 4.0",
        "ctSHA256": hashlib.sha256(Path(f"{subject}/ct.nii.gz").read_bytes()).hexdigest(),
        "voxelMm": [round(float(z), 3) for z in image.header.get_zooms()],
        "units": "mm, atlas axes (+x left, +y up, +z anterior), scan position and size",
        "method": {
            "segmentation": "TotalSegmentator tasks total and headneck_bones_vessels (open models)",
            "vertebralArteries": "least-cost path through contrast from the subclavian label to the C2-C3 level, centred with VMTK centerlines on the path's lumen mask",
            "carotids": "VMTK centerline of the common and internal carotid labels joined across the unlabelled fork by a least-cost path",
            "fork": "first path voxel above the common carotid label",
            "extractor": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "landmarkRules": hashlib.sha256((Path(__file__).parent / "neck_landmarks.py").read_bytes()).hexdigest(),
        },
        "landmarks": {k: rounded(v) for k, v in sorted(landmarks.items())},
        "centerlines": {k: {name: rounded(value) for name, value in v.items()} for k, v in centerlines.items()},
        "quality": quality,
    }
    Path(out).write_text(json.dumps(report, separators=(",", ":")) + "\n")
    print(json.dumps({"landmarks": len(landmarks), "quality": quality, "points": {k: len(v["points"]) for k, v in centerlines.items()}}, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:4])
