"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Color, Mesh, MeshStandardMaterial } from "three";
import type { Group, WebGLProgramParametersWithUniforms } from "three";

const MODEL_PATH = "/3DModel/japanese_torii_gate/scene.gltf";

/**
 * Japanese Torii Gate (CC-BY-4.0)
 * https://sketchfab.com/3d-models/japanese-torii-gate-2027a248de1b4b70985ff97e708fb50d
 * by Sahir Virmani (https://sketchfab.com/sahirvirmani)
 */

/*
  このモデルは元シーンでの配置(原点から離れた位置・cm単位の巨大な数値)が
  そのままノード行列に焼き込まれていて、原点合わせされていない。
  gltf のノード変換をすべて適用した状態(R3Fスケール1)で実測した値:
    world bbox  x∈[-408.14,-352.81] / y∈[5.11,538.39] / z∈[-370.24,364.61]
  中心(x,z)と下端(y)をここで引いて原点に立たせ、高さで割って
  「scale=1のとき高さちょうど1」になるよう正規化する(下の useFrame 外の
  group 参照)。この正規化のおかげで、呼び出し側は他の鳥居と同じ感覚で
  scale prop に「欲しい高さ(ワールド単位)」をそのまま渡せる。
*/
const RAW_CENTER_X = -380.4767;
const RAW_CENTER_Z = -2.8136;
const RAW_MIN_Y = 5.107;
const RAW_HEIGHT = 533.2869;
const NORMALIZE_SCALE = 1 / RAW_HEIGHT;

/*
  上の補正は「モデルの置き場所」の話。一方こちらは「モデル自身の軸」の話で、
  ノード行列の Z-up→Y-up 変換の結果、メッシュのローカル座標では
  **Z軸が高さ**になる(Yではない)。発光グラデーションはメッシュの
  頂点シェーダーで position(補正前のローカル座標)を直接読むので、
  ここだけは position.z を使う。実測(POSITION アクセサ): ローカル
  z ∈ [-4.2448, 1.0881]。
*/
const LOCAL_HEIGHT_MIN = -4.2448;
const LOCAL_HEIGHT_MAX = 1.0881;

/*
  高さでの発光グラデーション。MiyajimaTorii.tsx と同じ手法
  (onBeforeCompile で totalEmissiveRadiance を高さで橙→赤に補間する)。
  こちらはマテリアルが「torii」1個だけで、除外対象(黒い部品等)が無いぶん
  MiyajimaTorii よりシンプル。
*/
const GLOW_COLOR_BOTTOM = new Color("#ff7a28");
const GLOW_COLOR_TOP = new Color("#ff2410");
/** 発光の最大強度。activation(0〜1)にこれを掛けてシェーダーのuGlowStrengthへ渡す */
const GLOW_INTENSITY_MAX = 3.5;

type GlowMaterial = MeshStandardMaterial & {
  userData: { shader?: WebGLProgramParametersWithUniforms };
};

type PreparedGate = {
  scene: Group;
  glowMaterials: GlowMaterial[];
};

/**
 * シーンを複製し、高さで橙→赤に光る発光グラデーションを仕込む。
 * GLTFキャッシュのマテリアルを直接触らないよう必ず clone する
 * (MiyajimaTorii.tsx と同じ手当て)。
 */
function usePreparedGate(): PreparedGate {
  const { scene } = useGLTF(MODEL_PATH);

  return useMemo(() => {
    const clone = scene.clone(true);
    const glowMaterials: GlowMaterial[] = [];

    clone.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const source = child.material;
      const materials = Array.isArray(source) ? source : [source];
      const next = materials.map((mat) => {
        if (!(mat instanceof MeshStandardMaterial)) return mat;
        const glow = mat.clone() as GlowMaterial;

        glow.onBeforeCompile = (shader) => {
          shader.uniforms.uGlowBottom = { value: GLOW_COLOR_BOTTOM };
          shader.uniforms.uGlowTop = { value: GLOW_COLOR_TOP };
          shader.uniforms.uGlowStrength = { value: 0 };

          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying float vGlowHeightT;",
            )
            .replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>\nvGlowHeightT = clamp((position.z - ${LOCAL_HEIGHT_MIN.toFixed(4)}) / ${(LOCAL_HEIGHT_MAX - LOCAL_HEIGHT_MIN).toFixed(4)}, 0.0, 1.0);`,
            );

          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform vec3 uGlowBottom;\nuniform vec3 uGlowTop;\nuniform float uGlowStrength;\nvarying float vGlowHeightT;",
            )
            .replace(
              "#include <emissivemap_fragment>",
              "#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(uGlowBottom, uGlowTop, vGlowHeightT) * uGlowStrength;",
            );

          glow.userData.shader = shader;
        };

        glowMaterials.push(glow);
        return glow;
      });
      child.material = Array.isArray(source) ? next : next[0];
    });

    return { scene: clone, glowMaterials };
  }, [scene]);
}

type ToriiGateProps = {
  /** 鳥居の底が来るワールド座標 */
  position?: [number, number, number];
  /** 鳥居の高さ(ワールド単位)。正規化済みなのでそのまま欲しい高さを渡せる */
  scale?: number;
  /**
   * 発光強度(0〜1)を持つ ref。星降る海の activationRef と同じ理由で
   * 数値 prop ではなく ref(毎フレーム変わる値なので、state だと親ごと
   * 再レンダーが走る)。
   */
  glowRef?: RefObject<number>;
  /** 減光係数(1=そのまま, <1=暗い)を持つ ref。省略時は常に1(減光なし) */
  dimRef?: RefObject<number>;
};

/**
 * ステージ中央に置く大鳥居。左右の宮島鳥居(MiyajimaTorii)よりはっきり
 * 大きくして主役にする指定。発光の見た目は左右の鳥居と揃える
 * (橙→赤の高さグラデーション。色・強度は MiyajimaTorii.tsx と同じ値)。
 */
export function ToriiGate({
  position = [0, 0, 0],
  scale = 1,
  glowRef,
  dimRef,
}: ToriiGateProps) {
  const { scene, glowMaterials } = usePreparedGate();
  // useFrame内でuseMemoの戻り値を直接書き換えるとreact-hooks/immutabilityに
  // 引っかかるため、refへコピーしてそちら経由で触る(MiyajimaTorii.tsxと同じ)
  const materialsRef = useRef<GlowMaterial[]>([]);

  useEffect(() => {
    materialsRef.current = glowMaterials;
  }, [glowMaterials]);

  useFrame(() => {
    const intensity =
      (glowRef?.current ?? 0) * (dimRef?.current ?? 1) * GLOW_INTENSITY_MAX;
    materialsRef.current.forEach((mat) => {
      // シェーダーはWebGLが初回コンパイルするまで生成されない(マウント直後の
      // 数フレームは未生成のことがある)ため、存在チェックしてから触る
      const shader = mat.userData.shader;
      if (shader) shader.uniforms.uGlowStrength.value = intensity;
    });
  });

  return (
    <group position={position} scale={scale}>
      <group scale={NORMALIZE_SCALE}>
        {/*
          モデル本来の向きは、実測すると幅の広い面(柱の間隔)がワールドZ向きに
          なっている。左右の宮島鳥居(MiyajimaTorii)はX方向に並べる指定なので、
          向きを90°振ってX向きに合わせる。中の group で先に原点合わせして
          あるので、この回転は「センターが原点にある状態」で効く
          (回転してもセンターがずれない)。
        */}
        <group rotation={[0, Math.PI / 2, 0]}>
          {/* モデル自体の座標系のズレ(このファイル冒頭のコメント参照)を補正する */}
          <group position={[-RAW_CENTER_X, -RAW_MIN_Y, -RAW_CENTER_Z]}>
            <primitive object={scene} />
          </group>
        </group>
      </group>
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
