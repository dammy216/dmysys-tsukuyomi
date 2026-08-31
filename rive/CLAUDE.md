# rive/ — Web版キャラの Luau スクリプト

Rive エディタ上で動く **Luau スクリプト**（Node Script）。Web版キャラの制御のみ。

- `rive/animations/webYachiyo/WebYachiyo.lua` — ヤチヨ
- `rive/animations/webKaguya/webKaguya.lua` — かぐや
- `rive/scripts/watch_rive.py` — `.lua` の保存を監視し MCP 経由で Rive のスクリプトへ反映（要 Rive 起動）

`.riv` ファイル本体は Rive エディタが管理しており、このリポジトリには含まれない。
書き出した `.riv` を `frontend/public/` 側に置いて読み込む。
Luau スクリプトはファイルで編集し、Rive エディタに貼り付けて適用する運用。

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

## リファレンス

`.agents/skills/rive-scripting/rules/`（node-scripts, pointer-events, data-binding, api-reference 等）／
`.agents/skills/rive/references/`（animation-mode, data-binding, state-machine 等）／
`.agents/skills/rive-animations/`。

## MCP

`.mcp.json` の Rive MCP サーバー（`http://127.0.0.1:9791/mcp`）。Riveエディタ起動中のみ使用可能。
