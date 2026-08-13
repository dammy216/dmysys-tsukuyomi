"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { MeshReflectorMaterial, OrbitControls, Stats } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { MiyajimaTorii } from "./MiyajimaTorii";
import { Lanterns } from "./Lanterns";
import { Fish } from "./Fish";
import { SkyBackground } from "./SkyBackground";
import { Credits } from "./Credits";

/** 反射する水面 */
function Water() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <circleGeometry args={[400, 64]} />
      <MeshReflectorMaterial
        blur={[200, 60]}
        resolution={512}
        mixBlur={1}
        mixStrength={35}
        roughness={0.6}
        depthScale={1}
        minDepthThreshold={0.85}
        color="#0a1a2e"
        metalness={0.4}
      />
    </mesh>
  );
}

/** 3Dサンドボックス。新しい表現を試すための実験場（ここを自由に書き換えていく） */
export function Sandbox3D() {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        background: "#0b1626",
      }}
    >
      <Canvas camera={{ position: [0, 3, 11], fov: 50 }}>
        <color attach="background" args={["#1c2540"]} />
        <fog attach="fog" args={["#1c2540", 20, 300]} />

        <ambientLight intensity={0.7} color="#5a6fa8" />
        <directionalLight position={[9, 14, 5]} intensity={2} color="#bcd3ff" />

        <Suspense fallback={null}>
          <SkyBackground />
          <MiyajimaTorii position={[0, 0, -2]} scale={0.18} />
          <Fish
            position={[0, 0, -2]}
            radius={6.5}
            height={5.2}
            heightSpread={8}
            fishScale={0.02}
            showSwirl={false}
            count={60}
          />
          <Fish
            position={[0, 0, -2]}
            radius={9.5}
            height={10.2}
            heightSpread={8}
            fishScale={0.02}
            showSwirl={false}
            count={60}
          />
           <Fish
            position={[0, 0, -2]}
            radius={12.5}
            height={13.2}
            heightSpread={8}
            fishScale={0.02}
            showSwirl={false}
            count={60}
          />
          <Lanterns />
          <Water />
        </Suspense>

        <OrbitControls makeDefault enableDamping target={[0, 2, -2]} />
        <Stats />

        <EffectComposer>
          <Bloom mipmapBlur luminanceThreshold={0.4} intensity={0.8} />
        </EffectComposer>
      </Canvas>

      <Credits />
    </div>
  );
}
