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
