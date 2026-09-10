/**
 * Reply のドローン航路(値そのものは features/reply/dronePathData.ts の
 * DRONE_PATH)が従うデータ形と、それを時刻で標本化する関数。
 *
 * 値と型/関数をファイルごと分けてあるのは、編集モードの「コードとして
 * コピー」がファイル1つを丸ごと貼り替えられるようにするため
 * (dronePathData.ts のコメント参照)。
 *
 * **補間の中身は timelineType.ts に移してある。** 天守の組み上げ・照明・
 * 灯籠・花火なども同じ「時刻→状態」のキーフレームで動かすようになり、
 * ドローン専用ではなくなったため(replyTimeline.ts 参照)。ここはドローンの
 * チャンネル(turn/radius/y/lookY/fov)を束ねる薄い層だけを持つ。
 */

import { sampleTimeline, type TimelineKey } from "./timelineType";

/** ドローンの航路のキーフレーム。塔の軸を中心にした円筒座標で持つ */
export type DroneKey = {
  /** 曲中の時刻(秒)。**曲の構成(TRACK_NOTES.md §3)の境界に合わせてある** */
  t: number;
  /**
   * 塔の軸まわりの回転(周)。**単調に増やすこと。**
   * 隣り合うキーの差がそのまま旋回量になるので、差が大きいほど速く回る
   * (= バンクも深くなる)。戻すと逆回転して見える。
   */
  turn: number;
  /** 軸からの水平距離 */
  radius: number;
  /** カメラの高さ */
  y: number;
  /** 注視点の高さ(塔の軸上)。カメラの y との差が伏角/仰角になる */
  lookY: number;
  /** 画角(度) */
  fov: number;
  /**
   * 曲の構成上の注記(例 "サビ: 最も低く近い煽り")。挙動には一切関係せず、
   * DRONE_PATH の該当キーの直前に `// {note}` として書き出すためだけに持つ
   * (「コードとしてコピー」でファイルを丸ごと貼り替えても、この注記が
   * 消えないようにするため)。
   */
  note?: string;
};

/** DroneKey が持つ数値チャンネル。標本化するとき舐める順に並べる */
export const DRONE_CHANNELS = ["turn", "radius", "y", "lookY", "fov"] as const;

export type DroneChannel = (typeof DRONE_CHANNELS)[number];

/**
 * 航路(path)を時刻 t(秒) で標本化する。返り値は破壊的に out へ書く。
 * path は呼び出し側から渡す(通常は dronePathStore の現在値。編集パネルで
 * 調整中の値をそのまま反映させるため、モジュールスコープの DRONE_PATH を
 * 直接参照しない)。
 *
 * 補間は単調3次エルミート(PCHIP)。理屈は timelineType.ts のコメント参照。
 */
export function sampleDrone(
  path: readonly DroneKey[],
  t: number,
  out: { turn: number; radius: number; y: number; lookY: number; fov: number },
) {
  sampleTimeline(path as readonly TimelineKey<DroneChannel>[], DRONE_CHANNELS, t, out);
}
