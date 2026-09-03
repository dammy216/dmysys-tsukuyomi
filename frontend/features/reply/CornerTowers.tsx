"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { DoubleSide, Mesh, MeshStandardMaterial } from "three";
import type { Group } from "three";
import { CASTLE_TOP_Y } from "./constants";
import {
  applyCastleBuildShader,
  BUILD_TOP_Y,
  type BuildUniforms,
  createCastleBuildUniforms,
  PROJECTION_INTENSITY_MAX,
} from "./castleBuildShader";
import { CORNER_TOWER_XZ, TOWER_SCALE } from "./towerLayout";

const MODEL_PATH = "/3DModel/japanese_tower/scene.gltf";

/**
 * Japanese Tower (CC-BY-4.0)
 * https://sketchfab.com/3d-models/japanese-tower-e09244dc5ca84b7b98e9bdbe6ae99c69
 * by florenciocristan77 (https://sketchfab.com/florenciocristan77)
 */

/** 地の色。天守(EdoCastle の BODY_COLOR)と同じほぼ黒 */
const BODY_COLOR = "#0a0708";

type PreparedTowers = {
  towers: Group[];
  material: MeshStandardMaterial;
  buildUniforms: BuildUniforms;
};

/**
 * gltf のシーンを四隅ぶん複製し、全メッシュを共有の黒マテリアルへ差し替える。
 * マテリアルには天守と同じ組み上げ + 投影光シェーダーを仕込む
 * (castleBuildShader.ts)。useGLTF のキャッシュを汚さないよう必ず clone する。
 * マテリアルと uniform は4体で1組を共有(生成も投影光も天守と同じ1本の
 * 組み上げ面 uBuildY で駆動する)。
 */
function usePreparedTowers(): PreparedTowers {
  const { scene } = useGLTF(MODEL_PATH);

  return useMemo(() => {
    const buildUniforms = createCastleBuildUniforms();
    const material = new MeshStandardMaterial({
      color: BODY_COLOR,
      roughness: 0.9,
      metalness: 0,
      // gltf マテリアルが doubleSided(薄い板組みなので裏面も要る)
      side: DoubleSide,
    });
    applyCastleBuildShader(material, buildUniforms, "corner-tower-build");

    const towers = CORNER_TOWER_XZ.map(() => {
      const clone = scene.clone(true);
      clone.traverse((child) => {
        if (child instanceof Mesh) child.material = material;
      });
      return clone;
    });

    return { towers, material, buildUniforms };
  }, [scene]);
}

type CornerTowersProps = {
  /** 城の底面を置くワールド座標。EdoCastle と同じ値を渡す */
  position?: [number, number, number];
  /** 組み上げ進行度(0〜1)。天守と同じ組み上げ面に乗せる */
  buildRef?: RefObject<number>;
  /** Reply の進行度(0〜1)。投影光の立ち上がりに使う */
  activationRef?: RefObject<number>;
  /** ステージ照明の点灯具合(0〜1)。曲が11秒に達してから立ち上がる */
  lightsRef?: RefObject<number>;
};

/**
 * 江戸城の四隅に立つ隅櫓。天守(EdoCastle)とまったく同じ黒 + 組み上げ +
 * 投影光で、下からボクセル状に湧いて現れる。背が低いぶん天守より早く建ちきる。
 */
export function CornerTowers({
  position = [0, 0, 0],
  buildRef,
  activationRef,
  lightsRef,
}: CornerTowersProps) {
  const { towers, material, buildUniforms } = usePreparedTowers();
  /*
    useFrame 内で useMemo の戻り値を直接触ると react-hooks/immutability に
    引っかかるため ref 経由で書く(EdoCastle と同じ手当て)。
  */
  const materialRef = useRef<MeshStandardMaterial | null>(null);
  const uniformsRef = useRef<BuildUniforms | null>(null);

  useEffect(() => {
    materialRef.current = material;
    uniformsRef.current = buildUniforms;
    return () => material.dispose();
  }, [material, buildUniforms]);

  useFrame(({ clock }) => {
    const activation = activationRef?.current ?? 0;
    const build = buildRef?.current ?? 1;
    const lights = lightsRef?.current ?? 1;

    /*
      uniform は天守と同じ内容を隅櫓ぶんにも書く(1棟1組なので別インスタンス)。
      組み上げ面 uBuildY は天守と同じワールド高さ。隅櫓は背が低いので
      build が 2/3 ほどで完全に現れ、そのまま天守の完成を待つ。
    */
    const uniforms = uniformsRef.current;
    if (uniforms) {
      uniforms.uProjStrength.value =
        activation * lights * PROJECTION_INTENSITY_MAX;
      uniforms.uProjTime.value = clock.elapsedTime;
      uniforms.uProjBaseY.value = position[1];
      uniforms.uProjTopY.value = position[1] + CASTLE_TOP_Y;
      uniforms.uBuildY.value = position[1] + build * BUILD_TOP_Y;
      uniforms.uBuildOn.value = build < 1 ? 1 : 0;
    }
  });

  return (
    <group position={position}>
      {towers.map((tower, i) => {
        const [cx, cz] = CORNER_TOWER_XZ[i];
        return (
          <group key={i} position={[cx, 0, cz]}>
            <primitive object={tower} scale={TOWER_SCALE} />
          </group>
        );
      })}
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
