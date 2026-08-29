"use client";

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { EquirectangularReflectionMapping, SRGBColorSpace } from "three";

/** 空の見た目パターン。黄昏時(sky-vertical)と夜(aurora-vertical)を切り替えられる */
export type SkyVariant = "dusk" | "night";

/**
 * sky-vertical.png(黄昏時)、aurora.png(オーロラ)を上半分に使ったaurora-vertical.png(夜)。
 * どちらも下半分は水面下用の画像を流用して縦連結してある。
 * 全天球マッピングでは画像の上半分が天頂側(水面より上)、下半分が天底側(水面より下、隠れる)になる。
 */
const SKY_PATHS: Record<SkyVariant, string> = {
  dusk: "/images/sky-vertical.png",
  night: "/images/aurora-vertical.png",
};

/** 通常の画像(png/jpg)を全天球の空として貼る。反射(水面)にも同じ空が映り込む */
export function SkyBackground({ variant }: { variant: SkyVariant }) {
  const loaded = useTexture(SKY_PATHS[variant]);

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

useTexture.preload(SKY_PATHS.dusk);
useTexture.preload(SKY_PATHS.night);
