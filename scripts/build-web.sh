#!/bin/bash
# Build + test the web app (used by hand and by the Dockerfile's checks)
set -e
cd "$(dirname "$0")/../web"
npm test 2>&1 | grep -E "(pass|fail) [0-9]"
npx tsc --noEmit -p .
npx vite build 2>&1 | tail -6
