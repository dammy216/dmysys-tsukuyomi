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

/* ------------------------------------------------------------------ *
 * 補間 — 単調3次エルミート(PCHIP)
 *
 * **区間ごとに smoothstep を掛けてはいけない。** smoothstep は両端で微分が
 * 0 なので、キーを通過するたびにカメラの速度が一度0に落ちる=キーフレーム
 * ごとに一瞬止まって見える(実際そうなっていた。1秒刻みのキーが並ぶ
 * 0〜11秒で特に顕著)。
 *
 * 代わりに、各キーの**接線(速度)を前後のキーから決めて左右の区間で共有**
 * する3次エルミートにしてある。キーの左右で速度が一致する(C1連続)ので、
 * キーを通過しても勢いが途切れない。Theatre.js / Blender の「自動」
 * タンジェントと同じ考え方で、旧 BUILD_ORBIT がドリーイン→周回の継ぎ目
 * 1箇所だけ手で行っていた速度合わせを、全キーへ一般化したものにあたる。
 *
 * 接線は Fritsch–Carlson(PCHIP)の式で求める。単純に前後の差分を取る
 * (Catmull-Rom)と、値が山/谷になっているキーでカーブが元の値を大きく
 * 飛び越して膨らむ — 例えば11秒の引きは radius が 11.5 → 53 → 45 と
 * 折り返すので、Catmull-Rom だと 53 を超えて 60 近くまで外へ膨らんでしまう。
 * PCHIP は
 *   - 前後の傾きの符号が違うキー(=山/谷)では接線を 0 にする
 *   - それ以外は前後の傾きを間隔で重み付けした調和平均にする
 * ことで**オーバーシュートしない**。キー間隔がばらばら(1秒刻みの区間と
 * 4秒刻みの区間が混在)でも正しく効くよう、重みは実時間の間隔で取る。
 * ------------------------------------------------------------------ */

/**
 * 3次エルミート補間。速度 v0/v1 は、区間全体を1としたローカル時間
 * u∈[0,1] に対する dp/du(=秒あたりの速度 × 区間の長さ)。
 */
function hermite(p0: number, v0: number, p1: number, v1: number, u: number) {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * p0 +
    (u3 - 2 * u2 + u) * v0 +
    (-2 * u3 + 3 * u2) * p1 +
    (u3 - u2) * v1
  );
}

/**
 * キー1点ぶんの接線(単位: 値/秒)。前後の傾きの符号が違えば0(そのキーが
 * 山/谷なので、そこは実際に折り返し=速度0が正しい)、同じ符号なら間隔で
 * 重み付けした調和平均を返す。
 *
 * 呼び出し側は符号が違う/どちらかが0のケースを先に弾いてから割り算に
 * 入るので、ここでゼロ除算は起きない。
 */
function pchipTangent(
  yPrev: number,
  yCur: number,
  yNext: number,
  hPrev: number,
  hNext: number,
) {
  const dPrev = (yCur - yPrev) / hPrev;
  const dNext = (yNext - yCur) / hNext;
  if (dPrev * dNext <= 0) return 0;
  const w1 = 2 * hNext + hPrev;
  const w2 = hNext + 2 * hPrev;
  return (w1 + w2) / (w1 / dPrev + w2 / dNext);
}

/**
 * 1チャンネル(turn / radius / ...)ぶんの補間。
 * prevY / nextY は区間の外側のキーの値で、端の区間では undefined を渡す
 * (その側は片側差分=区間の平均速度をそのまま接線にする)。
 */
function interpolateField(
  prevY: number | undefined,
  aY: number,
  bY: number,
  nextY: number | undefined,
  hPrev: number,
  h: number,
  hNext: number,
  u: number,
) {
  const d = (bY - aY) / h;
  const ma = prevY === undefined ? d : pchipTangent(prevY, aY, bY, hPrev, h);
  const mb = nextY === undefined ? d : pchipTangent(aY, bY, nextY, h, hNext);
  return hermite(aY, ma * h, bY, mb * h, u);
}

/**
 * 航路(path)を時刻 t(秒) で標本化する。返り値は破壊的に out へ書く。
 * path は呼び出し側から渡す(通常は dronePathStore の現在値。編集パネルで
 * 調整中の値をそのまま反映させるため、モジュールスコープの DRONE_PATH を
 * 直接参照しない)。
 *
 * 接線は「今いる区間の前後1点ずつ」だけで決まるので、毎フレーム呼んでも
 * 見るキーは最大4点(配列全体の前計算は要らない)。
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
  // 区間の外側のキー(端では無い=片側差分になる)
  const prev = i > 0 ? path[i - 1] : undefined;
  const next = i + 2 <= last ? path[i + 2] : undefined;
  // 間隔は必ず正にする(0だと接線がNaNになりカメラごと壊れる)
  const h = b.t - a.t || 1;
  const hPrev = prev ? a.t - prev.t || 1 : 1;
  const hNext = next ? next.t - b.t || 1 : 1;
  const u = (t - a.t) / h;

  out.turn = interpolateField(prev?.turn, a.turn, b.turn, next?.turn, hPrev, h, hNext, u);
  out.radius = interpolateField(prev?.radius, a.radius, b.radius, next?.radius, hPrev, h, hNext, u);
  out.y = interpolateField(prev?.y, a.y, b.y, next?.y, hPrev, h, hNext, u);
  out.lookY = interpolateField(prev?.lookY, a.lookY, b.lookY, next?.lookY, hPrev, h, hNext, u);
  out.fov = interpolateField(prev?.fov, a.fov, b.fov, next?.fov, hPrev, h, hNext, u);
}
