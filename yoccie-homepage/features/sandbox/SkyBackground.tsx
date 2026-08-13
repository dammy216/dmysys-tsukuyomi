"use client";

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { EquirectangularReflectionMapping, SRGBColorSpace } from "three";

/**
 * aurora.png(オーロラ)を上、既存sky-vertical.pngの下半分(水面下用)を流用して縦連結した画像。
 * 全天球マッピングでは画像の上半分が天頂側(水面より上)、下半分が天底側(水面より下、隠れる)になるため、
 * オーロラだけが水面より上に表示される。
 */
const SKY_PATH = "/aurora-vertical.png";

/** 通常の画像(png/jpg)を全天球の空として貼る。反射(水面)にも同じ空が映り込む */
export function SkyBackground() {
  const loaded = useTexture(SKY_PATH);

  const texture = useMemo(() => {
    const clone = loaded.clone();
    clone.mapping = EquirectangularReflectionMapping;
    clone.colorSpace = SRGBColorSpace;
    clone.needsUpdate = true;
    return clone;
  }, [loaded]);

  return (
    <>
      <primitive object={texture} attach="background" />
      <primitive object={texture} attach="environment" />
    </>
  );
}

useTexture.preload(SKY_PATH);
