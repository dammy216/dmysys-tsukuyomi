"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { Group, Object3D } from "three";

const MODEL_PATH = "/3DModel/old_japanese_lamp__andon/scene.gltf";
const BASE_Y = 0.05;
const FIELD_SEED = 1337;

type LanternData = {
  x: number;
  z: number;
  scale: number;
  rotationY: number;
  phase: number;
  speed: number;
};

/** シード値から0〜1の疑似乱数を返す決定的なジェネレータ（mulberry32）。
 * useMemo内でMath.random()を直接呼ぶとReact Compilerのpurityルールに引っかかるため使う。 */
function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useLanternField(
  count: number,
  radius: number,
  innerRadius: number,
): LanternData[] {
  return useMemo(() => {
    const random = mulberry32(FIELD_SEED + count);
    const items: LanternData[] = [];
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const r = innerRadius + random() * (radius - innerRadius);
      items.push({
        x: Math.cos(angle) * r,
        z: Math.sin(angle) * r,
        scale: 0.4 + random() * 0.25,
        rotationY: random() * Math.PI * 2,
        phase: random() * Math.PI * 2,
        speed: 0.5 + random() * 0.4,
      });
    }
    return items;
  }, [count, radius, innerRadius]);
}

/** 灯籠1個。テンプレートのGLTFシーンを複製して独立に浮遊アニメーションさせる */
function Lantern({ template, data }: { template: Object3D; data: LanternData }) {
  const groupRef = useRef<Group>(null);
  const model = useMemo(() => template.clone(true), [template]);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const t = clock.elapsedTime * data.speed + data.phase;
    groupRef.current.position.y = BASE_Y + Math.sin(t) * 0.04;
  });

  return (
    <group
      ref={groupRef}
      position={[data.x, BASE_Y, data.z]}
      rotation={[0, data.rotationY, 0]}
      scale={data.scale}
    >
      <primitive object={model} />
    </group>
  );
}

type LanternsProps = {
  count?: number;
  radius?: number;
  innerRadius?: number;
};

/**
 * 水面に浮かぶ灯籠群。
 * Old Japanese Lamp : Andon (CC-BY-4.0)
 * https://sketchfab.com/3d-models/old-japanese-lamp-andon-0f5cff9fb78b4657b26ddefff4e10fcf
 * by K (https://sketchfab.com/tanaka.ko91)
 */
export function Lanterns({
  count = 28,
  radius = 9,
  innerRadius = 2.5,
}: LanternsProps) {
  const { scene } = useGLTF(MODEL_PATH);
  const items = useLanternField(count, radius, innerRadius);

  return (
    <>
      {items.map((data, i) => (
        <Lantern key={i} template={scene} data={data} />
      ))}
    </>
  );
}

useGLTF.preload(MODEL_PATH);
