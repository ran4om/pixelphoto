#!/usr/bin/env bash
# Install PixelPhoto globally so `pixelphoto` is on your PATH (from a git clone).
# Usage: from repo root — ./scripts/install-global.sh   or   bash scripts/install-global.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "error: node is not installed (need Node.js 20+)." >&2
  exit 1
fi

echo "Installing dependencies…"
npm install

echo "Building…"
npm run build

echo "Installing globally (may need sudo on some systems if npm prefix is not writable)…"
npm install -g .

echo "Done. Try: pixelphoto --help"
command -v bun >/dev/null 2>&1 || echo "Note: install Bun from https://bun.sh for the TUI (pixelphoto tui)."
