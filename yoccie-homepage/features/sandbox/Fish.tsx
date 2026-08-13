"use client";

import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Box3, Group, Mesh, MeshStandardMaterial, Vector3 } from "three";

const MODEL_PATH = "/3DModel/fish_hologram/scene.gltf";
const CLIP_NAME = "Take 001";
/** 参考画像のような、ピンク・シアン・黄緑・水色・オレンジが混ざった柔らかいネオンのボケ感パレット */
const COLOR_PALETTE = ["#fa0577", "#4de8d8", "#c8e356", "#7ec8ff", "#e09109"];
/** 鳥居の周りを1周するのにかかる角速度(rad/秒) */
const ORBIT_SPEED = 0.2;
/**
 * モデル本来のアニメーションは生の単位で縦に数十単位動く(渦が縦に伸びて埋まる原因)。
 * ここで内部の動きの振れ幅だけ小さく縮め、見た目の魚のサイズはfishScaleで別途戻す
 * (魚のメッシュ自体のscaleに fishScale / RAW_SPREAD_SCALE を掛けて相殺するため、
 * fishScaleの値がそのまま最終的な見た目のサイズになる)。
 */
const RAW_SPREAD_SCALE = 0.15;
/** 半径の揺れ幅(渦が膨らんだり縮んだりする) */
const RADIUS_WOBBLE = 1.2;
/** 高さの揺れ幅(竜巻のようにゆらゆら上下する) */
const HEIGHT_WOBBLE = 0.8;
/**
 * 元モデルは1セット内の魚6匹がX・Zが同一でYだけ違う完全な直線状に並んでいるため、
 * そのままだと綺麗に整列しすぎて見える。ノード名+角度から決定的な乱数を作り、
 * 生の座標系(RAW_SPREAD_SCALEで縮める前)でX・Zに散らす。
 */
const POSITION_JITTER = 10;

function seededRandom(seed: number) {
  let a = seed | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

type FishInstanceProps = {
  angle: number;
  radius: number;
  baseHeight: number;
  fishScale: number;
  showSwirl: boolean;
  color: string;
};

/**
 * 渦1セット(魚6匹+リング)。鳥居の中心を軸に周回しつつ、
 * 半径と高さをそれぞれ別の周期で揺らして竜巻のような渦を描く
 * (半径だけ・高さだけの単振動だと綺麗な円/直線になってしまうため、
 * 速さの違う2つの正弦波を組み合わせて不規則な渦の揺らぎを出している)。
 */
function FishInstance({ angle, radius, baseHeight, fishScale, showSwirl, color }: FishInstanceProps) {
  const orbit = useRef<Group>(null);
  const wander = useRef<Group>(null);
  const { scene, animations } = useGLTF(MODEL_PATH);

  // 揺れの位相・速さをセットごとにランダム化する(角度だけで揃えると全セットが同期して
  // 綺麗な帯に見えてしまうため)
  const wobble = useMemo(() => {
    const seed = hashString(angle.toFixed(4));
    return {
      radiusPhase: seededRandom(seed + 10) * Math.PI * 2,
      radiusFreq: 0.35 + seededRandom(seed + 11) * 0.4,
      heightPhase: seededRandom(seed + 20) * Math.PI * 2,
      heightFreq: 0.25 + seededRandom(seed + 21) * 0.35,
    };
  }, [angle]);

  const centeredScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.updateMatrixWorld(true);
    const center = new Box3().setFromObject(clone).getCenter(new Vector3());
    clone.position.sub(center);
    const instanceSeed = hashString(angle.toFixed(4));
    clone.traverse((child) => {
      if (/^fishA\d*$/.test(child.name)) {
        // 6匹が一直線に並んでいるのを崩すためX・Zにランダムなズレを加える
        const seed = instanceSeed + hashString(child.name);
        child.position.x += (seededRandom(seed) - 0.5) * POSITION_JITTER;
        child.position.z += (seededRandom(seed + 1) - 0.5) * POSITION_JITTER;
      } else if (child instanceof Mesh && /^fishA/.test(child.name) && !Array.isArray(child.material)) {
        // 元マテリアルはKHR_materials_pbrSpecularGlossiness由来でcolorが効かないため、
        // テクスチャ(発光マップ・法線マップ)だけ引き継いだ素のMeshStandardMaterialに差し替える
        const original = child.material as MeshStandardMaterial;
        child.material = new MeshStandardMaterial({
          emissiveMap: original.emissiveMap ?? null,
          normalMap: original.normalMap ?? null,
          transparent: original.transparent,
          opacity: original.opacity,
          side: original.side,
          emissiveIntensity: 2.5,
        });
      }
    });
    return clone;
  }, [scene, angle]);

  useEffect(() => {
    const meshScale = fishScale / RAW_SPREAD_SCALE;
    centeredScene.traverse((child) => {
      if (/^swirl\d*$/.test(child.name)) {
        child.visible = showSwirl;
      } else if (/^fishA\d*$/.test(child.name)) {
        child.scale.setScalar(meshScale);
      }
    });
  }, [centeredScene, fishScale, showSwirl]);

  useEffect(() => {
    centeredScene.traverse((child) => {
      if (!(child instanceof Mesh) || !/^fishA/.test(child.name) || Array.isArray(child.material)) {
        return;
      }
      const material = child.material as MeshStandardMaterial;
      material.color?.set(color);
      material.emissive?.set(color);
    });
  }, [centeredScene, color]);

  const { actions } = useAnimations(animations, wander);

  useEffect(() => {
    const action = actions[CLIP_NAME];
    if (!action) return;
    action.reset().play();
    return () => {
      action.stop();
    };
  }, [actions]);

  useFrame(({ clock }) => {
    if (!orbit.current) return;
    const elapsed = clock.elapsedTime;
    const t = angle + elapsed * ORBIT_SPEED;
    const r = radius + Math.sin(elapsed * wobble.radiusFreq + wobble.radiusPhase) * RADIUS_WOBBLE;
    const y = baseHeight + Math.sin(elapsed * wobble.heightFreq + wobble.heightPhase) * HEIGHT_WOBBLE;
    orbit.current.position.set(Math.cos(t) * r, y, Math.sin(t) * r);
  });

  return (
    <group ref={orbit}>
      <group ref={wander} scale={RAW_SPREAD_SCALE}>
        <primitive object={centeredScene} />
      </group>
    </group>
  );
}

type FishProps = {
  /** 鳥居の中心位置 */
  position?: [number, number, number];
  /** 個々の魚の最終的な大きさ(見た目のサイズ。内部の縮小とは独立) */
  fishScale?: number;
  /** リング状の光の渦を表示するか(最初の1セットのみ) */
  showSwirl?: boolean;
  /** 渦セットの複製数。増やすほど魚の総数が増える(1セット=魚6匹) */
  count?: number;
  /** 鳥居の中心から円軌道までの距離 */
  radius?: number;
  /** 渦の中心の高さ(鳥居の中心position基準の相対値) */
  height?: number;
  /** 渦セットを縦方向にどれだけ散らすか(竜巻のように帯状に積み重ねる) */
  heightSpread?: number;
};

/**
 * Fish Hologram (CC-BY-4.0)
 * https://sketchfab.com/3d-models/fish-hologram-adc420289ced44b79cf3142e071d680a
 * by Pat Sipes (https://sketchfab.com/pasipes)
 *
 * count個の渦セットを鳥居の上空で縦の帯に散らして配置し、
 * 周回しながら半径・高さを揺らして竜巻のような渦を描く。
 * リングは重なると煩雑になるため最初の1セットのみ表示する。
 */
export function Fish({
  position = [0, 0, 0],
  fishScale = 1,
  showSwirl = false,
  count = 8,
  radius = 4.5,
  height = 3,
  heightSpread = 3,
}: FishProps) {
  const instances = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        angle: (i / count) * Math.PI * 2,
        baseHeight: height + (i / Math.max(count - 1, 1) - 0.5) * heightSpread,
        color: COLOR_PALETTE[i % COLOR_PALETTE.length],
      })),
    [count, height, heightSpread],
  );

  return (
    <group position={position}>
      {instances.map((inst, i) => (
        <FishInstance
          key={i}
          angle={inst.angle}
          radius={radius}
          baseHeight={inst.baseHeight}
          fishScale={fishScale}
          showSwirl={showSwirl && i === 0}
          color={inst.color}
        />
      ))}
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
