/**
 * 時刻キーフレームの汎用型と、それを標本化する補間。
 *
 * **元は dronePathType.ts にドローン航路専用として書かれていたもの。**
 * ドローンだけが「時刻→状態」の宣言的なキーフレームで動いていて、天守の
 * 組み上げ・照明の点灯・灯籠・花火などは SceneContents の useFrame に
 * 命令的な計算(定数と clamp/smoothstep)として散らばっていた。これらを
 * 同じ仕組みへ寄せるにあたり、補間の中身をここへ切り出して共有する。
 *
 * 「値そのもの(キーフレーム配列)」と「型/補間関数」をファイルごと分ける
 * 方針は据え置き ―― 編集モードの「コードとしてコピー」が値のファイル1つを
 * 丸ごと貼り替えられるようにするため(dronePathData.ts のコメント参照)。
 */

/**
 * 時刻キーフレーム1点。`t`(秒)以外のチャンネルは使う側が型引数で決める
 * (ドローンなら turn/radius/y/lookY/fov、天守なら build など)。
 *
 * **1つのキーがそのトラックの全チャンネルの値を持つ。** 編集モードの
 * タイムラインはチャンネルごとに行を描くが、菱形(キー)の時刻は行をまたいで
 * 共通 ―― これは既存のドローン航路の作りに合わせたもの。時刻を別々に
 * 打ちたい値は、チャンネルではなく別トラックとして分ける。
 */
export type TimelineKey<C extends string> = { t: number; note?: string } & Record<
  C,
  number
>;

/* ------------------------------------------------------------------ *
 * 補間 — 単調3次エルミート(PCHIP)
 *
 * **区間ごとに smoothstep を掛けてはいけない。** smoothstep は両端で微分が
 * 0 なので、キーを通過するたびに速度が一度0に落ちる=キーフレームごとに
 * 一瞬止まって見える(実際そうなっていた。1秒刻みのキーが並ぶ 0〜11秒で
 * 特に顕著)。
 *
 * 代わりに、各キーの**接線(速度)を前後のキーから決めて左右の区間で共有**
 * する3次エルミートにしてある。キーの左右で速度が一致する(C1連続)ので、
 * キーを通過しても勢いが途切れない。Theatre.js / Blender の「自動」
 * タンジェントと同じ考え方。
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
 *
 * オーバーシュートしない性質は、0〜1 に収まるべき進行度(build / lights /
 * stage など)を扱うようになってから特に効く ―― Catmull-Rom だと
 * 「0→1 で頭打ち」のつもりのキーが 1 を超えて膨らみ、光が飽和する。
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
 * 1チャンネル(turn / build / ...)ぶんの補間。
 * prevY / nextY は区間の外側のキーの値で、端の区間では undefined を渡す
 * (その側は片側差分=区間の平均速度をそのまま接線にする)。
 */
export function interpolateField(
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
 * キーフレーム列 keys を時刻 t(秒) で標本化し、channels に挙げたチャンネルを
 * out へ破壊的に書く。
 *
 * keys は呼び出し側から渡す(通常はストアの現在値。編集パネルで調整中の値を
 * そのまま反映させるため、モジュールスコープの既定値を直接参照しない)。
 *
 * 接線は「今いる区間の前後1点ずつ」だけで決まるので、毎フレーム呼んでも
 * 見るキーは最大4点(配列全体の前計算は要らない)。
 */
export function sampleTimeline<C extends string>(
  keys: readonly TimelineKey<C>[],
  channels: readonly C[],
  t: number,
  out: Record<C, number>,
) {
  const last = keys.length - 1;
  if (last < 0) return;

  // 端の外側は端の値で頭打ち(曲の頭より前・最後のキーより後ろ)
  if (t <= keys[0].t || last === 0) {
    const k = keys[0];
    for (const c of channels) out[c] = k[c];
    return;
  }
  if (t >= keys[last].t) {
    const k = keys[last];
    for (const c of channels) out[c] = k[c];
    return;
  }

  let i = 0;
  while (i < last - 1 && t > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  // 区間の外側のキー(端では無い=片側差分になる)
  const prev = i > 0 ? keys[i - 1] : undefined;
  const next = i + 2 <= last ? keys[i + 2] : undefined;
  // 間隔は必ず正にする(0だと接線がNaNになり、それを受ける演出ごと壊れる)
  const h = b.t - a.t || 1;
  const hPrev = prev ? a.t - prev.t || 1 : 1;
  const hNext = next ? next.t - b.t || 1 : 1;
  const u = (t - a.t) / h;

  for (const c of channels) {
    out[c] = interpolateField(prev?.[c], a[c], b[c], next?.[c], hPrev, h, hNext, u);
  }
}
