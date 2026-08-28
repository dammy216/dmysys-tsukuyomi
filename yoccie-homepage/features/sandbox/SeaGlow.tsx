"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color } from "three";
import type { Mesh, ShaderMaterial } from "three";

/*
  星降る海の間、鳥居のまわりの海面が柔らかな光でゆらゆら満ちて見える表現。

  波の凹凸をリアルに再現する方向(WaterWaves=頂点変位、normalMap=反射の歪み)は
  どちらも「波」としては正確だが、求めているのは写実的な波ではなく
  「光の演出による神秘的な雰囲気」という指摘を受けて方針転換した。
  最初のcausticBand版はpowで尖らせすぎて「変な模様」に見え、次に
  なだらかなsinだけにしたら今度は「わかりにくい」薄さになった。
  今回は向きのある大きなうねり(bigWave)+細かい揺らぎ(smallRipple)の
  2層構成にして、波っぽい方向性のある動きと複雑さを足しつつ、
  causticBandほど尖った縞にはしない中間の強さに調整している。

  頂点は一切動かさない、ただの円盤(circleGeometry)。
  MeshReflectorMaterial の水面(Sandbox3D の Water)はそのまま暗い海として残し、
  そのすぐ上に加算合成の円盤を1枚重ねて「光っている領域」だけを足す。
*/

/** 光が届く範囲(半径)。Water(circleGeometry半径400)の見える範囲まで広げる */
const RADIUS = 200;
/** 水面(y=0)から浮かせる高さ。Zファイティングを避けるだけのわずかな量 */
const LIFT = 0.03;

/*
  色は足元の水たまり(WaterGlow)と同じ系統で揃える。
*/
const CORE_COLOR = new Color("#5294f7");
const EDGE_COLOR = new Color("#8004d3");

const vertexShader = /* glsl */ `
varying vec2 vPos;

void main() {
  // circleGeometry はXY平面に作られる。中心からの距離を測るためローカル座標を渡す
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/*
  柔らかいだけだと何が起きているか分かりにくかったため、2層構成にして
  「波っぽさ」と「複雑さ」を足す。

  1. bigWave — 一定方向へ寄せてくるような、向きのある大きなうねり。
     smoothstepでややコントラストを付け、「帯」として視認できるようにする
     (ただしcausticBandのpow(v,3)ほど尖らせず、輪郭は柔らかいまま)。
  2. smallRipple — 細かく速い揺らぎ。軽くpowで持ち上げてキラッとした
     質感を足し、大きなうねりだけでは単調になるところに複雑さを加える。

  2つを別スケール・別速度で重ねることで、単一のsinよりずっと表情豊かな
  「揺らめく光」になる。
*/
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uStrength;
uniform float uRadius;
uniform vec3 uCoreColor;
uniform vec3 uEdgeColor;
varying vec2 vPos;

// 向きのある大きなうねり。1方向に流れる帯を2つ重ねて奥行きを出す
float bigWave(vec2 p, float t) {
  float v = sin(p.x * 0.16 + p.y * 0.08 - t * 0.55) * 0.6
          + sin(p.x * 0.06 - p.y * 0.14 - t * 0.35) * 0.4;
  return v * 0.5 + 0.5;
}

// 細かく速い揺らぎ。causticBandと同じ「波の中に波を仕込む」考え方だが弱めにする
float smallRipple(vec2 p, float t) {
  float v = sin(p.x * 0.5 + t * 1.1 + sin(p.y * 0.4 - t * 0.9) * 1.2)
          + sin(p.y * 0.45 - t * 0.8 + sin(p.x * 0.35 + t * 0.7) * 1.0);
  return v * 0.5 + 0.5;
}

void main() {
  float d = length(vPos) / uRadius;
  if (d > 1.0) discard;

  // 外周に向かってなめらかに消す
  float falloff = pow(1.0 - d, 1.6);

  // 大きなうねりは帯として見えるようコントラストを付ける
  float big = smoothstep(0.15, 0.9, bigWave(vPos, uTime));
  // 細かい揺らぎは軽くpowで持ち上げてキラつき感を足す(強く尖らせすぎない)
  float small = pow(max(smallRipple(vPos * 0.6, uTime), 0.0), 1.6);

  float glow = clamp(big * 0.7 + small * 0.5, 0.0, 1.0);

  // ゆっくりした全体の呼吸。神秘的な「満ちては引く」感じを足す
  float breathe = 0.8 + sin(uTime * 0.3) * 0.2;

  vec3 color = mix(uEdgeColor, uCoreColor, glow);
  float intensity = glow * falloff * breathe * uStrength * 0.5;

  gl_FragColor = vec4(color * intensity, intensity);
}
`;

type SeaGlowProps = {
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

/** 星降る海の間、鳥居のまわりの海面を波っぽい向きのある揺らぎと細かい光のきらつきで満たす */
export function SeaGlow({ position, activationRef, dimRef }: SeaGlowProps) {
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
