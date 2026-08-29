# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**dmysys-tsukuyomi** — キャラクター「ヤチヨ」の公開サイト（旧 yoccie-homepage）。
**yachiyoGPT モノレポから分離した単独リポジトリ**（mobile アプリと server は元モノレポに残っている）。
サイト本体は `frontend/` サブディレクトリ（旧 `yoccie-homepage/`）。

- **frontend/** — Next.js 16 (App Router) 製の公開サイト。ルート("/")は3Dサンドボックス
  （Three.js / React Three Fiber の実験場）。画面のトグルUIから「かぐや」「ヤチヨ」の
  Rive キャラクター表示を重ねて切り替えられる。
- **rive/** — Rive エディタ上で動く **Luau スクリプト**（Node Script）。Web版キャラの制御のみ。
  - `rive/animations/webYachiyo/WebYachiyo.lua` — ヤチヨ
  - `rive/animations/webKaguya/webKaguya.lua` — かぐや
  - `rive/scripts/watch_rive.py` — `.lua` の保存を監視し MCP 経由で Rive のスクリプトへ反映（要 Rive 起動）

`.riv` ファイル本体は Rive エディタが管理しており、このリポジトリには含まれない。
書き出した `.riv` を `frontend/public/` 側に置いて読み込む。
Luau スクリプトはファイルで編集し、Rive エディタに貼り付けて適用する運用。

## トップレベル構成

```
frontend/        # Next.js サイト本体（App Router）
                 #   features/ に sandbox（Sandbox3D / CharacterOverlay）/ kaguya / yachiyo
rive/            # Web版キャラの Luau スクリプト + watch_rive.py
.agents/skills/  # 各技術のリファレンス（後述）
.mcp.json        # Rive MCP サーバー設定
```

`features/<機能>/{components,hooks,services,types}` の **feature-based** 構成。
新規コードは既存の feature 分割に合わせて配置する。

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

## Luau スクリプトの書き方

`rive/animations/` の `.lua` を編集し、Riveエディタのスクリプトパネルに貼り付けて使う。

### ViewModelアクセスのパターン（このプロジェクトで使う方式）

`context:viewModel()` + `Property.value` 方式を使う（`getViewModel()` や `setNumber()` 方式と混同しないこと）：

```lua
function init(self: MyNode, context: Context): boolean
    local vm = context:viewModel()
    if not vm then return false end
    self.vmPropX = vm:getNumber("propName")  -- Property<number>? を保持
    return true
end

function advance(self: MyNode, seconds: number): boolean
    if self.vmPropX then self.vmPropX.value = 42.0 end  -- .value で書き込み
    return true
end
```

### ポインタイベント

シグネチャは `(self, event: PointerEvent)`。座標は `event.position.x / .y`。`event:hit()` でアートボード全体を当たり判定にする。

```lua
function pointerMove(self: MyNode, event: PointerEvent)
    self.mouseX = event.position.x
    self.mouseY = event.position.y
    event:hit()
end
```

`watch_rive.py` は `python rive/scripts/watch_rive.py` で起動。`.lua` を保存するたびに MCP の
text_editor で Rive のスクリプトをライブ更新する（ファイル名→スクリプト名は同スクリプト内の `SCRIPT_MAP` で対応）。

## ヤチヨのViewModelプロパティ名

| プロパティ名 | 対象ノード | 用途 |
|---|---|---|
| `irisRX` / `irisRY` | 右虹彩 | 目追従 X/Y |
| `irisLX` / `irisLY` | 左虹彩 | 目追従 X/Y |
| `eyelashRX` / `eyelashRY` | 右まつ毛 | 目追従（0.6/0.4倍） |
| `eyelashLX` / `eyelashLY` | 左まつ毛 | 目追従（0.6/0.4倍） |
| `eyewhiteRX` / `eyewhiteRY` | 右白目 | 目追従（0.2倍） |
| `eyewhiteLX` / `eyewhiteLY` | 左白目 | 目追従（0.2倍） |
| `eyebrowRX` / `eyebrowRY` | 右眉 | 目追従（0.15/0.1倍） |
| `eyebrowLX` / `eyebrowLY` | 左眉 | 目追従（0.15/0.1倍） |
| `faceY` | 顔 | 呼吸（基準値 494.0） |
| `backHairY` | 後ろ髪 | 呼吸（0.6倍、基準値 494.0） |
| `neckY` | 首 | 呼吸（基準値 -256.5） |
| `topwearY` | トップス | 呼吸（基準値 52.0） |
| `singAmplitude` | (入力) | 歌唱モード: React が歌唱音声の振幅(0〜1)を書き込み、スクリプトが自動口パク+体の弾みに変換 |

eyes グループのアートボード座標: `(505, 284)`（目追従の中心点）

## Riveエディタでしかできない操作

以下はコードから変更不可。Riveエディタ（GUI）で行う：

- ヒエラルキー上のノード構造の変更
- タイムラインアニメーションの追加・削除
- ViewModelプロパティの追加・削除・バインド設定
- ノードへのスクリプトのアタッチ

## スキル・リファレンスの場所

`.agents/skills/` に各技術のリファレンスが集約されている。このサイトで主に使うもの：

- `rive-scripting/rules/` — Luauスクリプトの書き方（node-scripts, pointer-events, data-binding, api-reference 等）
- `rive/references/` — Riveエディタの操作・機能リファレンス（animation-mode, data-binding, state-machine 等）
- `rive-animations/` — Riveアニメーション全般のリファレンス
- `threejs-animation/` — Three.js アニメーション（keyframe / skeletal / morph target / AnimationMixer）のリファレンス
- `threejs-shaders/` — Three.js シェーダー（GLSL, ShaderMaterial, uniforms）のリファレンス
- `react-three-fiber/` — React Three Fiber（R3F）のリファレンス（Canvas, useFrame, useThree, drei連携, パフォーマンス最適化等）

（`fastapi-python/` `fish-audio-sdk/` `gemini-live-api-dev/` `vercel-react-native-skills/` `vertical-slice-architecture/`
は元モノレポの mobile / server 用。このリポジトリでは基本使わない。）

## MCP サーバー

`.mcp.json` に Rive MCP サーバーの設定がある（`http://127.0.0.1:9791/mcp`）。Riveエディタが起動中のときのみ使用可能。

# 重要事項

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
