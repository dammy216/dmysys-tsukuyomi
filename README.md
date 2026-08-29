# dmysys-tsukuyomi

キャラクター「ヤチヨ」の公開サイト（旧 yoccie-homepage）。Next.js 16 (App Router) + Three.js / React Three Fiber + Rive。

yachiyoGPT モノレポから分離した単独リポジトリ（mobile / server は元モノレポに残存）。
サイト本体は `frontend/` サブディレクトリ（旧 `yoccie-homepage/`）。

## 開発

```
cd frontend
bun install
bun run dev      # http://localhost:3000
bun run build
bun run lint
```

## 構成

```
frontend/         # サイト本体（App Router）
                  #   shared/   = 画面共通（layout: Header）
                  #   features/ = root / scenery / starfall-sea / scene-controls /
                  #               character-overlay / scene-recording / kaguya / yachiyo
rive/             # Web版キャラの Luau スクリプト（webYachiyo / webKaguya）+ watch_rive.py
.agents/skills/   # 技術リファレンス
```

詳細は [.claude/CLAUDE.md](.claude/CLAUDE.md) を参照。

## デプロイ

Vercel。Root Directory = `frontend`、install は `bun install`（`bun.lock` で自動判定）。
