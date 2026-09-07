"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  DoubleSide,
  ShaderMaterial,
} from "three";
import { CASTLE_ROOF_TIERS } from "./constants";
import { CORNER_TOWER_XZ, TOWER_ROOF_TIERS } from "./towerLayout";

/*
  参照画像はコンサート会場のトラス照明。天守・隅櫓それぞれの屋根の
  **層ごとに**四隅へ立てる。天守・隅櫓とも1段の箱ではなく、上へ行くほど
  幅が狭くなる屋根が何段も重なった層塔型の建物(天守はCASTLE_ROOF_TIERSで
  5段、隅櫓はTOWER_ROOF_TIERSで3段。どちらも scene.gltf の頂点を実測して
  求めた値 ―― 定義は constants.ts / towerLayout.ts のコメント参照)。

  向きは「全ビームが同じ+Zへ平行」ではなく、**各隅ごとにL字**
  (上から見て、その隅に集まる屋根の2辺をそのまま外へ延長する2方向)。
  StageBeams.tsx のような放射状の扇でもない。

  天守は四隅とも正味のL字(4隅×2本=8本/層)。隅櫓は天守の四隅に重なって
  立つ配置なので、天守側(内側)を向く成分は城の中を貫通してしまうため
  間引く(4隅×2本→4本/層。詳細は EAVE_BEAM_SPOTS のコメント参照)。
*/

type EaveTierAtBuilding = {
  cx: number;
  cz: number;
  y: number;
  halfWidth: number;
  halfDepth: number;
};

/**
 * ビームを生やす「建物×層」の一覧。天守1棟(CASTLE_ROOF_TIERS ぶん)+
 * 四隅の隅櫓4棟(それぞれ TOWER_ROOF_TIERS ぶん)。隅櫓は4棟とも同じ形の
 * モデルなので同じ層データを使い回すが、中心(cx, cz)だけは
 * CORNER_TOWER_XZ の各棟のものを使う(天守全体の四隅ではなく、
 * 各棟ローカルな四隅にするのがポイント)。
 */
const EAVE_TIERS: EaveTierAtBuilding[] = [
  ...CASTLE_ROOF_TIERS.map((t) => ({ cx: 0, cz: 0, ...t })),
  ...CORNER_TOWER_XZ.flatMap(([cx, cz]) =>
    TOWER_ROOF_TIERS.map((t) => ({ cx, cz, ...t })),
  ),
];

/** 隅の符号の組み合わせ(signX, signZ)。四隅ぶん */
const CORNER_SIGNS: readonly [1 | -1, 1 | -1][] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

type EaveBeamSpot = {
  position: [number, number, number];
  /** ジオメトリは既定でローカル+Zへ伸びる。Y回転でX/Z軸4方向のどれかへ向ける */
  rotationY: number;
};

/**
 * 層ごとの屋根の四隅(±半幅, ±半奥行き)それぞれに、そこへ集まる2辺を
 * 外へ延長する2方向(L字)でビームの根元を置く。位置・向きは定数だけから
 * 決まるので、モジュール読み込み時に一度だけ計算する
 * (毎フレーム・毎レンダーで作り直さない)。
 *
 * **天守(cx=cz=0)は指示により手を付けず、全4隅×2方向のまま。**
 * 隅櫓は天守の四隅に重なる位置に立つので、天守側(内側)を向く方向まで
 * 律儀に出すと城の内部を貫通するビームになってしまう。そこで隅櫓の
 * 中心が居る象限の符号(qx/qz)と逆向きの成分は間引く: 外側の1隅は
 * そのままL字(2本)、天守の各辺に接する2隅はそれぞれ外向きの1本だけ、
 * 天守にめり込む内側の1隅は0本になる(1隅あたり8本→4本)。
 */
const EAVE_BEAM_SPOTS: readonly EaveBeamSpot[] = EAVE_TIERS.flatMap((t) => {
  // 天守は cx=cz=0 なので qx=qz=0 になり、下の間引き条件が常に真になる(=間引かれない)
  const qx = Math.sign(t.cx);
  const qz = Math.sign(t.cz);
  return CORNER_SIGNS.flatMap(([signX, signZ]): EaveBeamSpot[] => {
    const position: [number, number, number] = [
      t.cx + signX * t.halfWidth,
      t.y,
      t.cz + signZ * t.halfDepth,
    ];
    const spots: EaveBeamSpot[] = [];
    if (qx === 0 || signX === qx) {
      // X方向の辺を外へ延長(+Xならrotation.yが+90°で+Zジオメトリが+X向きになる)
      spots.push({ position, rotationY: signX > 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
    if (qz === 0 || signZ === qz) {
      // Z方向の辺を外へ延長(+Zはジオメトリそのまま、-Zは180°反転)
      spots.push({ position, rotationY: signZ > 0 ? 0 : Math.PI });
    }
    return spots;
  });
});

/** ビームの長さ。水面(半径400。scenery/SeaGlow.tsx参照)の内側に十分収まる長さ */
const BEAM_LENGTH = 150;
/**
 * ビームの太さ。トラス照明の光条らしい細さを求められ、前段(2.6)から
 * さらに絞ってある。
 */
const BEAM_RADIUS = 1.2;
/** 円周方向の分割数。太いStageBeamsの18分割ほどの解像度は要らないので絞る */
const BEAM_SEGMENTS = 12;

/**
 * 光の色。暖色の白。以前あった足元アップライトの赤(REPLY_GLOW_COLOR)は
 * ユーザーの判断で撤去した経緯があるため避け、EdoCastle の裏縁取り
 * (#ffd8b0)に寄せた、赤みの少ない暖色にしてある。
 */
const EAVE_BEAM_COLOR = "#ffe9c7";

/** ビーム本体の最大の濃さ。StageBeams の BEAM_OPACITY_MAX と同程度 */
const EAVE_BEAM_OPACITY_MAX = 0.55;

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
  StageBeams.tsx の BEAM_FRAGMENT と同じ考え方(ConeGeometry の断面は
  「芯が明るい」・先端は smoothstep で完全に減衰)をそのまま流用する。
  詳しい理屈のコメントは StageBeams.tsx 側を参照。
*/
const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    float y = clamp(vUv.y, 0.0, 1.0);
    float along = mix(0.25, 1.0, pow(y, 1.5));
    along *= 1.0 - smoothstep(0.94, 1.0, y) * 0.45;
    along *= smoothstep(0.0, 0.30, y);

    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vViewDir);
    float facing = clamp(abs(dot(n, v)), 0.0, 1.0);

    float body = facing;
    float core = pow(facing, 7.0);
    // pow の底は必ず 0 以上に丸める(負の底はGLSLで未定義=NaNになる。詳細はStageBeams.tsx参照)
    float haze = pow(max(1.0 - facing, 0.0), 3.0);

    float a = clamp(
      along * (body * 0.45 + core * 0.9 + haze * 0.1) * uOpacity,
      0.0,
      1.0
    );
    gl_FragColor = vec4(uColor * a, a);
  }
`;

type EaveBeamsProps = {
  /** 天守の底面のワールド座標。EdoCastle / CornerTowers と同じ値を渡す */
  position?: [number, number, number];
  /**
   * Reply の進行度(0〜1)を持つ ref。毎フレーム変わるので数値 prop ではなく
   * ref で受け取る。
   */
  activationRef?: RefObject<number>;
  /**
   * ステージ照明の点灯具合(0〜1)を持つ ref。曲が11秒に達してから立ち上がる。
   * EdoCastle / CornerTowers の投影光(uProjStrength = activation*lights*…)と
   * 同じ掛け算パターンで、ステージ照明が点くのと同時にフェードインさせる。
   */
  lightsRef?: RefObject<number>;
};

/**
 * 天守・隅櫓の屋根の四隅、軒下あたりから伸びる細いビームライト
 * (コンサート会場のトラス照明の見立て)。上から見て、その隅に集まる
 * 屋根の2辺をそのまま外へ延長するL字の2方向へ1本ずつ伸ばす。
 *
 * StageBeams と違って首振り・チェイス・色替えのような凝った動きは持たない。
 * lightsRef(と activationRef)にそのまま連動してフェードインするだけ。
 */
export function EaveBeams({
  position = [0, 0, 0],
  activationRef,
  lightsRef,
}: EaveBeamsProps) {
  /*
    useFrame 内で useMemo の戻り値を直接書き換えると react-hooks/immutability に
    引っかかるため、ref へコピーしてそちら経由で触る(EdoCastle と同じ手当て)。
  */
  const materialRef = useRef<ShaderMaterial | null>(null);

  /*
    コーンは既定で頂点が+h/2・底面が-h/2(+Y方向)。rotateX(-90°)で
    頂点をワールド+Zへ倒し、translateで頂点を原点に据える
    (StageBeams は+Yへ伸ばすため rotateX(180°)を使っているが、
    今回は+Zへ伸ばしたいので回転角が異なる)。
  */
  const geometry = useMemo(() => {
    const g = new ConeGeometry(BEAM_RADIUS, BEAM_LENGTH, BEAM_SEGMENTS, 1, true);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, BEAM_LENGTH / 2);
    return g;
  }, []);

  /*
    EAVE_BEAM_SPOTS.length 本(天守5層×4隅×2方向=40本 + 隅櫓3層×4棟×
    間引き後4本/層=48本、計88本)すべて同じ色・同じ明るさで動くので、
    マテリアルは1個を共有する(StageBeams は本ごとに色を変えるので
    本数ぶん必要だったが、ここは不要)。
  */
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uColor: { value: new Color(EAVE_BEAM_COLOR) },
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
    [],
  );

  useEffect(() => {
    materialRef.current = material;
    // GPU資源なので外れるときに解放する
    return () => {
      material.dispose();
      geometry.dispose();
    };
  }, [material, geometry]);

  useFrame(() => {
    // 出具合はref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef?.current ?? 0;
    // 渡されなければ従来どおり常時点灯とみなす(EdoCastleのlightsRefと同じ既定)
    const lights = lightsRef?.current ?? 1;
    const mat = materialRef.current;
    if (mat) {
      mat.uniforms.uOpacity.value = activation * lights * EAVE_BEAM_OPACITY_MAX;
    }
  });

  return (
    <group position={position}>
      {EAVE_BEAM_SPOTS.map((spot, i) => (
        <mesh
          key={i}
          geometry={geometry}
          material={material}
          position={spot.position}
          rotation={[0, spot.rotationY, 0]}
          // 遠くまで長く伸びるので、建物のbboxではカリングされてしまう
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
