"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Color, Mesh, MeshStandardMaterial } from "three";
import type { Group, Material, PointLight } from "three";
import {
  BUILD_CELL_SIZE,
  BUILD_EDGE_GLOW,
  BUILD_EDGE_JITTER,
  CASTLE_SCALE,
  CASTLE_TOP_Y,
  PROJECTION_COLOR_A,
  PROJECTION_COLOR_B,
  REPLY_GLOW_COLOR,
} from "./constants";

const MODEL_PATH = "/3DModel/944e48f240cc449abb5ecc969051b155/scene.gltf";

/*
  テクスチャ(フォトグラメトリの焼き込み写真)は使わない。天守は黒く沈めておき、
  Reply.mp4 の 0:07〜0:11 と同じく「暗い城にステージ照明が這う」画を作る。
  スキャンの baseColor には昼の陰影が焼き込まれていて、夜の景色に置くと
  そこだけ写真が浮いてしまうため。
*/
/** 地の色。ほぼ黒。形を作るのは下の投影光とポイントライトだけ */
const BODY_COLOR = "#0a0708";

/*
  プロジェクションマッピング。実際にスポットライトを何灯も置くと重いので、
  ワールド座標と時間から色帯を作って自己発光へ足す方式にしている。
  高さ方向に流れる帯と、周方向に回る帯の2系統を別々の色で重ねることで、
  面ごとに違う色が這っていく参照映像の見え方に寄せる。
*/
const PROJECTION_A = new Color(PROJECTION_COLOR_A);
const PROJECTION_B = new Color(PROJECTION_COLOR_B);
/**
 * 投影光の最大強度。activation(0〜1)にこれを掛ける。
 * 帯A・帯Bが重なるところは2色ぶん足されるので、ここを上げすぎると
 * 城が黄色く飽和して形が消える(2.4 では真っ白に飛んだ)。
 */
const PROJECTION_INTENSITY_MAX = 0.85;
/**
 * 面の向きによる明暗。水平な面(屋根)を明るく、垂直な面(壁・石垣)を暗くする。
 * テクスチャを外したぶん、これが無いと天守の層になった屋根が潰れて
 * ただの塊に見えてしまう。0で無効、1で最大。
 */
const GLOW_FACE_SHADE = 0.55;

/** 足元から天守を舐め上げる赤いライト。輪郭を夜空から浮かせる */
const UPLIGHT_INTENSITY_MAX = 420;
/** 裏からの縁取り。屋根の稜線を夜空から切り出す */
const RIMLIGHT_INTENSITY_MAX = 260;

/** 組み上がり面で光る帯の強さ。ここだけ白熱させて「今できた」感を出す */
const BUILD_BAND_STRENGTH = 3;
const BUILD_GLOW_COLOR = new Color(REPLY_GLOW_COLOR);

/**
 * 組み上げ面がここまで上がりきったら演出終了。頂点(CASTLE_TOP_Y)に
 * ばらつき(BUILD_EDGE_JITTER)と帯(BUILD_EDGE_GLOW)を足した高さまで
 * 上げないと、最後のブロックが出ないまま止まる。
 */
const BUILD_TOP_Y = CASTLE_TOP_Y + BUILD_EDGE_JITTER + BUILD_EDGE_GLOW;

/**
 * 組み上げ用の uniform。**全マテリアルでこのオブジェクトを共有する**。
 *
 * MiyajimaTorii のように material.userData.shader へ控えて後から触る手も
 * あるが、江戸城は4つのマテリアルが同じ onBeforeCompile を持つため three が
 * シェーダープログラムを共有し、userData.shader が入らない個体が出る
 * (実際それで天守が discard されず最初から完成した状態で出ていた)。
 * onBeforeCompile の中で shader.uniforms へ同じ参照を差し込んでおけば、
 * ここを1回書き換えるだけで全マテリアルに効く。
 */
type BuildUniforms = {
  uBuildY: { value: number };
  uBuildOn: { value: number };
  uBuildCell: { value: number };
  uBuildJitter: { value: number };
  uBuildEdge: { value: number };
  uBuildGlow: { value: Color };
  /* 天守に這わせる投影光(プロジェクションマッピング) */
  uProjA: { value: Color };
  uProjB: { value: Color };
  uProjStrength: { value: number };
  uProjTime: { value: number };
  uProjBaseY: { value: number };
  uProjTopY: { value: number };
};

type PreparedCastle = {
  scene: Group;
  materials: MeshStandardMaterial[];
  buildUniforms: BuildUniforms;
};

/**
 * シーンを複製し、
 *  - baseColor を emissiveMap に流用した自己発光
 *  - 下から組み上がる演出(セル単位で切り落とす + 面で光る帯)
 * を仕込んだマテリアルへ差し替える。GLTFキャッシュのマテリアルを直接
 * 触らないよう必ず clone する(MiyajimaTorii.tsx と同じ手当て)。
 */
function usePreparedCastle(): PreparedCastle {
  const { scene } = useGLTF(MODEL_PATH);

  return useMemo(() => {
    const clone = scene.clone(true);
    const materials: MeshStandardMaterial[] = [];
    // 全マテリアルへ差し込む共有 uniform(上の BuildUniforms のコメント参照)
    const buildUniforms: BuildUniforms = {
      uBuildY: { value: 0 },
      uBuildOn: { value: 0 },
      uBuildCell: { value: BUILD_CELL_SIZE },
      uBuildJitter: { value: BUILD_EDGE_JITTER },
      uBuildEdge: { value: BUILD_EDGE_GLOW },
      uBuildGlow: { value: BUILD_GLOW_COLOR },
      uProjA: { value: PROJECTION_A },
      uProjB: { value: PROJECTION_B },
      uProjStrength: { value: 0 },
      uProjTime: { value: 0 },
      uProjBaseY: { value: 0 },
      uProjTopY: { value: CASTLE_TOP_Y },
    };

    /*
      元マテリアル → 差し替え後、のキャッシュ。

      この GLTF はメッシュ4つが同じマテリアル1個を参照している。メッシュごとに
      作り直すと、three は customProgramCacheKey(既定は onBeforeCompile の
      ソース文字列)が同じマテリアル同士でシェーダープログラムを共有し、
      **2個目以降では onBeforeCompile を呼ばない**。すると uniform が渡らず
      uBuildOn=0 のまま = 組み上げ演出が効かない。1個だけ作って共有する。
    */
    const converted = new Map<Material, MeshStandardMaterial>();

    clone.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const source = child.material;
      const list = Array.isArray(source) ? source : [source];
      const next = list.map((mat: Material) => {
        const done = converted.get(mat);
        if (done) return done;

        /*
          このモデルは KHR_materials_unlit 付きなので、GLTFLoader が作るのは
          MeshBasicMaterial。unlit のままだとライトも emissive も一切効かず、
          焼き込まれた昼のテクスチャがベタっと出るだけになる(組み上げ用の
          onBeforeCompile も MeshStandard 前提のチャンク名なので当たらない)。
          ここで MeshStandardMaterial へ作り替える。

          テクスチャ(map)は引き継がない。スキャンの写真には昼の陰影が
          焼き込まれていて夜の景色から浮くため、鳥居と同じく「建物自体が
          高さで橙→赤に光る」表現へ置き換える(発光は下のシェーダー側)。
        */
        const src = mat as Material & {
          side?: MeshStandardMaterial["side"];
        };
        const copy = new MeshStandardMaterial({
          color: BODY_COLOR,
          side: src.side,
          transparent: mat.transparent,
          alphaTest: mat.alphaTest,
          // 石垣・瓦。てかりは出さない
          roughness: 0.9,
          metalness: 0,
        });

        copy.onBeforeCompile = (shader) => {
          // 同じ参照を差し込む = 1箇所書き換えれば全マテリアルに効く
          Object.assign(shader.uniforms, buildUniforms);

          /*
            組み上げ判定はワールド座標の高さで行う。頂点側でワールド位置を
            varying へ出しておく(transformed は begin_vertex で定義される)。
          */
          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 vBuildWorld;\nvarying vec3 vBuildNormal;",
            )
            .replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\nvBuildWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
            )
            // 屋根と壁で発光の明るさを変えるためのワールド法線
            .replace(
              "#include <beginnormal_vertex>",
              "#include <beginnormal_vertex>\nvBuildNormal = normalize(mat3(modelMatrix) * objectNormal);",
            );

          /*
            フラグメント側。セル(BUILD_CELL_SIZE の立方格子)ごとにハッシュで
            出現高さをずらし、組み上げ面(uBuildY)より上のセルを discard する。
            これで水平の切断面ではなく、ブロックが虫食い状に生えてくる
            見た目になる。面のすぐ下は帯状に白熱させる。
          */
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              `#include <common>
uniform float uBuildY;
uniform float uBuildOn;
uniform float uBuildCell;
uniform float uBuildJitter;
uniform float uBuildEdge;
uniform vec3 uBuildGlow;
uniform vec3 uProjA;
uniform vec3 uProjB;
uniform float uProjStrength;
uniform float uProjTime;
uniform float uProjBaseY;
uniform float uProjTopY;
varying vec3 vBuildWorld;
varying vec3 vBuildNormal;

float buildHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`,
            )
            .replace(
              "#include <clipping_planes_fragment>",
              `#include <clipping_planes_fragment>
  float buildBand = 0.0;
  if (uBuildOn > 0.5) {
    vec3 buildCell = floor(vBuildWorld / uBuildCell);
    float buildH = vBuildWorld.y - buildHash(buildCell) * uBuildJitter;
    if (buildH > uBuildY) discard;
    buildBand = smoothstep(uBuildY - uBuildEdge, uBuildY, buildH);
  }`,
            )
            /*
              プロジェクションマッピング。天守は黒いので、ここで足す光だけが
              建物を浮かび上がらせる。
                - 帯A: 高さ方向に流れる帯。下から上へ光が這い上がる
                - 帯B: 周方向に回る帯。城のまわりを光が一周する
              pow で締めて、ぼんやりした照り返しではなく「照明が当たっている
              帯」として見えるようにする。そこへ組み上がり面の帯を足す。
            */
            .replace(
              "#include <emissivemap_fragment>",
              `#include <emissivemap_fragment>
  float projT = clamp((vBuildWorld.y - uProjBaseY) / max(uProjTopY - uProjBaseY, 0.001), 0.0, 1.0);
  float projAng = atan(vBuildWorld.z, vBuildWorld.x);
  // pow へ渡すので必ず 0 以上に丸める(負の底は GLSL では未定義 = NaN。
  // 0.5+0.5*sin() は浮動小数点誤差でわずかに負になりうる)
  float bandA = clamp(0.5 + 0.5 * sin(projT * 9.0 - uProjTime * 1.7 + projAng * 1.5), 0.0, 1.0);
  float bandB = clamp(0.5 + 0.5 * sin(projAng * 3.0 + uProjTime * 0.9 - projT * 4.0), 0.0, 1.0);
  // 水平な面(屋根)ほど強く当たる。テクスチャが無いぶん、これで層を描き分ける
  float projFace = mix(${(1 - GLOW_FACE_SHADE).toFixed(2)}, 1.0, abs(vBuildNormal.y));
  vec3 projection = uProjA * pow(bandA, 3.0) + uProjB * pow(bandB, 4.0);
  totalEmissiveRadiance = projection * uProjStrength * projFace
    + uBuildGlow * buildBand * ${BUILD_BAND_STRENGTH.toFixed(1)};`,
            );
        };
        /*
          さらに保険。将来モデルのマテリアルが増えて上のキャッシュで1個に
          まとまらなくなっても、キーが個体ごとに違えば three は必ず
          onBeforeCompile を呼ぶ(uniform は同じ参照を配るので実害はない)。
        */
        const cacheKey = `edo-castle-build-${converted.size}`;
        copy.customProgramCacheKey = () => cacheKey;

        converted.set(mat, copy);
        materials.push(copy);
        return copy;
      });
      child.material = Array.isArray(source) ? next : next[0];
    });

    return { scene: clone, materials, buildUniforms };
  }, [scene]);
}

type EdoCastleProps = {
  /** 城の底面を置くワールド座標。モデルは底面がちょうど y=0 に来る */
  position?: [number, number, number];
  /**
   * Reply の進行度(0〜1)を持つ ref。自己発光と足元のライトをこれに連動させる。
   * 立ち上がり/収まりの間ずっと値が変わるため、数値 prop だと親ごと
   * 毎フレーム再レンダーされる。ref で受け取り useFrame の中で反映する。
   */
  activationRef?: RefObject<number>;
  /**
   * 組み上げの進行度(0〜1)を持つ ref。0で何も無い状態、1で天守が完成。
   * これも毎フレーム変わるので ref で受け取る。
   */
  buildRef?: RefObject<number>;
  /**
   * ステージ照明の点灯具合(0〜1)を持つ ref。曲が11秒に達してから立ち上がる。
   * 投影光(プロジェクションマッピング)はこれに連動させ、組み上げ中の天守は
   * 黒いシルエットのままにしておく。
   */
  lightsRef?: RefObject<number>;
};

/**
 * 【3DScan】江戸城 寛永度天守閣 (Sketchfab Standard License)
 * https://sketchfab.com/3d-models/3dscan-edo-castle-944e48f240cc449abb5ecc969051b155
 * by BENA-3DSolution (https://sketchfab.com/BENA-ArchitecturalModeling)
 *
 * Reply モードの土台。星降る海で鳥居が立っていた位置にそのまま置き換わり、
 * 天守の上へステージ → 宮島の鳥居 → ホログラムと積み上がる。
 * 押した直後は下から組み上がって現れる(CastleAssembly.tsx の飛来ブロックと対)。
 */
export function EdoCastle({
  position = [0, 0, 0],
  activationRef,
  buildRef,
  lightsRef,
}: EdoCastleProps) {
  const { scene, materials, buildUniforms } = usePreparedCastle();
  /*
    useFrame 内で useMemo の戻り値を直接書き換えると react-hooks/immutability に
    引っかかるため、ref へコピーしてそちら経由で触る(MiyajimaTorii.tsx と同じ)。
  */
  const materialsRef = useRef<MeshStandardMaterial[]>([]);
  const uniformsRef = useRef<BuildUniforms | null>(null);
  const uplightRef = useRef<PointLight>(null);
  const rimlightRef = useRef<PointLight>(null);

  useEffect(() => {
    materialsRef.current = materials;
    uniformsRef.current = buildUniforms;
    /*
      GLTF から複製ではなく作り直したマテリアルなので、外れるときに解放する
      (テクスチャは useGLTF のキャッシュと共有しているので dispose しない)。
    */
    return () => {
      materials.forEach((mat) => mat.dispose());
    };
  }, [materials, buildUniforms]);

  useFrame(({ clock }) => {
    // 進行度はどちらもref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef?.current ?? 0;
    const build = buildRef?.current ?? 1;
    const lights = lightsRef?.current ?? 1;

    /*
      uniform は全マテリアルで共有しているので1回書けば足りる
      (シェーダーのコンパイル前でも、この値がそのまま初期値として渡る)。

      - 投影光: 天守に這うステージ照明。強さは activation に連動
      - 組み上げ面: base(position[1])から BUILD_TOP_Y まで上がる。
        組み上がりきったら uBuildOn=0 にして分岐ごと止める(以降は素通し)
    */
    const uniforms = uniformsRef.current;
    if (uniforms) {
      // 投影光は11秒(lights)から。それまで天守は黒いシルエットのまま
      uniforms.uProjStrength.value = activation * lights * PROJECTION_INTENSITY_MAX;
      uniforms.uProjTime.value = clock.elapsedTime;
      uniforms.uProjBaseY.value = position[1];
      uniforms.uProjTopY.value = position[1] + CASTLE_TOP_Y;
      uniforms.uBuildY.value = position[1] + build * BUILD_TOP_Y;
      uniforms.uBuildOn.value = build < 1 ? 1 : 0;
    }

    /*
      ライトは組み上がりに合わせて立ち上げる。まだ天守が無いうちから
      煌々と照らしていると、何も無い空間が光って見えてしまう。
    */
    const lightGain = activation * build;
    if (uplightRef.current) {
      uplightRef.current.intensity = lightGain * UPLIGHT_INTENSITY_MAX;
    }
    if (rimlightRef.current) {
      rimlightRef.current.intensity = lightGain * RIMLIGHT_INTENSITY_MAX;
    }
  });

  return (
    <group position={position}>
      <primitive object={scene} scale={CASTLE_SCALE} />
      {/* 石垣のあたりから天守を舐め上げる赤いライト */}
      <pointLight
        ref={uplightRef}
        position={[0, 1.5, 6]}
        color={REPLY_GLOW_COLOR}
        distance={44}
        decay={1.6}
        intensity={0}
      />
      {/* 裏手からの縁取り。屋根の稜線を夜空から浮かせる */}
      <pointLight
        ref={rimlightRef}
        position={[-4, CASTLE_TOP_Y * 0.75, -10]}
        color="#ffd8b0"
        distance={50}
        decay={1.7}
        intensity={0}
      />
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
