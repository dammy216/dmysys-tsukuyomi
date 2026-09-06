# frontend/ — Next.js 公開サイト

Next.js 16 (App Router)。ルート("/")は3Dサンドボックス（Three.js / React Three Fiber の実験場）。
画面のトグルUIから「かぐや」「ヤチヨ」の Rive キャラクター表示を重ねて切り替えられる。

パッケージマネージャは **bun**。コマンドはリポジトリルートの `.claude/CLAUDE.md` を参照。

## shared/（画面共通）

どの画面でも使う横断的なもの。現状は `shared/layout/`（`Header` のみ。全ページで `app/layout.tsx`
から表示）。汎用UIパーツが増えたら `shared/ui/` を作る。特定 feature でしか使わないものは
feature 側に置く。

## スタイル（Tailwind v4）

スタイルは **Tailwind のみ**。CSS Modules は使わない。

- HUDの共通トークンは `app/globals.css` の `@theme`: `--color-hud`（水色）/ `--color-hud-glass`
  （濃紺ガラス地）/ `--color-hud-pink`（星降る海）/ `--color-hud-rec`（録画）。`bg-hud/14` のように使う。
- 押下トグルは `aria-pressed` を要素に付け、`aria-pressed:` バリアントで見た目を変える
  （JSで active クラスを足さない）。`hover:` は v4 が自動でタッチ端末を除外する。
- 繰り返す長いクラス列はコンポーネント冒頭で `const PILL = "..."` のように定数化する。
- グラデ枠・多重shadow は arbitrary value（`bg-[linear-gradient(...)]` 等）。録画の点滅は
  `@theme` の `--animate-record` → `animate-record`（`motion-reduce:animate-none` 併用）。
- 例外は `.scene-stats`（globals.css）のみ。stats.js が挿す React 外の DOM に `classList` で
  当てるため Tailwind が使えない。

## features/（feature-based 構成）

ルート("/")の3Dシーンは複数の feature に分割してある。新規コードは既存の feature に合わせて配置する。

| feature | 役割 |
|---|---|
| `root/` | ページ本体。副作用フックの配線・R3F `<Canvas>`・`useFrame` 演出ロジック・演出定数(`timings.ts`)・UI状態ストア(`store.ts`) |
| `scenery/` | 静的な景観（鳥居・水面/海のグロー・灯籠・空背景） |
| `starfall-sea/` | 「星降る海」演出モード（魚群・専用カメラ・流れ星・鳥居ホログラム・泡・水中エフェクト・専用BGM） |
| `scene-controls/` | 下部HUDコントロールバー `ControlBar`（DOM） |
| `editor/` | 編集モード（`L`キー・開発時のみ）のUI一式。Theatre.js Studio 風の3ペイン（左=Outline / 右=Details / 下=Sequence Editor）。シーク/再生バー（`EditorToolbar`）は Sequence Editor パネルの見出しを兼ねる。Reply開始/停止・自由視点（`EditorModeBar`）はビューポート直下（DOM） |
| `character-overlay/` | かぐや・ヤチヨの Rive を3Dに重ねるドラッグ可能パネル `CharacterOverlay`（DOM） |
| `scene-recording/` | WebGLキャンバス + 音声の webm 録画 |
| `kaguya/` `yachiyo/` | 各キャラの Rive コンポーネント |

各 feature 内のコンポーネント一覧・依存関係・どこで使われているかは `/graphify`（knowledge graph）で参照する。

feature 間は `index.ts` バレル経由で `@/features/<name>` から import する。

### シーンの状態管理は2層

- **UIステート**（`showKaguya` / `skyVariant` / `starfallSea` など、ボタン操作で変わる値）は
  `@/features/root/store` の `useSceneStore`（zustand）。`ControlBar` `CharacterOverlay`
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
  `dronePathType.ts` の `sampleDrone()`)。11秒以降。曲の再生位置に直接刺す
  ノンループの航路
- `features/reply/buildOrbitDefaults.ts` の `BUILD_ORBIT_DEFAULTS`
  (0〜11秒の周回。SPECS・store本体は `buildOrbitParams.ts`)
- `features/reply/cameraFeelDefaults.ts` の `CAMERA_FEEL_DEFAULTS`
  (バンク・揺れ・追従。SPECS・store本体は `cameraFeelParams.ts`)
- `features/starfall-sea/StarfallCamera.tsx` の `PATH` 配列 + `samplePath()`
  (`CYCLE_SECONDS` 周期でループする航路)

コードの数値を書き換えて保存すれば Fast Refresh でそのまま反映される。

**編集モード(`L`キー・開発時のみ)では GUI からも触れる**。`features/editor/` の
3ペインUI(Outline / Details / Sequence Editor)が上記の値を実行時ストア
(`useDronePathStore` / `useBuildOrbitStore` / `useCameraFeelStore`)経由で
書き換え、3D画面に即反映する。ただし**その変更はブラウザ上の下書き**で、
リロードするとコードの既定値へ戻る。気に入った値は Details パネルの
「コードとしてコピー」で書き出す。

Drone Path はキーフレームの追加・削除もできる: Sequence Editor のトラックを
**ダブルクリック**でその時刻に追加(挿入時点の補間値が初期値になるので
追加した瞬間は動きが変わらない)、Details パネルの `×` ボタンで選択中の
キーフレームを削除(航路として成立する最低2点は残す)。

**上の `*Data.ts` / `*Defaults.ts` は「コードとしてコピー」の貼り付け先
として、値の定義だけを置く専用ファイルにしてある**(SPECS・store・型と
分離)。コピーした内容はそのファイルの`import`文を含む**完全な内容**なので、
そのファイルを開いて全選択→貼り付けするだけで確定できる(値の意味を
説明する `/** ... */` コメントや、Drone Pathの区間コメント`// サビ:...`も
コピー結果に含めてあるので、丸ごと貼り替えても消えない)。
GUIとコードを自動同期させない = Theatre.js を外した理由そのものなので、
この一方通行は意図的な設計。

GUIでの変更は `Ctrl+Z`/`Ctrl+Y`(`Ctrl+Shift+Z`も可)でUndo/Redoできる
(`features/editor/editorHistory.ts`。Drone Path・Build Orbit・Camera Feel の
3ストアをまとめて1つの履歴として扱う)。ドラッグのような連続操作は
`beginGesture()`/`endGesture()` で区間を明示し、指を離すまでの変化を
Undo1回ぶんにまとめる(時間デバウンスだけだとドラッグが長引いたときに
指を離す前に確定してしまうため)。

Outline / Details / Sequence Editor の3ペインの大きさは境界線をドラッグして
変えられる(`features/editor/useResizableEdge.ts`。EditorViewportの3D
ビューポート箱のリサイズと同じ操作感)。サイズは localStorage に覚える。

`ReplyCamera` はこれらのストアを**購読せず** `getState()` で毎フレーム読む
(購読すると数千匹の `StarfallSwarm` を含むツリーが毎フレーム再レンダーされる)。
