/**
 * 天守・隅櫓に仕込んだ光(軒のビーム BeamLight / 破風のウォッシュ WashLight)を
 * 動かす「照明卓」。
 *
 * Searchlight.tsx が足元のサーチライト12本を受け持つのに対し、こちらは
 * **建物そのものから出る光**(軒下80本 + 破風16本 = 96本)をまとめて受け持つ。
 * 2つのコンポーネントが同じキュー表・同じ位相・同じ点灯フロントを共有するので、
 * 別々に書いた演出がぶつからず、1つのリグとして揃って動く。
 *
 * ------------------------------------------------------------------
 * 参照映像
 * ------------------------------------------------------------------
 * BUMP OF CHICKEN「BUTTERFLY」(TOUR 2019 Aurora Ark)の 3:06〜3:56。
 * ユーザー指定の区間をフレーム単位で見て、次の4点を写し取っている。
 *
 * 1. **本数が曲で激変する。** 静かな箇所(3:27 / 3:44 / 3:55)はビームが
 *    ほぼ0本で、単色のウォッシュだけ。サビ・キメ(3:07 / 3:08 / 3:35 / 3:53)は
 *    数十本が一斉に開く。**この落差そのものが演出の主役**で、明るさを
 *    上げ下げするより本数を増減させるほうが効く。
 * 2. **動きは剛体。** 3:15 の緑のファンは全灯が同じ角度で同じ向きへ倒れ、
 *    扇が1枚の板のように動く。灯ごとにばらばらの角度を向く瞬間は無い。
 * 3. **色は空間のグラデーション。** 3:07 の大ファンは扇の端から端へ
 *    シアン→緑→黄→マゼンタと *並び順どおりに* 色が変わる。灯ごとの
 *    ランダムな色替えではない。
 * 4. **静かな箇所は単色の暖色/寒色**(3:27 は青一色、3:55 はほぼ無灯)。
 *    色数が増えるのは盛り上がる箇所だけ。
 *
 * ------------------------------------------------------------------
 * 設計: 4層だけ。層を増やさないこと
 * ------------------------------------------------------------------
 * 灯1本の見え方は、次の4つの積で決まる。層を足すと「何が効いているか」が
 * 読めなくなるので、演出を足したくなったらまずこの4つのどれかを動かす。
 *
 *   1. density  … **何本灯すか**(点灯フロント。下の heightGate)
 *   2. swing    … **どこを向くか**(剛体スイープ。上下 lift / 左右 yaw)
 *   3. chase    … **今どれが一番明るいか**(位相の走る波)
 *   4. color    … **何色か**(リグ全体に配るグラデーション)
 *
 * **乱数を使わないこと。** どの層も「灯の高さ・方位」から決まる決定的な値で
 * 動かす。Searchlight.tsx の同じ趣旨のコメントを参照 ―― 拍ごとの抽選や
 * 灯ごとの乱数位相は規則が読めず、実機で見るとかなり気持ち悪い動きになる。
 */

import {
  CASTLE_ROOF_TIERS,
  REPLY_BAR_ORIGIN,
  REPLY_BAR_SECONDS,
  REPLY_BEAT_OFFSET,
  REPLY_BEAT_SECONDS,
} from "./constants";
import {
  REPLY_SECTIONS,
  replySectionIndexAt,
  type ReplySectionName,
} from "./songStructure";
import { TOWER_ROOF_TIERS } from "./towerLayout";

/* ------------------------------------------------------------------ *
 * 色
 * ------------------------------------------------------------------ */

/**
 * 静かな箇所で使う地の色。BeamLight / WashLight が元々1色で使っていた
 * 暖色の白そのもの。彩度を上げるのは盛り上がる箇所だけなので、
 * 「色が付いていない状態」= これになる。
 */
export const CASTLE_BEAM_WARM = "#ffe9c7";

/**
 * 盛り上がる箇所でリグ全体へ配るパレット。**並び順が意味を持つ**
 * (寒色→暖色の順。リグの高さ方向にこの順で配ると、参照映像の大ファンと
 * 同じ「端から端へ色が変わる」グラデーションになる)。
 *
 * 参照映像のレーザーはシアン/緑/黄/マゼンタ(TRACK_NOTES.md §4.1: 緑は
 * 常に「動く光」として使われる)。Searchlight の BEAM_COLORS は当初
 * 緑(#6effb0)とピンク(#ff4fa3)を外していたが、ビームに緑を使わないのは
 * §4.1 と矛盾するため緑を復活させてある(constants.ts のコメント参照)。
 * ここでも同じ緑を使い、既にこのシーンで使われている色
 * (#8b6cff = BEAM_COLORS の紫 / #ffab3d = 提灯・天守ライトアップの暖色 /
 * #ff3d86 = マゼンタ)に、映像の寒色端としてシアンを1色だけ
 * 足す構成にしている。シアン(#3ee0ff)と紫(#8b6cff)は投影光
 * (PROJECTION_COLOR_CYAN / PROJECTION_COLOR_VIOLET)と共通で、
 * 投影はこのパレットの寒色側だけを抜き出した配色になっている。
 */
export const CASTLE_BEAM_PALETTE: readonly string[] = [
  "#3ee0ff", // シアン(映像の寒色端。投影光の PROJECTION_COLOR_CYAN と共通)
  "#6effb0", // 緑 = BEAM_COLORS(参照映像のビームは緑を使う。§4.1参照)
  "#8b6cff", // 紫 = BEAM_COLORS / 投影光の PROJECTION_COLOR_VIOLET
  "#ff3d86", // ピンク(マゼンタ。映像の主アクセント)
  "#ffab3d", // 琥珀(提灯・天守ライトアップ。投影光はサビの一撃でだけこの金)
];

/* ------------------------------------------------------------------ *
 * 高さの正規化 ―― 「点灯フロント」の土台
 * ------------------------------------------------------------------ */

/**
 * リグの下端/上端(ワールドY)。**96本ぶんの実際の取り付け高さから求める**
 * (勘で置いた値ではない)。下端は隅櫓の最下層の軒、上端は天守の最上層の軒。
 *
 * この2つで灯の高さを 0〜1 に正規化した値(heightNorm)が、下の
 * heightGate に渡る「何本灯すか」の唯一の入力になる。
 */
export const CASTLE_RIG_BOTTOM_Y = TOWER_ROOF_TIERS[0].y;
export const CASTLE_RIG_TOP_Y =
  CASTLE_ROOF_TIERS[CASTLE_ROOF_TIERS.length - 1].y;

/** 灯の取り付け高さ(ワールドY)を 0(リグ下端)〜1(リグ上端)へ正規化する */
export function castleRigHeightNorm(y: number): number {
  const span = CASTLE_RIG_TOP_Y - CASTLE_RIG_BOTTOM_Y;
  if (span <= 0) return 0;
  const k = (y - CASTLE_RIG_BOTTOM_Y) / span;
  return k < 0 ? 0 : k > 1 ? 1 : k;
}

/**
 * 点灯フロントの厚み(heightNorm 単位)。0にすると本数が段階的にパッと
 * 増えてしまう。ここで境界をぼかすと、フロントが降りてくる途中の層が
 * 中間の明るさで灯り、**本数が連続的に増えていく**ように見える。
 */
const FRONT_FEATHER = 0.16;

/**
 * 灯が点いているか(0〜1)。
 *
 * **これが「本数」の唯一の実装。** density=0 でフロントは天守のてっぺんより
 * 上にあり1本も灯らない。density が上がるとフロントが城を**降りて**いき、
 * それより高い位置の灯が順に点いていく。density=1 で隅櫓の足元まで全灯。
 *
 * 高さだけで決まるので、**左右対称は常に保たれる**(x に依存しない)。
 * 「静かな箇所は天守のてっぺんだけ、サビは城と櫓が丸ごと光る」という
 * 参照映像どおりの落差が、この1本の式だけで出る。
 *
 * 実際の本数(96本の内訳。上から順に累積。この表は実測で検算してある):
 *   density 0.08 →  8本(薄く) / 0.12 →  8本 / 0.30 → 16本 /
 *   density 0.55 → 34本       / 0.85 → 80本 / 1.00 → 96本
 */
export function heightGate(heightNorm: number, density: number): number {
  /*
    density=0 で front=1(最上段のちょうど上=全消灯)、density=1 で
    front=-FRONT_FEATHER(最下段より下=全点灯)。

    **1+FRONT_FEATHER を掛けるのを忘れないこと。** ここを (1-density) だけに
    すると density=1 でも最下段(heightNorm=0)が灯りきらない。逆に係数を
    大きくしすぎると(以前 1+FEATHER*2 にしていた)、density が小さいときに
    front が 1 を超えて**最上段まで消え、城の光が丸ごと落ちる**
    (breath 0.12 / fade 0.08 が0本になっていた)。
  */
  const front = 1 - density * (1 + FRONT_FEATHER);
  const k = (heightNorm - front) / FRONT_FEATHER;
  const c = k < 0 ? 0 : k > 1 ? 1 : k;
  return c * c * (3 - 2 * c);
}

/* ------------------------------------------------------------------ *
 * キュー表
 * ------------------------------------------------------------------ */

/**
 * 灯ごとの位相のずらし方。**どれも灯の取り付け位置から決まる決定的な並び**で、
 * 「次はどれが光るか」が目で追える形にしてある(Searchlight の BeamPattern と
 * 同じ趣旨だが、あちらが円周上の12点なのに対しこちらは**高さを持つ**ので、
 * 縦に走る波が使える)。
 *
 * - unison:  全灯同位相。剛体そのもの。参照映像 3:15 の緑のファンがこれ
 * - rise:    下から上へ波が駆け上がる。城が下から順に光る
 * - ring:    城のまわりを一周する。光が城をぐるりと回る
 * - spiral:  上へ登りながら回る。rise と ring の合成。サビ用の一番派手なやつ
 * - split:   高さの偶奇で逆位相。上下の層が噛み合って動く
 */
export type CastleBeamPattern = "unison" | "rise" | "ring" | "spiral" | "split";

/** セクション1つぶんの照明キュー。実機の照明卓で言う「シーン」1つ */
export type CastleBeamCue = {
  /** 全体の明るさ倍率。1が基準 */
  level: number;
  /**
   * **灯す本数の割合(0〜1)。このリグの主役の値。**
   * 0で全消灯、1で96本全点灯。heightGate 経由で「上から順に」効く。
   */
  density: number;
  /**
   * **水平からの基準の仰角(ラジアン)。正で上向き。**
   *
   * lift と liftSwing は組で意味を持つ:「lift ± liftSwing」が実際の
   * 可動範囲になる。**ユーザーが横から見た可動域の図を手描きして指定**
   * しており、それによると建物のビームは
   * 「真上(π/2)〜水平を超えて見下ろす向き(マイナス)」という
   * 広い範囲を動く。上限(π/2 = 真上)は全セクション共通で固定し、
   * 下限だけをセクションの盛り上がりに応じて下げる(静かな箇所は水平より
   * 上まで、サビは下向きまで)。CASTLE_LIFT_UPPER / castleLiftFromRange
   * で「上限固定・下限だけ指定」の形に組んでいるので、キュー表側は
   * 下限の角度をひとつ書くだけでよい。
   */
  lift: number;
  /** 上下の揺れ幅(ラジアン)。上の仰角を中心に往復する */
  liftSwing: number;
  /** 左右スイングの振幅(ラジアン) */
  yaw: number;
  /** スイープの周期(小節)。大きいほどゆっくり首を振る */
  swingBars: number;
  /** 位相のずらし方 */
  pattern: CastleBeamPattern;
  /** パターンの位相がリグ全体に渡る量(周)。大きいほど波が細かく分かれる */
  waveSpread: number;
  /** 走る光(チェイス)が一周するのにかかる小節数 */
  chaseBars: number;
  /** チェイスの深さ。0=全灯同じ明るさ、1に近いほど「一部だけ光る」 */
  chaseDepth: number;
  /** 拍のストロボの深さ */
  strobe: number;
  /** 何小節ごとに色を送るか */
  colorBars: number;
  /**
   * パレットをリグの高さ方向へどれだけ広げるか。
   * 0=全灯同じ色(単色) / 1=パレット全色が端から端へ並ぶ(参照映像の大ファン)
   */
  colorSpread: number;
  /** 地の暖色(CASTLE_BEAM_WARM)からパレット色へどれだけ寄せるか(0〜1) */
  tint: number;
  /** ヘッドの首振りの追従速度(1/秒)。大きいほど機敏に向きを変える */
  slew: number;
  /**
   * **隅櫓(isTower)のビームだけに使う点灯フロント。省略すると density と同じ。**
   * 天守の下層と隅櫓の上層は heightNorm が重なるので、ひとつの density では
   * 「天守は4層・隅櫓は最上層だけ」といった作り分けができない。隅櫓側を
   * これで別に指定する。今は breath だけ 0(隅櫓を全消灯 = 天守だけ残す。
   * ユーザー指定)。他のセクションは未指定 = density と同じ。
   */
  towerDensity?: number;
};

/**
 * 首振りの上限(ラジアン)。**全セクション共通で固定。**
 * ユーザーが手描きした可動域の図で、すべての色(足元・建物とも)の矢印が
 * 根元から真上へ伸びていた = 「上に向く分にはどのセクションでも同じだけ
 * 振れる」という意味だと解釈し、ここだけ固定にした。
 * π/2 = ちょうど真上(水平から90°)。首振りの一番上の瞬間だけここに届く。
 */
const CASTLE_LIFT_UPPER = Math.PI / 2;

/**
 * lift/liftSwing を「上限(CASTLE_LIFT_UPPER で固定)・下限(セクションごとに
 * 指定)」の形から逆算する。CUES 側は下限の角度をひとつ書くだけでよくなる。
 *
 * @param lower 下限の仰角(ラジアン)。マイナスなら水平を超えて見下ろす向き
 *   まで振れる(ユーザーの図の「赤(建物)」がここまで下がっていた)。
 */
function castleLiftFromRange(lower: number): { lift: number; liftSwing: number } {
  return {
    lift: (CASTLE_LIFT_UPPER + lower) / 2,
    liftSwing: (CASTLE_LIFT_UPPER - lower) / 2,
  };
}

/**
 * セクションごとのキュー表。songStructure.ts の REPLY_SECTIONS と1対1。
 *
 * **density の段が演出の背骨**。TRACK_NOTES.md §4.3 のとおり、元映像は
 * カット割りではなく「密度」で盛り上がりを作っている。ここもそれに倣って
 * 静→動の落差を本数で付ける:
 *
 *   intro-B 1.00(11秒の一斉点灯) → breath 0.68 → A 0.68 →
 *   B 0.55(サビへ溜める) → SABI 1.00(全点灯) → LATTER 0.85 → outro 0.40 → fade 0.08
 *
 * 天守と隅櫓は別々に効かせられる(towerDensity。省略時は density と同じ)。
 * 今は breath だけ density 0.68 / towerDensity 0 = 天守だけ残す(櫓は消灯)。
 * 以前 breath は density 0.12 で天守のてっぺん8本だけ残していたが、
 * 「レーザーが消えたあと天守の上だけになる」のを嫌ってやめた。
 * サビの落差は SABI 1.00(全点灯)と、A/B より上げた明るさ・速さで付ける。
 */
export const CASTLE_BEAM_CUES: Record<ReplySectionName, CastleBeamCue> = {
  /*
    11秒より手前でビームはまだ点いていない(activation が0)ので実際には
    使われないが、intro-B へのクロスフェード元として参照されるため
    intro-B と同じ値を置く(Searchlight の CUES と同じ扱い)。
  */
  "intro-A": {
    level: 1,
    density: 1,
    ...castleLiftFromRange(0.6),
    yaw: 0.06,
    swingBars: 2,
    pattern: "unison",
    waveSpread: 0,
    chaseBars: 4,
    chaseDepth: 0,
    strobe: 0.12,
    colorBars: 4,
    colorSpread: 0,
    tint: 0.2,
    slew: 9,
  },
  /*
    11.05秒のベース入り = 会場の照明が一斉に入る瞬間。ここは**全点灯**で
    「バッと点いた」を見せる(density を下げると点灯の瞬間が弱くなる)。
    動きは浅く、色も地の暖色寄り。ここで色まで散らすと後のサビで上が無くなる。
  */
  "intro-B": {
    level: 1,
    density: 1,
    ...castleLiftFromRange(0.6),
    yaw: 0.08,
    swingBars: 2,
    pattern: "rise",
    waveSpread: 0.5,
    chaseBars: 4,
    chaseDepth: 0.12,
    strobe: 0.14,
    colorBars: 4,
    colorSpread: 0.25,
    tint: 0.3,
    slew: 9,
  },
  /*
    歌前の間。**天守だけビームを残す**(ユーザー指定「レーザーが消えて
    天守の上だけになるのを、天守全体残して。ただし櫓からは出さない」)。
    density 0.68 で天守の4層すべてに点灯フロントが届く。隅櫓は heightNorm が
    天守下層と重なるので同じ density だと一緒に出てしまう ―― towerDensity 0 で
    隅櫓のビームだけ全消灯。静けさは level を落とし、動き(swingBars 8 /
    strobe 0.02)と色(colorSpread 0)をほぼ止めて出す。
  */
  breath: {
    level: 0.42,
    density: 0.68,
    towerDensity: 0,
    ...castleLiftFromRange(0.75),
    yaw: 0.02,
    swingBars: 8,
    pattern: "unison",
    waveSpread: 0,
    chaseBars: 8,
    chaseDepth: 0.1,
    strobe: 0.02,
    colorBars: 8,
    colorSpread: 0,
    tint: 0.15,
    slew: 2.5,
  },
  /*
    Aメロ。ゆっくり上下して歌の邪魔をしない。
    density は 0.3(上から2層ほど)だったが、ユーザー指定で **天守の4層すべて**
    ビームを出すため 0.68 へ。天守の一番下のビーム層(heightNorm≈0.35)まで
    点灯フロントが届く値。隅櫓は towerDensity 未指定=density と同じなので
    最上層だけ(ユーザー指定「櫓は前と同じ一番上だけ」)。
  */
  A: {
    level: 0.68,
    density: 0.68,
    ...castleLiftFromRange(0.5),
    yaw: 0.05,
    swingBars: 4,
    pattern: "rise",
    waveSpread: 0.6,
    chaseBars: 4,
    chaseDepth: 0.35,
    strobe: 0.07,
    colorBars: 4,
    colorSpread: 0.3,
    tint: 0.4,
    slew: 3.5,
  },
  // Bメロ。フロントを城の中ほどまで下ろし、チェイスを回してサビへ溜める
  B: {
    level: 0.85,
    density: 0.55,
    ...castleLiftFromRange(0.15),
    yaw: 0.1,
    swingBars: 2,
    pattern: "ring",
    waveSpread: 1,
    chaseBars: 2,
    chaseDepth: 0.55,
    strobe: 0.14,
    colorBars: 2,
    colorSpread: 0.6,
    tint: 0.7,
    slew: 6,
  },
  /*
    サビ。**全点灯 + 色を端から端まで配る + 上へ登る渦。**
    density を 0.55 → 1.0 へ一気に上げるので、Bメロの34本から96本へ
    ほぼ3倍に増える。これが「サビで本数が増える」の実体。
  */
  SABI: {
    level: 1.4,
    density: 1,
    // 下限マイナス = 水平を超えて見下ろす向きまで振る(可動域の図の最大)
    ...castleLiftFromRange(-0.45),
    yaw: 0.16,
    swingBars: 1,
    pattern: "spiral",
    waveSpread: 1.5,
    chaseBars: 1,
    chaseDepth: 0.6,
    strobe: 0.3,
    colorBars: 1,
    colorSpread: 1,
    tint: 1,
    slew: 13,
  },
  // 後半。サビの熱を保ちつつ、フロントを少し戻して波を半分の速さにする
  LATTER: {
    level: 1.25,
    density: 0.85,
    ...castleLiftFromRange(-0.25),
    yaw: 0.13,
    swingBars: 1,
    pattern: "spiral",
    waveSpread: 1,
    chaseBars: 2,
    chaseDepth: 0.5,
    strobe: 0.22,
    colorBars: 1,
    colorSpread: 0.85,
    tint: 0.9,
    slew: 10,
  },
  // アウトロ。同位相へ戻し、色を抜きながらフロントを上げて静かに引く
  outro: {
    level: 0.75,
    density: 0.4,
    ...castleLiftFromRange(0.35),
    yaw: 0.04,
    swingBars: 4,
    pattern: "rise",
    waveSpread: 0.5,
    chaseBars: 4,
    chaseDepth: 0.2,
    strobe: 0.08,
    colorBars: 2,
    colorSpread: 0.3,
    tint: 0.45,
    slew: 3.5,
  },
  // フェード。天守のてっぺんだけ残して消えていく
  fade: {
    level: 0.35,
    density: 0.08,
    ...castleLiftFromRange(0.75),
    yaw: 0,
    swingBars: 8,
    pattern: "unison",
    waveSpread: 0,
    chaseBars: 8,
    chaseDepth: 0,
    strobe: 0,
    colorBars: 8,
    colorSpread: 0,
    tint: 0.15,
    slew: 2,
  },
};

/**
 * サビ・後半の頭で焚く一撃を出すセクション。Searchlight の HIT_SECTIONS と
 * 揃えてあり、足元のサーチライトと建物の光が同じ瞬間に「バーン」と来る。
 */
const HIT_SECTIONS: readonly ReplySectionName[] = ["SABI", "LATTER"];
/** 一撃が減衰するまでの秒数(指数減衰の時定数)。Searchlight の HIT_DECAY と同値 */
const HIT_DECAY = 0.85;
/** 一撃で上乗せする明るさ */
export const CASTLE_HIT_LEVEL = 0.8;

/**
 * サビ・後半の頭の一撃のエンベロープ(0〜1)。指数減衰。
 *
 * sampleCastleRig の中で base に混ぜ込んでいるのと同じ値だが、こちらは
 * **単体で取り出せる**。EdoCastle / CornerTowers の投影光
 * (castleBuildShader の uProjHit)を、この瞬間だけ金へフラッシュさせるのに使う
 * ―― 足元サーチライト・建物のビームが「バーン」と来るのと同じ拍・同じ時定数。
 */
export function castleHitAt(t: number): number {
  const time = Number.isFinite(t) ? t : 0;
  const section = REPLY_SECTIONS[replySectionIndexAt(time)];
  if (!HIT_SECTIONS.includes(section.name)) return 0;
  const since = Math.max(time - section.start, 0);
  return Math.exp(-since / HIT_DECAY);
}

/** 小節頭にだけ足すアクセント。Searchlight の BAR_ACCENT と同値 */
const BAR_ACCENT = 0.16;

/* ------------------------------------------------------------------ *
 * サンプリング
 * ------------------------------------------------------------------ */

/**
 * ある時刻のリグの状態。**毎フレーム useFrame から読むので、
 * 呼び出し側が1個持ち回して使い回す**(戻り値を new しない)。
 */
export type CastleRigSample = {
  /** 灯ごとの明るさの土台(density・チェイス・高さゲートを掛ける前) */
  base: number;
  /** 灯す本数の割合 0〜1 */
  density: number;
  /** 水平からの基準の仰角(ラジアン) */
  lift: number;
  /** 上下の揺れ幅(ラジアン) */
  liftSwing: number;
  /** 左右スイングの振幅(ラジアン) */
  yaw: number;
  /** スイープの位相(周。小数部だけ意味がある) */
  swingPos: number;
  /** チェイスの位相(周) */
  chasePos: number;
  /** 位相のずらし方 */
  pattern: CastleBeamPattern;
  /** パターンの位相がリグ全体に渡る量(周) */
  waveSpread: number;
  /** チェイスの深さ */
  chaseDepth: number;
  /** 今の色スロット(整数。変わったフレームだけ塗り替える判定に使う) */
  colorSlot: number;
  /** パレットの広がり */
  colorSpread: number;
  /** 暖色からパレット色への寄せ具合 */
  tint: number;
  /** ヘッドの追従速度(1/秒) */
  slew: number;
  /** 今のセクションの添字(色の塗り直し判定に使う) */
  sectionIndex: number;
  /** 隅櫓のビームだけに使う点灯フロント。CastleBeamCue.towerDensity 参照 */
  towerDensity: number;
};

/** 使い回す入れ物を1つ作る。コンポーネント側で useMemo して持つ */
export function createCastleRigSample(): CastleRigSample {
  return {
    base: 0,
    density: 0,
    lift: 0,
    liftSwing: 0,
    yaw: 0,
    swingPos: 0,
    chasePos: 0,
    pattern: "unison",
    waveSpread: 0,
    chaseDepth: 0,
    colorSlot: 0,
    colorSpread: 0,
    tint: 0,
    slew: 4,
    sectionIndex: 0,
    towerDensity: 0,
  };
}

/** なめらかな加減速。キューのクロスフェードに使う */
function smoothstep(x: number) {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

function mix(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

/**
 * 曲の再生位置 t(秒)からリグの状態を引いて out へ書く。
 *
 * セクションの段は ramp 秒かけてクロスフェードする(段差のまま使うと
 * 境界のフレームで本数と明るさが跳ねて「カットが入った」ように見える。
 * 演出強度 energy のタイムライン(replyTimelineData.ts)が、セクションの
 * 境界に2点ずつキーを打って同じ形を作っているのと同じ考え方)。
 *
 * **周期(swingBars / chaseBars / colorBars)とパターンは離散のまま切り替える。**
 * 補間すると位相が飛ぶ。飛びは呼び出し側の首振りのなまし(slew)が吸収する。
 */
export function sampleCastleRig(
  t: number,
  out: CastleRigSample,
): CastleRigSample {
  const time = Number.isFinite(t) ? t : 0;

  // barPos は曲頭では負になる。Math.floor で引けば負でも 0〜1 に収まる
  const barPos = (time - REPLY_BAR_ORIGIN) / REPLY_BAR_SECONDS;
  const barPhase = barPos - Math.floor(barPos);

  const si = replySectionIndexAt(time);
  const section = REPLY_SECTIONS[si];
  const cue = CASTLE_BEAM_CUES[section.name];
  const prev = CASTLE_BEAM_CUES[REPLY_SECTIONS[Math.max(si - 1, 0)].name];
  const since = Math.max(time - section.start, 0);
  const k = section.ramp > 0 ? smoothstep(since / section.ramp) : 1;

  /*
    サビ・後半の頭の一撃。明るさを上乗せしつつ、点灯フロントを強制的に
    下げきる = **一瞬だけ全灯**になる。曲の山でだけ城が丸ごと光る役。
  */
  const hit = HIT_SECTIONS.includes(section.name)
    ? Math.exp(-since / HIT_DECAY)
    : 0;

  const density = mix(prev.density, cue.density, k);
  out.density = density + (1 - density) * hit;
  out.lift = mix(prev.lift, cue.lift, k);
  out.liftSwing = mix(prev.liftSwing, cue.liftSwing, k);
  out.yaw = mix(prev.yaw, cue.yaw, k);
  out.chaseDepth = mix(prev.chaseDepth, cue.chaseDepth, k);
  out.colorSpread = mix(prev.colorSpread, cue.colorSpread, k);
  out.tint = mix(prev.tint, cue.tint, k);
  out.slew = mix(prev.slew, cue.slew, k);
  out.towerDensity = mix(
    prev.towerDensity ?? prev.density,
    cue.towerDensity ?? cue.density,
    k,
  );
  out.waveSpread = mix(prev.waveSpread, cue.waveSpread, k);
  out.pattern = cue.pattern;
  out.sectionIndex = si;

  out.swingPos = barPos / cue.swingBars;
  out.chasePos = barPos / cue.chaseBars;
  out.colorSlot = Math.floor(barPos / cue.colorBars);

  /* 拍の明滅。小節頭だけ一段上げる(Searchlight と同じ式) */
  const strobe = mix(prev.strobe, cue.strobe, k);
  const beatPos = (time - REPLY_BEAT_OFFSET) / REPLY_BEAT_SECONDS;
  const beatPhase = beatPos - Math.floor(beatPos);
  const pulse = 1 - strobe * (1 - Math.pow(1 - beatPhase, 2.5));
  const accent = BAR_ACCENT * Math.pow(1 - barPhase, 5);
  const level = mix(prev.level, cue.level, k);
  out.base = level * (pulse + accent) + hit * CASTLE_HIT_LEVEL;

  return out;
}

/**
 * 灯ごとの位相のずらし量(0〜1)。**乱数を使わないこと。**
 * ここが「取り付け位置から決まる並び」であることが、動きの順番が
 * 目で追える(= 実機の照明卓に見える)ことの根拠になっている。
 *
 * @param heightNorm 灯の高さ 0(リグ下端)〜1(リグ上端)
 * @param azimuth    城の中心から見た方位 0〜1(1周)
 */
export function castleBeamPhase(
  pattern: CastleBeamPattern,
  spread: number,
  heightNorm: number,
  azimuth: number,
): number {
  switch (pattern) {
    case "rise":
      // 下から上へ。城を駆け上がる波
      return -heightNorm * spread;
    case "ring":
      // 城のまわりを一周。左右対称はあえて崩して「回る光」にする
      return azimuth * spread;
    case "spiral":
      // 登りながら回る。rise と ring の合成
      return (azimuth - heightNorm) * spread;
    case "split":
      // 高さの偶奇で逆位相。層が噛み合って動く
      return (Math.floor(heightNorm * 6) % 2) * 0.5;
    default:
      return 0;
  }
}
