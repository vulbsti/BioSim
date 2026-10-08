#!/usr/bin/env bash
# Build the molecule pack with Blender on a remote host and bring the outputs back.
#   scripts/molecules/build-remote.sh [host] [--preview]
set -euo pipefail
HOST="${1:-uxserver}"; shift || true
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; REMOTE='biosim-molecules-build'
ssh -o BatchMode=yes "$HOST" "mkdir -p $REMOTE/scripts $REMOTE/assets $REMOTE/public/models"
rsync -a --delete "$ROOT/scripts/molecules" "$HOST:$REMOTE/scripts/"
rsync -a --delete --exclude previews "$ROOT/assets/molecules" "$HOST:$REMOTE/assets/"
ssh -o BatchMode=yes "$HOST" "cd $REMOTE && blender --background --factory-startup --python scripts/molecules/build.py -- --root . $*" | grep -E 'MOLECULE|PREVIEW|Error|Traceback|line ' || true
mkdir -p "$ROOT/public/models/molecules" "$ROOT/assets/molecules/previews"
rsync -a "$HOST:$REMOTE/public/models/molecules/molecules.glb" "$ROOT/public/models/molecules/"
rsync -a "$HOST:$REMOTE/assets/molecules/build.json" "$ROOT/assets/molecules/"
rsync -a "$HOST:$REMOTE/assets/molecules/previews/" "$ROOT/assets/molecules/previews/" 2>/dev/null || true
python3 "$ROOT/scripts/molecules/package.py"
