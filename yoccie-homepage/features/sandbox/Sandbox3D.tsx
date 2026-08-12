"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { MeshReflectorMaterial, OrbitControls, Stats } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { MiyajimaTorii } from "./MiyajimaTorii";
import { Lanterns } from "./Lanterns";
import { Credits } from "./Credits";

/** 反射する水面 */
function Water() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[60, 60]} />
      <MeshReflectorMaterial
        blur={[400, 120]}
        resolution={1024}
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
      <Canvas camera={{ position: [0, 2.5, 9], fov: 50 }} shadows>
        <color attach="background" args={["#1c2540"]} />
        <fog attach="fog" args={["#1c2540", 12, 40]} />

        <ambientLight intensity={0.35} />
        <directionalLight position={[6, 8, 4]} intensity={1.1} color="#ffb37a" />

        <Suspense fallback={null}>
          <MiyajimaTorii position={[0, 0.3, -2]} scale={0.18} />
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
