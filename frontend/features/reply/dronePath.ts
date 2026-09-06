/**
 * 「Reply」11秒以降のドローン航路データ。ReplyCamera.tsx から分離してあるのは、
 * features/editor/ の DronePathEditorPanel からも参照できるようにするため
 * (実行時の値は features/reply/dronePathStore.ts 経由でここの初期値を
 * コピーして持つ。詳細はそちらのコメント参照)。
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
};

/**
 * 航路。**時刻は曲の構成の境界そのもの**なので、ここを触るときは
 * TRACK_NOTES.md §3 の表と突き合わせること。
 *
 * 半径の下限に注意: 天守は高さ約36・底面の半径約14.9あるので、
 * **y が 38 より低いキーでは radius を 20 以上**にしないと石垣に潜る。
 *
 * ここが実行時に使われる唯一の正データ(ビルド後もこのまま)。編集モードの
 * DronePathEditorPanel でブラウザ上から一時的に調整できるが、その調整は
 * ページを開き直すと消える下書きにすぎない。気に入った値は「コードとして
 * コピー」で書き出して、この配列そのものを書き換えること。
 */
export const DRONE_PATH: readonly DroneKey[] = [
  // 11秒: 引きの着地点。ここは従来の引きと同じ間合いに合わせてある
  { t: 11.0, turn: 0.0, radius: 53, y: 46, lookY: 45, fov: 68 },
  // イントロ2: 上昇しながら寄る
  { t: 15.0, turn: 0.09, radius: 45, y: 52, lookY: 43, fov: 66 },
  { t: 19.0, turn: 0.2, radius: 37, y: 60, lookY: 37, fov: 64 },
  // 歌前の間: 最高高度でホバリング。会場を見下ろす
  { t: 23.0, turn: 0.28, radius: 34, y: 65, lookY: 35, fov: 64 },
  // Aメロ: ゆっくり降りながら、見下ろし→水平へ
  { t: 27.5, turn: 0.32, radius: 33, y: 64, lookY: 36, fov: 66 },
  { t: 33.5, turn: 0.43, radius: 32, y: 57, lookY: 40, fov: 66 },
  { t: 39.0, turn: 0.54, radius: 31, y: 50, lookY: 44, fov: 66 },
  { t: 45.0, turn: 0.66, radius: 29, y: 44, lookY: 45, fov: 66 },
  // Bメロ: 螺旋で降りながら詰める。旋回が速くなってバンクが付き始める
  { t: 49.5, turn: 0.76, radius: 27, y: 40, lookY: 45, fov: 68 },
  { t: 55.0, turn: 0.96, radius: 24, y: 35, lookY: 45, fov: 70 },
  { t: 59.0, turn: 1.14, radius: 22, y: 31, lookY: 44, fov: 72 },
  // サビ: 最も低く近い煽り。広角で誇張する
  { t: 62.0, turn: 1.28, radius: 21, y: 28, lookY: 45, fov: 76 },
  // サビ中: 一気に開けて大きく回る(10.5秒で0.64周=最速。バンクが深く出る)
  { t: 67.5, turn: 1.62, radius: 30, y: 40, lookY: 45, fov: 72 },
  { t: 72.5, turn: 1.92, radius: 42, y: 54, lookY: 43, fov: 68 },
  { t: 78.5, turn: 2.28, radius: 34, y: 60, lookY: 39, fov: 68 },
  // 後半: 振り戻して寄る
  { t: 83.0, turn: 2.52, radius: 25, y: 45, lookY: 45, fov: 74 },
  // フライバイ: 外へ抜けてから低く戻る
  { t: 90.0, turn: 2.92, radius: 46, y: 38, lookY: 42, fov: 70 },
  { t: 96.0, turn: 3.22, radius: 31, y: 31, lookY: 44, fov: 72 },
  // 至近をかすめる。最後の歌詞へ向けて上昇に転じる
  { t: 101.0, turn: 3.48, radius: 23, y: 33, lookY: 45, fov: 76 },
  { t: 106.0, turn: 3.76, radius: 31, y: 48, lookY: 45, fov: 70 },
  // アウトロ: 望遠に寄せながら引き上げていく
  { t: 107.0, turn: 3.82, radius: 35, y: 51, lookY: 45, fov: 68 },
  { t: 114.0, turn: 4.02, radius: 62, y: 60, lookY: 44, fov: 62 },
  // フェード: 圧縮した望遠で静かに離脱する
  { t: 121.3, turn: 4.18, radius: 88, y: 68, lookY: 42, fov: 56 },
  { t: 127.5, turn: 4.28, radius: 108, y: 74, lookY: 40, fov: 52 },
] as const;

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
