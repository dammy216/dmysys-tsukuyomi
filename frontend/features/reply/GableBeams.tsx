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
  CASTLE_BEAM_PALETTE,
  CASTLE_BEAM_WARM,
  castleBeamPhase,
  castleRigHeightNorm,
  createCastleRigSample,
  heightGate,
  sampleCastleRig,
} from "./castleBeamRig";

/*
  天守正面(と背面)の破風(その段の屋根の上に乗っている、小さな三角の飾り屋根)
  の位置から伸びるビーム。EaveBeams.tsx(屋根の四隅・軒下からL字に伸びる
  細いビーム)とは別枠で、破風の中心から前後(±Z)へまっすぐ伸びる、
  少し太めのビーム。**軒(屋根の下端)ではなく、屋根の上に乗った破風の
  高さに置くこと** ―― 最初の実装で軒の高さに置いてしまい、位置がずれた。

  対象は天守のみ(隅櫓は指示に含まれていない)。指示のスケッチでは
  一番下の段(幅が広く、破風が左右に2つ)・その上の2段(破風1つずつ)の
  計3段に点があり、頂上付近の段(CASTLE_ROOF_TIERS[3]・[4])には無かった
  ので、その3段(index 0〜2)だけを対象にする。

  前後(+Z/-Z)と側面(+X/-X)で破風の並びが違う(2枚目のスケッチ参照)。
  前後: 最下段が中央から左右に2つ、その上2段は中央1つずつ。
  側面: 最下段は中央1つ、2段目(下から2番目)が左右に2つ、3段目は中央1つ。
  同じ「軒とひとつ上の軒の中間の高さ」というルールは前後・側面で共通。

  **動き・色・本数は castleBeamRig.ts が受け持つ。** 軒下の EaveBeams.tsx と
  同じリグ・同じ点灯フロントを共有するので、2つのビーム群は必ず揃って動く。
*/

type GableSpot = {
  position: [number, number, number];
  /** ジオメトリは既定でローカル+Zへ伸びる。0=前(+Z)、Math.PI=後ろ(-Z) */
  rotationY: number;
  /**
   * 取り付け高さ 0(リグ下端=隅櫓の最下層)〜1(上端=天守の最上層)。
   * EaveBeams と**同じ基準**で正規化するので、点灯フロントが降りてくると
   * 軒下と破風のビームが高さ順に混ざって点いていく。
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

/** 方位を 0〜1 に。EaveBeams の azimuth と同じ式(リグ全体で順番を揃えるため) */
function azimuthOf(x: number, z: number) {
  return (Math.atan2(x, z) / (Math.PI * 2) + 1) % 1;
}

/**
 * ビームの太さ。指示で「少し太く」とのことで一度3.2まで太くしたが、
 * まだ太いとの指摘で 2.2 → 1.4 と段階的に絞ってきた。EaveBeams と同じ
 * 比率(先端/根元とも約36%減)で連動させてある(EaveBeams(0.5、軒下用の
 * 細い光条)より明確に太いが、StageBeams(9、足元のサーチライト)ほどでは
 * ない値を目視で選んである)。
 *
 * **この3定数(BEAM_RADIUS / BEAM_ROOT_RADIUS / BEAM_EMBED_DEPTH)は
 * GABLE_SPOTS より前に置くこと。** GABLE_SPOTS はモジュール読み込み時に
 * 即評価され、BEAM_EMBED_DEPTH を参照するので、後ろに置くと実行時
 * ReferenceError になる(EaveBeams.tsx の同じ注意書きと同じ理由)。
 */
const BEAM_RADIUS = 1.4;
/**
 * 根元(光源側)の半径。**0にしないこと。**
 * 理由は EaveBeams.tsx の同名定数のコメント参照(フレアを非表示にした状態で
 * 根元が完全な点だと光源が消えて見えるため、CylinderGeometry で太さを持たせる)。
 */
const BEAM_ROOT_RADIUS = BEAM_RADIUS * 0.4;
/**
 * 根元を壁の内側へ埋め込む深さ(ワールド単位)。**破風は天守だけが対象**
 * なので、EaveBeams.tsx の CASTLE_BEAM_EMBED_DEPTH(天守用、隅櫓より深い)
 * と同じ係数(BEAM_ROOT_RADIUS の4.5倍)を使う。
 *
 * **ジオメトリではなく GABLE_SPOTS 側で spot.position に適用する**
 * (EaveBeams.tsx と同じ)。ジオメトリに焼き込むと回転中心(instanceMatrix
 * の原点)が光源から離れ、首を上下に振ったとき光源ごと弧を描いて
 * 「緑の点からすこし離れた所を中心に光が回る」ように見えてしまう
 * (ユーザー指摘。geometry のコメント参照)。
 */
const BEAM_EMBED_DEPTH = BEAM_ROOT_RADIUS * 4.5;

const GABLE_SPOTS: readonly GableSpot[] = GABLE_TIERS.flatMap((t, i) => {
  // ひとつ上の段の軒(破風が乗る屋根の上端)。GABLE_TIERSで使うのは0〜2段目までだが、
  // CASTLE_ROOF_TIERS自体は5段あるので i+1 は常に存在する
  const upper = CASTLE_ROOF_TIERS[i + 1];
  const y = t.y + (upper.y - t.y) * GABLE_HEIGHT_RATIO;
  const heightNorm = castleRigHeightNorm(y);

  const frontBack = FRONT_BACK_XS[i].flatMap((xr): GableSpot[] => {
    const x = xr * t.halfWidth;
    return [
      // 正面(+Z)。根元を壁の内側(-Z)へ BEAM_EMBED_DEPTH 引く。
      // 方位・高さは引く前の壁面座標で計算する(EaveBeams と同じ)。
      {
        position: [x, y, t.halfDepth - BEAM_EMBED_DEPTH],
        rotationY: 0,
        heightNorm,
        azimuth: azimuthOf(x, t.halfDepth),
      },
      // 背面(-Z)。根元を壁の内側(+Z)へ引く
      {
        position: [x, y, -t.halfDepth + BEAM_EMBED_DEPTH],
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
        position: [t.halfWidth - BEAM_EMBED_DEPTH, y, z],
        rotationY: Math.PI / 2,
        heightNorm,
        azimuth: azimuthOf(t.halfWidth, z),
      },
      // 左(-X)。根元を壁の内側(+X)へ引く
      {
        position: [-t.halfWidth + BEAM_EMBED_DEPTH, y, z],
        rotationY: -Math.PI / 2,
        heightNorm,
        azimuth: azimuthOf(-t.halfWidth, z),
      },
    ];
  });

  return [...frontBack, ...sides];
});

/** 灯の数。前後6本 + 側面6本 + …で計16本 */
const BEAM_COUNT = GABLE_SPOTS.length;

/** ビームの長さ。EaveBeams と同じく水面(半径400)の内側に収まる長さ */
const BEAM_LENGTH = 150;
/** 円周方向の分割数。EaveBeams と同じく絞ってある */
const BEAM_SEGMENTS = 12;

/** ビーム本体の最大の濃さ。EaveBeams と同じ */
const GABLE_BEAM_OPACITY_MAX = 0.55;

/**
 * 根元に置くフレアの半径(ワールド単位)。EaveBeamsよりビーム自体が太いので、
 * フレアも一回り大きくしてある。
 *
 * **大きすぎると逆効果。** 元は2.4だったが、引きの画で天守のまわりに
 * 白っぽい丸い玉がいくつも浮いて見え、「スポットライトの出口」ではなく
 * 「浮いてる発光体」に見えてしまっていた(ユーザー指摘で1.2へ縮小。
 * EaveBeams の FLARE_RADIUS と同じ比率で半分にしてある)。
 *
 * **ビルボード(sprite)にしないこと。** sprite は常にカメラの方を向くので、
 * どの角度から見ても真円の光る球体に見えてしまい、「スポットライトの
 * 出口」ではなく「浮いてる発光体」に見える。ビームと同じ向き(法線=
 * ビームの進行方向)を向いた円盤にして、正面(ビームが出ている方向)から
 * 見たときだけ光り、横や後ろからは見えないようにする(FLARE_FRAGMENT参照)。
 */
const FLARE_RADIUS = 1.2;
/** フレアの最大の濃さ。ビーム本体(GABLE_BEAM_OPACITY_MAX)より少し明るく */
const FLARE_OPACITY_MAX = 0.9;
/**
 * 正面から外れたときの減衰の鋭さ。大きいほど真正面付近だけに絞られ、
 * 少し角度がつくだけで急に消える。円盤の縁でのブツ切れ感を抑えつつ
 * 「正面からしか見えない」を成立させる値を目視で選んである。
 */
const FLARE_FRESNEL_POWER = 1.8;

/*
  灯ごとの色・明るさをインスタンス属性(aColor / aLevel)で持たせる。
  理屈とドローコールの話は EaveBeams.tsx の同名の定数のコメントを参照。
*/
const BEAM_VERTEX = /* glsl */ `
  attribute vec3 aColor;
  attribute float aLevel;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLevel;
  void main() {
    vUv = uv;
    vColor = aColor;
    vLevel = aLevel;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    // instanceMatrix は回転+平行移動だけなので mat3 をそのまま掛けてよい
    vNormalView = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

/*
  StageBeams.tsx の BEAM_FRAGMENT と同じ考え方(断面は「芯が明るい」・
  先端は smoothstep で完全に減衰)。詳しい理屈は StageBeams.tsx 側を参照。
*/
const BEAM_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLevel;

  void main() {
    float y = clamp(vUv.y, 0.0, 1.0);
    /*
      根元(y=1)がもっとも明るく、先端(y=0)へ向かって暗くなる。
      **以前あった根元だけを45%減衰させる処理は撤廃した。** ConeGeometryで
      根元が完全な点だった頃は「一点だけ極端に光るのを避ける」ための処置
      だったが、根元は光源そのものなので本来ここが一番明るくあるべきで、
      むしろ光源が暗く・先細りして見えなくなる原因になっていた
      (ユーザー指摘。BEAM_ROOT_RADIUS で根元に太さを持たせたのと対にして直す)。
    */
    float along = mix(0.25, 1.0, pow(y, 1.5));
    along *= smoothstep(0.0, 0.30, y);

    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vViewDir);
    float facing = clamp(abs(dot(n, v)), 0.0, 1.0);

    float body = facing;
    float core = pow(facing, 7.0);
    // pow の底は必ず 0 以上に丸める(負の底はGLSLで未定義=NaNになる。詳細はStageBeams.tsx参照)
    float haze = pow(max(1.0 - facing, 0.0), 3.0);

    float a = clamp(
      along * (body * 0.45 + core * 0.9 + haze * 0.1) * uOpacity * vLevel,
      0.0,
      1.0
    );
    gl_FragColor = vec4(vColor * a, a);
  }
`;

/*
  根元のフレア。頂点シェーダーは BEAM_VERTEX を使い回す。
  芯を白飛びさせる理屈は EaveBeams.tsx の FLARE_FRAGMENT のコメントを参照
  (参照映像の光源は「明るすぎて白く抜けている」見え方をしている)。
*/
const FLARE_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLevel;

  void main() {
    float d = length(vUv - vec2(0.5));
    float radial = smoothstep(0.5, 0.15, d);

    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vViewDir);
    float facing = max(dot(n, v), 0.0);

    float a = radial * pow(facing, ${FLARE_FRESNEL_POWER.toFixed(1)}) * uOpacity * vLevel;

    float core = smoothstep(0.34, 0.0, d) * clamp(vLevel, 0.0, 1.0);
    vec3 tinted = mix(vColor, vec3(1.0), core * 0.85);

    gl_FragColor = vec4(tinted * a, a);
  }
`;

type GableBeamsProps = {
  /** 天守の底面のワールド座標。EdoCastle / EaveBeams と同じ値を渡す */
  position?: [number, number, number];
  /** Reply の進行度(0〜1)を持つ ref */
  activationRef?: RefObject<number>;
  /** ステージ照明の点灯具合(0〜1)を持つ ref。曲が11秒に達してから立ち上がる */
  lightsRef?: RefObject<number>;
  /**
   * 曲の再生位置(秒)を持つ ref。**clock.elapsedTime ではなく曲の時計を
   * 使うこと**(理由は EaveBeams.tsx の同名 prop のコメント参照)。
   */
  songTimeRef?: RefObject<number>;
};

/**
 * 天守四面の破風から外向きへ伸びる、EaveBeams より太いビーム。
 *
 * **演出は castleBeamRig.ts のキュー表が決める。** 本数(点灯フロント)・
 * 首振り・チェイス・色は全部あちら側で、ここはその結果をインスタンス属性へ
 * 書き込むだけ。軒下の EaveBeams.tsx と同じリグを共有している。
 */
export function GableBeams({
  position = [0, 0, 0],
  activationRef,
  lightsRef,
  songTimeRef,
}: GableBeamsProps) {
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
    radiusTop=BEAM_ROOT_RADIUS(根元)・radiusBottom=BEAM_RADIUS(先端)なので、
    top 側が光源、bottom 側が空へ広がる先端になる。rotateX(-90°)で
    top をワールド+Zへ倒し、translateで **top(=光源)をちょうど原点に**据える。

    **埋め込みオフセットをここに焼き込まないこと。** ここで -BEAM_EMBED_DEPTH
    すると根元が原点より手前(-Z)へずれ、instanceMatrix の回転中心(=原点)が
    光源そのものから離れる。すると首を上下に振ったとき光源が原点まわりに
    弧を描き、「緑の点からすこし離れた所を中心に光が回っている」ように
    見えてしまう(ユーザー指摘)。埋め込みは EaveBeams.tsx と同じく
    GABLE_SPOTS 側で spot.position を壁の内側へ引いて行う ―― こうすると
    回転中心が光源に一致し、首振りでは先端(末端)だけが動く。
  */
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(
      BEAM_ROOT_RADIUS,
      BEAM_RADIUS,
      BEAM_LENGTH,
      BEAM_SEGMENTS,
      1,
      true,
    );
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, BEAM_LENGTH / 2);
    return g;
  }, []);

  const flareGeometry = useMemo(() => new CircleGeometry(FLARE_RADIUS, 24), []);

  /*
    灯ごとの色と明るさ。ビームとフレアで同じバッファを共有する
    (同じ灯なので必ず同じ値。EaveBeams.tsx と同じ作り)。
  */
  const attributes = useMemo(() => {
    const colors = new InstancedBufferAttribute(
      new Float32Array(BEAM_COUNT * 3),
      3,
    );
    const levels = new InstancedBufferAttribute(new Float32Array(BEAM_COUNT), 1);
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
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
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
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: BEAM_VERTEX,
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
      palette: CASTLE_BEAM_PALETTE.map((hex) => new Color(hex)),
      lift: new Float32Array(BEAM_COUNT),
      yaw: new Float32Array(BEAM_COUNT),
    }),
    [],
  );

  useEffect(() => {
    scratchRef.current = scratchValue;
  }, [scratchValue]);

  useFrame(({ clock }, delta) => {
    const beamMesh = beamMeshRef.current;
    // JSX 側でフレアの instancedMesh を外してある間は常に null
    const flareMesh = flareMeshRef.current;
    const mat = materialRef.current;
    const flareMat = flareMaterialRef.current;
    const attrs = attributesRef.current;
    const scratch = scratchRef.current;
    /*
      **フレアはユーザー指示でいったん描画を止めてある(JSX側で
      instancedMesh をコメントアウト)。** flareMesh は null のまま
      になるので早期return の条件には含めない ―― 含めると
      ビーム本体(beamMesh)の更新まで一緒に止まってしまう。
    */
    if (!beamMesh || !mat || !flareMat || !attrs || !scratch) {
      return;
    }

    const activation = activationRef?.current ?? 0;
    const lights = lightsRef?.current ?? 1;
    const lit = activation * lights;

    mat.uniforms.uOpacity.value = lit * GABLE_BEAM_OPACITY_MAX;
    flareMat.uniforms.uOpacity.value = lit * FLARE_OPACITY_MAX;

    const raw = songTimeRef?.current ?? clock.elapsedTime;
    const s = sampleCastleRig(raw, scratch.sample);

    const follow = 1 - Math.exp(-s.slew * delta);
    const colors = attrs.colors.array as Float32Array;
    const levels = attrs.levels.array as Float32Array;
    const n = scratch.palette.length;

    for (let i = 0; i < BEAM_COUNT; i++) {
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
      // 基準の仰角を中心に振る(理由は EaveBeams.tsx の同じ箇所のコメント参照)
      const targetLift = s.lift + s.liftSwing * Math.cos(swing);
      const targetYaw = s.yaw * Math.sin(swing);

      // 首の回る速さの上限。理屈は EaveBeams.tsx / StageBeams.tsx を参照
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
        args={[geometry, material, BEAM_COUNT]}
        frustumCulled={false}
      />
      {/*
        光源そのもののフレア。**ユーザー指示でいったん非表示にしてある。**
        戻すときはこのコメントを外すだけでよい(useFrame 側は flareMesh が
        null でも動く作りにしてあるので、他の変更は不要)。
      */}
      {/* <instancedMesh
        ref={flareMeshRef}
        args={[flareGeometry, flareMaterial, BEAM_COUNT]}
        frustumCulled={false}
      /> */}
    </group>
  );
}
