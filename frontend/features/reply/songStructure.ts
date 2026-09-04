/**
 * 「Reply」の曲構成テーブルと、そこから演出値を引く関数。
 *
 * 数値の出どころはすべて `TRACK_NOTES.md`(reply.mp4 の音声・映像からの実測)。
 * ここを直すときは TRACK_NOTES.md 側も一緒に直すこと。
 *
 * 演出側の使い方は TRACK_NOTES.md §5 の通り:
 *   - セクションで「段」を作る(energy)
 *   - カット割りを拍で刻まない。連続量を4倍レンジで動かす
 *   - 実測アンカー(11.05 / 121.3)だけは外さない
 */

/** セクション名。TRACK_NOTES.md §3 の表と1対1で対応する */
export type ReplySectionName =
  | "intro-A"
  | "intro-B"
  | "breath"
  | "A"
  | "B"
  | "SABI"
  | "LATTER"
  | "outro"
  | "fade";

export type ReplySection = {
  name: ReplySectionName;
  /** 開始位置(秒)。曲(=映像)の再生位置 */
  start: number;
  /**
   * 演出強度(0〜1)。カメラの巡航速度・ブルーム・花火の量をここから引く。
   *
   * 実測の「明るさ」(高域/低域のエネルギー比)と「カット/秒」を
   * それぞれ 0〜1 に正規化して平均し、音楽的に不自然な所だけ均した値。
   *   明るさ  0.014〜0.072 → intro-B 0.50 / breath 0.29 / A 0.60 / B 0.62 /
   *                          SABI 1.00 / LATTER 1.00 / outro 0.52 / fade 0
   *   カット  0.25〜1.29   → intro-B 0.00 / breath 0.40 / A 0.33 / B 0.22 /
   *                          SABI 1.00 / LATTER 0.76 / outro 0.08 / fade 0
   * breath のカット密度(0.67)は 27〜28秒の白飛び転換で持ち上がっているだけで、
   * 音は落ち着く区間なので明るさ側を優先して下げてある。
   */
  energy: number;
  /**
   * 前のセクションから energy を移すのにかける秒数。
   * サビの入りだけ短くして段差を立たせ、他は1小節(1.41秒)前後で滑らかに移す。
   */
  ramp: number;
};

/**
 * セクション表。**start の昇順**であること(下の探索が前提にしている)。
 * intro-A は 11秒までの演出を触らないため、ここでは energy を持つだけで
 * 実際にはカメラ・照明のどちらからも参照されない(11秒までは別経路)。
 */
export const REPLY_SECTIONS: readonly ReplySection[] = [
  { name: "intro-A", start: 0, energy: 0.1, ramp: 0 },
  // ベース入り(実測 11.05秒。低域が0.05秒で+20dB)
  { name: "intro-B", start: 11.05, energy: 0.38, ramp: 0.5 },
  { name: "breath", start: 23.0, energy: 0.2, ramp: 1.4 },
  { name: "A", start: 27.5, energy: 0.45, ramp: 1.4 },
  { name: "B", start: 49.5, energy: 0.58, ramp: 1.4 },
  { name: "SABI", start: 62.0, energy: 1.0, ramp: 0.7 },
  { name: "LATTER", start: 83.0, energy: 0.92, ramp: 1.4 },
  { name: "outro", start: 107.0, energy: 0.35, ramp: 2.8 },
  // フェード開始(実測 121.3秒。121.0秒まではレベルが平坦)
  { name: "fade", start: 121.3, energy: 0.0, ramp: 4.0 },
] as const;

/**
 * 実測のフェードアウト曲線(TRACK_NOTES.md §2.3)。
 * [再生位置(秒), 本編に対するリニアゲイン] の折れ線。
 *
 * 前半ゆるやか・124.0〜125.5 で急降下という形。等速フェードで代用すると
 * 音より先に絵が消えるので、実測値をそのまま持つ。
 */
const FADE_CURVE: readonly (readonly [number, number])[] = [
  [121.0, 0.93],
  [122.0, 0.74],
  [123.0, 0.61],
  [124.0, 0.54],
  [124.5, 0.35],
  [125.0, 0.33],
  [125.5, 0.23],
  [126.0, 0.19],
  [126.5, 0.1],
  [127.37, 0.0],
] as const;

/** なめらかな加減速。ReplyCamera の smoothstep と同じもの */
function smoothstep(x: number) {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

/**
 * 再生位置 t(秒) が属するセクションの添字。
 * t が負・NaN のときは 0(intro-A)を返す。
 */
export function replySectionIndexAt(t: number): number {
  if (!Number.isFinite(t) || t <= 0) return 0;
  let i = 0;
  while (i < REPLY_SECTIONS.length - 1 && t >= REPLY_SECTIONS[i + 1].start) i++;
  return i;
}

/** 現在のセクションが始まってからの経過秒数 */
export function replySectionSinceAt(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.max(t - REPLY_SECTIONS[replySectionIndexAt(t)].start, 0);
}

/**
 * 再生位置 t(秒) の演出強度(0〜1)。
 *
 * セクションの段を ramp 秒かけて移す。段差のまま使うと、境界のフレームで
 * カメラ速度やブルームが跳ねて「カットが入った」ように見えてしまう
 * (TRACK_NOTES.md §4.3: 元映像の編集はビートに同期していないので、
 * こちらも段差ではなく連続量で差をつける)。
 */
export function replySectionEnergyAt(t: number): number {
  if (!Number.isFinite(t)) return 0;
  const i = replySectionIndexAt(t);
  const section = REPLY_SECTIONS[i];
  if (i === 0 || section.ramp <= 0) return section.energy;

  const prev = REPLY_SECTIONS[i - 1];
  const k = smoothstep((t - section.start) / section.ramp);
  return prev.energy + (section.energy - prev.energy) * k;
}

/**
 * 再生位置 t(秒) のフェードゲイン(0〜1)。121.0秒までは 1。
 * 露出・花火・ブルームにこれを掛けると、絵が音と同じ形で消える。
 */
export function replyFadeGainAt(t: number): number {
  if (!Number.isFinite(t)) return 1;
  const first = FADE_CURVE[0];
  if (t <= first[0]) return 1;

  const last = FADE_CURVE[FADE_CURVE.length - 1];
  if (t >= last[0]) return 0;

  for (let i = 0; i < FADE_CURVE.length - 1; i++) {
    const a = FADE_CURVE[i];
    const b = FADE_CURVE[i + 1];
    if (t <= b[0]) {
      const span = b[0] - a[0] || 1;
      return a[1] + (b[1] - a[1]) * ((t - a[0]) / span);
    }
  }
  return 0;
}
