#!/bin/bash
[[ -z $(git status --porcelain) ]] &&
git checkout main &&
git pull --ff-only &&
git checkout develop &&
git merge main &&
git push --follow-tags &&
git checkout main &&
git merge develop --ff-only &&
git push &&
git checkout develop ||
(echo "Error: Failed to merge" && exit 1)