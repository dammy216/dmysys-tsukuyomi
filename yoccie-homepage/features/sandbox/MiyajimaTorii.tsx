"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { Group } from "three";

const MODEL_PATH = "/3DModel/miyajima_torii/scene.gltf";

/** Sketchfabのテクセル密度確認用に同梱されている40x40の平面（見た目には不要） */
const TEXEL_REFERENCE_NODE_NAME = "Object_39";

/** シーンを複製し、テクセル確認用の平面だけ非表示にする */
function usePreparedScene(): Group {
  const { scene } = useGLTF(MODEL_PATH);

  return useMemo(() => {
    const clone = scene.clone(true);
    const texelPlane = clone.getObjectByName(TEXEL_REFERENCE_NODE_NAME);
    if (texelPlane) texelPlane.visible = false;
    return clone;
  }, [scene]);
}

type MiyajimaToriiProps = {
  position?: [number, number, number];
  scale?: number;
};

/**
 * Miyajima Torii (CC-BY-4.0)
 * https://sketchfab.com/3d-models/miyajima-torii-584bdf5ca606482289f1fc84f0c708cf
 * by RMSHR (https://sketchfab.com/remy.sohier)
 */
export function MiyajimaTorii({
  position = [0, 0, 0],
  scale = 1,
}: MiyajimaToriiProps) {
  const scene = usePreparedScene();
  return <primitive object={scene} position={position} scale={scale} />;
}

useGLTF.preload(MODEL_PATH);
