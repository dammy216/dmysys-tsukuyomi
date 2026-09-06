import { create } from "zustand";
import { DRONE_PATH } from "./dronePathData";
import { sampleDrone, type DroneKey } from "./dronePathType";

/** 航路として意味を持つために必要な最低キーフレーム数(始点・終点) */
const MIN_KEYFRAME_COUNT = 2;

/**
 * DroneKey のうち編集パネルで数値入力できるフィールド。
 * t(時刻)はタイムラインのドラッグ専用、note(区間コメント)は文字列なので
 * どちらも数値入力の対象からは除く。
 */
export type DroneKeyField = Exclude<keyof DroneKey, "t" | "note">;

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
  /**
   * 時刻 t の位置に新しいキーフレームを挿入する(タイムラインのダブルクリック用)。
   * 挿入時点の**補間後の値**(sampleDrone の結果)を初期値にするので、
   * 挿入した瞬間はカメラの動きが変わらない(そこから値を調整していく)。
   * 隣のキーと重ならないよう MIN_KEY_GAP だけ離す。
   * 戻り値は実際に挿入された配列上の添字(呼び出し側がそのキーを選択するため)。
   */
  insertKeyframe: (t: number) => number;
  /**
   * キーフレームを削除する。航路として意味を持つ最低数(MIN_KEYFRAME_COUNT)
   * は割らない(それ以下では削除しない)。
   */
  removeKeyframe: (index: number) => void;
  /**
   * キーフレーム配列をまるごと置き換える。Undo/Redo(editorHistory.ts)が
   * スナップショットを復元するためだけに使う一般公開のセッター。
   */
  setKeyframes: (keyframes: DroneKey[]) => void;
  /** DRONE_PATH の元の値に戻す */
  reset: () => void;
};

/** 隣り合うキーの間隔として最低限空ける秒数 */
const MIN_KEY_GAP = 0.05;

function cloneDronePath(): DroneKey[] {
  return DRONE_PATH.map((key) => ({ ...key }));
}

function keysEqual(a: DroneKey, b: DroneKey | undefined) {
  if (!b) return false;
  return (
    a.t === b.t &&
    a.turn === b.turn &&
    a.radius === b.radius &&
    a.y === b.y &&
    a.lookY === b.lookY &&
    a.fov === b.fov
  );
}

/**
 * 元の DRONE_PATH と1件でも食い違うか。
 * insertKeyframe/removeKeyframe で配列の**長さ**が変わっている場合、
 * 添字を直接突き合わせると存在しない要素を参照してしまう
 * (単純な値編集だけを想定していた頃の実装のままだと undefined.t で
 * 例外になっていた)。長さが違う時点で無条件に「元と違う」扱いにする。
 */
export function keyframesAreDirty(keyframes: DroneKey[]): boolean {
  if (keyframes.length !== DRONE_PATH.length) return true;
  return keyframes.some((k, i) => !keysEqual(k, DRONE_PATH[i]));
}

/**
 * 個々のキーフレームが元の DRONE_PATH の同じ添字と食い違うか
 * (タイムラインの菱形の色分け用)。配列の長さ自体が違う場合は
 * 添字の対応関係が意味を持たないので、無条件に「食い違う」扱いにする。
 */
export function keyframeIsDirty(keyframes: DroneKey[], index: number): boolean {
  if (keyframes.length !== DRONE_PATH.length) return true;
  return !keysEqual(keyframes[index], DRONE_PATH[index]);
}

export const useDronePathStore = create<DronePathState>((set, get) => ({
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
  insertKeyframe: (t) => {
    const { keyframes } = get();
    let insertAt = keyframes.findIndex((k) => k.t > t);
    if (insertAt === -1) insertAt = keyframes.length;
    const prev = keyframes[insertAt - 1];
    const next = keyframes[insertAt];
    const min = prev ? prev.t + MIN_KEY_GAP : 0;
    const max = next ? next.t - MIN_KEY_GAP : Number.POSITIVE_INFINITY;
    const clampedT = Number(
      Math.min(Math.max(t, min), Math.max(min, max)).toFixed(2),
    );
    // 挿入時点の補間後の値を初期値にする(挿入直後はカメラの動きが変わらない)
    const sample = { turn: 0, radius: 0, y: 0, lookY: 0, fov: 0 };
    sampleDrone(keyframes, clampedT, sample);
    const newKey: DroneKey = { t: clampedT, ...sample };
    set({
      keyframes: [
        ...keyframes.slice(0, insertAt),
        newKey,
        ...keyframes.slice(insertAt),
      ],
    });
    return insertAt;
  },
  removeKeyframe: (index) => {
    const { keyframes } = get();
    if (keyframes.length <= MIN_KEYFRAME_COUNT) return;
    set({ keyframes: keyframes.filter((_, i) => i !== index) });
  },
  setKeyframes: (keyframes) => set({ keyframes }),
  reset: () => set({ keyframes: cloneDronePath() }),
}));
