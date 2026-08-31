#!/usr/bin/env bash
# Stop フック: このターンで frontend/ のコードが編集されていたときだけ
# lint + 型チェックを1回走らせる。マーカーは mark-frontend-dirty.sh が立てる。
set -uo pipefail

marker="${CLAUDE_PROJECT_DIR:-.}/.claude/.frontend-dirty"
[ -f "$marker" ] || exit 0
rm -f "$marker"

cd "${CLAUDE_PROJECT_DIR:-.}/frontend" || exit 0
bun run lint && bun x tsc --noEmit
