#!/bin/zsh
set -e
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"

echo "Watching for changes in $repo_dir"

fswatch -o "$repo_dir" --event Created --event Updated --event Removed --event Renamed | while read -r _; do
  if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    continue
  fi

  echo "Changes detected at $(date)"
  git add -A
  git commit -m "Auto sync $(date '+%Y-%m-%d %H:%M:%S')" || true
  git push origin HEAD:main || echo "Push failed. Check GitHub authentication or remote access."
done
