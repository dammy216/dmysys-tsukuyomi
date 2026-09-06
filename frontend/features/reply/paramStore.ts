import { create } from "zustand";

/**
 * ReplyCamera の「キーフレームではない」調整値(数値パラメータ)を、
 * 編集モードのパネルから触れるようにするための共通の型・ストア工場。
 *
 * DRONE_PATH(dronePathData.ts)が時間軸を持つキーフレームなのに対し、こちらは
 * 曲全体に効く定数。どちらも「コードの既定値が正 / ここでの変更はブラウザ上の
 * 下書き」という同じ運用にしてある(気に入った値はパネルの「コードとして
 * コピー」で書き出し、貼り付け先のファイルへ丸ごと貼り替えて確定させる)。
 *
 * パラメータの値そのもの(*_DEFAULTS)は、この用途ごとに分けた別ファイル
 * (buildOrbitDefaults.ts / cameraFeelDefaults.ts)に置く。「コードとして
 * コピー」の出力がそのファイル1つを丸ごと置き換えられるようにするため、
 * この共通インフラ(型・ストア工場・SPECS・store本体)とは分離してある。
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
  /**
   * この値の意味の短い説明。「コードとしてコピー」で `/** {comment} *\/`
   * として書き出す(貼り付け先のファイルを丸ごと置き換えても、値の意味を
   * 説明するコメントが消えないようにするため)。
   */
  comment?: string;
};

type ParamStore<T extends Record<string, number>> = {
  values: T;
  setValue: (key: keyof T, value: number) => void;
  /**
   * 値の集合をまるごと置き換える。Undo/Redo(editorHistory.ts)が
   * スナップショットを復元するためだけに使う一般公開のセッター。
   */
  setValues: (values: T) => void;
  reset: () => void;
};

/** 「数値の集合 + 既定値へ戻す」だけの小さなストアを作る */
export function createParamStore<T extends Record<string, number>>(defaults: T) {
  return create<ParamStore<T>>((set) => ({
    values: { ...defaults },
    setValue: (key, value) =>
      set((s) => ({ values: { ...s.values, [key]: value } })),
    setValues: (values) => set({ values }),
    reset: () => set({ values: { ...defaults } }),
  }));
}
