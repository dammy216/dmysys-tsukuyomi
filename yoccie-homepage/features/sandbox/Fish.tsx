"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF, useAnimations } from "@react-three/drei";
import { Box3, Group, Vector3 } from "three";

const MODEL_PATH = "/3DModel/fish_hologram/scene.gltf";
const CLIP_NAME = "Take 001";

type FishProps = {
  position?: [number, number, number];
  scale?: number;
  /** 個々の魚の大きさ(1が原寸)。渦の半径はそのままに魚だけ縮小できる */
  fishScale?: number;
  /** リング状の光の渦を表示するか */
  showSwirl?: boolean;
};

/**
 * Fish Hologram (CC-BY-4.0)
 * https://sketchfab.com/3d-models/fish-hologram-adc420289ced44b79cf3142e071d680a
 * by Pat Sipes (https://sketchfab.com/pasipes)
 *
 * モデル自体が魚6匹+リング状の光の渦として作られているため、
 * 鳥居を囲むように配置するだけで竜巻状に泳ぐ演出になる。
 * ルートノードの原点が渦の中心からズレているため、
 * バウンディングボックスの中心を原点に合わせ直してから配置する。
 */
export function Fish({
  position = [0, 0, 0],
  scale = 1,
  fishScale = 1,
  showSwirl = true,
}: FishProps) {
  const outer = useRef<Group>(null);
  const { scene, animations } = useGLTF(MODEL_PATH);

  const centeredScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    const center = new Box3().setFromObject(clone).getCenter(new Vector3());
    clone.position.sub(center);
    return clone;
  }, [scene]);

  useEffect(() => {
    centeredScene.traverse((child) => {
      if (/^swirl\d*$/.test(child.name)) {
        child.visible = showSwirl;
      } else if (/^fishA\d*$/.test(child.name)) {
        child.scale.setScalar(fishScale);
      }
    });
  }, [centeredScene, fishScale, showSwirl]);

  const { actions } = useAnimations(animations, outer);

  useEffect(() => {
    const action = actions[CLIP_NAME];
    action?.reset().play();
    return () => {
      action?.stop();
    };
  }, [actions]);

  return (
    <group ref={outer} position={position} scale={scale}>
      <primitive object={centeredScene} />
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
