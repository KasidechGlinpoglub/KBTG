#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
[ -f data/db.json ] || node server/seed.js
node server/index.js
