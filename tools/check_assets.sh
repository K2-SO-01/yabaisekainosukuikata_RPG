#!/usr/bin/env bash
# Checks that every asset the game data refers to is uploaded (tracked by git).
#
# Assets are ignored by default (.gitignore), so unused material is never published.
# The downside: a newly used image or sound is NOT uploaded unless it is allowed explicitly,
# while it still works on this PC. This script closes that gap.
#
#   bash tools/check_assets.sh          fix: allow and stage every asset in use
#   bash tools/check_assets.sh --check  only report; exit 1 if something is not uploaded
#                                       (the pre-push hook runs this, so a push cannot go out incomplete)
set -u
cd "$(dirname "$0")/.." || exit 1
mode="${1:-fix}"
list=$(mktemp)

# character sprites
grep -o '"sprite": *"[^"]*"' data/characters.json | sed 's/.*: *"//; s/"$//' >> "$list"
# tileset images used by maps (paths in the map files are relative to data/maps)
grep -ho '"image": *"[^"]*"' data/maps/*.json | sed 's/.*: *"//; s/"$//; s#^\.\./\.\./##' >> "$list"
# music (file names, and files named in the per-track settings) and sound effects
sed -n '/"bgm": \[/,/\]/p' data/manifest.json | grep -o '"[a-z0-9_]*"' | tr -d '"' | grep -v '^bgm$' | sed 's#^#assets/bgm/#; s#$#.mp3#' >> "$list"
grep -o '"file": *"[a-z0-9_]*"' data/manifest.json | sed 's/.*"\([a-z0-9_]*\)"$/\1/; s#^#assets/bgm/#; s#$#.mp3#' >> "$list"
sed -n '/"se": \[/,/\]/p' data/manifest.json | grep -o '"[a-z0-9_]*"' | tr -d '"' | grep -v '^se$' | sed 's#^#assets/se/#; s#$#.mp3#' >> "$list"
# monster pictures
grep -o '"image": *"[^"]*"' data/enemies.json | sed 's/.*: *"//; s/"$//' >> "$list"
# face icons of every character (one per id in data/characters.json)
grep -o '^  "[a-z_0-9]*":' data/characters.json | tr -d ' ":' | grep -v "^_" | sed 's#^#assets/faces/#; s#$#.png#' >> "$list"
# pictures of the things that block the way (flame statue, sign)
echo assets/tiles/extra/blockers.png >> "$list"
# fonts
printf '%s\n' assets/fonts/DotGothic16-Regular.ttf assets/fonts/OFL.txt >> "$list"

total=0; fixed=0; bad=0
while IFS= read -r p; do
  [ -n "$p" ] || continue
  total=$((total + 1))
  if [ ! -f "$p" ]; then echo "NOT FOUND on this PC: $p"; bad=$((bad + 1)); continue; fi
  if git ls-files --error-unmatch -- "$p" >/dev/null 2>&1; then continue; fi
  if [ "$mode" = "--check" ]; then echo "NOT uploaded: $p"; bad=$((bad + 1)); continue; fi
  if git check-ignore -q -- "$p"; then
    printf '!/%s\n' "$(printf '%s' "$p" | sed 's/\[/\\[/g; s/\]/\\]/g')" >> .gitignore
  fi
  if git add -- "$p" .gitignore; then echo "added: $p"; fixed=$((fixed + 1)); else echo "could not add: $p"; bad=$((bad + 1)); fi
done < <(sort -u "$list")
rm -f "$list"

# index.html の版の番号（tools/stamp.pl）。直す時は書きなおし、--check の時は古くないかだけ見る
if [ "$mode" = "--check" ]; then perl tools/stamp.pl --check || bad=$((bad + 1)); else perl tools/stamp.pl; fi
echo "assets in use: $total, added now: $fixed, problems: $bad"
[ "$bad" -eq 0 ]
