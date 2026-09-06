import { STAGE_Y } from "./constants";

/**
 * 組み上げ中(0〜11秒)の周回カメラの数値パラメータ。
 * 元は ReplyCamera.tsx の BUILD_ORBIT_* 定数。値は当時のまま。
 *
 * **このファイルは編集モードの「コードとしてコピー」の貼り付け先。**
 * コピーした内容をこのファイルへ全選択→貼り付けするだけで確定できるよう、
 * ここには BUILD_ORBIT_DEFAULTS の定義だけを置く(型・SPECS・store本体は
 * buildOrbitParams.ts)。
 */
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
