"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Color, Mesh, MeshStandardMaterial } from "three";
import type { Group, WebGLProgramParametersWithUniforms } from "three";

const MODEL_PATH = "/3DModel/miyajima_torii/scene.gltf";

/** Sketchfabのテクセル密度確認用に同梱されている40x40の平面（見た目には不要） */
const TEXEL_REFERENCE_NODE_NAME = "Object_39";

/**
 * 発光させない部品のマテリアル名。"Black"は屋根(笠木・島木)の黒い部分、
 * "Green"は先端の緑青の飾り金具、"TD_Checker"はテクセル確認用の平面
 * (非表示済み)。参考映像でも屋根は黒いまま光っていないため除外する。
 */
const NON_GLOW_MATERIAL_NAMES = new Set(["Black", "Green", "TD_Checker"]);

/*
  星降る海の映像では、屋根の黒い部分より下、鳥居の柱・貫(ぬき)が
  根本は橙色、屋根のすぐ下に近づくほど赤みがかったオレンジになるように
  発光している。ポイントライトで照らすだけでは反射光止まりで映像ほど
  光らないため、鳥居のマテリアル自体をシェーダーで書き換えて自己発光させ、
  かつ高さで色を橙→赤寄りのオレンジへ補間する。
*/
const GLOW_COLOR_BOTTOM = new Color("#ff7a28");
const GLOW_COLOR_TOP = new Color("#ff2410");
/** 発光の最大強度。activation(0〜1)にこれを掛けてシェーダーのuGlowStrengthへ渡す */
const GLOW_INTENSITY_MAX = 3.5;

/*
  グラデーションの基準にする高さの範囲。
  下端は水面(y=0)。鳥居の土台はそこより下にあるが水面下は常に見えないため、
  「見えている柱の根本」を橙色の基準にする。
  上端は発光対象(NON_GLOW_MATERIAL_NAMES を除いたメッシュ)のローカルY座標の
  最大値(scene.gltfの全POSITION accessorから実測、約23.5)。これは黒い屋根の
  すぐ下にあたり、そこが最も赤みがかったオレンジになる。
  ノードはすべて単位変換のみでオフセットが無いため、頂点シェーダーの
  `position.y`をそのままこの範囲で正規化して高さに使える。
*/
const TORII_LOCAL_HEIGHT_MIN = 0;
const TORII_LOCAL_HEIGHT_MAX = 23.5;

type GlowMaterial = MeshStandardMaterial & {
  userData: { shader?: WebGLProgramParametersWithUniforms };
};

type PreparedTorii = {
  scene: Group;
  glowMaterials: GlowMaterial[];
};

/**
 * シーンを複製し、テクセル確認用の平面を非表示にする。
 * マテリアルはGLTFキャッシュ(useGLTFのシーン全体)と共有されているため、
 * 発光シェーダーを足す前に複製して差し替える(このコンポーネント以外に
 * 同モデルの利用箇所は無いが、キャッシュを直接汚さないための保険)。
 */
function usePreparedTorii(): PreparedTorii {
  const { scene } = useGLTF(MODEL_PATH);

  return useMemo(() => {
    const clone = scene.clone(true);
    const texelPlane = clone.getObjectByName(TEXEL_REFERENCE_NODE_NAME);
    if (texelPlane) texelPlane.visible = false;

    const glowMaterials: GlowMaterial[] = [];
    clone.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const source = child.material;
      const materials = Array.isArray(source) ? source : [source];
      const nextMaterials = materials.map((mat) => {
        if (!(mat instanceof MeshStandardMaterial)) return mat;
        if (NON_GLOW_MATERIAL_NAMES.has(mat.name)) return mat;
        const next = mat.clone() as GlowMaterial;

        /*
          totalEmissiveRadianceは通常material.emissiveをそのまま使うだけの
          単色だが、onBeforeCompileで頂点の高さ(vGlowHeightT)に応じて
          橙→赤に補間するよう上書きする。強さ(uGlowStrength)は毎フレーム
          useFrame側からshader.uniforms経由で更新する。
        */
        next.onBeforeCompile = (shader) => {
          shader.uniforms.uGlowBottom = { value: GLOW_COLOR_BOTTOM };
          shader.uniforms.uGlowTop = { value: GLOW_COLOR_TOP };
          shader.uniforms.uGlowStrength = { value: 0 };
          shader.uniforms.uHeightMin = { value: TORII_LOCAL_HEIGHT_MIN };
          shader.uniforms.uHeightMax = { value: TORII_LOCAL_HEIGHT_MAX };

          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nuniform float uHeightMin;\nuniform float uHeightMax;\nvarying float vGlowHeightT;",
            )
            .replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\nvGlowHeightT = clamp((position.y - uHeightMin) / (uHeightMax - uHeightMin), 0.0, 1.0);",
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

          next.userData.shader = shader;
        };

        glowMaterials.push(next);
        return next;
      });
      child.material = Array.isArray(source) ? nextMaterials : nextMaterials[0];
    });

    return { scene: clone, glowMaterials };
  }, [scene]);
}

type MiyajimaToriiProps = {
  position?: [number, number, number];
  scale?: number;
  /**
   * 星降る海の進行度(0〜1)を持つ ref。鳥居の発光強度をここに連動させる。
   * 立ち上がり/収まりの間ずっと値が変わるため、数値 prop だと親ごと
   * 毎フレーム再レンダーされる。ref で受け取り useFrame の中で uniform へ入れる。
   */
  glowRef?: RefObject<number>;
  /**
   * 転調直前の暗転の減光係数(1=そのまま, <1=暗い)を持つ ref。
   * Sandbox3D が毎フレーム更新する。再レンダーを起こさないため prop ではなく
   * ref で受け取り、useFrame の中で glow に掛ける。
   */
  dimRef?: RefObject<number>;
};

/**
 * Miyajima Torii (CC-BY-4.0)
 * https://sketchfab.com/3d-models/miyajima-torii-584bdf5ca606482289f1fc84f0c708cf
 * by RMSHR (https://sketchfab.com/remy.sohier)
 */
export function MiyajimaTorii({
  position = [0, 0, 0],
  scale = 1,
  glowRef,
  dimRef,
}: MiyajimaToriiProps) {
  const { scene, glowMaterials } = usePreparedTorii();
  // useFrame内でuseMemoの戻り値を直接書き換えるとreact-hooks/immutabilityに
  // 引っかかるため、refへコピーしてそちら経由で触る(Bubbles.tsxと同じ手当て)
  const materialsRef = useRef<GlowMaterial[]>([]);

  useEffect(() => {
    materialsRef.current = glowMaterials;
  }, [glowMaterials]);

  useFrame(() => {
    // 発光強度・転調直前の暗転はどちらもref経由(数値propだと親ごと毎フレーム再レンダー)
    const intensity =
      (glowRef?.current ?? 0) * (dimRef?.current ?? 1) * GLOW_INTENSITY_MAX;
    materialsRef.current.forEach((mat) => {
      // シェーダーはWebGLが初回コンパイルするまで生成されない(マウント直後の
      // 数フレームは未生成のことがある)ため、存在チェックしてから触る
      const shader = mat.userData.shader;
      if (shader) shader.uniforms.uGlowStrength.value = intensity;
    });
  });

  return <primitive object={scene} position={position} scale={scale} />;
}

useGLTF.preload(MODEL_PATH);
