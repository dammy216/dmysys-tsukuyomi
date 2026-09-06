/**
 * Reply のドローン航路(値そのものは features/reply/dronePathData.ts の
 * DRONE_PATH)が従うデータ形と、それを時刻で標本化する関数。
 *
 * 値と型/関数をファイルごと分けてあるのは、編集モードの「コードとして
 * コピー」がファイル1つを丸ごと貼り替えられるようにするため
 * (dronePathData.ts のコメント参照)。
 */

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

/** なめらかな加減速(ease-in-out)。等速で動くと機械的に見えるため */
function smoothstep(x: number) {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

/**
 * 航路(path)を時刻 t(秒) で標本化する。返り値は破壊的に out へ書く。
 * path は呼び出し側から渡す(通常は dronePathStore の現在値。編集パネルで
 * 調整中の値をそのまま反映させるため、モジュールスコープの DRONE_PATH を
 * 直接参照しない)。
 */
export function sampleDrone(
  path: readonly DroneKey[],
  t: number,
  out: { turn: number; radius: number; y: number; lookY: number; fov: number },
) {
  const last = path.length - 1;
  if (t <= path[0].t) {
    const k = path[0];
    out.turn = k.turn;
    out.radius = k.radius;
    out.y = k.y;
    out.lookY = k.lookY;
    out.fov = k.fov;
    return;
  }
  if (t >= path[last].t) {
    const k = path[last];
    out.turn = k.turn;
    out.radius = k.radius;
    out.y = k.y;
    out.lookY = k.lookY;
    out.fov = k.fov;
    return;
  }

  let i = 0;
  while (i < last - 1 && t > path[i + 1].t) i++;
  const a = path[i];
  const b = path[i + 1];
  const span = b.t - a.t || 1;
  const k = smoothstep((t - a.t) / span);

  out.turn = a.turn + (b.turn - a.turn) * k;
  out.radius = a.radius + (b.radius - a.radius) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.lookY = a.lookY + (b.lookY - a.lookY) * k;
  out.fov = a.fov + (b.fov - a.fov) * k;
}
