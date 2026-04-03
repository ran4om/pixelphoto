#!/usr/bin/env bash
# Install PixelPhoto from npm and run first-time setup. Intended for:
#   curl -fsSL https://raw.githubusercontent.com/ran4om/pixelphoto/master/scripts/install-and-onboard.sh | bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js 20+ is required (https://nodejs.org/)" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm is required" >&2
  exit 1
fi

echo "Installing pixelphoto globally…"
npm install -g pixelphoto@latest

echo "Starting onboarding…"
exec pixelphoto onboard
