"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { DirectionalLight } from "three";
import { REPLY_MOON_ALTITUDE, REPLY_MOON_AZIMUTH } from "./constants";

/*
  Reply の月明かり。**月そのものは夜空テクスチャ側に星と同じレイヤーで
  描いてある**(SkyBackground の useReplySkyTexture)。ここはその月の向きから
  当てる directionalLight だけを持つ ―― 天守や鳥居の黒い面に冷たいリムを
  乗せて「月明かりに照らされている」感を出す。

  向き(9月・21時・満月 ≒ 高度35°・方位135°南東)は reply/constants.ts の
  REPLY_MOON_* で夜空テクスチャと共有する。強さは Reply の出具合で上下。
*/

/** 光源を置く距離(向きだけ合っていればよい。カメラ far 内の適当な遠さ) */
const LIGHT_DISTANCE = 800;
/** 月明かりの色(寒色の白)と最大強度(Reply 全開時) */
const MOONLIGHT_COLOR = "#aebfe0";
const MOONLIGHT_MAX = 0.9;

const LIGHT_POS: [number, number, number] = [
  Math.cos(REPLY_MOON_ALTITUDE) * Math.sin(REPLY_MOON_AZIMUTH) * LIGHT_DISTANCE,
  Math.sin(REPLY_MOON_ALTITUDE) * LIGHT_DISTANCE,
  -Math.cos(REPLY_MOON_ALTITUDE) * Math.cos(REPLY_MOON_AZIMUTH) * LIGHT_DISTANCE,
];

type ReplyMoonProps = {
  /** 天守の底面のワールド座標。EdoCastle と同じ値を渡す(光の target 基準) */
  position?: [number, number, number];
  /** Reply の出具合(0〜1)。月明かりのフェードに使う */
  activationRef: RefObject<number>;
};

/**
 * Reply の月明かり(directionalLight)。`{replyVisible && ...}` の中に置く。
 * 月の絵は SkyBackground(夜空テクスチャ)側。
 */
export function ReplyMoon({
  position = [0, 0, 0],
  activationRef,
}: ReplyMoonProps) {
  const lightRef = useRef<DirectionalLight>(null);

  useFrame(() => {
    if (lightRef.current) {
      lightRef.current.intensity = (activationRef.current ?? 0) * MOONLIGHT_MAX;
    }
  });

  return (
    <group position={position}>
      {/* target 既定 (0,0,0) = この group の原点(天守の底面) */}
      <directionalLight
        ref={lightRef}
        position={LIGHT_POS}
        color={MOONLIGHT_COLOR}
        intensity={0}
      />
    </group>
  );
}
