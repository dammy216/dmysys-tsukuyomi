#!/usr/bin/env bash
# PostToolUse(Edit|Write|MultiEdit): 編集ファイルが frontend/ のコードなら
# ダーティマーカーを立てる。実際のチェックは Stop フックが1回だけ走らせる。
set -euo pipefail

file=$(node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{process.stdout.write(JSON.parse(d).tool_input.file_path||'')}catch{}})" 2>/dev/null || true)

case "$file" in
  *frontend*) : ;;
  *) exit 0 ;;
esac
case "$file" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.mts|*.cts) : ;;
  *) exit 0 ;;
esac

dir="${CLAUDE_PROJECT_DIR:-.}/.claude"
mkdir -p "$dir"
touch "$dir/.frontend-dirty"
