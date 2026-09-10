"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import { CASTLE_ROOF_TIERS } from "./constants";
import {
  CASTLE_BEAM_WARM,
  castleBeamPhase,
  castleRigHeightNorm,
  createCastleRigSample,
  heightGate,
  sampleCastleRig,
} from "./castleBeamRig";
import { createBeamPaletteBuffer, sampleBeamSectionPalette } from "./beamSectionPalette";

/*
  天守の**破風**(その段の屋根の上に乗っている、小さな三角の飾り屋根)から
  出す **ウォッシュライト**。ユーザー指定で「ウォッシュライトとして扱う」
  = 参考画像(コンサートのステージ照明)のような、細い筋ではなく **広がりの
  ある光で面を染める**灯にする。細い光条の BeamLight.tsx(屋根の四隅・軒下
  からL字)や Searchlight.tsx(足元)とは見た目も役割も別。

  2枚重ねで作る:
    1. 色の靄の円錐(WASH_FRAGMENT)。ほぼ点の根元(WASH_ROOT_RADIUS)から
       WASH_FAR_RADIUS まで開く(半頂角およそ32°)。芯は立てず、中央が濃く
       縁へソフトに0。うすく色だけ乗せる(WASH_OPACITY_MAX)。
    2. 光源のキラキラ(FLARE_FRAGMENT)。芯 + 十字グレア + ハロー + またたき。
       まぶしさ・存在感はこちらが受け持つ。

  **軒(屋根の下端)ではなく、屋根の上に乗った破風の高さに置くこと** ――
  最初の実装で軒の高さに置いてしまい、位置がずれた。

  対象は天守のみ(隅櫓は指示に含まれていない)。指示のスケッチでは
  一番下の段(幅が広く、破風が左右に2つ)・その上の2段(破風1つずつ)の
  計3段に点があり、頂上付近の段(CASTLE_ROOF_TIERS[3]・[4])には無かった
  ので、その3段(index 0〜2)だけを対象にする。

  前後(+Z/-Z)と側面(+X/-X)で破風の並びが違う(2枚目のスケッチ参照)。
  前後: 最下段が中央から左右に2つ、その上2段は中央1つずつ。
  側面: 最下段は中央1つ、2段目(下から2番目)が左右に2つ、3段目は中央1つ。
  同じ「軒とひとつ上の軒の中間の高さ」というルールは前後・側面で共通。

  **動き・色・本数は castleBeamRig.ts が受け持つ。** 軒下の BeamLight.tsx と
  同じリグ・同じ点灯フロントを共有するので、軒のビームと破風のウォッシュは
  必ず揃って動く。
*/

type GableSpot = {
  position: [number, number, number];
  /** ジオメトリは既定でローカル+Zへ伸びる。0=前(+Z)、Math.PI=後ろ(-Z) */
  rotationY: number;
  /**
   * 取り付け高さ 0(リグ下端=隅櫓の最下層)〜1(上端=天守の最上層)。
   * BeamLight と**同じ基準**で正規化するので、点灯フロントが降りてくると
   * 軒下のビームと破風のウォッシュが高さ順に混ざって点いていく。
   */
  heightNorm: number;
  /** 城の中心から見た方位 0〜1(1周)。チェイスが城を回る順番になる */
  azimuth: number;
};

/** 対象の層。指示のスケッチで破風の点があった3段(最下層〜3段目)だけ使う */
const GABLE_TIERS = CASTLE_ROOF_TIERS.slice(0, 3);

/**
 * 最下層だけ破風が左右2つ(スケッチで2点)なので中心から左右へ振る。
 * 他の2段は破風1つ(中心)。振り幅は目視で選んだ値
 * (半幅に対する比率。大きすぎると隅の軒下ビームと重なる)。
 */
const TWIN_GABLE_OFFSET_RATIO = 0.35;

/**
 * 破風の高さ。**軒(その段の屋根の下端、CASTLE_ROOF_TIERS[i].y)ではなく、
 * その屋根の上に乗っている小さい破風屋根の高さに置く。** 破風はその段の軒と
 * ひとつ上の段の軒の間の斜面に乗っているので、2つの軒の高さを補間して
 * 求める(0で下の軒、1で上の軒。0.5を目視で選んである)。
 */
const GABLE_HEIGHT_RATIO = 0.5;

/** 前後(+Z/-Z)。最下段(i=0)だけ左右2本、それ以外は中心1本 */
const FRONT_BACK_XS: readonly number[][] = [
  [TWIN_GABLE_OFFSET_RATIO, -TWIN_GABLE_OFFSET_RATIO],
  [0],
  [0],
];
/** 側面(+X/-X)。2段目(i=1)だけ前後2本、それ以外(最下段・3段目)は中心1本 */
const SIDE_ZS: readonly number[][] = [
  [0],
  [TWIN_GABLE_OFFSET_RATIO, -TWIN_GABLE_OFFSET_RATIO],
  [0],
];

/** 方位を 0〜1 に。BeamLight の azimuth と同じ式(リグ全体で順番を揃えるため) */
function azimuthOf(x: number, z: number) {
  return (Math.atan2(x, z) / (Math.PI * 2) + 1) % 1;
}

/**
 * **ウォッシュライトの広がり。** 破風のこの光は「筋(ビーム)」ではなく、
 * **ほぼ点の根元から扇状に開いて面を染めるウォッシュ**(参考画像のコンサート
 * のステージ照明)。細い光条だった BeamLight(軒)/ Searchlight(足元)とは別物。
 *
 * WASH_ROOT_RADIUS はほぼ点(破風の飾りに対して根元の円盤が大きすぎると
 * 「ラッパの口が刺さってる」ように見える ―― ユーザー指摘)。そこから
 * WASH_LENGTH かけて WASH_FAR_RADIUS へ、半頂角およそ 32°
 * (atan((34-0.3)/55))で開く。光源の存在感はフレア(キラキラ)側が持つ。
 *
 * **この3定数(WASH_FAR_RADIUS / WASH_ROOT_RADIUS / WASH_EMBED_DEPTH)は
 * GABLE_SPOTS より前に置くこと。** GABLE_SPOTS はモジュール読み込み時に
 * 即評価され、WASH_EMBED_DEPTH を参照するので、後ろに置くと実行時
 * ReferenceError になる(BeamLight.tsx の同じ注意書きと同じ理由)。
 */
const WASH_FAR_RADIUS = 34;
/**
 * 根元(光源側)の半径。**ほぼ点。** 0 にはしない(円錐の先端が完全な点だと
 * 断面が消えて根元付近が見えなくなる)が、破風の飾りに対して大きく見えない
 * ぎりぎりまで絞る。光源そのものはフレア(FLARE_*)が描くので、円錐側の
 * 根元は細くてよい。
 */
const WASH_ROOT_RADIUS = 0.3;
/**
 * 根元を壁の内側へ埋め込む深さ(ワールド単位)。**破風は天守だけが対象。**
 * BeamLight.tsx の CASTLE_BEAM_EMBED_DEPTH と同じ意図(根元を壁に少し
 * めり込ませて「面から湧いている」ように見せる)。根元がほぼ点になったので
 * 浅くてよい。
 *
 * **ジオメトリではなく GABLE_SPOTS 側で spot.position に適用する**
 * (BeamLight.tsx と同じ)。ジオメトリに焼き込むと回転中心(instanceMatrix
 * の原点)が光源から離れ、首を上下に振ったとき光源ごと弧を描いて
 * 「緑の点からすこし離れた所を中心に光が回る」ように見えてしまう
 * (ユーザー指摘。geometry のコメント参照)。
 */
const WASH_EMBED_DEPTH = 0.6;

const GABLE_SPOTS: readonly GableSpot[] = GABLE_TIERS.flatMap((t, i) => {
  // ひとつ上の段の軒(破風が乗る屋根の上端)。GABLE_TIERSで使うのは0〜2段目までだが、
  // CASTLE_ROOF_TIERS自体は5段あるので i+1 は常に存在する
  const upper = CASTLE_ROOF_TIERS[i + 1];
  const y = t.y + (upper.y - t.y) * GABLE_HEIGHT_RATIO;
  const heightNorm = castleRigHeightNorm(y);

  const frontBack = FRONT_BACK_XS[i].flatMap((xr): GableSpot[] => {
    const x = xr * t.halfWidth;
    return [
      // 正面(+Z)。根元を壁の内側(-Z)へ WASH_EMBED_DEPTH 引く。
      // 方位・高さは引く前の壁面座標で計算する(BeamLight と同じ)。
      {
        position: [x, y, t.halfDepth - WASH_EMBED_DEPTH],
        rotationY: 0,
        heightNorm,
        azimuth: azimuthOf(x, t.halfDepth),
      },
      // 背面(-Z)。根元を壁の内側(+Z)へ引く
      {
        position: [x, y, -t.halfDepth + WASH_EMBED_DEPTH],
        rotationY: Math.PI,
        heightNorm,
        azimuth: azimuthOf(x, -t.halfDepth),
      },
    ];
  });

  const sides = SIDE_ZS[i].flatMap((zr): GableSpot[] => {
    const z = zr * t.halfDepth;
    return [
      // 右(+X)。根元を壁の内側(-X)へ引く
      {
        position: [t.halfWidth - WASH_EMBED_DEPTH, y, z],
        rotationY: Math.PI / 2,
        heightNorm,
        azimuth: azimuthOf(t.halfWidth, z),
      },
      // 左(-X)。根元を壁の内側(+X)へ引く
      {
        position: [-t.halfWidth + WASH_EMBED_DEPTH, y, z],
        rotationY: -Math.PI / 2,
        heightNorm,
        azimuth: azimuthOf(-t.halfWidth, z),
      },
    ];
  });

  return [...frontBack, ...sides];
});

/** 灯の数。前後6本 + 側面6本 + …で計16本 */
const WASH_COUNT = GABLE_SPOTS.length;

/**
 * ウォッシュの長さ。短め ―― 長いと「空へ伸びる筋」に見える。細い根元から
 * この距離かけて WASH_FAR_RADIUS まで開き、先端でほぼ薄れて消える。
 */
const WASH_LENGTH = 55;
/** 円周方向の分割数。広い円錐なので角(ファセット)が出ないよう多めに取る */
const WASH_SEGMENTS = 28;

/**
 * ウォッシュ本体の最大の濃さ。**面を染めるフィル光**なので薄く。光源の
 * 主張はフレア(キラキラ)側が受け持ち、円錐は色の靄だけを乗せる。
 * 加算合成なので重なる所は自然に持ち上がる。
 */
const WASH_OPACITY_MAX = 0.24;

/**
 * 破風のウォッシュの横(yaw)の首振りをどれだけ強めるか。BeamLight の
 * *_YAW_GAIN / *_YAW_MIN と同じ趣旨 ―― cue.yaw は全リグ共通で ±1〜9° しかなく
 * 破風の光もほぼ横に動かないので、ここで倍率を掛けて左右へ振らせる。
 * 上下(liftSwing)には手を付けないので、ヘッドは横長の楕円を描く。
 * WASH_YAW_MIN は静かな区間でも最低これだけは横に振る下限(ラジアン)。
 */
const WASH_YAW_GAIN = 5;
const WASH_YAW_MIN = 0.35;

/**
 * 光源の**キラキラ**(FLARE_FRAGMENT が芯 + 十字グレア + ハロー + またたきを
 * 描く)を乗せる円盤の半径。参考画像のステージ照明のように「光源そのものが
 * まぶしく輝いている」見え方を、この円盤1枚で作る。
 *
 * **ビルボード(sprite)にしないこと。** sprite は常にカメラを向くので、
 * どの角度からも同じ丸い玉に見えて「浮いてる発光体」になる。ビーム軸を
 * 向いた円盤にして、光が出ている方向から見たときだけ光らせる
 * (法線 vs 視線の FLARE_FRESNEL_POWER。横・後ろからは自然に消える)。
 */
const FLARE_RADIUS = 3;
/**
 * フレアの最大の濃さ。芯は加算合成で 1.0 を超えて飽和し、白く抜ける
 * (参考画像の光源も白飛びしている)。
 */
const FLARE_OPACITY_MAX = 1.3;
/**
 * 正面から外れたときの減衰の鋭さ。小さいほど広い角度から見え、大きいほど
 * 真正面付近だけに絞られる。キラキラを見せたいので以前(1.8)より寝かせて
 * ある。
 */
const FLARE_FRESNEL_POWER = 1.3;
/** またたきの速さ(rad/秒)。灯ごとに位置から決まる固定位相でずらす */
const WASH_TWINKLE_SPEED = 6.5;

/*
  灯ごとの色・明るさをインスタンス属性(aColor / aLevel)で持たせる。
  理屈とドローコールの話は BeamLight.tsx の同名の定数のコメントを参照。
*/
const WASH_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aLevel;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLevel;
  /* 光の進行方向(ローカル+Z=根元→先端)をビュー空間で。真正面判定に使う */
  varying vec3 vAxisView;
  /* 灯ごとに固定の位相(取り付け位置のハッシュ。またたきをズラすのに使う) */
  varying float vTwinkle;
  void main() {
    vUv = uv;
    vColor = aColor;
    vLevel = aLevel;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    // instanceMatrix は回転+平行移動だけなので mat3 をそのまま掛けてよい
    vNormalView = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vViewDir = normalize(-mv.xyz);
    vAxisView = normalize((modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    vec3 iPos = instanceMatrix[3].xyz;
    vTwinkle = fract(sin(dot(iPos, vec3(12.9898, 78.233, 37.719))) * 43758.5453) * 6.2831853;
    gl_Position = projectionMatrix * mv;
  }
`;

/*
  ウォッシュの円錐(色の靄)。**芯(細いシャフト)は作らない** ―― それを入れると
  「ビーム」に戻る。視線が円錐を貫く長さ ≒ facing なので、中央が濃く縁へ
  滑らかに0(=ソフトな輪郭)。根元(y=1、細い)がいちばん濃く、先端(y=0、広い)
  へ薄れて消える = 一点から広がって拡散する光。光源のまぶしさは FLARE 側。
*/
const WASH_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLevel;
  varying vec3 vAxisView;

  void main() {
    float y = clamp(vUv.y, 0.0, 1.0);
    float along = pow(y, 2.2);
    along *= smoothstep(0.0, 0.16, y);   // 先端側を完全に消す

    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vViewDir);
    float facing = clamp(abs(dot(n, v)), 0.0, 1.0);

    float body = facing * facing;                          // 中央が濃い、縁で0
    float rim  = pow(max(1.0 - facing, 0.0), 3.5) * 0.10;  // ごく薄い縁

    float shell = along * (body * 0.55 + rim);

    // 正面に立ったときのふわっとした明るさ(ギラつかせない)
    float headOn = clamp(dot(normalize(vAxisView), v), 0.0, 1.0);
    float glow = pow(headOn, 2.0) * 0.30;

    float a = clamp((shell + glow) * uOpacity * vLevel, 0.0, 1.0);
    gl_FragColor = vec4(vColor * a, a);
  }
`;

/*
  光源の**キラキラ**。ビーム軸を向いた円盤に、白熱した芯 + 十字のグレア +
  やわらかいハロー + またたきを描く。円盤なので光が出ている方向から見た
  ときだけ光り、横・後ろからは facing→0 で自然に消える(FLARE_FRESNEL_POWER)。
  芯は加算合成で 1.0 を超えて飽和し白く抜ける(参考画像の光源も白飛び)。
*/
const FLARE_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLevel;
  varying float vTwinkle;

  void main() {
    vec2 p = (vUv - vec2(0.5)) * 2.0;   // -1..1
    float r = length(p);
    if (r > 1.0) discard;

    // 円盤はビーム軸を向いている。正面付近でだけ見える。
    float facing = max(dot(normalize(vNormalView), normalize(vViewDir)), 0.0);
    float face = pow(facing, ${FLARE_FRESNEL_POWER.toFixed(1)});

    // 白熱した芯
    float core = pow(smoothstep(0.42, 0.0, r), 2.4);

    // 十字のグレア(横+縦)、斜め45°を弱く
    float ang = atan(p.y, p.x);
    float k = 22.0;
    float star = pow(abs(cos(ang)), k) + pow(abs(sin(ang)), k);
    star += 0.3 * (pow(abs(cos(ang - 0.7854)), k) + pow(abs(sin(ang - 0.7854)), k));
    float ray = star * pow(smoothstep(1.0, 0.04, r), 1.6);

    // やわらかいハロー
    float halo = pow(smoothstep(1.0, 0.1, r), 2.2) * 0.4;

    // またたき(灯ごとに固定位相 + 時間)
    float tw = 0.6 + 0.4 * sin(uTime * ${WASH_TWINKLE_SPEED.toFixed(1)} + vTwinkle);

    float lum = (core * 1.8 + ray * 0.85 + halo) * face * tw
              * uOpacity * clamp(vLevel, 0.0, 1.0);
    vec3 rgb = mix(vColor, vec3(1.0), clamp(core * 0.9 + ray * 0.4, 0.0, 1.0));
    float a = clamp(lum, 0.0, 1.0);
    gl_FragColor = vec4(rgb * a, a);
  }
`;

type WashLightProps = {
  /** 天守の底面のワールド座標。EdoCastle / BeamLight と同じ値を渡す */
  position?: [number, number, number];
  /** Reply の進行度(0〜1)を持つ ref */
  activationRef?: RefObject<number>;
  /** ステージ照明の点灯具合(0〜1)を持つ ref。曲が11秒に達してから立ち上がる */
  lightsRef?: RefObject<number>;
  /**
   * 曲の再生位置(秒)を持つ ref。**clock.elapsedTime ではなく曲の時計を
   * 使うこと**(理由は BeamLight.tsx の同名 prop のコメント参照)。
   */
  songTimeRef?: RefObject<number>;
};

/**
 * 天守四面の破風から外向きへ広がる **ウォッシュライト**(細い筋ではなく、
 * 面を染める広い円錐。ユーザー指定)。
 *
 * **演出は castleBeamRig.ts のキュー表が決める。** 本数(点灯フロント)・
 * 首振り・チェイス・色は全部あちら側で、ここはその結果をインスタンス属性へ
 * 書き込むだけ。軒下の BeamLight.tsx と同じリグを共有している。
 */
export function WashLight({
  position = [0, 0, 0],
  activationRef,
  lightsRef,
  songTimeRef,
}: WashLightProps) {
  const beamMeshRef = useRef<InstancedMesh>(null);
  const flareMeshRef = useRef<InstancedMesh>(null);
  /*
    useFrame 内で useMemo の戻り値を直接書き換えると react-hooks/immutability に
    引っかかるため、ref へコピーしてそちら経由で触る(EdoCastle と同じ手当て)。
  */
  const materialRef = useRef<ShaderMaterial | null>(null);
  const flareMaterialRef = useRef<ShaderMaterial | null>(null);
  const attributesRef = useRef<{
    colors: InstancedBufferAttribute;
    levels: InstancedBufferAttribute;
  } | null>(null);
  const scratchRef = useRef<typeof scratchValue | null>(null);

  /*
    円柱(CylinderGeometry)は既定で top が+h/2・bottom が-h/2(+Y方向)。
    radiusTop=WASH_ROOT_RADIUS(根元)・radiusBottom=WASH_FAR_RADIUS(先端)なので、
    top 側が光源、bottom 側が空へ広がる先端になる。rotateX(-90°)で
    top をワールド+Zへ倒し、translateで **top(=光源)をちょうど原点に**据える。

    **埋め込みオフセットをここに焼き込まないこと。** ここで -WASH_EMBED_DEPTH
    すると根元が原点より手前(-Z)へずれ、instanceMatrix の回転中心(=原点)が
    光源そのものから離れる。すると首を上下に振ったとき光源が原点まわりに
    弧を描き、「緑の点からすこし離れた所を中心に光が回っている」ように
    見えてしまう(ユーザー指摘)。埋め込みは BeamLight.tsx と同じく
    GABLE_SPOTS 側で spot.position を壁の内側へ引いて行う ―― こうすると
    回転中心が光源に一致し、首振りでは先端(末端)だけが動く。
  */
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(
      WASH_ROOT_RADIUS,
      WASH_FAR_RADIUS,
      WASH_LENGTH,
      WASH_SEGMENTS,
      1,
      true,
    );
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, WASH_LENGTH / 2);
    return g;
  }, []);

  const flareGeometry = useMemo(() => new CircleGeometry(FLARE_RADIUS, 32), []);

  /*
    灯ごとの色と明るさ。ビームとフレアで同じバッファを共有する
    (同じ灯なので必ず同じ値。BeamLight.tsx と同じ作り)。
  */
  const attributes = useMemo(() => {
    const colors = new InstancedBufferAttribute(
      new Float32Array(WASH_COUNT * 3),
      3,
    );
    const levels = new InstancedBufferAttribute(new Float32Array(WASH_COUNT), 1);
    colors.setUsage(DynamicDrawUsage);
    levels.setUsage(DynamicDrawUsage);
    return { colors, levels };
  }, []);

  useEffect(() => {
    attributesRef.current = attributes;
    geometry.setAttribute("aColor", attributes.colors);
    geometry.setAttribute("aLevel", attributes.levels);
    flareGeometry.setAttribute("aColor", attributes.colors);
    flareGeometry.setAttribute("aLevel", attributes.levels);
  }, [geometry, flareGeometry, attributes]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: WASH_VERTEX,
        fragmentShader: WASH_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  const flareMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
        vertexShader: WASH_VERTEX,
        fragmentShader: FLARE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    materialRef.current = material;
    flareMaterialRef.current = flareMaterial;
    // GPU資源なので外れるときに解放する
    return () => {
      material.dispose();
      geometry.dispose();
      flareMaterial.dispose();
      flareGeometry.dispose();
    };
  }, [material, geometry, flareMaterial, flareGeometry]);

  /* useFrame の中で new しないための使い回し(R3F のパフォーマンス規約) */
  const scratchValue = useMemo(
    () => ({
      sample: createCastleRigSample(),
      euler: new Euler(0, 0, 0, "YXZ"),
      quat: new Quaternion(),
      matrix: new Matrix4(),
      pos: new Vector3(),
      one: new Vector3(1, 1, 1),
      color: new Color(),
      warm: new Color(CASTLE_BEAM_WARM),
      // セクション別の色。中身は毎フレーム sampleBeamSectionPalette が上書き
      // する(beamSectionPalette.ts。BeamLight.tsx も同じ関数を同じ時刻で
      // 呼ぶので、2つのリグの色は独立に計算しても必ず一致する)
      palette: createBeamPaletteBuffer(),
      lift: new Float32Array(WASH_COUNT),
      yaw: new Float32Array(WASH_COUNT),
    }),
    [],
  );

  useEffect(() => {
    scratchRef.current = scratchValue;
  }, [scratchValue]);

  useFrame(({ clock }, delta) => {
    const beamMesh = beamMeshRef.current;
    const flareMesh = flareMeshRef.current;
    const mat = materialRef.current;
    const flareMat = flareMaterialRef.current;
    const attrs = attributesRef.current;
    const scratch = scratchRef.current;
    /*
      flareMesh は早期return の条件に含めない。JSX 側で外されていても
      (`flareMesh?.` で扱う)円錐本体(beamMesh)の更新は止めたくないため。
    */
    if (!beamMesh || !mat || !flareMat || !attrs || !scratch) {
      return;
    }

    const activation = activationRef?.current ?? 0;
    const lights = lightsRef?.current ?? 1;
    const lit = activation * lights;

    mat.uniforms.uOpacity.value = lit * WASH_OPACITY_MAX;
    flareMat.uniforms.uOpacity.value = lit * FLARE_OPACITY_MAX;
    // またたきは曲の時計ではなくシーンの経過時間で回す(止めない・ループしない)
    flareMat.uniforms.uTime.value = clock.elapsedTime;

    const raw = songTimeRef?.current ?? clock.elapsedTime;
    const s = sampleCastleRig(raw, scratch.sample);
    // セクション別の色をこのフレームの値へ更新(BeamLight.tsx と揃える)
    sampleBeamSectionPalette(raw, scratch.palette);

    const follow = 1 - Math.exp(-s.slew * delta);
    const colors = attrs.colors.array as Float32Array;
    const levels = attrs.levels.array as Float32Array;
    const n = scratch.palette.length;

    for (let i = 0; i < WASH_COUNT; i++) {
      const spot = GABLE_SPOTS[i];

      const phase = castleBeamPhase(
        s.pattern,
        s.waveSpread,
        spot.heightNorm,
        spot.azimuth,
      );

      /* --- 1. 本数。点灯フロントより高い灯だけが灯る --- */
      const gate = heightGate(spot.heightNorm, s.density);

      /* --- 3. チェイス --- */
      const wave = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (s.chasePos - phase));
      const chase = 1 - s.chaseDepth + s.chaseDepth * Math.pow(wave, 3);
      levels[i] = Math.max(s.base * gate * chase, 0);

      /* --- 2. 首振り。上下(lift)と左右(yaw)で同じ位相の円を描く --- */
      const swing = Math.PI * 2 * (s.swingPos + phase);
      // 基準の仰角を中心に振る(理由は BeamLight.tsx の同じ箇所のコメント参照)
      const targetLift = s.lift + s.liftSwing * Math.cos(swing);
      // 横は cue.yaw を増幅して扇状に振らせる(WASH_YAW_* のコメント参照)
      const yawAmp = Math.max(s.yaw * WASH_YAW_GAIN, WASH_YAW_MIN);
      const targetYaw = yawAmp * Math.sin(swing);

      // 首の回る速さの上限。理屈は BeamLight.tsx / Searchlight.tsx を参照
      const nextLift = scratch.lift[i] + (targetLift - scratch.lift[i]) * follow;
      const nextYaw = scratch.yaw[i] + (targetYaw - scratch.yaw[i]) * follow;
      scratch.lift[i] = nextLift;
      scratch.yaw[i] = nextYaw;

      // "YXZ"(パン→チルト)。ジオメトリは+Zへ伸びるので X をマイナスで上向き
      scratch.euler.set(-nextLift, spot.rotationY + nextYaw, 0);
      scratch.quat.setFromEuler(scratch.euler);
      scratch.pos.set(spot.position[0], spot.position[1], spot.position[2]);
      scratch.matrix.compose(scratch.pos, scratch.quat, scratch.one);
      beamMesh.setMatrixAt(i, scratch.matrix);
      flareMesh?.setMatrixAt(i, scratch.matrix);

      /* --- 4. 色。パレットをリグの高さ方向へ配り、暖色から寄せる --- */
      const slot = s.colorSlot + spot.heightNorm * s.colorSpread * n;
      // 剰余は必ず正に丸める(曲頭では colorSlot が負になる)
      const idx = ((Math.floor(slot) % n) + n) % n;
      scratch.color.copy(scratch.warm).lerp(scratch.palette[idx], s.tint);
      colors[i * 3] = scratch.color.r;
      colors[i * 3 + 1] = scratch.color.g;
      colors[i * 3 + 2] = scratch.color.b;
    }

    beamMesh.instanceMatrix.needsUpdate = true;
    if (flareMesh) flareMesh.instanceMatrix.needsUpdate = true;
    attrs.colors.needsUpdate = true;
    attrs.levels.needsUpdate = true;
  });

  return (
    <group position={position}>
      {/* 遠くまで長く伸びるので、建物のbboxではカリングされてしまう */}
      <instancedMesh
        ref={beamMeshRef}
        args={[geometry, material, WASH_COUNT]}
        frustumCulled={false}
      />
      {/*
        光源そのものの**キラキラ**(芯 + 十字グレア + ハロー + またたき。
        FLARE_FRAGMENT)。ビーム軸を向いた円盤なので、光が出ている方向から
        見たときだけ光る。
      */}
      <instancedMesh
        ref={flareMeshRef}
        args={[flareGeometry, flareMaterial, WASH_COUNT]}
        frustumCulled={false}
      />
    </group>
  );
}
