"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type SpriteMaterial,
} from "three";
import {
  createSearchlightPaletteBuffer,
  sampleSearchlightSectionPalette,
} from "./beamSectionPalette";
import {
  BEAM_COLORS,
  CASTLE_HALF_DEPTH,
  CASTLE_HALF_WIDTH,
  REPLY_B_BLINK_START_SECONDS,
  REPLY_B_HUSH_FADE_SECONDS,
  REPLY_B_HUSH_START_SECONDS,
  REPLY_B_NORTH_SPOT_START_SECONDS,
  REPLY_B_RISER_BEAT_DIVISOR,
  REPLY_B_SOUTH_SPOT_START_SECONDS,
  REPLY_BAR_ORIGIN,
  REPLY_BAR_SECONDS,
  REPLY_BEAT_OFFSET,
  REPLY_BEAT_SECONDS,
  REPLY_BEAT_SYNC_BLINK_FLOOR,
  REPLY_BEAT_SYNC_BLINK_ON,
  REPLY_BEAT_SYNC_SECTIONS,
  REPLY_INTRO2_LASER_HIGH,
  REPLY_INTRO2_LASER_LOW,
  REPLY_INTRO2_LASER_MID,
} from "./constants";
import {
  REPLY_SECTIONS,
  replySectionIndexAt,
  type ReplySectionName,
} from "./songStructure";
import {
  CORNER_TOWER_XZ,
  TOWER_HALF_DEPTH,
  TOWER_HALF_WIDTH,
} from "./towerLayout";

/*
  用語(reply の照明は光源の場所で呼び分ける。ユーザー指定の呼び名):
    Searchlight = このファイル。**足元**(水面すぐ上)から空へ撃つ 12 本。
    BeamLight   = 屋根の端(軒)から出るビーム 80 本(BeamLight.tsx。細い光条)。
    WashLight   = 破風から出るウォッシュライト 16 本(WashLight.tsx。広がりで面を染める)。
  BeamLight + WashLight の 96 本は castleBeamRig.ts が動かす。Searchlight は
  それとは別リグで、下の CUES がセクションごとに動きを切り替える。
*/

/**
 * 本数。**必ず偶数**にすること。天守の四辺(前後左右)それぞれの外側、
 * 隅櫓と隅櫓の隙間の位置に2点ずつ(4辺×2点=8)+ 隅櫓4棟それぞれの外側の角
 * (天守から一番遠い、外周のコーナー)に1点ずつ(4点)=計12。並び順(下の
 * BEAM_POINTS)は i と (BEAM_COUNT-1-i) が X=0 の面でちょうど鏡像の
 * ペアになるよう組んであり、扇の開き具合もこのペア単位で左右対称に決まる。
 * 参照映像(Reply.mp4)の照明は左右がぴったり対称に動いていて、それが
 * 「会場に組んだリグ」に見える理由になっている。
 */
const BEAM_COUNT = 12;
const BEAM_HALF = BEAM_COUNT / 2;

/**
 * ビームの長さ。
 *
 * 引きの画で先端が画面内に収まると光がぶつ切りに見えるので、空へ抜けきる
 * 長さまで伸ばし、さらにシェーダー側で先端を完全に減衰させて切れ目を消す
 * (BEAM_FRAGMENT 参照)。水面(半径400)の内側には収まる。
 */
const BEAM_LENGTH = 220;
/**
 * 先端の半径。根元は0(コーンの頂点)で、先へ行くほど広がる。
 * 参照映像のビームは細くシャープな筋なので絞ってある。細くしても
 * 断面の芯(BEAM_FRAGMENT の core)で見えなくならない。
 */
const BEAM_RADIUS = 9;
/** 光源の高さ。水面のすぐ上から放つ */
const BEAM_ORIGIN_Y = 2.5;
/**
 * 光源を天守の辺の外へどれだけ出すか(その辺と垂直な方向、前後辺なら
 * CASTLE_HALF_DEPTH・左右辺なら CASTLE_HALF_WIDTH に掛ける係数)。
 *
 * **天守の外周より外に出すこと。** 固定値(7)にしていたころは、
 * CASTLE_SCALE を上げて天守が大きくなった結果、光源が天守の内側に埋まり、
 * ビームが石垣の途中から生えているように見えていた。天守の底面の広がり
 * (実測で半径約19.7)に追従させて、常に外側から放つようにする(旧
 * BEAM_ORIGIN_RADIUS と同じ係数)。
 */
const BEAM_EDGE_OUTSET = 1.4;
/**
 * 辺に沿った方向へ中心からどれだけ離すか(前後辺なら CASTLE_HALF_WIDTH・
 * 左右辺なら CASTLE_HALF_DEPTH に掛ける係数)。0だと辺の中央(隅櫓から
 * 一番遠い1点)に重なってしまうので、中心と隅櫓のだいたい中間に来る値を
 * 目視で選んである。大きすぎると隅櫓に近づきすぎて埋もれる。
 * (0.55だと各辺の2本が離れすぎて見えたため、少し中心寄りに詰めてある)
 */
const BEAM_EDGE_SPREAD = 0.35;

/* ------------------------------------------------------------------ *
 * 動き。**ユーザーが上から見た配置図を手描きして指定**した軌道をそのまま
 * 実装している(赤=灯の位置固定、青=その灯の照射方向が描く軌道)。
 *
 *   隅の4本(隅櫓の外側の角。Beam.isCorner=true): 東(+X)→北(+Z)→
 *     西(-X)→南(-Z)の順に、直線的に振れて戻る「十字」の軌道。
 *   辺の8本(天守の四辺。Beam.isCorner=false): 方位を連続的に一周させる
 *     「円」の軌道。
 *
 * 以前は全灯が「垂直⇔外向きの扇」を開閉するだけの1軸の動き
 * (reply.mp4 から実測した周期のフィット)だったが、指定によりこちらへ
 * 置き換えた。**周期・振れ幅・色・明るさの制御(下の CUES)は変えていない**
 * ―― セクションごとの盛り上がりに応じて速さ・振れ幅・色を切り替える仕組み
 * はそのまま活きていて、「軌道の形」だけが十字/円になった。
 *
 * **ここに足してよい変化と、足してはいけない変化がある。**
 *   足してよい: 灯ごとに *決まった順番* で位相をずらす(チェイス・波)。
 *     どの灯がいつ光るかが空間的に読み取れるので、実機の照明卓と同じに見える。
 *   足してはいけない: 拍ごとのランダム抽選、灯ごとの乱数位相。
 *     規則が読めず、実機で見るとかなり気持ち悪い動きになる。
 * ------------------------------------------------------------------ */

/**
 * 首振りの最大の傾き(垂直からの角度、ラジアン)。隅の十字・辺の円のどちらも
 * この振れ幅を基準にする。cue.spread(0〜1)を掛けて、以前の「開閉」の
 * 代わりにする(spread=0で真上を向いたまま静止、1でこの角度まで振る)。
 *
 * **ユーザーが横から見た可動域の図を手描きして指定**しており、それによると
 * 足元のライトは「垂直〜かなり水平に近い角度」まで動く(建物からのビーム
 * (castleBeamRig.ts の CASTLE_LIFT_UPPER 系)は水平を超えて見下ろす向きまで
 * 振れるが、足元は地面すれすれの根元なので水平までに留める)。
 * 1.3rad(≒75°)は元の0.85rad(≒49°)よりだいぶ寝かせた値。
 */
const MAX_SWING = 1.3;

/** 小節頭にだけ足すアクセント */
const BAR_ACCENT = 0.16;

/** 波(wave)のとき、扇の内→外でずらす位相の量(小節に対する割合) */
const WAVE_SPREAD = 0.42;

/**
 * 灯ごとの位相のずらし方。**どれも添字から決まる決定的な並び**で、
 * 「次はどれが光るか」が目で追える形にしてある。
 *
 * - unison: 全灯同位相。実測どおりの素の動き
 * - wave:   扇の内→外へ波が広がる。左右対称は保たれる
 * - chase:  円周に沿って順番に。光が会場をぐるりと回る
 * - split:  1本おきに逆位相。開く灯と閉じる灯が噛み合う
 * - crossX: 左右のペアが中央線をまたいでX字に交差(reply.mp4 4〜9秒)。
 *           イントロ2専用。点く灯・色は INTRO2_SOLO で固定する
 */
type BeamPattern = "unison" | "wave" | "chase" | "split" | "crossX";

/**
 * セクション1つぶんの照明キュー。実機の照明卓で言う「シーン」1つ。
 * 曲の構成(songStructure.ts)に合わせて切り替える。
 */
type BeamCue = {
  pattern: BeamPattern;
  /**
   * 首振り(十字/円)の周期(小節)。大きいほどゆっくり動く
   * (隅は1周=4方向を巡る周期、辺は1周=円を1周する周期)。
   */
  sweepBars: number;
  /** 走る光(チェイス)が一周するのにかかる小節数 */
  chaseBars: number;
  /** チェイスの深さ。0=全灯同じ明るさ、1に近いほど「1本だけ光る」 */
  chaseDepth: number;
  /** 全体の明るさ倍率。1が基準 */
  level: number;
  /** 首振りの振れ幅の上限。0で真上に静止(光の柱)、1でMAX_SWINGまで振る */
  spread: number;
  /** 拍のストロボの深さ */
  strobe: number;
  /** 何小節ごとに色を替えるか */
  colorBars: number;
  /** 円周に沿ってパレット全色を配るか。false なら従来の2色 */
  ringColors: boolean;
  /** ヘッドの首振りの追従速度(1/秒)。大きいほど機敏に向きを変える */
  slew: number;
};

/**
 * セクションごとのキュー表。
 *
 * intro-A はビームが点く前(11秒より手前)なので実際には使われないが、
 * intro-B へのクロスフェード元として参照されるため intro-B と同じ値を置く。
 * **intro-B は11秒の点灯の瞬間そのものなので、従来の見え方を保つ**
 * (全開・全灯・最大の明るさ)。動きだけ、ごく浅い波にしてある。
 */
const CUES: Record<ReplySectionName, BeamCue> = {
  /*
    intro-A は11秒より手前=ビームが点く前なので実際には描画されないが、
    intro-B へのクロスフェード元(prev)として数値が参照されるため
    intro-B と同じ値を置く(11秒で何も動かないように)。
  */
  "intro-A": {
    pattern: "crossX",
    sweepBars: 2,
    chaseBars: 2,
    chaseDepth: 0.12,
    level: 1,
    spread: 0.55,
    strobe: 0.16,
    colorBars: 4,
    ringColors: false,
    slew: 7,
  },
  /*
    イントロ2。ユーザー指定で reply.mp4 4〜9秒のサーチライトに寄せる:
    - 点くのは図の6灯だけ(INTRO2_SOLO。残り6灯はこの区間だけ消灯)
    - 動きは左右ペアが中央線をまたいでX字に交わるシザース(pattern crossX)
    - 色は図に合わせた固定色(INTRO2_SOLO)
    sweepBars 2 = 1シザース(交差→開く)で2小節≒2.82秒。§2.1 のイントロの
    2小節パルスと同じ間隔。spread 0.55 = 交差時の傾きが最大 MAX_SWING*0.55
    ≒ 41°(足元なので水平までは寝かせない)。
  */
  "intro-B": {
    pattern: "crossX",
    sweepBars: 2,
    chaseBars: 2,
    chaseDepth: 0.12,
    level: 1,
    spread: 0.55,
    strobe: 0.16,
    colorBars: 4,
    ringColors: false,
    slew: 7,
  },
  /*
    歌前の間。イントロ2レーザーの6本を **(1) まっすぐ上に立てて (2) 城の
    ビームと同じ 1.4秒の ramp でフェードアウト** させる(ユーザー指定)。
    - (1): 円軌道の辺の灯は polar = MAX_SWING*spread の一定の傾きで回り続け、
      spread を下げても真上に来ない(十字の隅の灯は polar が 0 を通過するので
      上を向いて見える ← この左右差が「オレンジ(辺の5・6)だけ斜め」の正体)。
      下の useFrame の standUp 分岐で軌道に関係なく polar=0 へ向ける。
      イントロ2レーザーからの向き替えは slew の slerp が滑らかに繋ぐ。
    - (2): level:0 なので level0 = mix(1, 0, k) が castleBeamRig の density/level
      と同じ k(= smoothstep(since/1.4))で落ちる = 城のビームと同時に消える。
    色は castle パレットへ替えずイントロ2の色のまま(色の分岐の
    (crossX || prevCrossX) 参照)。図に無い6灯は breath では点け直さない
    (下の solo 参照)。
  */
  breath: {
    pattern: "unison",
    sweepBars: 4,
    chaseBars: 4,
    chaseDepth: 0.1,
    level: 0,
    spread: 0.22,
    strobe: 0.04,
    colorBars: 4,
    ringColors: false,
    slew: 3,
  },
  // Aメロ。**サーチライトは消す**(ユーザー指定)。他は breath→B の
  // クロスフェード用に無害な値を置くだけ。
  A: {
    pattern: "wave",
    sweepBars: 2,
    chaseBars: 4,
    chaseDepth: 0.3,
    level: 0,
    spread: 0.5,
    strobe: 0.1,
    colorBars: 4,
    ringColors: false,
    slew: 4,
  },
  /*
    Bメロ(49.5〜56.8秒のリザー前)。ユーザー指定「イントロ2の南側の
    サーチライトと同じ速度、動きをするようにして」で pattern を crossX に
    変更 ―― isBeatSync が先に判定される分岐順序(useFrame内)のおかげで、
    リザー(56.8秒〜。isBeatSync=true)にはこの変更は効かず、前後スナップの
    ままになる。crossX の速さ(INTRO2_SWEEP_SCALE)は intro-2 だと南(1・10)が
    遅く北(4・7)が速い非対称だが、Bは両方とも南と同じ遅さに揃える
    (useFrame内のcrossXScale参照)。

    **sweepBars も intro-B と同じ2に揃えること。** crossX の周期は
    `cue.sweepBars * crossXScale` の積で決まるので、crossXScaleだけ
    北=南(2倍)に揃えてもsweepBarsがBの元の値(1)のままだと、intro-2
    (sweepBars=2)のちょうど半分の周期=2倍速のままになってしまう
    (ユーザー指摘「49.5秒〜56.8秒のサーチライトの動きが早い」の正体)。
  */
  B: {
    pattern: "crossX",
    sweepBars: 2,
    chaseBars: 2,
    chaseDepth: 0.55,
    level: 0.82,
    spread: 0.78,
    strobe: 0.16,
    colorBars: 2,
    ringColors: false,
    slew: 7,
  },
  // サビ。全開・高速チェイス・色を円周へ散らして一気に開ける
  SABI: {
    pattern: "chase",
    sweepBars: 1,
    chaseBars: 1,
    chaseDepth: 0.7,
    level: 1.35,
    spread: 1,
    strobe: 0.34,
    colorBars: 1,
    ringColors: true,
    slew: 14,
  },
  /*
    後半。**SABIと全パラメータ同値**(ユーザー指定「sabiとlatterのサーチも
    ビームも同じにして。sabiは全部出ているのにlatterから消えてるから」)。
    以前は「チェイスを半分の速さにして少し落ち着かせる」意図でSABIより
    控えた値にしていたが、castleBeamRig.ts の CUES.LATTER と揃えて
    SABIの値をそのまま使う。
  */
  LATTER: {
    pattern: "chase",
    sweepBars: 1,
    chaseBars: 1,
    chaseDepth: 0.7,
    level: 1.35,
    spread: 1,
    strobe: 0.34,
    colorBars: 1,
    ringColors: true,
    slew: 14,
  },
  // アウトロ。同位相へ戻して静かに引く
  outro: {
    pattern: "unison",
    sweepBars: 2,
    chaseBars: 4,
    chaseDepth: 0.12,
    level: 0.7,
    spread: 0.55,
    strobe: 0.1,
    colorBars: 2,
    ringColors: false,
    slew: 4,
  },
  /*
    フェード。intro-B→breath(11秒台)と同じ「まっすぐ上を向いて消える」
    見せ方に揃える(ユーザー指定)。level:0 で outro からこの区間の ramp
    (REPLY_SECTIONS の fade.ramp)にかけて完全に消灯し、下の standUp 判定
    (section.name === "fade")が spread/pattern を無視して polar=0 へ畳む
    ―― breath 用のコメント(このファイル上部、CUES.breath 参照)と同じ理屈。
  */
  fade: {
    pattern: "unison",
    sweepBars: 4,
    chaseBars: 4,
    chaseDepth: 0,
    level: 0,
    spread: 0.2,
    strobe: 0,
    colorBars: 4,
    ringColors: false,
    slew: 2,
  },
};

/**
 * イントロ2(intro-B / 11.05〜23秒)専用のオーバーライド。
 *
 * ユーザーが手描きした「reply の建物を上から見た図」(上=奥 / -Z 向き、
 * 図の右=ワールド +X)に置かれた6つの光点だけを点け、色も図に合わせる。
 * key は BEAM_POINTS の添字(beam.order)。色は溶鉄グラデ(REPLY_INTRO2_LASER_*)を
 * 前後に配る ―― 手前ほど白熱、奥ほど赤い:
 *   4, 7  = 奥(-Z)の隅櫓 左右          → LOW(赤熱)
 *   5, 6  = 奥(-Z)の辺の中央 左右       → MID(橙。他より遅く交差。INTRO2_SWEEP_SCALE)
 *   1, 10 = 手前(+Z)の隅櫓 左右         → HIGH(白熱。他より遅く交差)
 * ここに無い6灯 —— 0,11(手前の辺の中央) / 2,3(右の辺) / 8,9(左の辺) —— は
 * intro-B の間だけ消灯し、breath(23秒)へ移る 1.4 秒で戻す。
 *
 * 動き(pattern: "crossX")は reply.mp4 4〜9秒の「左右から中央へ寄って
 * X字に交わる」サーチライトに合わせた、中央線をまたぐシザース。左右の灯は
 * beam.x の符号で鏡像になる(useFrame 内)ので必ず対称に交差する。
 */
const INTRO2_SOLO: Readonly<Record<number, string>> = {
  1: REPLY_INTRO2_LASER_HIGH,
  4: REPLY_INTRO2_LASER_LOW,
  5: REPLY_INTRO2_LASER_MID,
  6: REPLY_INTRO2_LASER_MID,
  7: REPLY_INTRO2_LASER_LOW,
  10: REPLY_INTRO2_LASER_HIGH,
};

/**
 * INTRO2_SOLO の hex を Color にパースして持つ(毎フレーム new しないため)。
 * ここだけは常に固定色(セクション別パレットのクロスフェード対象ではない)
 * なので、beamSectionPalette.ts のバッファとは別に一度だけ作る。
 */
const INTRO2_SOLO_COLORS: Readonly<Record<number, Color>> = Object.fromEntries(
  Object.entries(INTRO2_SOLO).map(([order, hex]) => [order, new Color(hex)]),
);

/**
 * crossX のシザース周期(既定 cue.sweepBars=2小節)を灯ごとに引き伸ばす倍率。
 * ユーザー指定で、手前の白熱(1・10)と奥の橙(5・6)を他より遅く交差
 * させる(2 = 周期2倍 ≒ 5.6秒)。速いままなのは奥の赤熱(4・7)だけ。
 * ここに無い灯は 1(等倍)。ペアで同じ値にしておけば左右対称は保たれる。
 */
const INTRO2_SWEEP_SCALE: Readonly<Record<number, number>> = {
  1: 2,
  10: 2,
  5: 2,
  6: 2,
};

/**
 * Bメロの角4本(隅櫓)に、リザー中(bRiserOn)の色を均等に巡らせるための
 * 通し番号(0〜3)。**beam.order(1/4/7/10)をそのまま colorSlot に足すと
 * 使えない** ―― 4本の order は3ずつ離れていて、パレットがちょうど3色
 * (SEARCHLIGHT_SECTION_PALETTE)なので (order + colorSlot) % 3 が4本とも
 * 同じ値になってしまう。これが「北(4・7)はずっと同じ1色、南(1・10)には
 * その色が出ない」というユーザー指摘の正体 ―― 実際には half(0/1の2群)で
 * 固定2色に割っていた旧ロジックが原因だったが、そちらも同様に4本を
 * 2本ずつの固定グループへ縛ってしまっていた。ここで隣同士が3の倍数だけ
 * 離れないよう 0,1,2,3 に振り直し、(seq + colorSlot) % 3 で4本のうち3本が
 * 常に別々の色、1本だけ重複する形にする ―― どれが重複するかは colorSlot
 * (=点滅のたび)ごとに入れ替わるので、4本全体で見れば3色に均等に触れる。
 */
const CORNER_COLOR_SEQ: Readonly<Record<number, number>> = {
  1: 0, // 隅櫓(右上・南東)
  4: 1, // 隅櫓(右下・北東)
  7: 2, // 隅櫓(左下・北西)
  10: 3, // 隅櫓(左上・南西)
};

/**
 * Bのリザー(56.8秒〜)専用: 隅4本それぞれの「外向き」の方位(azimuth)。
 * beam.angle(front=0/right=π/2/back=π/left=-π/2。group.rotation.yに使う
 * 値)とは座標の測り方が違う ―― azimuth は
 * `dir=(sin(polar)cos(azimuth), cos(polar), sin(polar)sin(azimuth))` で
 * 作るワールド絶対方向(azimuth=0→+X, π/2→+Z)なので、beam.angle を
 * そのまま使えない。beam.angle の指す方向と一致する azimuth は
 * `π/2 - beam.angle`(既存の isBeatSync 分岐の azimuth=0/π がこの隅から
 * 見て天守の外側を向く/向かないという計算とは別に、ここでは「その灯の
 * 真後ろにある建物へ向けて振らない」ための基準に使う)。
 */
const CORNER_OUTWARD_AZIMUTH: Readonly<Record<number, number>> = {
  1: Math.PI / 4,
  4: -Math.PI / 4,
  7: (-3 * Math.PI) / 4,
  10: (3 * Math.PI) / 4,
};

/**
 * Bのリザー専用: 隅ごとの外向き方位から±30°振るオフセット(ラジアン)。
 * ユーザー指定「光の向きを変えるとかの変化がいい」への対応の一部。
 * RISER_AZIMUTH_STATE_COUNT のうち state 2〜4(下のswitch参照)で使う。
 * 何度で振るかは実機で見ながら調整する前提の値(このコメント自体がその
 * 注意書き)。
 */
const RISER_AZIMUTH_WOBBLE = Math.PI / 6;

/**
 * SABI/LATTER/outro(拍同期。isB=false側)の首振りの、外向き方位からの
 * 左右スナップの半角。ユーザー指摘「サビのサーチライトの光が建物を貫通
 * している」への対応 ―― 以前はここがワールドX軸(azimuth 0/π)への
 * 固定スナップで、灯の位置(建物のどの辺にいるか)を無視していたため、
 * 東西の辺の灯が振れ先で建物の幅を横切る向きになっていた。
 * beam.outwardAzimuth(=その灯にとって建物と反対の向き)を中心に、
 * ±この角度だけ拍ごとにスナップして振ることで、常に建物のない側だけを
 * 向くようにする。かつ「イントロ2みたいに左右に動かす動きをつけて」の
 * 指定を、拍ごとのスナップという既存の動きの質(ユーザー指定)を保ったまま
 * 満たす。RISER_AZIMUTH_WOBBLE(Bのリザーの外向き±ウォブル)と同じ角度。
 */
const AIM_SIDE_SWING = Math.PI / 6;

/**
 * Bのリザー専用: 「南」「北」というワールドの方位そのもの(azimuth換算)。
 *
 * コンパスHUD(cameraHeading.ts)の定義で 北=ワールド-Z・南=ワールド+Z が
 * 確定しているので、それに合わせる: dir.z = sin(polar)*sin(azimuth) なので
 * azimuth=π/2(sin=1・+Z側)が南、azimuth=-π/2(-Z側)が北。
 *
 * 一度これと逆の値(南北を実機での見た目基準で入れ替えた値)を試したが、
 * それでも南の隅が南を向いて見える不具合が再現したため、原因は別の
 * state(2〜4。外向き±ウォブル)を見ていた可能性が高いと判断し、
 * コンパスと整合するこの値へ戻した。もし state 5(このazimuthを使う唯一の
 * state)がまだ逆に見えるなら、そのときだけ改めて入れ替えること。
 */
const SOUTH_AZIMUTH = Math.PI / 2;
const NORTH_AZIMUTH = -Math.PI / 2;

/**
 * Bのリザーの向きが取りうる状態の数。下の useFrame 内 switch と対応させる
 * こと ―― 増減したらここも合わせて変える。
 *
 *   0: V字(開く。従来の isBeatSync と同じ前後2値のうち片方)
 *   1: X字(交差。同じくもう片方。ユーザー指定「X字に交差しなくなってる
 *      けど、X字交差は入れて」で復活させた)
 *   2: 隅の素の外向き
 *   3: 外向きから -RISER_AZIMUTH_WOBBLE
 *   4: 外向きから +RISER_AZIMUTH_WOBBLE
 *   5: 北↔南の入れ替え(北の隅は南向き、南の隅は北向き。ユーザー指定)
 *
 * V字/X字/state5は前後(ワールドX軸寄り〜Z軸寄り)の固定方位、2〜4は隅ごとの
 * 外向き方位を中心にした控えめな振れ(実機未確認。CORNER_OUTWARD_AZIMUTH の
 * コメント参照)。
 */
const RISER_AZIMUTH_STATE_COUNT = 6;

/** サビ・後半の頭で「バーン」と出すセクション */
const HIT_SECTIONS: readonly ReplySectionName[] = ["SABI", "LATTER"];
/** その一撃が減衰するまでの秒数(指数減衰の時定数) */
const HIT_DECAY = 0.85;
/**
 * 一撃で上乗せする明るさ。
 * ビーム本体はシェーダー側で 0〜1 にクランプされるので、この値だと
 * サビ頭の 0.2 秒ほどだけ芯が飽和して「バーン」と白く抜ける。
 * これ以上上げても飽和している時間が延びるだけで、眩しいだけになる。
 */
const HIT_LEVEL = 0.95;

/**
 * ビーム1本の最大の濃さ。
 *
 * 断面を「縁が明るい」から「芯が明るい」に直した(BEAM_FRAGMENT 参照)ぶん
 * 実効の明るさが上がっている。上げすぎると加算合成で空が白飛びする。
 */
const BEAM_OPACITY_MAX = 0.55;

/** 光源の位置に置くフレア(ビルボード)の大きさ(ワールド単位) */
const FLARE_SIZE = 11;
/** フレアの最大の濃さ */
const FLARE_OPACITY_MAX = 0.9;
/**
 * フレアの濃さの上限。サビ頭の一撃(HIT_LEVEL)を乗せると 2 を超えることが
 * あり、加算合成のビルボードなので画面が真っ白に潰れる。ビーム本体は
 * シェーダー側でクランプしているが、こちらは素の材質なのでここで止める。
 */
const FLARE_OPACITY_CLAMP = 1.5;

const BEAM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

/*
  コーンの側面に光の減衰を描く。ConeGeometry の uv.y は底面0・頂点1で、
  頂点側を光源(根元)に持ってきてあるので、vUv.y が1に近いほど根元。
  根元を強く、先へ向かって細く消していく。
*/
const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    /*
      根元(vUv.y=1)が最も強い。先端へ向かって落とすが、落としすぎると
      空へ抜けていく部分が消えてビームに見えなくなるので、下限を高く取る。
    */
    float y = clamp(vUv.y, 0.0, 1.0);
    float along = mix(0.25, 1.0, pow(y, 1.5));
    // 根元の一点だけ極端に光るのを避ける
    along *= 1.0 - smoothstep(0.94, 1.0, y) * 0.45;
    /*
      先端(vUv.y=0)は完全に0まで落とす。ここを打ち切ると、コーンの底面の縁が
      そのまま「光の切れ目」として見えてしまう。BEAM_LENGTH が220あるので、
      この 0.30 の帯だけで66ワールド単位ぶんかけて消えることになり、
      空へ溶けていくように見える。
    */
    along *= smoothstep(0.0, 0.30, y);

    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vViewDir);
    float facing = clamp(abs(dot(n, v)), 0.0, 1.0);

    /*
      **断面は「芯が明るい」。縁ではない。**

      以前はここで graze = pow(1 - facing, k)、つまりシルエットの縁ほど
      明るくしていた。それだと中身が抜けた輪郭だけの円錐 = ワイヤーフレームに
      見えてしまう。

      正しくは、視線が光の筒を貫く長さに比例させる。円筒のシェルでは
      軸から正規化距離 r の位置に当たったときの法線と視線の関係が
      |dot(n,v)| = sqrt(1 - r^2) なので、貫通長 2*sqrt(1-r^2) は
      そのまま facing に比例する。DoubleSide なので前後2面が加算されて
      ちょうど筒1本ぶんの密度になる — つまり facing をそのまま使えばよい。

      body: 筒の密度そのもの。core: さらに芯を立てて細いシャフト感を出す。
      haze: 縁にわずかだけ残す空気の散乱。ここだけは 1-facing を使う。
    */
    float body = facing;
    float core = pow(facing, 7.0);
    /*
      **pow の底は必ず 0 以上に丸めること。**
      正規化ベクトル同士の内積は理論上 |dot| <= 1 だが、浮動小数点誤差で
      1.0000001 のような値が出る。すると 1.0 - facing が -1e-7 になり、
      GLSL の pow は負の底に対して未定義 = NaN を返す。この NaN が加算合成で
      フレームバッファへ書き込まれると、そのピクセルは黒くなるだけでなく
      **下に描いてあった天守やステージごと壊す**。コーン面がカメラを正面から
      向くほど(＝カメラが近いほど広範囲で)起きるため、「近いと画面が真っ黒・
      遠ざかると治る」という形で表面化していた。
    */
    float haze = pow(max(1.0 - facing, 0.0), 3.0);

    // 念のため出力もクランプしておく(NaN/負値をフレームバッファへ流さない)
    float a = clamp(
      along * (body * 0.45 + core * 0.9 + haze * 0.1) * uOpacity,
      0.0,
      1.0
    );
    gl_FragColor = vec4(uColor * a, a);
  }
`;

type Beam = {
  /** 天守の中心からのローカル座標(X, Z)。固定12点(天守の辺8点+隅櫓4点)のひとつ */
  x: number;
  z: number;
  /**
   * 外向きの方角(ラジアン)。front=0 / right=π/2 / back=π / left=-π/2、
   * 隅櫓の4点はその中間の45°刻み。ヘッドの首振り(mesh側の傾き軸)を
   * この方角へ向けるのに使う。
   */
  angle: number;
  /** リング状に並べたときの通し番号(0〜BEAM_COUNT-1)。チェイスの順番になる */
  order: number;
  /** 鏡像ペアの通し番号(0〜BEAM_HALF-1)。ペアには同じ値が入る */
  half: number;
  /** 扇の内(0)から外(1)への位置。鏡像ペアには同じ値が入る */
  u: number;
  /**
   * 隅櫓の1本(true)か、天守の辺の1本(false)か。
   * 首振りの軌道の形(十字 or 円)を決める(ユーザー指定の配置図参照)。
   */
  isCorner: boolean;
  /**
   * angle を、useFrame の dir 計算が使う「ワールド方位角(azimuth)」の
   * 単位に変換した値(建物と反対の向き)。dir.x=sin(polar)cos(azimuth)・
   * dir.z=sin(polar)sin(azimuth) という定義(azimuth=0→+X, π/2→+Z)に対し、
   * angle は「group.rotation.y」という別の測り方(front=0)なので、
   * そのままでは azimuth として使えない。CORNER_OUTWARD_AZIMUTH のコメントに
   * ある変換 `π/2 - angle` を隅の4本だけでなく12本すべてに一般化したもの
   * (実際に代入して4隅で CORNER_OUTWARD_AZIMUTH と一致することを確認済み)。
   * SABI/LATTER/outro(拍同期)のスナップ先をこれ基準にすることで、
   * 「建物のある方向」へ振れないようにする(AIM_SIDE_SWING 参照)。
   */
  outwardAzimuth: number;
  /**
   * angle(外向きの方位)ぶんのY軸回転を打ち消す逆クォータニオン。
   *
   * **これが無いと、十字/円の軌道が「灯ごとの外向き方位を基準にした
   * 相対的な向き」になってしまう。** mesh は外側の group(Y回転=angle)の
   * 子で、mesh.quaternion はその group から見た**相対的な**回転。
   * 首振りの計算(dir/targetQuat)はワールド座標系の絶対的な東西南北
   * (画像どおり、灯の位置に関わらず同じ4方向・同じ円)で作っているので、
   * mesh へ渡す前に親の回転(angle)を打ち消してローカル空間へ変換する
   * 必要がある。useFrame 内で毎フレーム計算し直すのは無駄なので、
   * angle は固定値であることを利用してここで一度だけ計算しておく。
   */
  groupQuatInverse: Quaternion;
};

/**
 * 隅櫓4棟、それぞれの外側の角(天守から一番遠い、城全体の外周のコーナー)。
 * towerLayout.ts の CORNER_TOWER_XZ(隅櫓の中心)に、隅櫓自身の半幅/半奥行き
 * を外向きに足した位置 ―― BeamLight.tsx で「外側の1隅」として使っているのと
 * 同じ角。ここに天守の足元と同じサーチライトを1本ずつ追加する。
 */
const [TOP_RIGHT_TOWER, TOP_LEFT_TOWER, BOTTOM_LEFT_TOWER, BOTTOM_RIGHT_TOWER] =
  CORNER_TOWER_XZ.map(([cx, cz]): [number, number] => [
    cx + Math.sign(cx) * TOWER_HALF_WIDTH,
    cz + Math.sign(cz) * TOWER_HALF_DEPTH,
  ]);

/**
 * 固定12点の座標と外向きの方角。天守の四辺(前後左右)それぞれの外側、
 * 隅櫓と隅櫓の隙間にあたる位置に2点ずつ(8点)+ 隅櫓4棟の外側の角に1点ずつ
 * (4点)。並び順は時計回りに一周する並び(front-right → 隅櫓(右上) →
 * right(前寄り) → right(後寄り) → 隅櫓(右下) → back-right → back-left →
 * 隅櫓(左下) → left(後寄り) → left(前寄り) → 隅櫓(左上) → front-left)に
 * してあり、chase パターンで「光が会場をぐるりと回る」動きとして意味が通る。
 * 隅櫓は天守の辺と辺の間の対角線上に来るので、外向きの方角(angle)は
 * 隣り合う2辺のちょうど中間(45°刻み)にしてある。
 *
 * i と (BEAM_COUNT-1-i) が X=0 の面でちょうど鏡像のペアになっていることを
 * 確認済み: (front-right, front-left) / (隅櫓右上, 隅櫓左上) /
 * (right前寄り, left前寄り) / (right後寄り, left後寄り) /
 * (隅櫓右下, 隅櫓左下) / (back-right, back-left)。
 *
 * isCorner: 隅櫓の4点(true)か天守の辺の8点(false)か。首振りの軌道
 * (十字 or 円)を決める(MAX_SWING のコメント参照)。
 */
const BEAM_POINTS: readonly {
  x: number;
  z: number;
  angle: number;
  isCorner: boolean;
}[] = [
  // front-right: 前辺、中心から右寄り
  {
    x: CASTLE_HALF_WIDTH * BEAM_EDGE_SPREAD,
    z: CASTLE_HALF_DEPTH * BEAM_EDGE_OUTSET,
    angle: 0,
    isCorner: false,
  },
  // 隅櫓(右上): 前辺と右辺のちょうど中間の対角線上
  {
    x: TOP_RIGHT_TOWER[0],
    z: TOP_RIGHT_TOWER[1],
    angle: Math.PI / 4,
    isCorner: true,
  },
  // right辺、前寄りの1点
  {
    x: CASTLE_HALF_WIDTH * BEAM_EDGE_OUTSET,
    z: CASTLE_HALF_DEPTH * BEAM_EDGE_SPREAD,
    angle: Math.PI / 2,
    isCorner: false,
  },
  // right辺、後ろ寄りの1点
  {
    x: CASTLE_HALF_WIDTH * BEAM_EDGE_OUTSET,
    z: -CASTLE_HALF_DEPTH * BEAM_EDGE_SPREAD,
    angle: Math.PI / 2,
    isCorner: false,
  },
  // 隅櫓(右下): 右辺と後辺のちょうど中間の対角線上
  {
    x: BOTTOM_RIGHT_TOWER[0],
    z: BOTTOM_RIGHT_TOWER[1],
    angle: (3 * Math.PI) / 4,
    isCorner: true,
  },
  // back-right: 後辺、中心から右寄り
  {
    x: CASTLE_HALF_WIDTH * BEAM_EDGE_SPREAD,
    z: -CASTLE_HALF_DEPTH * BEAM_EDGE_OUTSET,
    angle: Math.PI,
    isCorner: false,
  },
  // back-left: 後辺、中心から左寄り
  {
    x: -CASTLE_HALF_WIDTH * BEAM_EDGE_SPREAD,
    z: -CASTLE_HALF_DEPTH * BEAM_EDGE_OUTSET,
    angle: Math.PI,
    isCorner: false,
  },
  // 隅櫓(左下): 後辺と左辺のちょうど中間の対角線上
  {
    x: BOTTOM_LEFT_TOWER[0],
    z: BOTTOM_LEFT_TOWER[1],
    angle: (-3 * Math.PI) / 4,
    isCorner: true,
  },
  // left辺、後ろ寄りの1点
  {
    x: -CASTLE_HALF_WIDTH * BEAM_EDGE_OUTSET,
    z: -CASTLE_HALF_DEPTH * BEAM_EDGE_SPREAD,
    angle: -Math.PI / 2,
    isCorner: false,
  },
  // left辺、前寄りの1点
  {
    x: -CASTLE_HALF_WIDTH * BEAM_EDGE_OUTSET,
    z: CASTLE_HALF_DEPTH * BEAM_EDGE_SPREAD,
    angle: -Math.PI / 2,
    isCorner: false,
  },
  // 隅櫓(左上): 左辺と前辺のちょうど中間の対角線上
  {
    x: TOP_LEFT_TOWER[0],
    z: TOP_LEFT_TOWER[1],
    angle: -Math.PI / 4,
    isCorner: true,
  },
  // front-left: 前辺、中心から左寄り
  {
    x: -CASTLE_HALF_WIDTH * BEAM_EDGE_SPREAD,
    z: CASTLE_HALF_DEPTH * BEAM_EDGE_OUTSET,
    angle: 0,
    isCorner: false,
  },
];

/** 灯の基準の向き(真上)。首振りの方向ベクトルをこの向きからの回転として作る */
const UP = new Vector3(0, 1, 0);

/** なめらかな加減速。キューのクロスフェードに使う */
function smoothstep(x: number) {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

function mix(a: number, b: number, k: number) {
  return a + (b - a) * k;
}

/**
 * 灯ごとの位相のずらし量(0〜1)。**乱数を使わないこと。**
 * ここが添字から決まる並びであることが「順番が読める」の根拠になっている。
 */
function patternPhase(pattern: BeamPattern, beam: Beam): number {
  switch (pattern) {
    case "wave":
      // 扇の内→外。鏡像ペアで u が同じなので左右対称は保たれる
      return beam.u * WAVE_SPREAD;
    case "chase":
      // 円周をぐるりと1周。左右対称はあえて崩して「回る光」にする
      return beam.order / BEAM_COUNT;
    case "split":
      return (beam.order % 2) * 0.5;
    case "crossX":
      // 位相ずらしは無し。左右の交差は beam.x の符号だけで作る(useFrame 内)。
      // 3ペアが同位相で揃ってシザースする
      return 0;
    default:
      return 0;
  }
}

type SearchlightProps = {
  /** 天守の底面のワールド座標。EdoCastle と同じ値を渡す */
  position?: [number, number, number];
  /**
   * ビームの出具合(0〜1)を持つ ref。11秒の瞬間に立ち上げる。
   * 毎フレーム変わるので数値 prop ではなく ref で受け取る。
   */
  activationRef: RefObject<number>;
  /**
   * 曲(=ホログラム映像)の再生位置(秒)を持つ ref。開閉スイープ・明滅・
   * 色替えのグリッドをここから取る。**clock.elapsedTime ではなく曲の時計を
   * 使うこと。** REPLY_BAR_ORIGIN は曲の頭を基準にした実測値なので、
   * シーンの経過時間で回すと小節線がまるごとずれる。
   * 渡さなければシーンの経過時間にフォールバックする。
   */
  songTimeRef?: RefObject<number>;
};

/**
 * 天守の四辺の外側・隅櫓の隙間(8点)+ 隅櫓4棟の外側の角(4点)に立つ、
 * 固定12点のサーチライト。
 *
 * 曲が11秒に達した瞬間に点灯する(SceneContents 側で activationRef を
 * 立ち上げる)。実際のボリュームライトは重いので、加算合成のコーン+根元の
 * フレアで見立てている。12本 × 三角形数十枚なので描画コストは無視できる。
 *
 * **動きはユーザーが手描きした配置図をそのまま実装している**
 * (隅の4本=十字、辺の8本=円。上の「動き」セクションのコメント、
 * MAX_SWING のコメント参照)。乱数も、拍ごとの抽選も、本ごとの乱数位相も
 * 入れないこと — どれも「規則が読めない動き」になって、実機で見ると
 * かなり気持ち悪い。変化を足したいときは、周期を小節の倍数に取った
 * レイヤーを重ねる(色替えの COLOR_BARS がその例)。**リグ自体は固定位置で
 * 回転させない**(以前はゆっくり1周させていたが、天守の周りを回っている
 * ように見えて不自然なので廃止した)。
 *
 * **例外: B・SABI・LATTER・outro は「拍同期」モード**(ユーザー指定。
 * useFrame の isBeatSync 分岐 / constants.ts の REPLY_BEAT_SYNC_* 参照。
 * BeamLight.tsx と同じ4セクション・同じ拍グリッドで揃って動く)。この
 * 4セクションでは通常の chase パターンを無効化して拍ごとのON/OFF点滅に、
 * 首振りは連続的な sin ではなく拍ごとに可動域の限界(MAX_SWING)へパッと
 * スナップする動きに置き換える。色はセクション別パレット
 * (beamSectionPalette.ts)から取る。
 */
export function Searchlight({
  position = [0, 0, 0],
  activationRef,
  songTimeRef,
}: SearchlightProps) {
  const groupRef = useRef<Group>(null);
  const materialsRef = useRef<ShaderMaterial[]>([]);
  const flaresRef = useRef<(SpriteMaterial | null)[]>([]);

  const beams = useMemo<Beam[]>(() => {
    return BEAM_POINTS.map((p, i) => {
      const half = Math.min(i, BEAM_COUNT - 1 - i);
      // 親group(rotation.y=angle)を打ち消す逆クォータニオン(groupQuatInverse のコメント参照)
      const groupQuatInverse = new Quaternion()
        .setFromAxisAngle(UP, p.angle)
        .invert();
      return {
        x: p.x,
        z: p.z,
        angle: p.angle,
        order: i,
        half,
        u: half / (BEAM_HALF - 1),
        isCorner: p.isCorner,
        outwardAzimuth: Math.PI / 2 - p.angle,
        groupQuatInverse,
      };
    });
  }, []);

  /*
    コーンは既定で頂点が +h/2・底面が -h/2。回して平行移動し、
    「頂点が原点、+Y方向へ広がりながら伸びる」形にしておく。
    こうしておくと、あとは mesh を傾けるだけで狙った向きへ撃てる。
  */
  const geometry = useMemo(() => {
    const g = new ConeGeometry(BEAM_RADIUS, BEAM_LENGTH, 18, 1, true);
    g.rotateX(Math.PI);
    g.translate(0, BEAM_LENGTH / 2, 0);
    return g;
  }, []);

  /*
    光源そのもののフレア。中心が飽和して外へ滑らかに落ちる放射グラデを
    キャンバスで焼き、加算のビルボードで置く。これがあると「筒がどこから
    出ているか」がはっきりして、ただの浮いた三角形に見えなくなる。
  */
  const flareTexture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const g = ctx.createRadialGradient(
        size / 2,
        size / 2,
        0,
        size / 2,
        size / 2,
        size / 2,
      );
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(0.14, "rgba(255,255,255,0.6)");
      g.addColorStop(0.4, "rgba(255,255,255,0.14)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    return new CanvasTexture(canvas);
  }, []);

  const materials = useMemo(
    () =>
      beams.map(
        (b) =>
          new ShaderMaterial({
            uniforms: {
              // 色は COLOR_BARS ごとに useFrame から入れ替える。ここは初期値
              uColor: {
                value: new Color(BEAM_COLORS[b.half % 2 === 0 ? 0 : 1]),
              },
              uOpacity: { value: 0 },
            },
            vertexShader: BEAM_VERTEX,
            fragmentShader: BEAM_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
            side: DoubleSide,
            toneMapped: false,
          }),
      ),
    [beams],
  );

  useEffect(() => {
    materialsRef.current = materials;
    // GPU資源なので外れるときに解放する
    return () => {
      materials.forEach((m) => m.dispose());
      geometry.dispose();
      flareTexture.dispose();
    };
  }, [materials, geometry, flareTexture]);

  /** 今どの色スロットを塗ってあるか。変わったフレームだけ塗り替える */
  const colorSlotRef = useRef(Number.NaN);
  /** 今どのキューで塗ったか。セクションが変わったら塗り直す */
  const colorCueRef = useRef(Number.NaN);
  /**
   * セクション別パレット(beamSectionPalette.ts)の3色バッファ。中身は毎フレーム
   * sampleSearchlightSectionPalette が上書きする(useFrame内でnewしないため
   * useRefの初期値として一度だけ作る。swingDirRef と同じパターン)。
   */
  const paletteRef = useRef(createSearchlightPaletteBuffer());
  /**
   * 灯ごとに「パレットの何番目を表示するか」(0〜2)。-1 は特別扱いで
   * INTRO2_SOLO_COLORS(固定のイントロ2色)を使う合図。**この添字自体は
   * colorSlot/セクションが変わったときだけ選び直す**(何小節ごとに色を
   * 替えるか、という従来の頻度を保つため)。選んだ添字の実際のRGBは
   * paletteRef.current[idx] を毎フレーム見るので、セクション境界の
   * クロスフェード中でも自然に色が動く。
   */
  const colorIndexRef = useRef<number[]>(beams.map(() => 0));
  /**
   * 首振り(十字/円)の計算で使い回すスクラッチ。useFrame の中で
   * new すると R3F の禁止ルールに触れるので、ref の初期値として一度だけ
   * 作る(tiltRef 時代と同じ「useRefの初期値に直接 new を渡す」パターン)。
   * 灯ごとの目標姿勢は mesh.quaternion.slerp(...) で追従させる
   * (実機のムービングヘッドは首の回る速さに限りがあり、目標へ瞬間移動
   * させると作り物に見えるため。以前の tiltRef の役割を quaternion の
   * slerp が引き継いでいる)。
   */
  const swingDirRef = useRef(new Vector3());
  const swingQuatRef = useRef(new Quaternion());

  useFrame(({ clock }, delta) => {
    // 出具合はref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef.current ?? 0;
    /*
      グリッドは**曲の再生位置**で取る。シーンの経過時間で回すと、
      REPLY_BAR_ORIGIN(曲の頭からの実測値)を基準にした小節線がずれる。
    */
    const raw = songTimeRef?.current ?? clock.elapsedTime;
    const t = Number.isFinite(raw) ? raw : 0;

    // barPos は曲頭では負になる。Math.floor で引けば負でも 0〜1 に収まる
    const barPos = (t - REPLY_BAR_ORIGIN) / REPLY_BAR_SECONDS;
    const barPhase = barPos - Math.floor(barPos);

    /* --- 今のキュー。セクションの ramp でひとつ前からクロスフェードする --- */
    const si = replySectionIndexAt(t);
    const section = REPLY_SECTIONS[si];
    const cue = CUES[section.name];
    const prev = CUES[REPLY_SECTIONS[Math.max(si - 1, 0)].name];
    const since = Math.max(t - section.start, 0);
    const k = section.ramp > 0 ? smoothstep(since / section.ramp) : 1;

    /*
      crossX は「軌道の形」(首振りの計算)の判定に使う。B も cue.pattern を
      crossX にしてある(「イントロ2の南側と同じ速度、動きをするように」
      というユーザー指定)ので、**intro-2固有の色/本数の絞り込み
      (INTRO2_SOLO)にはcrossXをそのまま使わず、isIntro2(intro-B本人か
      どうか)で別途判定する**―― でないとBの間もINTRO2_SOLOの固定色・
      6灯絞りに引きずられてしまう(Bは CORNER_COLOR_SEQ で拍ごとに色を
      巡らせる独自の色演出を持っているため)。
    */
    const crossX = cue.pattern === "crossX";
    const isIntro2 = section.name === "intro-B";
    /*
      イントロ2(isIntro2)の solo。図の6灯(INTRO2_SOLO)以外は intro-B の間だけ
      消灯し、次の breath へ移る ramp(1.4秒)で戻す。intro-B の間は k に
      関わらずハードに絞る(11秒の点灯の瞬間から6灯だけ、というユーザー指定)。
    */
    const prevCrossX =
      si > 0 && REPLY_SECTIONS[si - 1].name === "intro-B";

    /*
      B の区間フラグ。歌詞「カラフル」の頭(bRiserOn)から点滅が始まり、
      「さぁ」の頭(bHushOn)からサビ直前まで全灯が静まる(下のstandUp/
      isBeatSync/レベル計算で参照する。REPLY_B_* のコメント参照)。
    */
    const isB = section.name === "B";
    const bRiserOn = isB && t >= REPLY_B_BLINK_START_SECONDS;
    const bHushOn = isB && t >= REPLY_B_HUSH_START_SECONDS;
    /*
      静けさへ落ちる明るさのフェード(1→0)。bHushOnの瞬間に0へ飛ばすと
      「いきなり消える」ので、REPLY_B_HUSH_FADE_SECONDSかけてなだらかに
      落とす(ユーザー指摘)。姿勢(standUp)側はもとから slew のなましで
      滑らかなのでここでは明るさだけ扱う。
    */
    const bHushFade = bHushOn
      ? 1 - smoothstep((t - REPLY_B_HUSH_START_SECONDS) / REPLY_B_HUSH_FADE_SECONDS)
      : 1;

    /*
      breath(歌前の間)は軌道の種類に関係なく全灯まっすぐ上へ立てる
      (CUES.breath のコメント参照)。十字/円の首振り計算をバイパスして
      polar=0 を渡すだけ ―― イントロ2レーザーからの向き替えは slerp(slew)が
      滑らかに繋ぐ。

      Bメロの「静けさ」区間(bHushOn)も同じ扱いにする ―― 歌詞「さぁ」から
      サビ直前まで、真上へ向けて灯を落ち着かせる(ユーザー指定「さぁのところで
      点滅やめて、静けさを出したいからすべてのライトを消して。上に向けて
      消してね」)。
    */
    /*
      fade も breath と同じく「まっすぐ上を向いて消える」扱いにする
      (ユーザー指定。intro-B→breath の見せ方をフェード開始(1:59.1=119.1秒。
      songStructure.ts の REPLY_SECTIONS 参照)にも使う)。
    */
    const standUp =
      section.name === "breath" || section.name === "fade" || bHushOn;

    /*
      連続量だけ混ぜる。パターン・色・周期は離散のまま切り替える
      (周期を補間すると位相が飛ぶ。飛びは下の首振りのなまし(slew)が吸収する)。
    */
    const level0 = mix(prev.level, cue.level, k);
    const spread = mix(prev.spread, cue.spread, k);
    const strobe = mix(prev.strobe, cue.strobe, k);
    const chaseDepth = mix(prev.chaseDepth, cue.chaseDepth, k);
    const slew = mix(prev.slew, cue.slew, k);

    /*
      サビ・後半の頭で焚く一撃。指数で減衰しながら、明るさを上乗せしつつ
      扇を強制的に開ききらせる。曲の山でだけ「バーン」と開ける役。
    */
    const hit = HIT_SECTIONS.includes(section.name)
      ? Math.exp(-since / HIT_DECAY)
      : 0;
    const spreadNow = spread + (1 - spread) * hit;

    // セクション別の色をこのフレームの値へ更新(BeamLight/WashLightと同じ
    // 関数群(beamSectionPalette.ts)を使うので、配色コンセプトは共通)
    sampleSearchlightSectionPalette(t, paletteRef.current);

    /*
      拍同期モード(B/SABI/LATTER/outro。ユーザー指定)。BeamLight.tsx の
      isBeatSync と対象セクションを共有する(REPLY_BEAT_SYNC_SECTIONS。片方
      だけ対象がずれると、建物のビームと足元のサーチライトが違う拍で
      点滅する破綻になるため)。拍のグリッドは下の「拍の明滅」ブロックと
      同じ式(REPLY_BEAT_OFFSET / REPLY_BEAT_SECONDS、曲全体を通した連番)を
      先取りして計算し、beatPhase は下のブロックへそのまま渡す。

      例外: B は「歌詞『カラフル』の入り(REPLY_B_BLINK_START_SECONDS)まで
      点滅させない」というユーザー指摘があり、それまでは isBeatSync を
      false にして通常の chase パターン(CUES.B)へ戻す(BeamLight.tsx と
      同じ考え方)。「カラフル　つかまえよう…さぁ！」の間だけ、実測(低域
      オンセットが半拍間隔に詰まる)に合わせて点滅を REPLY_B_RISER_BEAT_
      DIVISOR 倍速にする。「さぁ」以降(bHushOn)はサビ直前の静けさとして
      isBeatSync 自体を false に戻す ―― 上の standUp が polar=0 を渡し、
      下のレベル計算(bHushFade)で明るさも REPLY_B_HUSH_FADE_SECONDS かけて
      0へフェードするので、拍の点滅ではなく「まっすぐ上を向きながら
      なだらかに消える」動きになる(いきなり消えるとの指摘でフェード化)。
      この倍速判定専用に
      syncBeatPos/syncBeat/syncBeatPhase を別で持つ ―― 素の beatPosForSync/
      beatForSync/beatPhaseForSync は下の「拍の明滅」ブロック(beatPhase =
      beatPhaseForSync、全区間共通のpulse)にも使われているので上書きしない。
    */
    const isBeatSync =
      REPLY_BEAT_SYNC_SECTIONS.has(section.name) &&
      (!isB || (bRiserOn && !bHushOn));
    const beatPosForSync = (t - REPLY_BEAT_OFFSET) / REPLY_BEAT_SECONDS;
    const beatForSync = Math.floor(beatPosForSync);
    const beatPhaseForSync = beatPosForSync - beatForSync;
    const syncDivisor = bRiserOn ? REPLY_B_RISER_BEAT_DIVISOR : 1;
    const syncBeatPos = beatPosForSync * syncDivisor;
    const syncBeat = Math.floor(syncBeatPos);
    const syncBeatPhase = syncBeatPos - syncBeat;
    const beatSyncBlink =
      syncBeatPhase < REPLY_BEAT_SYNC_BLINK_ON ? 1 : REPLY_BEAT_SYNC_BLINK_FLOOR;
    /** 偶数拍+1/奇数拍-1。BeamLightのbeatSyncDirと同じ素直な対応 */
    const beatSyncDir = ((syncBeat % 2) + 2) % 2 === 0 ? 1 : -1;

    /*
      --- 色。ringColors なら円周へ全色を配り、そうでなければ従来の2色 ---
      **ここで決めるのは「パレットの何番目を見るか」という添字だけ**
      (colorIndexRef)。実際のRGBは paletteRef.current[idx] を毎フレーム
      参照する側(下の materialsRef.current.forEach)で反映するので、
      セクション境界のクロスフェード中でも自然に色が動く。

      「カラフル　つかまえよう…さぁ」の間(bRiserOn)だけ、色を送るタイミングを
      小節(cue.colorBars)ではなく拍の点滅そのもの(syncBeat)に揃える
      (ユーザー指定「サーチの点滅の時に、代わる光を点滅のたびに代わる
      ようにして」)。syncBeat は上の拍同期ブロックで REPLY_B_RISER_BEAT_
      DIVISOR ぶん倍速にしてあるので、点滅が切り替わるたびに色も切り替わる。
    */
    const colorSlot = bRiserOn ? syncBeat : Math.floor(barPos / cue.colorBars);
    if (colorSlot !== colorSlotRef.current || si !== colorCueRef.current) {
      colorSlotRef.current = colorSlot;
      colorCueRef.current = si;
      const partners = paletteRef.current.length - 1;
      /*
        剰余は必ず正に丸める。曲頭(barPos<0)では colorSlot が負になり、
        JS の % は負を返すので、そのまま添字にすると undefined になる。
      */
      const partner = 1 + (((colorSlot % partners) + partners) % partners);
      beams.forEach((beam, i) => {
        /*
          crossX(イントロ2)と、その直後の breath(prevCrossX): 図に合わせた
          固定色(INTRO2_SOLO_COLORS)を保持する(-1)。23秒で城のセクション色へ
          切り替えず、イントロ2の色(赤/橙/白)のまま立てて、そのまま
          フェードアウトさせる(ユーザー指定「城に変えないで」)。図に無い6灯は
          breath では点かない(下の solo)ので色は効かない。
          ringColors: 2本ひと組で色を変えながら円周を一周させる。1本ずつ
          色を変えると点描になって色が読めないので、組にして帯にする。
          スロットごとに起点をずらすので、小節ごとに色の帯が回って見える。
          それ以外: 鏡像ペアには同じ色。並び順の偶奇で2色を交互に差す。
        */
        const soloHex = INTRO2_SOLO[beam.order];
        colorIndexRef.current[i] =
          (isIntro2 || prevCrossX) && soloHex
            ? -1
            : cue.ringColors
              ? (Math.floor(beam.order / 2) + colorSlot) % paletteRef.current.length
              : bRiserOn && beam.isCorner
                ? ((CORNER_COLOR_SEQ[beam.order] ?? 0) + colorSlot) %
                  paletteRef.current.length
                : beam.half % 2 === 0
                  ? 0
                  : partner;
      });
    }

    /*
      南スポット2本(隅櫓の右上/左上。beam.isCorner && beam.z>0)だけの上書き。
      **点灯直後にいきなり色が切り替わって見える現象への対処**(ユーザー指摘
      「54秒で出るサーチライトが紫で出てすぐマゼンタになる」)。

      上のcolorSlotは曲頭からの小節グリッド(REPLY_BAR_ORIGIN基準)で全灯共通に
      進むため、南スポットの点灯開始(REPLY_B_SOUTH_SPOT_START_SECONDS=54秒)と
      色の境界(2小節≒2.82秒ごと)が独立で、たまたま境界が点灯直後(約0.37秒後)
      に来て「紫→マゼンタ」に見えていた。ここだけ**色の境界を南スポットの
      点灯開始そのものを起点に数え直す**(bRiserOn前提。bRiserOn中はcolorSlotが
      syncBeatに切り替わり、この現象自体が発生しないので対象外)。これにより
      点灯直後は必ず1サイクルぶん(2小節)色が保たれ、その後は通常どおり
      紫⇄マゼンタを繰り返す(周期は変わらないので見た目のリズムは崩れない)。
      北スポット(beam.z<0)は half が偶数で常に固定色(index 0)なのでこの
      現象自体が起きず、対象外。
    */
    if (isB && !bRiserOn && t >= REPLY_B_SOUTH_SPOT_START_SECONDS) {
      const southBarPos =
        (t - REPLY_B_SOUTH_SPOT_START_SECONDS) / REPLY_BAR_SECONDS;
      const southColorSlot = Math.floor(southBarPos / cue.colorBars);
      const partners = paletteRef.current.length - 1;
      const southPartner =
        1 + (((southColorSlot % partners) + partners) % partners);
      beams.forEach((beam, i) => {
        if (beam.isCorner && beam.z > 0) {
          colorIndexRef.current[i] = beam.half % 2 === 0 ? 0 : southPartner;
        }
      });
    }

    /* --- 拍の明滅。小節頭だけ一段上げる(beatPhaseは上のbeatSync計算と同じ式) --- */
    const beatPhase = beatPhaseForSync;
    const pulse = 1 - strobe * (1 - Math.pow(1 - beatPhase, 2.5));
    const accent = BAR_ACCENT * Math.pow(1 - barPhase, 5);
    const base = activation * level0 * (pulse + accent) + activation * hit * HIT_LEVEL;

    /*
      灯ごとの位相。スイープ(首振り)とチェイス(光の走り)で別々の周期を持つ。
      どちらも小節グリッドの上に乗るので、拍から外れることはない。
    */
    const sweepPos = barPos / cue.sweepBars;
    const chasePos = barPos / cue.chaseBars;
    const follow = 1 - Math.exp(-slew * delta);

    const group = groupRef.current;
    if (group) {
      group.children.forEach((child, i) => {
        const beam = beams[i];
        /*
          首を振るのは中の mesh(quaternion)、配置角(外向きの方位)は
          外側の group(rotation.y、固定)。役割を分けておくことで、
          首振りの計算はどの灯も「ローカルの真上」を基準にした同じ式で
          済み、外向きの方位はグループの回転が自動で載せてくれる。
        */
        const mesh = child.children[0];
        if (!beam || !mesh) return;

        /*
          首振りの向き。灯ごとのずらし量(phase)を足した上で、隅は「十字」・
          辺は「円」の軌道を描く(ユーザー指定の配置図、MAX_SWING のコメント
          参照)。spreadNow(0〜1)が振れ幅そのもの(以前の「開閉」に相当)。
        */
        const phase = patternPhase(cue.pattern, beam);
        const cyclePos = sweepPos + phase;

        let azimuth: number;
        let polar: number;
        if (standUp) {
          /*
            breath: 軌道に関係なくまっすぐ上(polar=0)。十字の隅は元々
            polar が 0 を通過するので上を向いて見えるが、円の辺は
            polar = MAX_SWING*spread の一定の傾きで回り続けて真上に来ない
            (ユーザー指摘「オレンジ(辺の5・6)だけ斜め」)。ここで両方畳む。
          */
          azimuth = 0;
          polar = 0;
        } else if (isBeatSync) {
          /*
            拍同期(B/SABI/LATTER/outro)。intro-Bのcrossingと違い、連続的な
            sinで開閉するのではなく、拍が変わった瞬間にパッと可動域の限界へ
            切り替える(ユーザー指定「拍ごとに可動域の限界へスナップする」)。
            方位は鏡像ペア(beam.xの符号)と拍の符号(beatSyncDir)の積で決め、
            常に左右対称に開閉させる ―― BeamLightの lateralSign * beatSyncDir
            と同じ考え方。polar/azimuthは1本のクォータニオンに合成される
            都合上、BeamLightのようにlift/yawを別々になますことができないため、
            この2軸をまとめてスナップさせる(下のslerpバイパスとセットで運用)。

            振れ幅は固定のMAX_SWINGではなく spreadNow(セクションの cue.spread)
            を掛ける ―― 他の軌道(crossX/十字/円)はどれも spreadNow で絞っているのに
            ここだけ無条件で物理可動域いっぱい(MAX_SWING≒75°)へ振っていたため、
            「サーチライトがほぼ真横を向いている」印象になっていた(ユーザー指摘。
            「イントロ2みたいな振り方をしてる程度でいい」= intro-B の cue.spread
            (0.55)相当まで絞れば十分、という指定)。spreadNow を掛けることで、
            outro(spread 0.55)は intro-B とほぼ同じ振れ幅になり、SABI/LATTER
            (0.78〜1)は従来どおり大きく開く。

            **SABI/LATTER/outro(isB=false)は外向き基準の左右スナップ。**
            以前はワールドX軸(azimuth 0/π)への固定スナップで、灯の位置
            (建物のどの辺にいるか)を無視していたため、東西の辺の灯が
            建物の幅を横切る向きに振れていた(ユーザー指摘「サビのサーチ
            ライトの光が建物を貫通している」)。beam.outwardAzimuth(その灯
            にとって建物と反対の向き)を中心に ±AIM_SIDE_SWING だけ
            拍ごとにスナップする ―― 「イントロ2みたいに左右に動かす」の
            指定を、拍ごとのスナップという動きの質は変えずに満たす。
            Bのリザーは「前後に
            開閉するだけでなく、光の向きそのものが変わる方が良い」という
            ユーザー指定で状態を5つに増やした(RISER_AZIMUTH_STATE_COUNT の
            コメント参照。V字/X字の2つ+外向き±30°の3つ)。**X字は一度
            外したら「X字に交差しなくなってる、入れて」と指摘があった**
            ので、必ず状態の1つとして残してある。北(4・7)は南(1・10)より
            2拍ぶん位相をずらし、南北が同時に同じ状態へ揃う瞬間とずれる
            瞬間が交互に出るようにしている(側の符号 side を掛けて鏡像ペアの
            左右対称は維持)。
          */
          const side = beam.x >= 0 ? 1 : -1;
          if (isB) {
            const outward = CORNER_OUTWARD_AZIMUTH[beam.order] ?? 0;
            const isNorthCorner = beam.order === 4 || beam.order === 7;
            const phaseBeat = isNorthCorner ? syncBeat + 2 : syncBeat;
            const stateIndex =
              ((Math.floor(phaseBeat) % RISER_AZIMUTH_STATE_COUNT) +
                RISER_AZIMUTH_STATE_COUNT) %
              RISER_AZIMUTH_STATE_COUNT;
            switch (stateIndex) {
              case 0:
                azimuth = side >= 0 ? 0 : Math.PI; // V字(開く)
                break;
              case 1:
                azimuth = side >= 0 ? Math.PI : 0; // X字(交差)
                break;
              case 2:
                azimuth = outward; // 隅の素の外向き
                break;
              case 3:
                azimuth = outward - side * RISER_AZIMUTH_WOBBLE;
                break;
              case 4:
                azimuth = outward + side * RISER_AZIMUTH_WOBBLE;
                break;
              default:
                // 北↔南の入れ替え(ユーザー指定「北の光は南を、南の光は北を向くように」)
                azimuth = isNorthCorner ? SOUTH_AZIMUTH : NORTH_AZIMUTH;
                break;
            }
          } else {
            const swingSign = side * beatSyncDir >= 0 ? 1 : -1;
            azimuth = beam.outwardAzimuth + swingSign * AIM_SIDE_SWING;
          }
          polar = MAX_SWING * spreadNow;
        } else if (crossX) {
          /*
            シザース交差(reply.mp4 4〜9秒)。図の左右(=ワールド X)方向へ
            首を振り、中央線をまたいで往復する。
              swing =  +1 … 相方の側へ倒れて交差(X字)
              swing =  -1 … 反対へ倒れて開く(V字)
            右灯(beam.x>=0)と左灯は beam.x の符号で lean の向きが逆になる
            ので、位相をずらさなくても常に左右対称に交わる。isCorner(隅櫓)か
            辺の灯かに関わらず同じ動き。

            INTRO2_SWEEP_SCALE で灯ごとに周期を伸ばせる(ピンクの2灯だけ遅く)。
            ペア(1と10)は同じ倍率なので左右対称は保たれる。

            **Bは南北の速さを揃える。** イントロ2は南(1・10)を遅く・北
            (4・7)を速くする非対称が意図的な演出だが、Bにそのまま流用すると
            南北で交差の速さが違って見え、「イントロ2の南側のサーチライトと
            同じ速度、動きをするように」というユーザー指定に沿わない。Bの
            ときだけ北(INTRO2_SWEEP_SCALEに無い=既定1倍)も南と同じ倍率
            (2)を強制し、4本そろって同じ速さで交差させる。イントロ2本編
            (isB=false)側の非対称はそのまま残す。

            **Bは南北を半周期ずらして逆位相にする。** 南北の速さを揃えた
            ぶん、位相まで同じだと4本が常に同時にX字/V字になって「1つの
            ペアが2倍の太さで動いている」ように見えてしまう。ユーザー指定
            「1つ目(南)がXのときは2つ目(北)はVになっているように」に
            従い、北(4・7)にだけ半周期(crossXScale/2)ぶんcyclePosをずらす
            ―― sin(θ+π) = -sin(θ) で符号がちょうど反転し、南がX(swing>0)
            のとき北はV(swing<0)に、南がVのとき北はXになる。
          */
          const crossXScale = isB ? 2 : (INTRO2_SWEEP_SCALE[beam.order] ?? 1);
          const crossXPhaseOffset =
            isB && (beam.order === 4 || beam.order === 7)
              ? crossXScale / 2
              : 0;
          const swing = Math.sin(
            (2 * Math.PI * (cyclePos + crossXPhaseOffset)) / crossXScale,
          );
          const side = beam.x >= 0 ? 1 : -1;
          const lean = -side * swing;
          azimuth = lean >= 0 ? 0 : Math.PI;
          polar = MAX_SWING * spreadNow * Math.abs(swing);
        } else if (beam.isCorner) {
          /*
            十字: 東(+X)→北(+Z)→西(-X)→南(-Z)の順に、直線的に振れて
            戻る。1周期(cue.sweepBars小節)を4等分し、その区間の中で
            0→1→0 と往復する(Math.sin(within*π))。
          */
          const cycleFrac = cyclePos - Math.floor(cyclePos);
          const segment = cycleFrac * 4;
          const segIndex = Math.floor(segment) % 4;
          const within = segment - Math.floor(segment);
          const swing = Math.sin(within * Math.PI);
          azimuth = segIndex * (Math.PI / 2);
          polar = MAX_SWING * swing * spreadNow;
        } else {
          // 円: 方位を連続的に一周させる。傾きの大きさ(polar)は一定
          azimuth = 2 * Math.PI * cyclePos;
          polar = MAX_SWING * spreadNow;
        }

        /*
          極角(polar)・方位角(azimuth)から方向ベクトルを作り、真上(UP)から
          その方向への回転を Quaternion で直接組む。Euler(rotation.x/z)を
          個別に動かすと合成順序でねじれるので、球面座標→ベクトル→
          setFromUnitVectors で一発に作るのが正確(BeamLight/WashLight の
          lift/yaw とは違い、こちらは対称な円錐状の首振りなのでこの方法が合う)。
        */
        const dir = swingDirRef.current;
        dir.set(
          Math.sin(polar) * Math.cos(azimuth),
          Math.cos(polar),
          Math.sin(polar) * Math.sin(azimuth),
        );
        const targetQuat = swingQuatRef.current;
        // ここまではワールド座標系の絶対的な向き。mesh は外側group(Y回転=
        // beam.angle)の子なので、親の回転を打ち消してローカル空間へ変換する
        // (groupQuatInverse のコメント参照。これが無いと十字/円が
        // 灯ごとの外向き方位で回転してしまう)
        targetQuat.setFromUnitVectors(UP, dir);
        targetQuat.premultiply(beam.groupQuatInverse);

        if (isBeatSync) {
          // 拍ごとに可動域の限界へ瞬間移動(なましをバイパス。BeamLightの
          // yawスナップと同じ考え方。follow を通すと瞬間切り替えに見えない)
          mesh.quaternion.copy(targetQuat);
        } else {
          // ヘッドの首振りをなまして追従させる(以前の tiltRef と同じ考え方)
          mesh.quaternion.slerp(targetQuat, follow);
        }
      });
    }

    materialsRef.current.forEach((mat, i) => {
      const beam = beams[i];
      const flare = flaresRef.current[i];

      /*
        色。colorIndexRef で決めた「どの枠を見るか」を、セクション別パレット
        (毎フレーム sampleSearchlightSectionPalette が更新する paletteRef)
        から引く。-1 は固定のイントロ2色(INTRO2_SOLO_COLORS)。
      */
      const idx = colorIndexRef.current[i];
      const color =
        idx === -1 ? INTRO2_SOLO_COLORS[beam.order] : paletteRef.current[idx];
      if (color) {
        mat.uniforms.uColor.value.copy(color);
        if (flare) flare.color.copy(color);
      }

      /*
        走る光。位相を引くと「番号の若い灯から順に」光が渡っていく。
        cos を鋭くして、明るい山が1点に集まるようにする。
      */
      const phase = patternPhase(cue.pattern, beam);
      const wave = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (chasePos - phase));
      const chase = 1 - chaseDepth + chaseDepth * Math.pow(wave, 3);
      /*
        イントロ2は図の6灯だけ(INTRO2_SOLO)。intro-B の間はハードに0、
        直後の breath でも点け直さない(prevCrossX)。breath は「6本を立てて
        フェードアウト」する区間なので、残り6本を戻すと逆に増えて見える
        (CUES.breath 参照)。breath を抜ければ prevCrossX が偽になり通常へ。
        ここも isIntro2(intro-B本人)で判定する ―― crossX だとBも含んで
        しまうため。
      */
      const solo = isIntro2
        ? INTRO2_SOLO[beam.order]
          ? 1
          : 0
        : prevCrossX && !INTRO2_SOLO[beam.order]
          ? 0
          : 1;
      /*
        拍同期モードは通常の chase(走る光)パターンを無効化し、拍のON/OFF
        点滅(beatSyncBlink)に置き換える(ユーザー指定)。
      */
      /*
        Bメロは隅櫓の角4本だけ(ユーザー指定「Bメロは角の4本だけでいい。
        8本出るのはさびだけでいい」)。天守の辺8本(beam.isCorner=false)は
        Bの間ハードに0にし、次のSABIから通常どおり12本(角4+辺8)に戻す。
      */
      const bCornerOnlyGate = isB && !beam.isCorner ? 0 : 1;
      /*
        角4本も一斉には灯さず、方角で2本ずつ時差を付ける(ユーザー指定
        「51.2で北のスポット2個を照らし始めて、54秒で南のスポット2個を
        照らすようにして」)。北=ワールドZが負(隅櫓の右下/左下。北=-Z の
        規約は constants.ts の REPLY_MOON_AZIMUTH コメント/Compassと同じ)。
        bCornerOnlyGate と掛け合わせるだけなので、B以外やSABI以降には
        影響しない(isB=falseなら常に1)。
      */
      const bStagedSpotGate =
        isB && beam.isCorner
          ? beam.z < 0
            ? t >= REPLY_B_NORTH_SPOT_START_SECONDS
              ? 1
              : 0
            : t >= REPLY_B_SOUTH_SPOT_START_SECONDS
              ? 1
              : 0
          : 1;
      const level =
        (isBeatSync ? base * beatSyncBlink : base * chase * solo) *
        bCornerOnlyGate *
        bStagedSpotGate *
        bHushFade;

      mat.uniforms.uOpacity.value = Math.max(level * BEAM_OPACITY_MAX, 0);
      if (flare) {
        flare.opacity = Math.min(
          Math.max(level * FLARE_OPACITY_MAX, 0),
          FLARE_OPACITY_CLAMP,
        );
      }
    });
  });

  return (
    <group ref={groupRef} position={position}>
      {beams.map((beam, i) => (
        /*
          外側の group で配置角を決め、内側の mesh を傾ける。
          傾きは毎フレーム useFrame から書き換えるのでここは初期値。
        */
        <group
          key={beam.order}
          position={[beam.x, BEAM_ORIGIN_Y, beam.z]}
          rotation={[0, beam.angle, 0]}
        >
          <mesh
            geometry={geometry}
            material={materials[i]}
            // 初期姿勢は真上(無回転)。以降は useFrame が quaternion を直接書き換える
            // 空へ長く伸びるので、天守の bbox ではカリングされてしまう
            frustumCulled={false}
          />
          {/* 光源そのもののフレア。ビームと同じ色・同じ明るさで明滅する */}
          <sprite scale={[FLARE_SIZE, FLARE_SIZE, 1]}>
            <spriteMaterial
              ref={(m) => {
                flaresRef.current[i] = m;
              }}
              map={flareTexture}
              color={BEAM_COLORS[beam.half % 2 === 0 ? 0 : 1]}
              transparent
              opacity={0}
              blending={AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        </group>
      ))}
    </group>
  );
}
