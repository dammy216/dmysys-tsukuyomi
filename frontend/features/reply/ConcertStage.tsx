"use client";

import { useRef, type RefObject } from "react";
import { AdditiveBlending, DoubleSide, type MeshBasicMaterial } from "three";
import { useFrame } from "@react-three/fiber";
import { REPLY_GLOW_COLOR, STAGE_RADIUS, STAGE_THICKNESS } from "./constants";

/** 縁のライトアップの最大の明るさ。強すぎると黒い甲板の質感が消えるので控えめに */
const RIM_OPACITY_MAX = 0.7;
/**
 * 縁のリングを甲板の外側へどれだけ張り出させるか(STAGE_RADIUSに対する倍率)。
 * 以前は1.005(甲板の縁とほぼ面一)で、ほとんど目立たなかった。ユーザー指定
 * 「赤い枠の部分を前に出す」を、外側へはっきり張り出す縁取りとして実装する。
 */
const RIM_RADIUS_SCALE = 0.8;
/**
 * 縁のリングを南(ワールド+Z)へどれだけずらすか。カメラは初期姿勢で
 * -Zを向く(=北。cameraHeading.tsコメント参照)ので、+Z側(南)がカメラの
 * 手前側になる。リングの中心だけを南へオフセットすることで、南側は
 * 甲板の縁からさらに張り出し、北側は逆に控えめになる(ユーザー指定
 * 「赤い枠は南方向に動かして」)。
 */
const RIM_SOUTH_OFFSET = STAGE_RADIUS * 1.2

type ConcertStageProps = {
  /** 甲板の上面を置くワールド座標 */
  position?: [number, number, number];
  /**
   * Reply の進行度(0〜1)を持つ ref。縁のライトアップの明るさをこれに
   * 連動させる。立ち上がり/収まりの間ずっと変わるため ref で受け取り
   * useFrame で読む(数値 prop だと親ごと毎フレーム再レンダー)。
   */
  activationRef?: RefObject<number>;
};

/**
 * 天守の上に張り出すライブステージ。円形の甲板に、宮島鳥居(小×2)と
 * 大鳥居(ToriiGate、中央)を横一列に載せる構成が指定
 * (鳥居側の配置は SceneContents.tsx 参照)。
 *
 * シンプルな黒い甲板+ 縁のわずかなライトアップ。真っ黒だけだと寂しい
 * という指定で、以前の派手な光る円盤・縁取りは戻さず、輪郭を淡く
 * 浮かせる程度のリングだけ足してある。
 */
export function ConcertStage({
  position = [0, 0, 0],
  activationRef,
}: ConcertStageProps) {
  const rimMaterialRef = useRef<MeshBasicMaterial>(null);

  useFrame(() => {
    // 進行度はref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef?.current ?? 0;
    if (rimMaterialRef.current) {
      rimMaterialRef.current.opacity = activation * RIM_OPACITY_MAX;
    }
  });

  return (
    <group position={position}>
      {/* 甲板本体。上面がちょうど position の高さに来るよう半分だけ下げる */}
      <mesh position={[0, -STAGE_THICKNESS / 2, 0]}>
        <cylinderGeometry
          args={[STAGE_RADIUS, STAGE_RADIUS * 0.94, STAGE_THICKNESS, 64]}
        />
        <meshStandardMaterial color="#0a0a0a" roughness={0.8} metalness={0} />
      </mesh>

      {/* 縁を一周するライン。甲板の外側へ張り出させ、赤い枠として南(手前)へ出す */}
      <mesh position={[0, -STAGE_THICKNESS / 2, RIM_SOUTH_OFFSET]}>
        <cylinderGeometry
          args={[
            STAGE_RADIUS * RIM_RADIUS_SCALE,
            STAGE_RADIUS * RIM_RADIUS_SCALE,
            STAGE_THICKNESS * 0.45,
            64,
            1,
            true,
          ]}
        />
        {/* opacity は useFrame で activation を反映して毎フレーム上書きする。ここは初期値 */}
        <meshBasicMaterial
          ref={rimMaterialRef}
          color={REPLY_GLOW_COLOR}
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
