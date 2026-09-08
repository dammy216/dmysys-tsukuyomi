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
  BEAM_COLORS,
  CASTLE_HALF_DEPTH,
  CASTLE_HALF_WIDTH,
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
import {
  CORNER_TOWER_XZ,
  TOWER_HALF_DEPTH,
  TOWER_HALF_WIDTH,
} from "./towerLayout";

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
 */
type BeamPattern = "unison" | "wave" | "chase" | "split";

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
  "intro-A": {
    pattern: "wave",
    sweepBars: 1,
    chaseBars: 2,
    chaseDepth: 0,
    level: 1,
    spread: 1,
    strobe: 0.22,
    colorBars: 2,
    ringColors: false,
    slew: 9,
  },
  "intro-B": {
    pattern: "wave",
    sweepBars: 1,
    chaseBars: 2,
    chaseDepth: 0.18,
    level: 1,
    spread: 1,
    strobe: 0.22,
    colorBars: 2,
    ringColors: false,
    slew: 9,
  },
  // 音が落ち着く区間。ほぼ柱に立てて、明滅も止める
  breath: {
    pattern: "unison",
    sweepBars: 4,
    chaseBars: 4,
    chaseDepth: 0.1,
    level: 0.4,
    spread: 0.22,
    strobe: 0.04,
    colorBars: 4,
    ringColors: false,
    slew: 3,
  },
  // Aメロ。ゆっくりした波で、歌の邪魔をしない
  A: {
    pattern: "wave",
    sweepBars: 2,
    chaseBars: 4,
    chaseDepth: 0.3,
    level: 0.62,
    spread: 0.5,
    strobe: 0.1,
    colorBars: 4,
    ringColors: false,
    slew: 4,
  },
  // Bメロ。チェイスを回し始めて、サビへ向けて溜める
  B: {
    pattern: "chase",
    sweepBars: 1,
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
  // 後半。サビの勢いを保ちつつ、チェイスは半分の速さにして少し落ち着かせる
  LATTER: {
    pattern: "chase",
    sweepBars: 1,
    chaseBars: 2,
    chaseDepth: 0.6,
    level: 1.2,
    spread: 0.95,
    strobe: 0.26,
    colorBars: 1,
    ringColors: true,
    slew: 11,
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
  // フェード。柱に立てて消えていく
  fade: {
    pattern: "unison",
    sweepBars: 4,
    chaseBars: 4,
    chaseDepth: 0,
    level: 0.32,
    spread: 0.2,
    strobe: 0,
    colorBars: 4,
    ringColors: false,
    slew: 2,
  },
};

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
 * を外向きに足した位置 ―― EaveBeams.tsx で「外側の1隅」として使っているのと
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
    default:
      return 0;
  }
}

type StageBeamsProps = {
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
 */
export function StageBeams({
  position = [0, 0, 0],
  activationRef,
  songTimeRef,
}: StageBeamsProps) {
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

    /* --- 色。ringColors なら円周へ全色を配り、そうでなければ従来の2色 --- */
    const colorSlot = Math.floor(barPos / cue.colorBars);
    if (colorSlot !== colorSlotRef.current || si !== colorCueRef.current) {
      colorSlotRef.current = colorSlot;
      colorCueRef.current = si;
      const partners = BEAM_COLORS.length - 1;
      /*
        剰余は必ず正に丸める。曲頭(barPos<0)では colorSlot が負になり、
        JS の % は負を返すので、そのまま添字にすると undefined になる。
      */
      const partner = 1 + (((colorSlot % partners) + partners) % partners);
      beams.forEach((beam, i) => {
        /*
          ringColors: 2本ひと組で色を変えながら円周を一周させる。1本ずつ
          色を変えると点描になって色が読めないので、組にして帯にする。
          スロットごとに起点をずらすので、小節ごとに色の帯が回って見える。
          それ以外: 鏡像ペアには同じ色。並び順の偶奇で2色を交互に差す。
        */
        const hex = cue.ringColors
          ? BEAM_COLORS[
              (Math.floor(beam.order / 2) + colorSlot) % BEAM_COLORS.length
            ]
          : BEAM_COLORS[beam.half % 2 === 0 ? 0 : partner];
        materialsRef.current[i]?.uniforms.uColor.value.set(hex);
        flaresRef.current[i]?.color.set(hex);
      });
    }

    /* --- 拍の明滅。小節頭だけ一段上げる --- */
    const beatPos = (t - REPLY_BEAT_OFFSET) / REPLY_BEAT_SECONDS;
    const beatPhase = beatPos - Math.floor(beatPos);
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
        if (beam.isCorner) {
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
          setFromUnitVectors で一発に作るのが正確(EaveBeams/GableBeams の
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

        // ヘッドの首振りをなまして追従させる(以前の tiltRef と同じ考え方)
        mesh.quaternion.slerp(targetQuat, follow);
      });
    }

    materialsRef.current.forEach((mat, i) => {
      const beam = beams[i];
      /*
        走る光。位相を引くと「番号の若い灯から順に」光が渡っていく。
        cos を鋭くして、明るい山が1点に集まるようにする。
      */
      const phase = patternPhase(cue.pattern, beam);
      const wave = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (chasePos - phase));
      const chase = 1 - chaseDepth + chaseDepth * Math.pow(wave, 3);
      const level = base * chase;

      mat.uniforms.uOpacity.value = Math.max(level * BEAM_OPACITY_MAX, 0);
      const flare = flaresRef.current[i];
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
