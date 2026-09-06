/**
 * ドローンらしさの味付け(11秒以降)。バンク・揺れ・呼吸・追従。
 * 元は ReplyCamera.tsx の BANK_* / SHAKE_* / BREATH_AMOUNT /
 * FOLLOW_RATE / MIN_ORBIT_DISTANCE。値は当時のまま。
 *
 * **このファイルは編集モードの「コードとしてコピー」の貼り付け先。**
 * コピーした内容をこのファイルへ全選択→貼り付けするだけで確定できるよう、
 * ここには CAMERA_FEEL_DEFAULTS の定義だけを置く(型・SPECS・store本体は
 * cameraFeelParams.ts)。
 */
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
