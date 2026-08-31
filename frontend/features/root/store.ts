import { create } from "zustand";
import type { SkyVariant } from "@/features/scenery";

/**
 * ルート("/")3Dシーンの UI 状態。ボタン操作で変わる純粋な状態だけを持つ
 * (副作用フック useStarfallSong / useSceneRecorder は RootScene に残す)。
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
   * 映像＋音が揃って実際に再生が始まっているか。starfallSea が true でも
   * 読み込み中は false。3Dシーンの演出・カメラ・ヤチヨの歌唱はこちらで駆動し、
   * 押した瞬間に演出だけ進んで音とタイミングがずれるのを防ぐ。
   * 値は useStarfallSong が RootScene 経由でセットする。
   */
  starfallPlaying: boolean;
  /** 星降る海モード中だけ意味を持つ。true でカメラの自動演出を止めて自由視点にする */
  starfallFreeCam: boolean;

  toggleKaguya: () => void;
  toggleYachiyo: () => void;
  setSkyVariant: (variant: SkyVariant) => void;
  toggleStarfallSea: () => void;
  setStarfallPlaying: (playing: boolean) => void;
  toggleStarfallFreeCam: () => void;
};

export const useSceneStore = create<SceneState>((set) => ({
  showKaguya: false,
  showYachiyo: false,
  skyVariant: "dusk",
  starfallSea: false,
  starfallPlaying: false,
  starfallFreeCam: false,

  toggleKaguya: () => set((s) => ({ showKaguya: !s.showKaguya })),
  toggleYachiyo: () => set((s) => ({ showYachiyo: !s.showYachiyo })),
  setSkyVariant: (skyVariant) => set({ skyVariant }),

  /*
    星降る海の ON/OFF に伴う協調更新を1アクションにまとめる。
    - 演出を始めるときは歌うヤチヨを見せたいので自動で表示する
    - 次に星降る海へ入るときは必ずアニメーションモードから始める
  */
  toggleStarfallSea: () =>
    set((s) => {
      const next = !s.starfallSea;
      return {
        starfallSea: next,
        // 再生開始は useStarfallSong が読み込み完了時にセットする。OFF は即座に
        starfallPlaying: next ? s.starfallPlaying : false,
        showYachiyo: next ? true : s.showYachiyo,
        starfallFreeCam: false,
      };
    }),

  setStarfallPlaying: (starfallPlaying) => set({ starfallPlaying }),

  toggleStarfallFreeCam: () =>
    set((s) => ({ starfallFreeCam: !s.starfallFreeCam })),
}));
