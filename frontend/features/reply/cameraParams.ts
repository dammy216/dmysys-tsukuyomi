import { create } from "zustand";
import { STAGE_Y } from "./constants";

/**
 * ReplyCamera の「キーフレームではない」調整値(数値パラメータ)を、
 * 編集モードのパネルから触れるようにするためのストア群。
 *
 * DRONE_PATH(dronePath.ts)が時間軸を持つキーフレームなのに対し、こちらは
 * 曲全体に効く定数。どちらも「コードの既定値が正 / ここでの変更はブラウザ上の
 * 下書き」という同じ運用にしてある(気に入った値はパネルの「コードとして
 * コピー」で書き出し、下の *_DEFAULTS を手で書き換えて確定させる)。
 */

/** 数値パラメータの入力欄1つぶんの仕様。編集パネルはこの配列を舐めて描く */
export type ParamSpec<K extends string> = {
  key: K;
  label: string;
  /** ドラッグ1pxあたりの変化量。入力欄の step にも使う */
  step: number;
  /**
   * 既定値がコード上では式で書かれている場合の、その式(例 "STAGE_Y + 2")。
   * 「コードとしてコピー」で既定値のままの項目をベタ数値へ潰さないために使う
   * (潰すと STAGE_Y との連動が黙って切れてしまう)。
   */
  defaultExpr?: string;
};

type ParamStore<T extends Record<string, number>> = {
  values: T;
  setValue: (key: keyof T, value: number) => void;
  reset: () => void;
};

/** 「数値の集合 + 既定値へ戻す」だけの小さなストアを作る */
function createParamStore<T extends Record<string, number>>(defaults: T) {
  return create<ParamStore<T>>((set) => ({
    values: { ...defaults },
    setValue: (key, value) =>
      set((s) => ({ values: { ...s.values, [key]: value } })),
    reset: () => set({ values: { ...defaults } }),
  }));
}

/* ------------------------------------------------------------------ *
 * 組み上げ中(0〜11秒)の周回カメラ。
 * 元は ReplyCamera.tsx の BUILD_ORBIT_* 定数。値は当時のまま。
 * ------------------------------------------------------------------ */

export const BUILD_ORBIT_DEFAULTS = {
  /** 押してから前進を始めるまでの静止時間(秒) */
  holdSeconds: 2.5,
  /** 静止のあと START→MID へ前進する秒数(まだ回転しない) */
  dollySeconds: 3.5,
  /** 周回半径の3段階 */
  radiusStart: 70,
  radiusMid: 34,
  radiusTo: 11.5,
  /** 高さの3段階 */
  yFrom: 2,
  yMid: 16,
  yTo: STAGE_Y + 2,
  /** 見る先の高さ(build に対して直線で上がる) */
  lookYFrom: 5,
  lookYTo: STAGE_Y,
  /** 組み上げ中に回る周回数 */
  turns: 1,
};

export type BuildOrbitParams = typeof BUILD_ORBIT_DEFAULTS;

export const BUILD_ORBIT_SPECS: ParamSpec<keyof BuildOrbitParams>[] = [
  { key: "holdSeconds", label: "hold(静止 秒)", step: 0.1 },
  { key: "dollySeconds", label: "dolly(前進 秒)", step: 0.1 },
  { key: "radiusStart", label: "radius start", step: 0.5 },
  { key: "radiusMid", label: "radius mid", step: 0.5 },
  { key: "radiusTo", label: "radius to", step: 0.5 },
  { key: "yFrom", label: "y from", step: 0.5 },
  { key: "yMid", label: "y mid", step: 0.5 },
  { key: "yTo", label: "y to", step: 0.5, defaultExpr: "STAGE_Y + 2" },
  { key: "lookYFrom", label: "lookY from", step: 0.5 },
  { key: "lookYTo", label: "lookY to", step: 0.5, defaultExpr: "STAGE_Y" },
  { key: "turns", label: "turns(周回数)", step: 0.05 },
];

export const useBuildOrbitStore = createParamStore(BUILD_ORBIT_DEFAULTS);

/* ------------------------------------------------------------------ *
 * ドローンらしさの味付け(11秒以降)。バンク・揺れ・呼吸・追従。
 * 元は ReplyCamera.tsx の BANK_* / SHAKE_* / BREATH_AMOUNT /
 * FOLLOW_RATE / MIN_ORBIT_DISTANCE。値は当時のまま。
 * ------------------------------------------------------------------ */

export const CAMERA_FEEL_DEFAULTS = {
  /** 旋回の角速度[rad/s]に掛けるロール量 */
  bankGain: 0.6,
  /** バンクの上限(ラジアン)。0.3 ≒ 17度 */
  bankMax: 0.3,
  /** バンクの追従の速さ(1/秒) */
  bankSmooth: 2.2,
  /** 1小節周期の寄り引きの深さ */
  breathAmount: 0.014,
  /** 手持ち風の揺れ(静かな所 / 盛り上がり) */
  shakeMin: 0.18,
  shakeMax: 0.5,
  /** 目標位置へ寄せる速さ(1/秒) */
  followRate: 6,
  /** 塔の軸からの最低水平距離。これ以上は近づけない */
  minOrbitDistance: 11,
};

export type CameraFeelParams = typeof CAMERA_FEEL_DEFAULTS;

export const CAMERA_FEEL_SPECS: ParamSpec<keyof CameraFeelParams>[] = [
  { key: "bankGain", label: "bank gain", step: 0.02 },
  { key: "bankMax", label: "bank max(rad)", step: 0.01 },
  { key: "bankSmooth", label: "bank smooth", step: 0.1 },
  { key: "breathAmount", label: "breath", step: 0.002 },
  { key: "shakeMin", label: "shake min", step: 0.01 },
  { key: "shakeMax", label: "shake max", step: 0.01 },
  { key: "followRate", label: "follow rate", step: 0.5 },
  { key: "minOrbitDistance", label: "min distance", step: 0.5 },
];

export const useCameraFeelStore = createParamStore(CAMERA_FEEL_DEFAULTS);
