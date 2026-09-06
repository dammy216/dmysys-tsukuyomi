import { create } from "zustand";
import { DRONE_PATH, type DroneKey } from "./dronePath";

/** DroneKey のうち編集パネルで数値入力できるフィールド(t は時刻なので固定) */
export type DroneKeyField = Exclude<keyof DroneKey, "t">;

type DronePathState = {
  /**
   * 実行時にカメラが実際に辿る航路。DRONE_PATH のコピーから始まり、
   * 編集モードの DronePathEditorPanel から書き換えられる。
   * ページを開き直すと DRONE_PATH の値に戻る(=永続化はしない下書き)。
   */
  keyframes: DroneKey[];
  setField: (index: number, field: DroneKeyField, value: number) => void;
  /**
   * キーフレームの時刻を動かす(タイムラインのドラッグ用)。
   * sampleDrone は配列が時刻順に並んでいる前提なので、隣のキーを追い越さない
   * よう前後のキーの間へ必ずクランプする。
   */
  setTime: (index: number, t: number) => void;
  /** DRONE_PATH の元の値に戻す */
  reset: () => void;
};

/** 隣り合うキーの間隔として最低限空ける秒数 */
const MIN_KEY_GAP = 0.05;

function cloneDronePath(): DroneKey[] {
  return DRONE_PATH.map((key) => ({ ...key }));
}

export const useDronePathStore = create<DronePathState>((set) => ({
  keyframes: cloneDronePath(),
  setField: (index, field, value) =>
    set((s) => ({
      keyframes: s.keyframes.map((key, i) =>
        i === index ? { ...key, [field]: value } : key,
      ),
    })),
  setTime: (index, t) =>
    set((s) => {
      const prev = s.keyframes[index - 1];
      const next = s.keyframes[index + 1];
      const min = prev ? prev.t + MIN_KEY_GAP : 0;
      const max = next ? next.t - MIN_KEY_GAP : t;
      const clamped = Number(Math.min(Math.max(t, min), max).toFixed(2));
      return {
        keyframes: s.keyframes.map((key, i) =>
          i === index ? { ...key, t: clamped } : key,
        ),
      };
    }),
  reset: () => set({ keyframes: cloneDronePath() }),
}));
