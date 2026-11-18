#!/bin/bash
# Static-site build used by Cloudflare Pages (and anyone else): Python data export, then the web build.
# Cloudflare Pages settings: build command `bash scripts/build-pages.sh`, output directory `web/dist`.
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m pip install --quiet --disable-pip-version-check .
python3 -c "from cislunar.export import export; print(export('web/public/data'))"
cd web
npm ci --no-audit --no-fund
npm test
npm run build
