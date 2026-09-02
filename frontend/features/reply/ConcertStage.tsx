"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  ShaderMaterial,
} from "three";
import {
  REPLY_GLOW_COLOR,
  STAGE_RADIUS,
  STAGE_THICKNESS,
} from "./constants";

/**
 * 甲板の上に描く光の模様。中心から外へ向かう同心円と、縁での強い立ち上がりで
 * 「ライブステージの床」を表す。板ポリ1枚 + シェーダーなので描画コストは無視できる。
 *
 * uTime で同心円をゆっくり外へ流し、uActivation で全体の明るさを出し入れする。
 */
const DECK_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DECK_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uActivation;
  varying vec2 vUv;

  void main() {
    // 円盤の中心からの距離(0=中心, 1=縁)
    float r = length(vUv - 0.5) * 2.0;
    if (r > 1.0) discard;

    // 外へ流れていく同心円。数が多すぎると干渉縞になるので控えめに
    float rings = 0.5 + 0.5 * sin((r * 14.0 - uTime * 1.1) * 3.14159);
    // 中心ほど明るく、縁へ向かって落とす下地
    float base = smoothstep(1.0, 0.15, r) * 0.35;
    // 縁のライン。ステージの輪郭をはっきり見せる
    float rim = smoothstep(0.86, 0.99, r) * smoothstep(1.0, 0.97, r) * 2.2;

    float intensity = (base + rings * base * 0.9 + rim) * uActivation;
    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`;

type ConcertStageProps = {
  /** 甲板の上面を置くワールド座標 */
  position?: [number, number, number];
  /**
   * Reply の進行度(0〜1)を持つ ref。甲板の光と縁のリングをこれに連動させる。
   * 立ち上がり/収まりの間ずっと値が変わるため ref で受け取り useFrame で読む
   * (数値 prop だと親ごと毎フレーム再レンダー)。
   */
  activationRef?: RefObject<number>;
};

/**
 * 天守の上に張り出すライブステージ。宮島の鳥居を載せる円形の甲板。
 *
 * モデルが無いので Three.js で組んでいる:
 * - 甲板本体: 黒く沈んだシリンダー(夜空に対して影として効く)
 * - 甲板の上面: シェーダーの光の円盤(同心円が外へ流れる)
 * - 縁のリング: 加算合成の赤いライン
 */
export function ConcertStage({
  position = [0, 0, 0],
  activationRef,
}: ConcertStageProps) {
  const deckMaterialRef = useRef<ShaderMaterial>(null);
  const rimMaterialRef = useRef<MeshBasicMaterial>(null);

  /*
    uniforms は毎フレーム値を書き換えるだけで参照は作り直さない。
    useMemo の戻り値を useFrame から直接触ると immutability lint に
    引っかかるので、materialRef 経由(material.uniforms)で書き換える。
  */
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(REPLY_GLOW_COLOR) },
      uTime: { value: 0 },
      uActivation: { value: 0 },
    }),
    [],
  );

  useFrame(({ clock }) => {
    // 進行度はref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef?.current ?? 0;
    const deck = deckMaterialRef.current;
    if (deck) {
      deck.uniforms.uTime.value = clock.elapsedTime;
      deck.uniforms.uActivation.value = activation;
    }
    if (rimMaterialRef.current) rimMaterialRef.current.opacity = activation;
  });

  return (
    <group position={position}>
      {/* 甲板本体。上面がちょうど position の高さに来るよう半分だけ下げる */}
      <mesh position={[0, -STAGE_THICKNESS / 2, 0]}>
        <cylinderGeometry
          args={[STAGE_RADIUS, STAGE_RADIUS * 0.94, STAGE_THICKNESS, 64]}
        />
        <meshStandardMaterial color="#0d1220" roughness={0.65} metalness={0.35} />
      </mesh>

      {/* 甲板の上面に敷く光の円盤。Z-fighting を避けて少しだけ浮かせる */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[STAGE_RADIUS * 2, STAGE_RADIUS * 2]} />
        <shaderMaterial
          ref={deckMaterialRef}
          uniforms={uniforms}
          vertexShader={DECK_VERTEX}
          fragmentShader={DECK_FRAGMENT}
          transparent
          depthWrite={false}
          toneMapped={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>

      {/* 縁を一周する赤いライン。甲板の輪郭を夜空から切り出す */}
      <mesh position={[0, -STAGE_THICKNESS / 2, 0]}>
        <cylinderGeometry
          args={[STAGE_RADIUS * 1.005, STAGE_RADIUS * 1.005, STAGE_THICKNESS * 0.45, 64, 1, true]}
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
