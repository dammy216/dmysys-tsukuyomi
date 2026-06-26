# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

yachiyoGPT は、キャラクター「ヤチヨ」を Rive で動かすためのプロジェクト。
Riveエディタ上で動く **Luau スクリプト**（Node Script）を開発・管理し、キャラクターのパーツ素材も管理するリポジトリ。

`.riv` ファイル本体はRiveエディタが管理しており、このリポジトリには含まれない。
Luauスクリプトをファイルで編集し、Riveエディタに貼り付けて適用する運用。

## ディレクトリ構成

```
rive/
├── animations/          # Luau スクリプト置き場（Riveエディタに貼り付けて使う）
└── components/          # キャラクターパーツ素材（PSDからエクスポートしたPNG群）
    ├── ヤチヨベース_*/  # ベースボディ全パーツ
    ├── 差分口/          # 口の差分（口あ・口い・口お・口閉じ・よくわからん口）
    └── 差分目/          # 目の差分（半目・目とじ・目閉じ2）
```

各コンポーネントフォルダ内の `info.json` はパーツ構成メタデータ（front hair / back hair / face / eyebrow / eyelash / irides / eyewhite / mouth / neck / topwear 等）。

## Luau スクリプトの書き方

`rive/animations/` に `.lua` ファイルを作成し、Riveエディタのスクリプトパネルに貼り付けて使う。

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
| `singAmplitude` | (入力) | 歌唱モード: yoccie-homepage の React が音楽の振幅(0〜1)を書き込み、スクリプトが自動口パク+体の弾みに変換 |

eyes グループのアートボード座標: `(505, 284)`（目追従の中心点）

## Riveエディタでしかできない操作

以下はコードから変更不可。Riveエディタ（GUI）で行う：

- ヒエラルキー上のノード構造の変更
- タイムラインアニメーションの追加・削除
- ViewModelプロパティの追加・削除・バインド設定
- ノードへのスクリプトのアタッチ

## スキル・リファレンスの場所

`.agents/skills/` に Rive 関連のリファレンスが集約されている：

- `rive-scripting/rules/` — Luauスクリプトの書き方（node-scripts, pointer-events, data-binding, api-reference 等）
- `rive/references/` — Riveエディタの操作・機能リファレンス（animation-mode, data-binding, state-machine 等）

## MCP サーバー

`.mcp.json` に Rive MCP サーバーの設定がある（`http://127.0.0.1:9791/mcp`）。Riveエディタが起動中のときのみ使用可能。

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.
