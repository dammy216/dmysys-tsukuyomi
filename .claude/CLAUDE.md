# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

yachiyoGPT は、キャラクター「ヤチヨ」を中心とした **モノレポ**。1つの Rive キャラクターを
複数のアプリで共有して動かす。

- **mobile/** — Expo (React Native) 製のモバイルアプリ。カメラ＋マイクで Gemini とマルチモーダル会話し、ヤチヨが応答音声に合わせて動く。
- **server/** — FastAPI + Socket.IO のリレーサーバー。Gemini Live と Fish Audio TTS を仲介する。
- **yoccie-homepage/** — Next.js 製の公開サイト。音楽再生に合わせてヤチヨが歌う（口パク＋弾み）。
- **rive/** — キャラクター「ヤチヨ」の Rive 素材と、Riveエディタ上で動く **Luau スクリプト**（Node Script）。

`.riv` ファイル本体は Rive エディタが管理しており、このリポジトリには含まれない。
各アプリは書き出した `.riv`（mobile は `mobile/assets/animations/yachiyo.riv`）をバンドルして読み込む。
Luau スクリプトはファイルで編集し、Rive エディタに貼り付けて適用する運用。

## トップレベル構成

```
mobile/          # Expo アプリ（features/ ごとに分割: camera / character / conversation / home）
server/          # FastAPI + Socket.IO（vertical slice。エントリ: main.py。sandbox/ は実験用の使い捨て）
yoccie-homepage/ # Next.js サイト（App Router。features/ に character / music / home / members）
rive/            # Rive 素材 + Luau スクリプト
.agents/skills/  # 各技術のリファレンス（Rive / Gemini Live / Fish Audio / FastAPI / React Native 等。後述）
.mcp.json        # Rive MCP サーバー設定
```

各アプリは共通して **feature-based** な構成（`features/<機能>/{components,hooks,services,types}` + `shared/` or `components/`）。
新規コードは既存の feature 分割に合わせて配置する。

## コマンド

各アプリは独立した依存を持つ。作業対象のディレクトリ内で実行する。

### mobile（Expo）
```
cd mobile
npm start            # Metro 起動（expo start）
npm run android      # Android 実機/エミュで起動（dev client 必須。expo-dev-client 使用）
npm run ios
npm run lint         # expo lint
```
`react-native-vision-camera` / `react-native-audio-record` などネイティブモジュールを使うため
Expo Go では動かない。`expo run:android` などで dev client をビルドして使う。

### server（FastAPI / Python）
```
cd server
uvicorn main:socket_app --host 0.0.0.0 --port 8080 --reload
```
`requirements.txt` は無く `.venv/` に依存が入っている。主な依存: `google-genai`, `python-socketio`,
`fastapi`, `uvicorn`, `python-dotenv`, `websockets`, `fishaudio`, `numpy`。
`server/.env` に `API_KEY`（Gemini）と `FISH_API_KEY` を置く（gitignore 済み）。

### yoccie-homepage（Next.js）
```
cd yoccie-homepage
npm run dev          # 開発サーバー
npm run build        # 本番ビルド
npm run lint
```

## エンドツーエンドのデータフロー（mobile 会話モード）

音声・映像会話は mobile → server → Gemini/Fish Audio を Socket.IO でリレーする構成。

1. mobile がマイク音声(PCM 16kHz, base64)とカメラフレーム(JPEG, base64)を `send_audio_chunk` / `send_image_frame` で送信（`mobile/features/conversation/services/socket.ts`）。
2. server（`server/features/conversation/` の session_runner）が sid ごとに Gemini Live セッションを張り、`media_streaming` slice がリアルタイム入力として転送。
3. Gemini は **AUDIO モダリティのみ**で応答（`gemini-3.1-flash-live-preview` は TEXT 非対応）。server は Gemini 音声を破棄し、`output_audio_transcription` の読み上げテキストをターン単位で集約する。
4. server がそのテキストを **Fish Audio TTS**（ヤチヨの声）で MP3 化し、`gemini_response`（音声バイト）→ `turn_complete` の順で mobile に emit。
5. mobile はターン完了時に MP3 を一括再生（`useGeminiSession.ts`）。録音とスピーカー再生は排他で切り替える。

server は Gemini Live の切断（~10分制限や GoAway）に対し `session_resumption` ハンドルで自動再接続し会話を継続する。sid 単位の状態は `infrastructure/session_store.py` の `SessionState` に集約。

### server の構成（vertical slice architecture）

機能（Socket.IO イベント）単位で slice を分割し、各 slice が自分のハンドラ＋処理を内包する。sid ごとの共有状態と外部クライアントは横断的関心事として `infrastructure/` に置く。

```
server/
├── main.py                  # 起動エントリ。各 slice の events を import してハンドラ登録
├── settings.py              # 設定・定数（Gemini/Fish Audio/ポート）+ .env 読み込み
├── infrastructure/          # 横断的関心事
│   ├── socket_server.py     # sio / app / socket_app
│   ├── gemini_client.py     # Gemini クライアント
│   ├── fish_audio_client.py # Fish Audio クライアント
│   └── session_store.py     # SessionState + SessionStore（sid ごとの状態）
└── features/
    ├── connection/          # connect / disconnect
    ├── conversation/        # start_session / end_session + 再接続ループ + Gemini 受信
    ├── media_streaming/     # send_audio_chunk / send_image_frame
    └── voice_response/      # 読み上げテキスト → Fish TTS → emit
```

新しい Socket.IO イベントを足すときは、対応する slice に `events.py` を作り `main.py` で import する（`@sio.event` は import 副作用でハンドラ登録される）。`services/` `utils/` `sandbox/` はライブ経路で未使用のデバッグ/実験コード。

`SERVER_URL` は `mobile/shared/config/env.ts` にハードコード。開発時は LAN の PC の IP に合わせて変更する。

## rive/ 詳細

```
rive/
├── animations/          # Luau スクリプト置き場（Riveエディタに貼り付けて使う）
│   ├── AIYachiyo/       # mobile 版キャラのスクリプト
│   └── webYachiyo/      # yoccie-homepage 版キャラのスクリプト
├── components/          # キャラクターパーツ素材（PSDからエクスポートしたPNG群）
│   ├── ヤチヨベース_*/  # ベースボディ全パーツ
│   ├── 差分口/          # 口の差分（口あ・口い・口お・口閉じ・よくわからん口）
│   └── 差分目/          # 目の差分（半目・目とじ・目閉じ2）
└── scripts/watch_rive.py  # .lua の保存を監視し MCP 経由で Rive のスクリプトへ反映（要 Rive 起動）
```

各コンポーネントフォルダ内の `info.json` はパーツ構成メタデータ（front hair / back hair / face / eyebrow / eyelash / irides / eyewhite / mouth / neck / topwear 等）。

`watch_rive.py` は `python rive/scripts/watch_rive.py` で起動。`.lua` を保存するたびに MCP の
text_editor で Rive のスクリプトをライブ更新する（ファイル名→スクリプト名は同スクリプト内の `SCRIPT_MAP` で対応）。

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

`.agents/skills/` に各技術のリファレンスが集約されている：

- `rive-scripting/rules/` — Luauスクリプトの書き方（node-scripts, pointer-events, data-binding, api-reference 等）
- `rive/references/` — Riveエディタの操作・機能リファレンス（animation-mode, data-binding, state-machine 等）
- `rive-animations/` — Riveアニメーション全般のリファレンス
- `fastapi-python/` — FastAPI / Python サーバーのリファレンス
- `fish-audio-sdk/` — Fish Audio SDK のリファレンス
- `gemini-live-api-dev/` — Gemini Live API のリファレンス
- `vercel-react-native-skills/rules/` — React Native のベストプラクティス（アニメーション・リスト最適化・ナビゲーション等）
- `vertical-slice-architecture/` — Vertical Slice Architecture のリファレンス（patterns-by-language, principles, testing）

## MCP サーバー

`.mcp.json` に Rive MCP サーバーの設定がある（`http://127.0.0.1:9791/mcp`）。Riveエディタが起動中のときのみ使用可能。

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

# 重要事項
必ず日本語で答えること