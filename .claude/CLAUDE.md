# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**dmysys-tsukuyomi** — キャラクター「ヤチヨ」の公開サイト（旧 yoccie-homepage）。
**yachiyoGPT モノレポから分離した単独リポジトリ**（mobile アプリと server は元モノレポに残っている）。

- **frontend/** — Next.js 16 (App Router) 製の公開サイト。ルート("/")は3Dサンドボックス
  （Three.js / React Three Fiber の実験場）。画面のトグルUIから「かぐや」「ヤチヨ」の
  Rive キャラクター表示を重ねて切り替えられる。→ 詳細は `frontend/CLAUDE.md`
- **rive/** — Rive エディタ上で動く **Luau スクリプト**（Node Script）。Web版キャラの制御のみ。
  → 詳細は `rive/CLAUDE.md`

## トップレベル構成

```
frontend/        # Next.js サイト本体（App Router） — frontend/CLAUDE.md
rive/            # Web版キャラの Luau スクリプト + watch_rive.py — rive/CLAUDE.md
.agents/skills/  # 各技術のリファレンス（後述）
.claude/agents/  # カスタムエージェント（後述）
.mcp.json        # Rive MCP サーバー設定（Riveエディタ起動中のみ使用可能）
```

ディレクトリごとの詳しい規約は、そのディレクトリの `CLAUDE.md`（`frontend/CLAUDE.md` /
`rive/CLAUDE.md`）に置いてある。配下のファイルに触れると自動で読み込まれる。

## コマンド

パッケージマネージャは **bun**。

```
cd frontend
bun install          # 依存インストール（bun.lock を生成/更新）
bun run dev          # 開発サーバー
bun run build        # 本番ビルド
bun run lint         # eslint
bun x tsc --noEmit   # 型チェック
```

`package.json` を手編集したら `bun install` し直して `bun.lock` も一緒にコミットする。

## デプロイ（Vercel）

Vercel はこのリポジトリに接続し、**Root Directory = `frontend`** でビルドする。
`bun.lock` があるので install は自動で `bun install` になる。Install Command を
ダッシュボードで npm に上書きしないこと。

## スキル・リファレンスの場所

`.agents/skills/` に各技術のリファレンスが集約されている（索引のみ。中身は各ディレクトリ配下の
`CLAUDE.md` から必要に応じて参照する）：

- Rive 系: `rive-scripting/rules/` `rive/references/` `rive-animations/`
- Three.js 系: `threejs-animation/` `threejs-shaders/` `react-three-fiber/`
- アニメーション編集(Theatre.js): `theatre-js/`。**タイムライン/キーフレームアニメーションを
  実装・修正するときは着手前に必ず読む。** ただしこのプロジェクトは `@theatre/r3f`(スキルの
  「R3F Scene」例が使っているもの)を**使わない**— `@react-three/fiber ^8` 固定で2022年から
  更新が止まっており、このプロジェクトの `@react-three/fiber ^9` と非互換のため。代わりに
  `@theatre/core` + `@theatre/studio` を直接使う、共有初期化は
  `frontend/features/root/theatre.ts`(`sceneProject`/`getStudio`/`exposeDevSeed`)経由。
  詳細は `frontend/CLAUDE.md`。
- 設計: `vertical-slice-architecture/`

（元モノレポの mobile / server 用スキル（`fastapi-python` `fish-audio-sdk` `gemini-live-api-dev`
`vercel-react-native-skills` `runpodctl`）はこのリポジトリでは使わないため削除済み。）

### スキルの管理方式（2系統）

- **外部ソース + ロック管理**: `rive` / `rive-scripting` / `rive-animations` /
  `vertical-slice-architecture` / `theatre-js`。取得元とハッシュを `skills-lock.json` で管理する。
  スキルを追加・削除したら `.agents/skills/` と `skills-lock.json` を同期させること。
- **ローカル管理（ロック対象外）**: `react-three-fiber` / `threejs-animation` /
  `threejs-shaders`。外部ソースが無くこのリポジトリ内で直接編集する。`skills-lock.json` には載せない。

## カスタムエージェント

`.claude/agents/` に2つ。ドメイン規約とスキル参照を前ロードしてある。

- `rive-luau` — `rive/animations/*.lua` の実装・修正。ViewModel バインド、pointer イベント。
- `r3f-scene` — `frontend/features/` の R3F / Three.js / GLSL / 演出タイミング。

### 委譲の方針

**まとまった作業だけ**、明示指示がなくても対応エージェントに委譲してよい。
「まとまった」= 複数ファイルにまたがる実装／アルゴリズムやアニメーションロジックの検討／
シェーダーの新規作成、など。

- `rive/animations/*.lua` のロジック実装・変更 → `rive-luau`
- `frontend/features/` の R3F / Three.js / GLSL / 演出ロジックの実装 → `r3f-scene`

以下は**必ずインライン**で対応する（委譲のコールドスタートが割に合わない）：

- 1〜2行の修正、定数・パラメータの調整、`import` の追加
- 「どこで使ってる」系の調査（組み込みの Explore で足りる）
- DOM の HUD の見た目、設定ファイル、`skills-lock.json` などの管理作業

コストが想定より高ければこの節ごと外してよい（その場合は毎回ユーザーが明示的に呼ぶ運用になる）。

## knowledge graph（graphify）

`graphify-out/graph.json`（gitignore、派生物）。MCP は使わず CLI を直接叩く。抽出対象の除外は `.graphifyignore`。

- **効くのは `graphify explain "<シンボル名>"`** — 定義位置・どこから import されてるか・何を呼んでるかを
  行番号付きで返す。`frontend/` の TS では grep より速い。
- `graphify path "A" "B" --undirected` も一応使える（グラフが疎なので `--undirected` 推奨）。
- `graphify query "..."` と community 命名は **LLM API キーが要る**（未設定なら精度が出ないので使わない）。
- `rive/*.lua` は Luau 抽出が部分失敗するので当てにしない。

**オンデマンド更新**。グラフに頼る前に `graphify . --code-only --update` → `graphify cluster-only .`。
毎回は不要。feature 追加・ファイル移動・大きめリファクタの後、または `fail-closed` 警告が出たら再抽出。

# 重要事項

## 実装前のルール

- **指示にあいまいなところがあれば、実装を始める前にユーザーに質問すること。**
  勝手に解釈して進めない。特に次のような場合：
  - 参照(「〜みたいに」「さっきの」)が複数の解釈を持つとき
  - 数値・タイミング・色・配置など、指定が曖昧または欠けているとき
  - どのファイル／機能を指しているか一意に定まらないとき
  - トレードオフのある設計判断（既存挙動を変える／排他にする 等）
- 質問は簡潔に、選択肢を添えて。推奨案があれば先頭に置く。
- 明らかに自明なデフォルトがある些細な点は、質問せず進めて回答内で明記するだけでよい。

## 回答時のルール

- 必ず日本語で答えること
- コードを書き換えたとき・コードについて説明するときは、ユーザーがその箇所へ直接飛べるよう
  **markdownリンクを付ける**こと。バッククォートでのファイル名表記だけで済ませない。
  - ファイル: `[webKaguya.lua](rive/animations/webKaguya/webKaguya.lua)`
  - 特定行: `[webKaguya.lua:1087](rive/animations/webKaguya/webKaguya.lua#L1087)`
  - 行範囲: `[webKaguya.lua:1080-1095](rive/animations/webKaguya/webKaguya.lua#L1080-L1095)`
  - フォルダ: `[frontend/features/](frontend/features/)`
  - パスはワークスペースルートからの相対パスで書く
- 定数やパラメータの値を変更した場合は、その定数が定義されている行へのリンクを添えること
  （例: `HAIR_SPREAD_DRIVE` を変更したなら定義行へのリンク）
