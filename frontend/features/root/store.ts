import { create } from "zustand";
import type { WebGLRenderer } from "three";

/**
 * 書き出し機能(features/recorder/)が Canvas 境界をまたいで R3F を手動駆動する
 * ための橋渡し。ExportSceneDriver が Canvas の内側から登録し、ExportPanel が
 * Canvas の外側から呼ぶ(R3F の advance/setSize/setDpr/setFrameloop はどれも
 * useThree() 経由でしか取れないため、store 越しに渡す)。
 */
export type ExportDriverHandle = {
  gl: WebGLRenderer;
  advance: (timestampSeconds: number) => void;
  setSize: (width: number, height: number) => void;
  setDpr: (dpr: number) => void;
  setFrameloop: (frameloop: "always" | "never") => void;
  getSize: () => { width: number; height: number; top: number; left: number };
  getDpr: () => number;
};

/**
 * ルート("/")3Dシーンの UI 状態。ボタン操作で変わる純粋な状態だけを持つ
 * (副作用フック useStarfallSong / useReplySong は RootScene に残す)。
 *
 * zustand ストアは React context を使わないモジュールシングルトンなので、
 * R3F の <Canvas> 境界をまたいで SceneContents からも直接購読できる。
 * 各コンポーネントは必要なキーだけを selector で購読し、無関係な変更では
 * 再レンダーされない。毎フレーム更新する演出値は従来どおり SceneContents 内の
 * ref で扱う(ストアには載せない)。
 */
type SceneState = {
  showKaguya: boolean;
  showYachiyo: boolean;
  /** 星降る海ボタンが押されているか(ユーザーの意思)。押した瞬間に true */
  starfallSea: boolean;
  /**
   * 映像＋音の再生が始まっているか。3Dシーンの演出・カメラ・ヤチヨの歌唱は
   * こちらで駆動する。starfallSea を押した次の tick で true になる
   * (useStarfallSong が RootScene 経由でセットする)。
   */
  starfallPlaying: boolean;
  /** Reply ボタンが押されているか(ユーザーの意思)。押した瞬間に true */
  reply: boolean;
  /**
   * starfallPlaying の Reply 版。江戸城・ステージ・ホログラムの演出と
   * かぐやの歌唱はこちらで駆動する(useReplySong が RootScene 経由でセット)。
   */
  replyPlaying: boolean;
  /**
   * 演出モード(星降る海 / Reply)中だけ意味を持つ。true でカメラの自動演出を
   * 止めて自由視点にする。どちらのモードでも同じボタンで切り替える。
   */
  freeCam: boolean;

  /**
   * 編集モード(本番でも使える。ビューポート下のバーの「編集」ボタン、または
   * `L`キー)。true の間はサイトのHUD(かぐやパネル/クレジット)を隠し、
   * Outline/Details/Sequence Editor の3ペインを出す。通常時と編集時で
   * ビューポート(Compass/FPS/EditorModeBar)自体は共通のコンポーネントを使う
   * (EditorLayout 参照)。
   */
  editorMode: boolean;
  /**
   * 編集モードの再生/一時停止。true で Reply の映像・音を止める
   * (= ReplyCamera は songTime が進まなくなるのでその位置の画を見続けられる)。
   */
  editorPaused: boolean;

  /**
   * ライセンス(Sketchfabモデルのクレジット表記)を出しているか。
   * ユーザー指定で初期値は非表示。ヘッダーの「ライセンス」ボタンで切り替える
   * (Credits.tsx 参照。表示自体は利用規約で必須だが、常時出しっぱなしに
   * しないためボタンの裏に置く)。
   */
  showCredits: boolean;

  /**
   * 動画書き出し(features/recorder/)が進行中か。true の間、EditorModeBar等の
   * 操作は書き出しを乱さないよう控える(ExportPanel側でモーダルにして塞ぐ)。
   */
  exporting: boolean;
  /** ExportSceneDriver(Canvas内)が登録する、Canvas境界をまたいだ手動駆動の橋渡し */
  exportDriver: ExportDriverHandle | null;

  toggleKaguya: () => void;
  toggleYachiyo: () => void;
  toggleStarfallSea: () => void;
  setStarfallPlaying: (playing: boolean) => void;
  toggleReply: () => void;
  setReplyPlaying: (playing: boolean) => void;
  toggleFreeCam: () => void;
  setFreeCam: (freeCam: boolean) => void;
  toggleEditorMode: () => void;
  setEditorPaused: (paused: boolean) => void;
  toggleCredits: () => void;
  setExporting: (exporting: boolean) => void;
  setExportDriver: (driver: ExportDriverHandle | null) => void;
};

export const useSceneStore = create<SceneState>((set) => ({
  showKaguya: false,
  showYachiyo: false,
  starfallSea: false,
  starfallPlaying: false,
  reply: false,
  replyPlaying: false,
  freeCam: false,
  editorMode: false,
  editorPaused: false,
  showCredits: false,
  exporting: false,
  exportDriver: null,

  toggleKaguya: () => set((s) => ({ showKaguya: !s.showKaguya })),
  toggleYachiyo: () => set((s) => ({ showYachiyo: !s.showYachiyo })),

  /*
    星降る海の ON/OFF に伴う協調更新を1アクションにまとめる。
    - 演出を始めるときは歌うヤチヨを見せたいので自動で表示する
    - Reply とは排他。曲が2つ重なるとカメラ制御も競合するため必ず落とす
    - 次に演出へ入るときは必ずアニメーションモードから始める
  */
  toggleStarfallSea: () =>
    set((s) => {
      const next = !s.starfallSea;
      return {
        starfallSea: next,
        // 再生開始は useStarfallSong が次の tick でセットする。OFF は即座に
        starfallPlaying: next ? s.starfallPlaying : false,
        reply: false,
        replyPlaying: false,
        showYachiyo: next ? true : s.showYachiyo,
        freeCam: false,
      };
    }),

  setStarfallPlaying: (starfallPlaying) => set({ starfallPlaying }),

  /*
    Reply の ON/OFF。星降る海と対になる協調更新。
    こちらはかぐやが歌うので、自動で表示するのはかぐや。

    editorPaused も必ず落とす。編集モードで一時停止したまま Reply を
    入れ直すと、useReplySong は映像を頭から再生し直すのに editorPaused が
    true のまま残り、「映像は鳴っているのにボーカルステムだけ止まる
    (=かぐやの口パクが死ぬ)」「ツールバーが▶表示のまま」という
    食い違いが起きていた。
  */
  toggleReply: () =>
    set((s) => {
      const next = !s.reply;
      return {
        reply: next,
        // 再生開始は useReplySong が次の tick でセットする。OFF は即座に
        replyPlaying: next ? s.replyPlaying : false,
        starfallSea: false,
        starfallPlaying: false,
        showKaguya: next ? true : s.showKaguya,
        freeCam: false,
        editorPaused: false,
      };
    }),

  setReplyPlaying: (replyPlaying) => set({ replyPlaying }),

  toggleFreeCam: () => set((s) => ({ freeCam: !s.freeCam })),
  setFreeCam: (freeCam) => set({ freeCam }),

  /*
    編集モードを抜けるときは一時停止も必ず解除する。止めたまま抜けると
    通常表示に戻ったのに映像が止まったままになり、原因が分かりにくい。
  */
  toggleEditorMode: () =>
    set((s) => {
      const next = !s.editorMode;
      return { editorMode: next, editorPaused: next ? s.editorPaused : false };
    }),

  setEditorPaused: (editorPaused) => set({ editorPaused }),

  toggleCredits: () => set((s) => ({ showCredits: !s.showCredits })),

  setExporting: (exporting) => set({ exporting }),
  setExportDriver: (exportDriver) => set({ exportDriver }),
}));
