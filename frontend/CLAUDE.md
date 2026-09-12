# frontend/ — Next.js 公開サイト

Next.js 16 (App Router)。ルート("/")は3Dサンドボックス（Three.js / React Three Fiber の実験場）。
画面のトグルUIから「かぐや」「ヤチヨ」の Rive キャラクター表示を重ねて切り替えられる。

パッケージマネージャは **bun**。コマンドはリポジトリルートの `.claude/CLAUDE.md` を参照。

## shared/（画面共通）

どの画面でも使う横断的なもの。現状は空（旧 `shared/layout/Header` は撤去）。
汎用UIパーツが増えたら `shared/ui/` を作る。特定 feature でしか使わないものは feature 側に置く。

## スタイル（Tailwind v4）

スタイルは **Tailwind のみ**。CSS Modules は使わない。

- HUDの共通トークンは `app/globals.css` の `@theme`: `--color-hud`（水色）/ `--color-hud-glass`
  （濃紺ガラス地）。CharacterOverlay のかぐや/ヤチヨパネルが使う。`bg-hud/14` のように使う。
  ビューポート一式(`features/editor/`)は別系統の `--color-ed-*`（ダークグレー＋ティール）。
- 押下トグルは `aria-pressed` を要素に付け、`aria-pressed:` バリアントで見た目を変える
  （JSで active クラスを足さない）。`hover:` は v4 が自動でタッチ端末を除外する。
- 繰り返す長いクラス列はコンポーネント冒頭で `const PILL = "..."` のように定数化する。
- グラデ枠・多重shadow は arbitrary value（`bg-[linear-gradient(...)]` 等）。

## features/（feature-based 構成）

ルート("/")の3Dシーンは複数の feature に分割してある。新規コードは既存の feature に合わせて配置する。

| feature | 役割 |
|---|---|
| `root/` | ページ本体。副作用フックの配線・R3F `<Canvas>`・`useFrame` 演出ロジック・演出定数(`timings.ts`)・UI状態ストア(`store.ts`) |
| `scenery/` | 静的な景観（鳥居・水面/海のグロー・灯籠・空背景） |
| `starfall-sea/` | 「星降る海」演出モード（魚群・専用カメラ・流れ星・鳥居ホログラム・泡・水中エフェクト・専用BGM） |
| `scene-controls/` | ビューポート左上の方位計 `Compass`（DOM。カメラの向き(度)だけを表示。旧・方位磁石UIとControlBarは廃止し、editor/のビューポート一式に統一した） |
| `editor/` | 3Dビューポート一式（ヘッダー＋`EditorViewport`＋`Compass`＋`EditorFpsBadge`＋`EditorModeBar`）。**通常画面・編集モードの両方で共通のコンポーネント**（ユーザー指定でControlBarを廃止し統一）。ヘッダーは編集モードでは「VIEWPORT」見出し+「編集モード終了」、通常画面では空の見出し+「ライセンス」ボタン（Credits.tsx。初期値非表示）。`EditorModeBar` はビューポート直下（DOM）に Reply開始/停止・自由視点・画面比率を常設し、通常画面のときだけ かぐや/ヤチヨ表示・星降る海・編集モードへの入口も出す（`siteControls` prop）。編集モード（「編集」ボタン or `L`キー。本番でも使える）に入ると Theatre.js Studio 風の3ペイン（左=Outline / 右=Details / 下=Sequence Editor）が追加で開く。シーク/再生バー（`EditorToolbar`）は Sequence Editor パネルの見出しを兼ねる。抜けるのは編集画面ヘッダーの「編集モード終了」or `L` |
| `character-overlay/` | かぐや・ヤチヨの Rive を3Dに重ねるドラッグ可能パネル `CharacterOverlay`（DOM） |
| `kaguya/` `yachiyo/` | 各キャラの Rive コンポーネント |

各 feature 内のコンポーネント一覧・依存関係・どこで使われているかは `/graphify`（knowledge graph）で参照する。

feature 間は `index.ts` バレル経由で `@/features/<name>` から import する。

### シーンの状態管理は2層

- **UIステート**（`showKaguya` / `starfallSea` / `showCredits` など、ボタン操作で変わる値）は
  `@/features/root/store` の `useSceneStore`（zustand）。`EditorModeBar` `CharacterOverlay`
  `SceneContents` が必要なキーだけを selector で購読する。`<Canvas>` 境界を越えて購読できる。
  協調更新（星降る海ON時にヤチヨ自動表示など）は store のアクションにまとめる。
- **毎フレーム変わる演出値**（activation の進行度など）は従来どおり `SceneContents` 内の `ref`。
  state 化すると数千匹の `StarfallSwarm` を含むツリーが毎フレーム再レンダーされるため。

### R3F パフォーマンス規約

- `useFrame` の中で `new ...()` や `.clone()` をしない（`@react-three/eslint-plugin` が弾く）。
  `useMemo` か、コンポーネント外の共有参照で一度だけ作る。
- GPU 資源（テクスチャ等）は外れるときに `dispose()` する。
- 演出のチューニング定数は `features/root/timings.ts`。

## リファレンス

`.agents/skills/react-three-fiber/` `threejs-animation/` `threejs-shaders/` `vertical-slice-architecture/`。

### タイムライン/キーフレームアニメーション(カメラワーク等)

**Theatre.js は使わない**(過去に導入したが撤去済み)。GUIエディタでの調整が
コード側と自動で同期しないため、AIが下書きしたキーフレームを都度手動で
Studioへ流し込む/エクスポートし直す運用が実運用に見合わず、外した経緯がある。

代わりに、キーフレーム配列と定数は**コードが唯一の正**として feature 内に置き、
曲の再生位置(`songTime`)や経過時間で直接補間する(`useFrame` の中で毎フレーム):

- `features/reply/dronePathData.ts` の `DRONE_PATH` 配列(型・補間関数は
  `dronePathType.ts` の `sampleDrone()`)。**曲の頭(0秒)から最後まで1本**の
  ノンループ航路を、曲の再生位置に直接刺す。0〜11秒の組み上げ周回も
  このキーフレームに含まれる(旧 `BUILD_ORBIT_DEFAULTS` の parametric 周回を
  標本化したもの。`turn` は 0〜11秒で1周まわるぶん 11秒以降が +1.0 されている)
- `features/reply/replyTimelineData.ts` の `REPLY_TIMELINE`
  (**カメラ以外の Reply の演出**。天守の組み上げ・照明の点灯・ステージ/鳥居/
  ホログラム・灯籠の集合・花火・11秒の閃光・曲の演出強度・終わりのフェードを、
  オブジェクトごとのキーフレームで持つ。型とトラックの仕様は `replyTimeline.ts`、
  実行時の可変コピーは `replyTimelineStore.ts`)。
  **もとは `SceneContents.tsx` の `useFrame` に命令的な計算として散らばっていた**
  (`REPLY_BUILD_END_SECONDS` などの定数を `clamp`/`smoothstep` に通す形)。
  どの時刻に何が起きるかがコードの奥の条件分岐に埋まっていて追いづらく、
  編集モードからも触れなかったので、ドローンと同じ表へ寄せてある
- `features/reply/cameraFeelDefaults.ts` の `CAMERA_FEEL_DEFAULTS`
  (バンク・揺れ・追従。SPECS・store本体は `cameraFeelParams.ts`)
- `features/starfall-sea/StarfallCamera.tsx` の `PATH` 配列 + `samplePath()`
  (`CYCLE_SECONDS` 周期でループする航路)

補間の実体(PCHIP)は `features/reply/timelineType.ts` に共通化してあり、
ドローン航路も `REPLY_TIMELINE` もこれを使う。**曲の再生位置だけで決まらない
動き**(再生/停止のフェード、止めたときの灯籠のゆっくりした戻り)は
タイムラインに載せず、`SceneContents` 側で掛け合わせる。

コードの数値を書き換えて保存すれば Fast Refresh でそのまま反映される。

**編集モード(`EditorModeBar` の「編集」ボタン or `L`キー。本番でも使える)では GUI からも触れる**。`features/editor/` の
3ペインUI(Outline / Details / Sequence Editor)が上記の値を実行時ストア
(`useDronePathStore` / `useReplyTimelineStore` / `useCameraFeelStore`)経由で
書き換え、3D画面に即反映する。ただし**その変更はブラウザ上の下書き**で、
リロードするとコードの既定値へ戻る。気に入った値は Details パネルの
「コードとしてコピー」で書き出す。

Outline に並ぶオブジェクトは `features/editor/editorStore.ts` の `EDITOR_OBJECTS`。
Drone Path と Camera Feel のほかに、`REPLY_TRACKS`(`replyTimeline.ts`)の
トラックが自動で並ぶので、**Reply の演出オブジェクトを増やすときは
`REPLY_TRACKS` に1件足すだけ**でよい。キーフレームを持つオブジェクトは
`features/editor/keyframeTarget.ts` が同じ形(`KeyframeTarget`)に均していて、
Sequence Editor と Details はオブジェクトの種類を区別しない。

キーフレームの追加・削除もできる: Sequence Editor のトラックを
**右クリック**でその時刻に追加(挿入時点の補間値が初期値になるので
追加した瞬間も見た目が変わらない)、Details パネルの `×` ボタンで
選択中のキーフレームを削除(成立に必要な最低2点は残す)。

**キーフレーム間の補間は単調3次エルミート(PCHIP)**(`timelineType.ts` の
`sampleTimeline()`)。区間ごとに `smoothstep` を掛ける実装にしてはいけない
— smoothstep は両端の微分が0なので、**キーを通過するたびにカメラが一瞬
止まる**(実際そうなっていた)。各キーの接線を前後のキーから決めて左右で
共有することで速度を繋いである(Theatre.js / Blender の「自動」タンジェントと
同じ考え方)。単純な Catmull-Rom ではなく PCHIP なのは、山/谷になっている
キーでカーブが元の値を飛び越して膨らむのを防ぐため(例: 11秒の引きは
radius が 11.5 → 53 → 45 と折り返す)。0〜1に収まるべき進行度が
1を超えて膨らまないのも同じ性質による。

この性質から、**2点だけの区間はちょうど直線**、**前後が平らなキーに挟まれた
区間はちょうど smoothstep** になる。`REPLY_TIMELINE` が移行前の
`clamp`/`smoothstep` をそのまま再現できているのはこれを使っているため
(キーを足し引きするとカーブの形も変わるので注意)。

**上の `dronePathData.ts` / `replyTimelineData.ts` / `cameraFeelDefaults.ts` は
「コードとしてコピー」の貼り付け先として、値の定義だけを置く専用ファイルに
してある**(SPECS・store・型と分離)。コピーした内容はそのファイルの`import`文を含む**完全な内容**なので、
そのファイルを開いて全選択→貼り付けするだけで確定できる(値の意味を
説明する `/** ... */` コメントや、Drone Pathの区間コメント`// サビ:...`も
コピー結果に含めてあるので、丸ごと貼り替えても消えない)。
GUIとコードを自動同期させない = Theatre.js を外した理由そのものなので、
この一方通行は意図的な設計。

GUIでの変更は `Ctrl+Z`/`Ctrl+Y`(`Ctrl+Shift+Z`も可)でUndo/Redoできる
(`features/editor/editorHistory.ts`。Drone Path・Reply Timeline・Camera Feel の
3ストアをまとめて1つの履歴として扱う)。ドラッグのような連続操作は
`beginGesture()`/`endGesture()` で区間を明示し、指を離すまでの変化を
Undo1回ぶんにまとめる(時間デバウンスだけだとドラッグが長引いたときに
指を離す前に確定してしまうため)。

Outline / Details / Sequence Editor の3ペインの大きさは境界線をドラッグして
変えられる(`features/editor/useResizableEdge.ts`。EditorViewportの3D
ビューポート箱のリサイズと同じ操作感)。サイズは localStorage に覚える。

`ReplyCamera` はこれらのストアを**購読せず** `getState()` で毎フレーム読む
(購読すると数千匹の `StarfallSwarm` を含むツリーが毎フレーム再レンダーされる)。
