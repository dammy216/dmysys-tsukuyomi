/**
 * 「Reply」の曲構成テーブル。**セクションの区切り(名前・開始時刻・ramp)だけ**を持つ。
 *
 * 数値の出どころはすべて `TRACK_NOTES.md`(reply.mp4 の音声・映像からの実測)。
 * ここを直すときは TRACK_NOTES.md 側も一緒に直すこと。
 *
 * **演出強度(energy)と終わりのフェード曲線はここには無い。**
 * 「時刻→状態」のキーフレーム(replyTimelineData.ts の REPLY_TIMELINE)へ移し、
 * 編集モードのタイムラインから触れるようにしてある。ここに残っているのは、
 * 照明のキュー表(castleBeamRig.ts / Searchlight.tsx / BeamLight.tsx の CUES)が
 * **セクション名で値を引く**ため ―― キュー表はセクション単位の対応表のままで、
 * その「今どのセクションか」をこの表が答える役割分担になっている。
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
   * 前のセクションから照明のキューを移すのにかける秒数。
   * サビの入りだけ短くして段差を立たせ、他は1小節(1.41秒)前後で滑らかに移す。
   * (演出強度 energy のクロスフェードにも使っていたが、そちらは
   *  REPLY_TIMELINE の energy トラックのキーの打ち方として表現してある)
   */
  ramp: number;
};

/**
 * セクション表。**start の昇順**であること(下の探索が前提にしている)。
 * intro-A は 11秒までの演出を触らないため、実際にはカメラ・照明のどちらからも
 * 参照されない(11秒までは別経路)。
 */
export const REPLY_SECTIONS: readonly ReplySection[] = [
  { name: "intro-A", start: 0, ramp: 0 },
  // ベース入り(実測 11.05秒。低域が0.05秒で+20dB)
  { name: "intro-B", start: 11.05, ramp: 0.5 },
  { name: "breath", start: 23.0, ramp: 1.4 },
  { name: "A", start: 27.5, ramp: 1.4 },
  { name: "B", start: 49.5, ramp: 1.4 },
  { name: "SABI", start: 62.0, ramp: 0.7 },
  { name: "LATTER", start: 83.0, ramp: 1.4 },
  { name: "outro", start: 107.0, ramp: 2.8 },
  // フェード開始(実測 121.3秒。121.0秒まではレベルが平坦)
  { name: "fade", start: 121.3, ramp: 4.0 },
] as const;

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
