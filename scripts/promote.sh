#!/usr/bin/env bash
# Neemt nieuwe commits van een werkbranch (bv. een Claude-sessie) over op main met cherry-pick.
# Wordt uitgevoerd door de GitHub-actie (.github/workflows/deploy.yml).
#
# - Commits die al op main staan (ook als ze eerder gecherry-pickt werden) worden overgeslagen.
# - Merge-commits worden overgeslagen; hun inhoud komt via de gewone commits mee.
# - Bij een conflict stopt het script zonder iets op main te wijzigen.
#
# Gebruik: scripts/promote.sh <commit>   (standaard HEAD)
# Schrijft "changed=true|false" naar $GITHUB_OUTPUT als die bestaat.
set -euo pipefail

SRC="$(git rev-parse "${1:-HEAD}")"
TARGET="${PROMOTE_TARGET:-main}"
OUT="${GITHUB_OUTPUT:-/dev/null}"

git config user.name >/dev/null || git config user.name "github-actions[bot]"
git config user.email >/dev/null || git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

if ! git ls-remote --exit-code --heads origin "$TARGET" >/dev/null 2>&1; then
  echo "▶ '$TARGET' bestaat nog niet: wordt aangemaakt vanaf $SRC"
  git push origin "$SRC:refs/heads/$TARGET"
  echo "changed=true" >> "$OUT"
  exit 0
fi

git fetch --quiet origin "$TARGET"
git checkout --quiet -B "$TARGET" "origin/$TARGET"

# Wat staat er al op main? 1) commits die eerder overgenomen werden ("cherry picked from commit ...")
# en 2) de inhoud (patch-id) van recente commits op main.
DONE="$(git log --format=%B -n 2000 "$TARGET" | sed -n 's/.*cherry picked from commit \([0-9a-f]\{7,40\}\).*/\1/p')"
PATCHES="$(git log -p --no-merges -n 500 "$TARGET" | git patch-id --stable | cut -d' ' -f1)"

# kandidaten: commits van de werkbranch die niet in de geschiedenis van main zitten, oudste eerst
COMMITS=()
while read -r c; do
  [ -n "$c" ] || continue
  if grep -q "^${c}" <<<"$DONE"; then continue; fi
  pid="$(git show "$c" | git patch-id --stable | cut -d' ' -f1)"
  if [ -n "$pid" ] && grep -qx "$pid" <<<"$PATCHES"; then continue; fi
  COMMITS+=("$c")
done < <(git rev-list --reverse --no-merges "$SRC" --not "$TARGET")
if [ "${#COMMITS[@]}" -eq 0 ]; then
  echo "✔ Niets nieuws: alles van deze branch staat al op $TARGET."
  echo "changed=false" >> "$OUT"
  exit 0
fi

echo "▶ ${#COMMITS[@]} commit(s) overnemen op $TARGET:"
for c in "${COMMITS[@]}"; do
  echo "  - $(git log -1 --format='%h %s' "$c")"
  if ! git cherry-pick -x "$c" >/dev/null 2>&1; then
    if [ -z "$(git ls-files -u)" ] && git diff --cached --quiet; then
      echo "    (al aanwezig op $TARGET, overgeslagen)"
      git cherry-pick --skip >/dev/null 2>&1 || git cherry-pick --abort
      continue
    fi
    echo "::error::Conflict bij het overnemen van $(git log -1 --format='%h %s' "$c") op $TARGET. Er is niets gewijzigd aan $TARGET. Vraag Claude om de branch eerst bij te werken met '$TARGET' (git merge origin/$TARGET) en opnieuw te pushen."
    git cherry-pick --abort || true
    exit 1
  fi
done

if ! git push origin "$TARGET" 2>push.err; then
  cat push.err
  if grep -q "workflow" push.err; then
    echo "::error::GitHub weigert wijzigingen aan .github/workflows met het standaard-token. Voeg een geheim GH_PUSH_TOKEN toe (fine-grained token met Contents + Workflows: Read and write) of zet deze wijziging zelf op $TARGET."
  fi
  exit 1
fi
rm -f push.err
echo "changed=true" >> "$OUT"
echo "✔ $TARGET bijgewerkt."
