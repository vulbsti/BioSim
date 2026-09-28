"""Read-only Blender audit for the saved muscle-pilot authoring scenes.

Run with:
  blender --background FILE.blend --python scripts/blender/audit-muscle-pilot.py -- OUTPUT.json [SPEC.json]

With SPEC.json, every mesh is classified against spec.topology: source surfaces are
reported but preserved, named openings must match their declared boundary loops,
and every other generated mesh must be closed. Any failure exits nonzero.
"""
import bpy
import hashlib
import json
import sys
from pathlib import Path
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blender_topology import mesh_stats, winding_consistency  # noqa: E402
from muscle_geometry import classify  # noqa: E402


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


blend_path = Path(bpy.data.filepath).resolve()
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(args) not in (1, 2):
    raise SystemExit("Expected OUTPUT.json [SPEC.json] after --")
output_path = Path(args[0]).resolve()
policy = json.loads(Path(args[1]).read_text())["topology"] if len(args) == 2 else None
objects = []
failures = []
for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name):
    record = {
        "name": obj.name,
        "type": obj.type,
        "entityId": obj.get("entityId"),
        "kind": obj.get("kind"),
        "evidence": obj.get("evidence"),
        "metersPerUnit": obj.get("metersPerUnit"),
        "location": list(obj.location),
        "rotationEuler": list(obj.rotation_euler),
        "scale": list(obj.scale),
        "parent": obj.parent.name if obj.parent else None,
    }
    if obj.type == "MESH":
        record["mesh"] = mesh_stats(obj)
        corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        record["worldBounds"] = {
            "min": [min(corner[i] for corner in corners) for i in range(3)],
            "max": [max(corner[i] for corner in corners) for i in range(3)],
        }
        if policy is not None:
            record["topologyVerdict"] = classify(obj.get("entityId"), record["mesh"], policy)
            if record["topologyVerdict"]["status"] == "fail":
                failures.append({"entityId": obj.get("entityId"), "reasons": record["topologyVerdict"]["reasons"]})
            if obj.get("entityId") in policy.get("sourceSurfaces", []):
                # Diagnostic only (never repairs the source): quantifies backfacing/
                # inconsistently wound faces reported as "pink patches" in the normals
                # diagnostic render.
                record["normalsConsistency"] = winding_consistency(obj)
    objects.append(record)

report = {
    "schemaVersion": 2,
    "blenderVersion": bpy.app.version_string,
    "blendPath": str(blend_path),
    "blendSHA256": sha256(blend_path),
    "sceneUnitSystem": bpy.context.scene.unit_settings.system,
    "sceneScaleLength": bpy.context.scene.unit_settings.scale_length,
    "topologyPolicyApplied": policy is not None,
    "topologyFailures": failures,
    "objects": objects,
}
output_path.parent.mkdir(parents=True, exist_ok=True)
output_path.write_text(json.dumps(report, indent=2) + "\n")
print("BLENDER_AUDIT", json.dumps({"blend": str(blend_path), "objects": len(objects), "failures": len(failures)}))
if failures:
    print("TOPOLOGY_FAILURES", json.dumps(failures))
    sys.exit(1)
