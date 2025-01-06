#!/bin/bash
[[ -z $(git status --porcelain) ]] &&
git checkout master &&
git pull --ff-only &&
git checkout develop &&
git merge master &&
git push --follow-tags &&
git checkout master &&
git merge develop --ff-only &&
git push &&
git checkout develop ||
(echo "Error: Failed to merge" && exit 1)