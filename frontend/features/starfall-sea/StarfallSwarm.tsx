"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
} from "three";

/** 水色・オレンジ・黄色寄りの黄緑・薄めのピンクの4色に絞ったパレット */
const COLOR_PALETTE = [
  "#7fd4ff", // 水色
  "#ffa64d", // オレンジ
  "#dce82c", // 黄色寄りの黄緑
  "#ff8fc4", // 薄めのピンク
];
/** 各色の出やすさ。水色を一番多く、次にピンク、オレンジと黄緑は同率で一番少なく */
const COLOR_WEIGHTS = [5, 1, 1, 2];
const COLOR_WEIGHT_TOTAL = COLOR_WEIGHTS.reduce((sum, w) => sum + w, 0);

/*
  転調(動画1:22)後に切り替わる、彩度を上げた派手なパレット。
  参考映像の1:24以降は、それまでの青基調から一転して
  マゼンタ・黄・シアン・緑のネオンが画面いっぱいに乱舞する。
  通常パレットと同じ並び順・同じ重みで引けるよう、色だけを差し替えた
  同じ長さの配列にしてある(個体ごとの色の選択インデックスを使い回し、
  シェーダー側で2つの色を uSurge で混ぜてなめらかに転調させる)。
*/
const SURGE_COLOR_PALETTE = [
  "#4df0ff", // 鮮やかなシアン(水色の位置)
  "#ffd23d", // 濃い黄(オレンジの位置)
  "#5cff8f", // ネオングリーン(黄緑の位置)
  "#ff4dd2", // マゼンタ(ピンクの位置)
];

/** 0〜1の乱数から、COLOR_WEIGHTS の比率に従ってパレットの色を1つ選ぶ */
function pickColorIndex(u: number) {
  let acc = 0;
  for (let k = 0; k < COLOR_WEIGHTS.length; k++) {
    acc += COLOR_WEIGHTS[k] / COLOR_WEIGHT_TOTAL;
    if (u <= acc) return k;
  }
  return COLOR_WEIGHTS.length - 1;
}

/**
 * 色の明るさ倍率。加算合成なので、密なところは重なりだけで白まで飽和する。
 * 数が多いほど重なりが増えるため、1匹あたりは控えめでよい
 * (上げすぎると画面全体が白く潰れて粒が見えなくなる)。
 */
const COLOR_GAIN = 1.35;

/**
 * 転調後の追加の明るさ倍率。COLOR_GAINにこれを掛ける。
 * 色が変わるだけでなく光量そのものが増すことで、曲の盛り上がりに
 * 合わせて画面が一段華やぐ(上げすぎると白飛びするため控えめにする)。
 */
const SURGE_COLOR_GAIN = 1.5;

/**
 * 転調直前(uPreDim)にどこまで暗くするか(0=変化なし〜1=真っ暗)。
 * Sandbox3D側のPRE_SURGE_DARKENと同じ意図の値をシェーダー側に定数として埋め込む。
 */
const PRE_SURGE_DARKEN = 0.75;

/*
  群れは役割の違う2種類でできている。並び順は「らせん → 紙吹雪」。

  形は「円柱」。半径と高さを切り離して、上から下まで同じ太さの筒にしてある。
  その筒の中に、縦に長いらせんを何本も通して構造を見せる。
  らせんの外には、密集させずまばらに漂う紙吹雪層を薄く足す
  (以前ここに「広がり層」を置いたときは渦と同じ密度で埋めてしまい、
  渦がぼやける原因になった。今回は明確にまばらな数だけ配って対比を作る)。

  位置と向きの計算は頂点シェーダ(GPU)側で全個体並列に行うので、
  匹数を増やしてもCPU(JSのメインスレッド)側の負担はほとんど変わらない。
  増やしたときに効いてくるのは描画側(頂点数と加算合成の塗り面積)。
*/

/*
  らせんと紙吹雪の比率。参考映像では、らせんの構造は確かにあるものの
  周囲の紙吹雪の量が圧倒的に多く、その中に埋もれて強く主張していない。
  そのためらせん側を絞り、紙吹雪側を主役の量にしてある。
*/
/** らせん(コイル)を作る個体数 */
const HELIX_COUNT = 15000;
/** らせんの外を紙吹雪のように漂う個体数。画面全体を埋める主役 */
const CONFETTI_COUNT = 25000;
/** 中心を貫いて立ち上がる、細く速く回る魚の柱を作る個体数 */
const COLUMN_COUNT = 3000;
/** 群れの総数 */
const SWARM_COUNT = HELIX_COUNT + CONFETTI_COUNT + COLUMN_COUNT;

/**
 * 円柱の内側の穴と外周。魚はこの間を泳ぐ。
 * 半径は高さと連動させない ＝ 上から下まで同じ太さの筒になる。
 *
 * StarfallCamera の PATH は(演出上の引き伸ばしを含めると)およそ半径18〜38を
 * 回るので、円柱の外周をその範囲の内側寄りに収めることで、カットによって
 * カメラが筒の中に潜っていたり外に出ていたりが自然に生まれる。
 * 広すぎるとカメラが常に筒の中に留まってしまい、出入りが起きない。
 */
const RADIUS_MIN = 5;
const RADIUS_MAX = 24;
/**
 * 円柱の高さ。
 *
 * らせんの「立ち上がりの急さ」は、1周ぶん横に進む距離(2πr)に対して
 * どれだけ縦に上がるかで決まる。参考映像のように水平から45〜60度の
 * 急な角度で立ち上げるには、回転数を減らすだけでは足りず高さも要る。
 * 半径15・0.45回転なら横に約42進むので、同じくらい縦に上がる高さが必要になる。
 *
 * 下端は水面(y=0)に揃えている。水面はMeshReflectorMaterialの不透明な板なので、
 * それより下は常にカメラから見えず、魚を配ってもGPUの無駄になるだけのため。
 */
const HEIGHT_MIN = 0;
const HEIGHT_MAX = 46;

/**
 * 紙吹雪層が漂う範囲。中心付近から渦の外まで(渦=半径5〜24を含んで
 * 少し外側まで)取ることで、渦の中にも紙吹雪が混ざりつつ、渦のまわりを
 * 回っているように見せる(広く取りすぎると渦から遠く離れた場所にまで
 * 散らばってしまい、渦と無関係な魚に見えてしまう)。高さは渦と揃える。
 * 下端を水面(y=0)に揃えている理由はHEIGHT_MINと同じ。
 */
const CONFETTI_RADIUS_MIN = 2;
const CONFETTI_RADIUS_MAX = 38;
const CONFETTI_HEIGHT_MIN = 0;
const CONFETTI_HEIGHT_MAX = 46;

/**
 * 中心の柱の半径。細いほど1本の光の筋らしく見える。
 * 別オブジェクトは置かず、魚自体を密に集めて速く回すことで
 * 柱そのものを表現する。
 */
const COLUMN_RADIUS_MIN = 0.2;
const COLUMN_RADIUS_MAX = 0.9;
/**
 * 柱の高さ。下端はホログラム画面(y=14、高さ9 ＝ 上端およそ18.5。
 * ToriiHologram.tsx の FLOAT_Y / SCREEN_HEIGHT と合わせてある)の
 * 上端より上から始めることで、画面の縦範囲と重ならないようにする
 * (以前は鳥居のすぐ上(y=6)から始めていたため、画面の下端より低い位置から
 * 立ち上がり、画面全体を貫通して見えていた)。上端は渦(円柱)の
 * HEIGHT_MAX に合わせ、渦と同じくらいの高さで収める。
 */
const COLUMN_HEIGHT_MIN = 20;
const COLUMN_HEIGHT_MAX = HEIGHT_MAX;
/** 柱の回転速度(rad/秒)。渦よりずっと速く回して、光が渦を巻いている勢いを出す */
const COLUMN_SPEED_MIN = 0.9;
const COLUMN_SPEED_MAX = 1.6;
/**
 * 柱の魚の勾配。らせんの climbPitch と同じ仕組みで、回転による水平の
 * 速さに縦成分を上乗せし、ただ回るだけでなく斜め上に泳いでいるように見せる。
 * 柱は全員同じ向き(上向き)に統一する(DNAのように反対向きのペアは作らない)。
 */
const COLUMN_CLIMB_PITCH = 1.6;

/**
 * 1匹あたりの見た目の大きさ。映像の2:07〜2:11(鳥居が入る引きの画)を見ると、
 * 渦の中心付近でこそ形が判別できるが、画面の大部分を埋める背景側の魚は
 * 星屑のように細かい粒になっている。1匹では画面のごく一部しか占めない。
 */
const SCALE_MIN = 0.024;
const SCALE_MAX = 0.075;

/**
 * らせんの本数。多いほど筒は均一に埋まるが、重なりすぎると
 * 1本1本の巻きが読めなくなってただの雲になる。本数を絞ると
 * 逆に1本1本の筋がくっきり見えるようになる。
 */
const STRAND_COUNT = 4;
/**
 * らせん1本が下から上まで登る間に回る回数。
 *
 * 1回転させると横に 2πr(半径15なら約94)も進んでしまい、高さを足しても
 * 寝た螺旋にしかならない。1周未満に抑えることで、上へ向かう角度が立つ。
 * 内側の筋ほど1周の距離が短いので、より垂直に近い流れになる。
 */
const HELIX_TURNS_MIN = 0.3;
const HELIX_TURNS_MAX = 0.65;
/**
 * らせん1本の太さ。半径方向と角度方向の広がり。
 * 細くするとくっきりした線になるが、参考映像のらせんは紙吹雪に紛れて
 * 輪郭がぼやけているので、少し太めに取って柔らかい帯として見せる。
 */
const STRAND_RADIUS_SPREAD = 1.3;
const STRAND_ANGLE_SPREAD = 0.26;

/**
 * 筒全体の回転速度(rad/秒)。らせんの形を保つため全個体この同じ速さで回す。
 * 半径ごとに速さを変えると、らせんがすぐ巻き取られて筋が消えてしまう。
 */
const SWIRL_SPEED = 0.2;

function seededRandom(seed: number) {
  let a = seed | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * -1〜1の三角分布。乱数2つの和なので中心ほど密になり、
 * らせんの束の縁が自然にぼける(一様乱数だと角張った箱になる)。
 */
function triangular(seed: number) {
  return seededRandom(seed) + seededRandom(seed + 7919) - 1;
}

/** らせん1本ぶんの設定 */
type Strand = {
  /** 筒の中でこのらせんが通る半径(高さによらず一定) */
  radius: number;
  /** 巻き始めの角度 */
  phase: number;
  /** 下から上までに回る回数 */
  turns: number;
  /** 回る向き。+1 か -1。ペアごとに変えて、渦全体で回転方向に差をつける */
  direction: number;
  /**
   * このらせんが占める高さの範囲(円柱全体の高さに対する割合、0〜1)。
   * ペアごとに範囲をずらすことで、全部のらせんが同じ高さで
   * 同時に始まり同時に終わる単調さをなくす。
   */
  heightStart: number;
  heightSpan: number;
  /** 所属させる魚の割合。大きいほど濃い筋になる */
  weight: number;
};

/**
 * らせんを作る。1本ずつ独立にばらけさせるのではなく、DNAの二重らせんのように
 * 「同じ半径・同じ回転数・同じ向き・同じ高さ範囲を持つ2本1組」を作り、
 * 位相だけ半周(π)ずらして反対側に置く。対になる相方が反対側からついてくる
 * ことで、2本が互いに巻きつき合いながら交差して見える、DNAらしい構造になる。
 *
 * ペア単位では、回転方向と高さ範囲をそれぞれランダムに変える。これをしないと
 * 全ペアが同じ向きに同じ高さで回るだけになり、本数を増やしても単調に見える。
 */
function createStrands(): Strand[] {
  const strands: Strand[] = [];
  const pairCount = Math.ceil(STRAND_COUNT / 2);

  for (let p = 0; p < pairCount; p++) {
    const seed = 91193 + p * 2477;
    // 外周ほど面積が広いので、平方根で分布させて見た目の密度を保つ
    const radial = Math.sqrt(seededRandom(seed));
    const radius = RADIUS_MIN + radial * (RADIUS_MAX - RADIUS_MIN);
    const turns =
      HELIX_TURNS_MIN +
      seededRandom(seed + 2) * (HELIX_TURNS_MAX - HELIX_TURNS_MIN);
    const phase = seededRandom(seed + 1) * Math.PI * 2;
    const weight = 0.5 + seededRandom(seed + 3) * 1.6;
    const direction = seededRandom(seed + 5) < 0.5 ? 1 : -1;
    // 全体の55〜90%の範囲を、開始位置をずらしながら占める
    const heightSpan = 0.55 + seededRandom(seed + 6) * 0.35;
    const heightStart = seededRandom(seed + 7) * (1 - heightSpan);

    const base = { radius, turns, direction, heightStart, heightSpan, weight };
    strands.push({ ...base, phase });
    if (strands.length < STRAND_COUNT) {
      // 相方: 半径・回転数・向き・高さ範囲はそのまま、位相だけ180度ずらして反対側に置く
      strands.push({ ...base, phase: phase + Math.PI });
    }
  }

  return strands;
}

type SwarmParticle = {
  radius: number;
  height: number;
  angle: number;
  /** 周回の速さ(rad/秒) */
  angularSpeed: number;
  /**
   * 角度の揺らぎ。時間で溜まっていく速度差と違い sin で往復するだけなので、
   * 何秒経ってもらせんの形が崩れない。
   */
  angleSway: number;
  angleSwayFreq: number;
  angleSwayPhase: number;
  /** 半径・高さのゆらぎ */
  radiusWobble: number;
  radiusFreq: number;
  radiusPhase: number;
  heightWobble: number;
  heightFreq: number;
  heightPhase: number;
  /**
   * らせんの勾配(登り降りの傾き)。回転にともなう水平方向の速さに対して、
   * どれだけ縦にも進むとみなすかの比率。0=完全に水平向き。
   * 揺らぎによる一時的な上下(heightWobble)と違い、これは1本の筋が
   * 登っていく/降りていく向きそのものを表すので、時間が経っても変わらない。
   * らせんに属さない紙吹雪・柱は0のまま(水平の速度だけで向きを決める)。
   */
  climbPitch: number;
  scale: number;
  color: Color;
  /** 転調(1:22)後の派手なパレット側の色。uSurgeで color からこちらへ寄せる */
  surgeColor: Color;
};

/**
 * 魚1匹ぶんの形。前後に伸びた八面体(紡錘)＋尾びれの8三角形しかない。
 *
 * 素材の fish_hologram は1匹3,090三角形あり、数ピクセルにしか映らない粒には
 * 過剰すぎる(1万匹で3千万三角形)。この大きさなら簡素な紡錘形で見分けがつかない
 * ので、軽くしたぶんを匹数に回して密度を稼ぐ。
 *
 * 進行方向は +Z(下の行列組み立てで、この軸を速度方向に向ける)。
 */
function createFishGeometry(): BufferGeometry {
  /** 胴の半幅(横) */
  const w = 0.16;
  /** 胴の半高(縦)。魚は横より縦に平たいので高さを取る */
  const h = 0.3;
  /** 尾びれの半高 */
  const fin = 0.42;

  // prettier-ignore
  const positions = new Float32Array([
    0, 0, 1.0,     // 0 鼻先
    0, 0, -1.0,    // 1 尾の付け根
    w, 0, 0,       // 2 右
    -w, 0, 0,      // 3 左
    0, h, 0,       // 4 背
    0, -h, 0,      // 5 腹
    0, fin, -1.5,  // 6 尾びれ上
    0, -fin, -1.5, // 7 尾びれ下
  ]);

  // prettier-ignore
  const indices = new Uint16Array([
    // 前半分(鼻先から胴の一番太いところへ)
    0, 2, 4,  0, 4, 3,  0, 3, 5,  0, 5, 2,
    // 後ろ半分(胴から尾の付け根へ)
    1, 4, 2,  1, 3, 4,  1, 5, 3,  1, 2, 5,
    // 尾びれ
    1, 6, 7,
  ]);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/*
  ここから下が、1匹ぶんの位置と向きを決める計算のGPU(頂点シェーダ)版。

  以前はこれと同じ計算をJSのforループで全個体ぶん毎フレーム回していたが、
  1匹あたり三角関数を10回ほど呼ぶため、数万匹になるとCPU(JSのメイン
  スレッド)側が丸ごとボトルネックになっていた。GPUは同じ計算を全個体
  同時に走らせられるので、CPU側は毎フレーム uTime を1つ書くだけで済む。

  個体ごとの定数(半径・位相・ゆらぎの周期など)は、初回に一度だけ
  インスタンス属性(aParamA〜D)としてGPUへ送る。時間で変わるのは
  uTime と uActivation の2つだけ。
*/
const SWARM_SHADER_HEAD = /* glsl */ `
uniform float uTime;
uniform float uActivation;
// 0で通常のパレット、1で転調後の派手なパレット
uniform float uSurge;
// 転調後の色。instanceColor(通常色)との間を uSurge で補間する
attribute vec3 aSurgeColor;
varying vec3 vSurgeColor;

// 個体ごとの定数。初回に1度だけ送り、以降は更新しない
attribute vec4 aParamA; // x:angle       y:angularSpeed  z:radius       w:height
attribute vec4 aParamB; // x:angleSway   y:swayFreq      z:swayPhase    w:climbPitch
attribute vec4 aParamC; // x:radiusWobble y:radiusFreq   z:radiusPhase  w:scale
attribute vec3 aParamD; // x:heightWobble y:heightFreq   z:heightPhase
`;

/*
  three の <begin_vertex>(= vec3 transformed = vec3(position);)を丸ごと
  置き換える。ここで魚1匹ぶんの姿勢と位置を組み立て、頂点座標を
  ワールド空間へ配置した状態で transformed に入れる。
  以降の three 側のチャンク(<project_vertex> や <fog_vertex>)は
  transformed をそのまま使うので、霧やトーンマッピングの扱いは
  meshBasicMaterial のときと変わらない。
*/
const SWARM_SHADER_BODY = /* glsl */ `
  float t = uTime;

  float pAngle        = aParamA.x;
  float pAngularSpeed = aParamA.y;
  float pRadius       = aParamA.z;
  float pHeight       = aParamA.w;

  float pAngleSway      = aParamB.x;
  float pAngleSwayFreq  = aParamB.y;
  float pAngleSwayPhase = aParamB.z;
  float pClimbPitch     = aParamB.w;

  float pRadiusWobble = aParamC.x;
  float pRadiusFreq   = aParamC.y;
  float pRadiusPhase  = aParamC.z;
  float pScale        = aParamC.w;

  float pHeightWobble = aParamD.x;
  float pHeightFreq   = aParamD.y;
  float pHeightPhase  = aParamD.z;

  float angle = pAngle
    + t * pAngularSpeed
    + sin(t * pAngleSwayFreq + pAngleSwayPhase) * pAngleSway;
  float y = pHeight + sin(t * pHeightFreq + pHeightPhase) * pHeightWobble;
  float r = pRadius + sin(t * pRadiusFreq + pRadiusPhase) * pRadiusWobble;

  float cosA = cos(angle);
  float sinA = sin(angle);

  /*
    位置を時間で微分して、実際に進んでいる向きへ頭を向ける。
    単純に円の接線へ固定すると、内外・上下に大きく動く個体まで
    いつも横を向いたままになってしまう。
  */
  float dAngle = pAngularSpeed
    + cos(t * pAngleSwayFreq + pAngleSwayPhase) * pAngleSway * pAngleSwayFreq;
  float dR = cos(t * pRadiusFreq + pRadiusPhase) * pRadiusWobble * pRadiusFreq;
  float dY = cos(t * pHeightFreq + pHeightPhase) * pHeightWobble * pHeightFreq;

  /*
    climbPitch(らせんの勾配)を、回転による水平方向の速さ(r * dAngle)に
    掛けて足す。これにより、回転にともなう純粋に水平な向きに
    「登っている/降りている」という縦の成分が上乗せされる
    (らせんに属さない個体は climbPitch=0 なので、この項は消えて
    従来通り水平の速度だけで向きが決まる)。
  */
  vec3 fwd = vec3(
    dR * cosA - r * sinA * dAngle,
    dY + pClimbPitch * r * dAngle,
    dR * sinA + r * cosA * dAngle
  );
  float fwdLen = length(fwd);
  // ほぼ止まっている瞬間は向きが定まらないので、接線向きで代用する
  fwd = fwdLen > 1e-5 ? fwd / fwdLen : vec3(-sinA, 0.0, cosA);

  /*
    進行方向から姿勢の基底を直接組み立てる。やっていることは lookAt と同じで、
    「+Z を進行方向に、+X を (worldUp × 進行方向) に向ける」だけ。
    worldUp=(0,1,0) なので外積を展開すると (fwd.z, 0, -fwd.x) となり、
    side の Y成分は必ず 0 になる。以降その 0 は畳んである。
  */
  vec2 sideXZ = vec2(fwd.z, -fwd.x);
  float sideLen = length(sideXZ);
  // 真上/真下を向いている個体は side が作れないので適当な直交軸を使う
  sideXZ = sideLen > 1e-5 ? sideXZ / sideLen : vec2(1.0, 0.0);

  vec3 sideV = vec3(sideXZ.x, 0.0, sideXZ.y);
  // up = fwd × side (side.y=0 を畳んだ形)
  vec3 upV = vec3(
    fwd.y * sideXZ.y,
    fwd.z * sideXZ.x - fwd.x * sideXZ.y,
    -fwd.y * sideXZ.x
  );

  // 出現時は湧き出すように、スケールを activation で伸ばす
  float s = pScale * uActivation;

  // 転調後の色はフラグメント側で instanceColor と混ぜるためそのまま渡す
  vSurgeColor = aSurgeColor;

  vec3 transformed =
      sideV * (position.x * s)
    + upV   * (position.y * s)
    + fwd   * (position.z * s)
    + vec3(cosA * r, y, sinA * r);
`;

type StarfallSwarmProps = {
  /** 鳥居の中心位置 */
  position?: [number, number, number];
  /**
   * 0=非表示 / 1=全開の進行度(heavyActivation)を持つ ref。
   * 立ち上がり/収まりの間ずっと値が変わるため、数値 prop だと数千匹の
   * このコンポーネントが親ごと毎フレーム再レンダーされる。ref で受け取り
   * useFrame の中で uniform へ入れる。
   */
  activationRef?: RefObject<number>;
  /**
   * 転調(動画1:22)の進行度(0〜1)を持つ ref。0=通常のパレット、1=彩度と
   * 光量を上げた派手なパレット。Sandbox3D側で毎フレーム更新する。
   * preDimRef と同じ理由で ref: SURGE_FADE_SECONDS の間ずっと値が変わるため
   * 数値 prop だと数千匹のこのコンポーネントが毎フレーム再レンダーされる。
   */
  surgeRef?: RefObject<number>;
  /**
   * 転調直前の暗転の進行度(0〜1)を持つ ref。0=通常の明るさ、1=PRE_SURGE_DARKEN
   * 分だけ暗くなる。Sandbox3D側で動画のcurrentTimeから毎フレーム更新する。
   * 暗転ランプ中は値が毎フレーム変わるため、prop(数値)だと数千匹のこの
   * コンポーネントが毎フレーム再レンダーされてFPSが落ちる。ref で受け取り
   * useFrame の中で uniform へ直接入れる。
   */
  preDimRef?: RefObject<number>;
};

/**
 * 「星降る海」モードの主役。ライブ映像のように、ネオンの魚の大群が
 * 鳥居のまわりを埋め尽くす巨大な筒になって回り続ける。
 *
 * 1つの InstancedMesh にまとめて描くことで、数万匹でも描画命令は1回で済む。
 */
export function StarfallSwarm({
  position = [0, 0, 0],
  activationRef,
  surgeRef,
  preDimRef,
}: StarfallSwarmProps) {
  const meshRef = useRef<InstancedMesh>(null);

  /*
    毎フレーム変わる唯一の値。シェーダーと同じオブジェクトを共有し、
    useFrame からはこの2つに書き込むだけで全個体が動く。
    (useMemo で作った値を useFrame 内で書き換えると
    react-hooks/immutability に引っかかるため ref で持つ。Bubbles.tsx と同じ理由)
  */
  const uniformsRef = useRef({
    uTime: { value: 0 },
    uActivation: { value: 0 },
    uSurge: { value: 0 },
    uPreDim: { value: 0 },
  });

  const particles = useMemo<SwarmParticle[]>(() => {
    const strands = createStrands();
    const weightTotal = strands.reduce((sum, s) => sum + s.weight, 0);

    return Array.from({ length: SWARM_COUNT }, (_, i) => {
      const seed = i * 977;

      const scale = SCALE_MIN + seededRandom(seed + 10) * (SCALE_MAX - SCALE_MIN);
      /*
        通常時と転調後で同じインデックスを引く。こうすると「水色だった個体は
        シアンへ、ピンクだった個体はマゼンタへ」と対応関係が保たれ、
        色が入れ替わるのではなく彩度が一気に上がったように見える。
      */
      const colorIndex = pickColorIndex(seededRandom(seed + 19));
      const color = new Color(COLOR_PALETTE[colorIndex]).multiplyScalar(COLOR_GAIN);
      const surgeColor = new Color(SURGE_COLOR_PALETTE[colorIndex]).multiplyScalar(
        COLOR_GAIN * SURGE_COLOR_GAIN,
      );

      if (i >= HELIX_COUNT + CONFETTI_COUNT) {
        /*
          中心の柱。渦・紙吹雪とは違い、狭い半径にほぼ固定したまま
          鳥居のすぐ上からホログラム画面を突き抜けて渦より高くまで速く回る。
          参考画像で鳥居の真上に立つ、ひときわ目立つ光の筋を表現する。
        */
        return {
          radius:
            COLUMN_RADIUS_MIN +
            seededRandom(seed) * (COLUMN_RADIUS_MAX - COLUMN_RADIUS_MIN),
          height:
            COLUMN_HEIGHT_MIN +
            seededRandom(seed + 1) * (COLUMN_HEIGHT_MAX - COLUMN_HEIGHT_MIN),
          angle: seededRandom(seed + 2) * Math.PI * 2,
          angularSpeed:
            COLUMN_SPEED_MIN +
            seededRandom(seed + 3) * (COLUMN_SPEED_MAX - COLUMN_SPEED_MIN),
          // 柱は真っ直ぐな回り方を保つので角度の揺らぎは足さない
          angleSway: 0,
          angleSwayFreq: 0,
          angleSwayPhase: 0,
          // 柱の輪郭を保つため、ゆらぎはごく小さく
          radiusWobble: 0.1 + seededRandom(seed + 4) * 0.25,
          radiusFreq: 0.3 + seededRandom(seed + 5) * 0.5,
          radiusPhase: seededRandom(seed + 6) * Math.PI * 2,
          heightWobble: 0.3 + seededRandom(seed + 7) * 0.8,
          heightFreq: 0.2 + seededRandom(seed + 8) * 0.4,
          heightPhase: seededRandom(seed + 9) * Math.PI * 2,
          // 斜め上に泳いでいるように見せる(向きは全員揃えて上向き)
          climbPitch: COLUMN_CLIMB_PITCH,
          scale,
          color,
          surgeColor,
        };
      }

      if (i >= HELIX_COUNT) {
        /*
          紙吹雪。らせんの構造(筋・固定半径)は持たないが、渦の中心付近から
          外側まで(CONFETTI_RADIUS_*)に留めることで、渦の中にも混ざりつつ、
          渦から遠く離れて散らばることもなく、渦のまわりを回っているように見せる。
          向きと速さは渦と揃え、全体の流れからは外れないようにする。
        */
        // 外周ほど面積が広いので、平方根で分布させて見た目の密度を一様に保つ
        const radial = Math.sqrt(seededRandom(seed));
        const height =
          CONFETTI_HEIGHT_MIN +
          seededRandom(seed + 1) * (CONFETTI_HEIGHT_MAX - CONFETTI_HEIGHT_MIN);
        return {
          radius: CONFETTI_RADIUS_MIN + radial * (CONFETTI_RADIUS_MAX - CONFETTI_RADIUS_MIN),
          height,
          angle: seededRandom(seed + 2) * Math.PI * 2,
          angularSpeed: SWIRL_SPEED,
          // らせんより少し大きく揺らして、束にならず個々に漂う感じを出す
          angleSway: 0.06 + seededRandom(seed + 12) * 0.16,
          angleSwayFreq: 0.15 + seededRandom(seed + 13) * 0.4,
          angleSwayPhase: seededRandom(seed + 14) * Math.PI * 2,
          /*
            揺れ幅は輪っかの厚み(CONFETTI_RADIUS_MAX-MIN=16)より
            十分小さく抑え、渦から大きく離れて漂い出さないようにする。
          */
          radiusWobble: 0.6 + seededRandom(seed + 4) * 1.8,
          radiusFreq: 0.1 + seededRandom(seed + 5) * 0.3,
          radiusPhase: seededRandom(seed + 6) * Math.PI * 2,
          heightWobble: 0.6 + seededRandom(seed + 7) * 1.8,
          heightFreq: 0.08 + seededRandom(seed + 8) * 0.25,
          heightPhase: seededRandom(seed + 9) * Math.PI * 2,
          // 紙吹雪は特定の筋を登る動きではないので、傾きは持たせない
          climbPitch: 0,
          scale,
          color,
          surgeColor,
        };
      }

      /*
        らせんの一員。weight の比率でどの筋に属するかを決める。

        高さ(v)から角度を決めるのが要点で、登るほど角度が回るので
        「縦に長いコイル」になる。半径は筋ごとに一定なので、
        以前のように下がすぼまることはなく円柱の形が保たれる。
      */
      let pick = seededRandom(seed + 11) * weightTotal;
      let strand = strands[strands.length - 1];
      for (let k = 0; k < strands.length; k++) {
        pick -= strands[k].weight;
        if (pick <= 0) {
          strand = strands[k];
          break;
        }
      }

      // このらせん自身の中でどこにいるか(0=始点, 1=終点)
      const v = seededRandom(seed);
      // 円柱全体に対する高さの割合。strand.heightStart/heightSpan の分だけ
      // ペアごとにずれるので、全部のらせんが同じ高さで並ばなくなる
      const heightFrac = strand.heightStart + v * strand.heightSpan;

      /*
        らせんの勾配。1本の筋が高さ方向に登る量(heightSpan×全体の高さ)を、
        水平方向に進む量(半径×回転角度=弧の長さ)で割った「登り傾斜」。
        回転にともなう水平方向の速さへこの比率を掛けることで、
        向きの計算にらせんの傾き(登り/降り)が反映される。
      */
      const climbPitch =
        (strand.direction * (strand.heightSpan * (HEIGHT_MAX - HEIGHT_MIN))) /
        (strand.radius * strand.turns * Math.PI * 2);

      return {
        radius: strand.radius + triangular(seed + 20) * STRAND_RADIUS_SPREAD,
        height: HEIGHT_MIN + heightFrac * (HEIGHT_MAX - HEIGHT_MIN),
        // 登るほど回る = らせん。半径は変えないので円柱のまま巻き上がる。
        // direction でペアごとに回る向きを変える
        angle:
          strand.phase +
          strand.direction * v * strand.turns * Math.PI * 2 +
          triangular(seed + 40) * STRAND_ANGLE_SPREAD,
        angularSpeed: SWIRL_SPEED,
        angleSway: 0.03 + seededRandom(seed + 12) * 0.08,
        angleSwayFreq: 0.3 + seededRandom(seed + 13) * 0.5,
        angleSwayPhase: seededRandom(seed + 14) * Math.PI * 2,
        /*
          揺れが大きすぎるとらせんの巻きがぼやけて潰れてしまうので、
          筋の太さ(STRAND_*_SPREAD)より十分小さく収める。
        */
        radiusWobble: 0.18 + seededRandom(seed + 4) * 0.6,
        radiusFreq: 0.15 + seededRandom(seed + 5) * 0.4,
        radiusPhase: seededRandom(seed + 6) * Math.PI * 2,
        heightWobble: 0.25 + seededRandom(seed + 7) * 0.75,
        heightFreq: 0.12 + seededRandom(seed + 8) * 0.35,
        heightPhase: seededRandom(seed + 9) * Math.PI * 2,
        climbPitch,
        scale,
        color,
        surgeColor,
      };
    });
  }, []);

  /*
    魚の形に、個体ごとの定数をインスタンス属性として載せる。
    ここで送った値はGPU側に置かれたまま以降更新されないので、
    毎フレームのCPU→GPU転送は uniform 2つぶんだけになる。
  */
  const geometry = useMemo(() => {
    const geo = createFishGeometry();

    const paramA = new Float32Array(SWARM_COUNT * 4);
    const paramB = new Float32Array(SWARM_COUNT * 4);
    const paramC = new Float32Array(SWARM_COUNT * 4);
    const paramD = new Float32Array(SWARM_COUNT * 3);
    // 転調後の色。通常色(instanceColor)とは別に、個体ごとに1度だけ送る
    const surgeColors = new Float32Array(SWARM_COUNT * 3);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const o = i * 4;

      const c = i * 3;
      surgeColors[c] = p.surgeColor.r;
      surgeColors[c + 1] = p.surgeColor.g;
      surgeColors[c + 2] = p.surgeColor.b;

      paramA[o] = p.angle;
      paramA[o + 1] = p.angularSpeed;
      paramA[o + 2] = p.radius;
      paramA[o + 3] = p.height;

      paramB[o] = p.angleSway;
      paramB[o + 1] = p.angleSwayFreq;
      paramB[o + 2] = p.angleSwayPhase;
      paramB[o + 3] = p.climbPitch;

      paramC[o] = p.radiusWobble;
      paramC[o + 1] = p.radiusFreq;
      paramC[o + 2] = p.radiusPhase;
      paramC[o + 3] = p.scale;

      paramD[c] = p.heightWobble;
      paramD[c + 1] = p.heightFreq;
      paramD[c + 2] = p.heightPhase;
    }

    geo.setAttribute("aParamA", new InstancedBufferAttribute(paramA, 4));
    geo.setAttribute("aParamB", new InstancedBufferAttribute(paramB, 4));
    geo.setAttribute("aParamC", new InstancedBufferAttribute(paramC, 4));
    geo.setAttribute("aParamD", new InstancedBufferAttribute(paramD, 3));
    geo.setAttribute("aSurgeColor", new InstancedBufferAttribute(surgeColors, 3));

    return geo;
  }, [particles]);

  /*
    素の meshBasicMaterial を onBeforeCompile で差し替える。
    ShaderMaterial で丸ごと書き直すと、霧・instanceColor・加算合成・
    トーンマッピング無効といった three 側の扱いを全部自前で再現する
    必要があり見た目がズレるため、頂点の配置だけを乗っ取る形にしている。
  */
  const material = useMemo(() => {
    const mat = new MeshBasicMaterial({
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
      opacity: 0.95,
    });

    mat.onBeforeCompile = (shader) => {
      // useFrame が書き込むのと同じオブジェクトを渡す
      shader.uniforms.uTime = uniformsRef.current.uTime;
      shader.uniforms.uActivation = uniformsRef.current.uActivation;
      shader.uniforms.uSurge = uniformsRef.current.uSurge;
      shader.uniforms.uPreDim = uniformsRef.current.uPreDim;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${SWARM_SHADER_HEAD}`)
        .replace("#include <begin_vertex>", SWARM_SHADER_BODY);
      /*
        転調後の色へ uSurge で寄せたあと、転調直前の暗転(uPreDim)ぶんだけ
        暗くする。<color_fragment> が instanceColor を diffuseColor に
        載せた直後に処理することで、three 側の色の扱いをそのまま活かせる。
      */
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vSurgeColor;\nuniform float uSurge;\nuniform float uPreDim;",
        )
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vSurgeColor, uSurge);
          diffuseColor.rgb *= 1.0 - uPreDim * ${PRE_SURGE_DARKEN.toFixed(3)};`,
        );
    };
    // onBeforeCompile で書き換えたシェーダーを他のマテリアルと混同させない
    mat.customProgramCacheKey = () => "starfall-swarm";

    return mat;
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  /*
    色は instanceColor で送る(頂点シェーダ側は three の <color_vertex> が
    そのまま処理する)。行列は使わないが <project_vertex> が必ず掛けるので、
    単位行列だけ入れておく。ゼロ埋めのままだと全個体が潰れて消える。
  */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    particles.forEach((p, i) => mesh.setColorAt(i, p.color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const arr = mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < particles.length; i++) {
      const o = i * 16;
      arr[o] = 1;
      arr[o + 5] = 1;
      arr[o + 10] = 1;
      arr[o + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [particles]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // 進行度・転調・暗転はすべてref経由(数値propだと毎フレーム再レンダーしてFPSが落ちる)
    const activation = activationRef?.current ?? 0;

    // 完全に消えている間は描画ごと省く
    if (activation <= 0.001) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    /*
      CPU側の毎フレームの仕事はこの2行だけ。位置と向きの計算は
      頂点シェーダ(SWARM_SHADER_BODY)が全個体ぶん並列に行う。
    */
    uniformsRef.current.uTime.value = clock.elapsedTime;
    uniformsRef.current.uActivation.value = activation;
    uniformsRef.current.uSurge.value = surgeRef?.current ?? 0;
    uniformsRef.current.uPreDim.value = preDimRef?.current ?? 0;
  });

  return (
    <instancedMesh
      ref={meshRef}
      /*
        マテリアルは onBeforeCompile で頂点シェーダを差し替えてあるので、
        JSXの子として書かず上の useMemo で作ったものをそのまま渡す。
        加算合成でネオンの発光感を出す設定(密なところは重なりだけで白まで
        飽和し、Bloom と合わさってピントの合っていない個体が色付きのボケ玉に
        なる。魚は薄い紡錘形なので裏面も描く)もそちらに書いてある。
      */
      args={[geometry, material, SWARM_COUNT]}
      position={position}
      /*
        頂点シェーダ側で位置を決めるので、three が持つ boundingSphere とは
        一致しない。視錐台カリングに任せると群れごと消えることがある。
      */
      frustumCulled={false}
      /*
        魚(特に柱の魚)はホログラム画面(depthWrite=false)を突き抜けて
        通るため、renderOrder を明示して画面より後(上)に描くようにする。
        指定しないと透過オブジェクト同士の描画順がカメラ距離のソートに
        委ねられ、角度によって魚が画面の奥に埋もれたように見えてしまう。
      */
      renderOrder={1}
    />
  );
}
