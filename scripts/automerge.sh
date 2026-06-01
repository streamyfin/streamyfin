#!/bin/bash
# Local helper: fast-forward master into develop and back. Aborts on any failure and
# restores the branch you started on. Not used in CI.
set -euo pipefail

if [[ -n $(git status --porcelain) ]]; then
  echo "Error: working tree is not clean — commit or stash first." >&2
  exit 1
fi

start_branch=$(git rev-parse --abbrev-ref HEAD)
trap 'git checkout "$start_branch" >/dev/null 2>&1 || true' EXIT

git checkout master
git pull --ff-only
git checkout develop
git merge master
git push --follow-tags
git checkout master
git merge develop --ff-only
git push
git checkout develop
