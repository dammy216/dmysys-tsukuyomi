"use client";

import { MeshReflectorMaterial } from "@react-three/drei";

/** 反射する水面 */
export function Water() {
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
