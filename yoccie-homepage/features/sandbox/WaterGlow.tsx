"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color } from "three";
import type { Mesh, ShaderMaterial } from "three";

/*
  参考映像の、本殿の鳥居の真下だけがなめらかに光る水たまり。

  以前は無数の粒(WaterSparkles)を鳥居の外まで広くばら撒く形で作ったが、
  「そういうのじゃない」という指摘で撤去した。今回は鳥居の真下だけに
  範囲を絞り、粒状のちらつきではなく、なめらかな一枚の光の水たまりにする。

  MeshReflectorMaterial の水面(Sandbox3D の Water)はそのまま暗い海として残し、
  そのすぐ上に加算合成の円盤を1枚重ねて「光っている領域」だけを足す。
*/

/** 光が届く範囲(半径)。本殿の鳥居の足元だけに絞る */
const RADIUS = 12;
/** 水面(y=0)から浮かせる高さ。Zファイティングを避けるだけのわずかな量 */
const LIFT = 0.02;

/** 芯の色。いちばん明るいところ */
const CORE_COLOR = new Color("#8fe6ff");
/** 外に向かって溶けていく色 */
const EDGE_COLOR = new Color("#1c8fe0");

const vertexShader = /* glsl */ `
varying vec2 vPos;

void main() {
  // circleGeometry はXY平面に作られる。中心からの距離を測るためローカル座標を渡す
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/*
  粒状のちらつきを持たせず、なめらかな減衰だけで「水たまり」を作る。
  完全に静止していると照明のように見えてしまうため、呼吸のようにごく
  ゆっくり明滅させて、水面らしい柔らかさだけ足す。
*/
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uStrength;
uniform float uRadius;
uniform vec3 uCoreColor;
uniform vec3 uEdgeColor;
varying vec2 vPos;

void main() {
  float d = length(vPos) / uRadius;
  if (d > 1.0) discard;

  // 外周に向かってなめらかに消す
  float falloff = pow(1.0 - d, 2.2);
  vec3 color = mix(uEdgeColor, uCoreColor, falloff);

  // ごくゆっくりした呼吸。速すぎると粒のちらつきに見えてしまうため控えめにする
  float breathe = 0.9 + sin(uTime * 0.6) * 0.1;

  float intensity = falloff * breathe * uStrength;
  gl_FragColor = vec4(color * intensity, intensity);
}
`;

type WaterGlowProps = {
  /** 光の中心(鳥居の位置) */
  position: [number, number, number];
  /**
   * 星降る海の進行度(0〜1)を持つ ref。発光の強さと表示/非表示をここに連動させる。
   * 立ち上がり/収まりの間ずっと値が変わるため、数値 prop だと親ごと毎フレーム
   * 再レンダーされる。ref で受け取り useFrame の中で uniform へ入れる。
   */
  activationRef?: RefObject<number>;
  /**
   * 転調直前の暗転の減光係数(1=そのまま, <1=暗い)を持つ ref。
   * Sandbox3D が毎フレーム更新する。再レンダーを避けるため prop ではなく
   * ref で受け取り、useFrame の中で強さに掛ける。
   */
  dimRef?: RefObject<number>;
};

/** 本殿の鳥居の真下の水面を、なめらかな光の水たまりで照らす */
export function WaterGlow({ position, activationRef, dimRef }: WaterGlowProps) {
  const meshRef = useRef<Mesh>(null);
  // useMemoで作った値をuseFrame内で直接書き換えるとreact-hooks/immutabilityに
  // 引っかかるため、マテリアルはrefから触る(Bubbles.tsxと同じ手当て)
  const materialRef = useRef<ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uRadius: { value: RADIUS },
      uCoreColor: { value: CORE_COLOR },
      uEdgeColor: { value: EDGE_COLOR },
    }),
    [],
  );

  useFrame(({ clock }) => {
    // 進行度・転調直前の暗転はどちらもref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef?.current ?? 0;
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = clock.elapsedTime;
      materialRef.current.uniforms.uStrength.value =
        activation * (dimRef?.current ?? 1);
    }
    // 完全に消えている間は描画ごと省く(減光は明るさだけなので素の activation で見る)
    if (meshRef.current) meshRef.current.visible = activation > 0.01;
  });

  return (
    <mesh
      ref={meshRef}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[position[0], position[1] + LIFT, position[2]]}
    >
      <circleGeometry args={[RADIUS, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}
