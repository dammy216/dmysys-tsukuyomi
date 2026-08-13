"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Matrix4, Mesh, Object3D } from "three";
import type { BufferGeometry, InstancedMesh, Material } from "three";

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
        scale: 0.14 + random() * 0.09,
        rotationY: random() * Math.PI * 2,
        phase: random() * Math.PI * 2,
        speed: 0.5 + random() * 0.4,
      });
    }
    return items;
  }, [count, radius, innerRadius]);
}

type LanternPart = {
  geometry: BufferGeometry;
  material: Material | Material[];
  /** モデルのルートから見たこのパーツのローカル変換行列 */
  localMatrix: Matrix4;
};

/** GLTFシーンを走査し、パーツ(メッシュ)ごとにジオメトリ・マテリアル・ローカル行列を集める。
 * InstancedMeshはパーツ単位でしか作れない(1個のInstancedMeshは1ジオメトリ+1マテリアル)ため、
 * 灯籠モデルを丸ごとcloneする代わりに、パーツごとに55個分のインスタンスをまとめて描画する。 */
function useLanternParts(): LanternPart[] {
  const { scene } = useGLTF(MODEL_PATH);

  return useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    const parts: LanternPart[] = [];
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        parts.push({
          geometry: child.geometry,
          material: child.material,
          localMatrix: child.matrixWorld.clone(),
        });
      }
    });
    return parts;
  }, [scene]);
}

type LanternsProps = {
  count?: number;
  radius?: number;
  innerRadius?: number;
};

/**
 * 水面に浮かぶ灯籠群。パーツごとにInstancedMeshでまとめて描画する
 * (灯籠55個 x パーツ13個 = 715描画コールだったのを、パーツ数=13描画コールまで削減)。
 * Old Japanese Lamp : Andon (CC-BY-4.0)
 * https://sketchfab.com/3d-models/old-japanese-lamp-andon-0f5cff9fb78b4657b26ddefff4e10fcf
 * by K (https://sketchfab.com/tanaka.ko91)
 */
export function Lanterns({
  count = 500,
  radius = 80,
  innerRadius = 2.5,
}: LanternsProps) {
  const parts = useLanternParts();
  const items = useLanternField(count, radius, innerRadius);
  const meshRefs = useRef<(InstancedMesh | null)[]>([]);
  const dummy = useMemo(() => new Object3D(), []);
  const partWorldMatrix = useMemo(() => new Matrix4(), []);

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;

    items.forEach((data, i) => {
      const t = elapsed * data.speed + data.phase;
      dummy.position.set(data.x, BASE_Y + Math.sin(t) * 0.04, data.z);
      dummy.rotation.set(0, data.rotationY, 0);
      dummy.scale.setScalar(data.scale);
      dummy.updateMatrix();

      parts.forEach((part, partIndex) => {
        partWorldMatrix.multiplyMatrices(dummy.matrix, part.localMatrix);
        meshRefs.current[partIndex]?.setMatrixAt(i, partWorldMatrix);
      });
    });

    meshRefs.current.forEach((mesh) => {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <>
      {parts.map((part, i) => (
        <instancedMesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          args={[part.geometry, part.material, count]}
          frustumCulled={false}
        />
      ))}
    </>
  );
}

useGLTF.preload(MODEL_PATH);
