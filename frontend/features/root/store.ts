import { create } from "zustand";
import type { SkyVariant } from "@/features/scenery";

/**
 * ルート("/")3Dシーンの UI 状態。ボタン操作で変わる純粋な状態だけを持つ
 * (副作用フック useStarfallSong / useReplySong / useSceneRecorder は
 * RootScene に残す)。
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
  skyVariant: SkyVariant;
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
   * Theatre.js の編集モード(開発時のみ。`L`キーで切り替え)。
   * true の間はサイトのHUD(ヘッダー/ControlBar/かぐやパネル/FPS/クレジット)を
   * すべて隠し、3Dキャンバスを中央のビューポートへ縮めて、まわりに
   * Theatre のパネル(左=Outline / 右=Details / 下=Sequence Editor)用の
   * 余白を空ける。操作系は EditorToolbar に集約する。
   */
  editorMode: boolean;
  /**
   * 編集モードの再生/一時停止。true で Reply の映像・音を止め、
   * ReplyCamera 側は songTime による Theatre シーケンス位置の上書きをやめる
   * (= タイムライン上のバーが動かなくなり、その位置の画を見続けられる)。
   */
  editorPaused: boolean;

  toggleKaguya: () => void;
  toggleYachiyo: () => void;
  setSkyVariant: (variant: SkyVariant) => void;
  toggleStarfallSea: () => void;
  setStarfallPlaying: (playing: boolean) => void;
  toggleReply: () => void;
  setReplyPlaying: (playing: boolean) => void;
  toggleFreeCam: () => void;
  toggleEditorMode: () => void;
  setEditorPaused: (paused: boolean) => void;
};

export const useSceneStore = create<SceneState>((set) => ({
  showKaguya: false,
  showYachiyo: false,
  skyVariant: "dusk",
  starfallSea: false,
  starfallPlaying: false,
  reply: false,
  replyPlaying: false,
  freeCam: false,
  editorMode: false,
  editorPaused: false,

  toggleKaguya: () => set((s) => ({ showKaguya: !s.showKaguya })),
  toggleYachiyo: () => set((s) => ({ showYachiyo: !s.showYachiyo })),
  setSkyVariant: (skyVariant) => set({ skyVariant }),

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
      };
    }),

  setReplyPlaying: (replyPlaying) => set({ replyPlaying }),

  toggleFreeCam: () => set((s) => ({ freeCam: !s.freeCam })),

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
}));
