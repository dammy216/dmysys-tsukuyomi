# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

yachiyoGPT は、キャラクター「ヤチヨ」を Rive で動かすためのプロジェクト。
Riveエディタ上で動く **Luau スクリプト**（Node Script）を開発・管理するリポジトリ。

`.riv` ファイル本体はRiveエディタが管理しており、このリポジトリには含まれない。
スクリプトをファイルで編集し、Riveエディタに貼り付けて適用する運用。

## スクリプト構成

```
scripts/
└── CharacterAnimation.lua   # rootノードにアタッチするメインスクリプト（唯一のスクリプト）
```

### CharacterAnimation.lua の役割

- **マウス目追従**: `pointerMove` / `pointerDown` でマウス座標を取得し、`advance` 内でViewModelのNumber プロパティ（`irisRX`, `irisRY` 等）を毎フレーム更新
- **呼吸**: `breathTime` を積算し、正弦波で `faceY`, `neckY`, `topwearY`, `backHairY` を上下させる
- rootノードにアタッチし、`event:hit()` でアートボード全体を当たり判定にしてどこでもポインタを受け取る

## Rive Luau API の重要ルール

ViewModelへのアクセス方法は `context:viewModel()` + `Property.value` 方式を使う（`getViewModel()` や `setNumber()` 方式と混同しないこと）：

```lua
function init(self: MyNode, context: Context): boolean
    local vm = context:viewModel()
    self.vmPropX = vm:getNumber("propName")  -- Property<number>? を保持
    return true
end

function advance(self: MyNode, seconds: number): boolean
    if self.vmPropX then self.vmPropX.value = 42.0 end  -- .value で書き込み
    return true
end
```

ポインタイベントのシグネチャは `(self, event: PointerEvent)` で、座標は `event.position.x / .y`。`event:hit()` で当たり判定を宣言する。

## Riveエディタでしかできない操作

以下はコードでは変更不可。Riveエディタ（GUI）での操作が必要：

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

## ViewModelプロパティ名の対応表（ヤチヨ）

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

eyes グループのアートボード座標: `(505, 284)`（目追従の中心点）
