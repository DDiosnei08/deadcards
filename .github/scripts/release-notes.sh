#!/usr/bin/env bash
# Uso: release-notes.sh <tag-anterior>. Imprime commits e issues resolvidas desde a tag anterior.
set -euo pipefail
prev="${1:-}"
range="${prev:+$prev..}HEAD"
since=$([ -n "$prev" ] && git log -1 --format=%cI "$prev" || echo 1970-01-01T00:00:00Z)

echo "## O que mudou"
echo
git log "$range" --no-merges --pretty='- %s — %an' | grep -v 'chore(release)' || echo "- Sem commits novos"

issues=$(gh issue list --state closed --limit 100 --search "closed:>$since reason:completed" \
  --json number,title,author --jq '.[] | "- #\(.number) \(.title) (reportada por @\(.author.login))"')
if [ -n "$issues" ]; then
  echo
  echo "## Issues resolvidas"
  echo
  echo "$issues"
fi

echo
echo "Obrigado a todo mundo que contribuiu, reportou bugs e sugeriu ideias nesta versão! 💜"
