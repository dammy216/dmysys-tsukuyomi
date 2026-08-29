# yoccie-homepage

キャラクター「ヤチヨ」の公開サイト。Next.js 16 (App Router) + Three.js / React Three Fiber + Rive。

yachiyoGPT モノレポから分離した単独リポジトリ（mobile / server は元モノレポに残存）。

## 開発

```
cd yoccie-homepage
bun install
bun run dev      # http://localhost:3000
bun run build
bun run lint
```

## 構成

```
yoccie-homepage/  # サイト本体（App Router。features/ = sandbox / kaguya / character）
rive/             # Web版キャラの Luau スクリプト（webYachiyo / webKaguya）+ watch_rive.py
.agents/skills/   # 技術リファレンス
```

詳細は [.claude/CLAUDE.md](.claude/CLAUDE.md) を参照。

## デプロイ

Vercel。Root Directory = `yoccie-homepage`、install は `bun install`（`bun.lock` で自動判定）。
