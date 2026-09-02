"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D } from "three";
import type { InstancedMesh } from "three";

/**
 * 灯籠の底が来る高さ。水面に接地させず、少しだけ浮かせる。
 * 水面との間に隙間ができることで、映り込みが本体から離れて
 * 「浮いている」ように見える。
 */
const BASE_Y = -0.02;
const FIELD_SEED = 1337;

/*
  灯籠の寸法(スケール1のとき)。下に黒い台、その上に光る本体を載せた
  だけの構成。3Dモデルは使わず箱2つで作る。
*/
/** 下の台。本体より一回り大きくして、載っているように見せる */
const BASE_SIZE = 0.5;
const BASE_HEIGHT = 0.1;
/** 光る本体。紙貼りの提灯のつもりなので縦長にする */
const BODY_SIZE = 0.38;
const BODY_HEIGHT = 0.5;

/** 台の色。夜に沈む黒木 */
const BASE_COLOR = "#140f0b";
/**
 * 光る本体の色。instanceColor で明滅だけ揺らすので、
 * マテリアル側は白にしておきここは基準色としてだけ使う。
 */
const GLOW_COLOR = new Color("#fff2d2");

/** 明るさのゆらぎ(ろうそくの揺れ)。0で無効 */
const FLICKER_DEPTH = 0.22;

/** 上下のゆらぎ幅。プカプカ浮いてる感じを弱める場合はここを下げる */
const BOB_AMPLITUDE = 0.01;

type LanternData = {
  x: number;
  z: number;
  scale: number;
  rotationY: number;
  /** 上下のゆらぎ */
  phase: number;
  speed: number;
  /** 明滅のゆらぎ */
  flickerPhase: number;
  flickerSpeed: number;
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
    const inner2 = innerRadius * innerRadius;
    const outer2 = radius * radius;
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      /*
        半径は面積が一様になるよう sqrt で分布させる。
        r を一様乱数にすると、外側ほど円周が長いのに個数が同じになるため
        中心付近に密集し、遠くはスカスカという偏った散らばりになる。
      */
      const r = Math.sqrt(inner2 + random() * (outer2 - inner2));
      items.push({
        x: Math.cos(angle) * r,
        z: Math.sin(angle) * r,
        scale: 0.34 + random() * 0.26,
        rotationY: random() * Math.PI * 2,
        phase: random() * Math.PI * 2,
        speed: 0.5 + random() * 0.4,
        flickerPhase: random() * Math.PI * 2,
        flickerSpeed: 1.6 + random() * 2.4,
      });
    }
    return items;
  }, [count, radius, innerRadius]);
}

type LanternsProps = {
  count?: number;
  radius?: number;
  innerRadius?: number;
};

/**
 * 水面に浮かぶ灯籠群。
 *
 * 以前は Sketchfab の行灯モデル(GLTF)をパーツごとに InstancedMesh 化して
 * 描いていたが、遠景に小さく散らばるだけの飾りにモデルの情報量は要らない。
 * 「下に黒い台、上に光る本体」の箱2つに置き換えてある(描画も13→2コール)。
 *
 * 本体は meshBasicMaterial + toneMapped={false} でライティングを通さず、
 * そのまま Bloom に拾わせて発光させる。1つずつ instanceColor で色味と
 * 明滅を変えているので、並べても金太郎飴にならない。
 */
export function Lanterns({
  /*
    面積一様に散らすようにしたぶん、同じ個数だと遠景がスカスカになる。
    範囲を広げた(80→150)ぶんと合わせて個数も増やしてある。
    箱2つ・2ドローコールなので、この程度なら描画コストは問題にならない。
  */
  count = 900,
  radius = 150,
  innerRadius = 3,
}: LanternsProps) {
  const items = useLanternField(count, radius, innerRadius);
  const baseRef = useRef<InstancedMesh>(null);
  const bodyRef = useRef<InstancedMesh>(null);

  // useFrame の中で new しないための使い回し
  const dummy = useRef(new Object3D()).current;
  const scratchColor = useRef(new Color()).current;

  /*
    台は動かないので(上下のゆらぎは本体と同じだけ必要なので毎フレーム書くが)
    色は一度だけ入れる。instanceColor は setColorAt の初回呼び出しで作られる。
  */
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    items.forEach((_, i) => {
      body.setColorAt(i, GLOW_COLOR);
    });
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  }, [items]);

  useFrame(({ clock }) => {
    const base = baseRef.current;
    const body = bodyRef.current;
    if (!base || !body) return;

    const elapsed = clock.elapsedTime;

    for (let i = 0; i < items.length; i++) {
      const data = items[i];
      const bob = Math.sin(elapsed * data.speed + data.phase) * BOB_AMPLITUDE;
      dummy.position.set(data.x, BASE_Y + bob, data.z);
      dummy.rotation.set(0, data.rotationY, 0);
      dummy.scale.setScalar(data.scale);

      // 台: 底が原点に来るよう半分持ち上げる
      dummy.position.y += (BASE_HEIGHT / 2) * data.scale;
      dummy.updateMatrix();
      base.setMatrixAt(i, dummy.matrix);

      // 本体: 台の上に載せる
      dummy.position.y += ((BASE_HEIGHT + BODY_HEIGHT) / 2) * data.scale;
      dummy.updateMatrix();
      body.setMatrixAt(i, dummy.matrix);

      /*
        明滅。instanceColor は白のマテリアルに掛かるので、ここで
        色そのものを上下させれば明るさのゆらぎになる。
      */
      const flicker =
        1 -
        FLICKER_DEPTH *
          (0.5 +
            0.5 * Math.sin(elapsed * data.flickerSpeed + data.flickerPhase));
      scratchColor.copy(GLOW_COLOR).multiplyScalar(flicker);
      body.setColorAt(i, scratchColor);
    }

    base.instanceMatrix.needsUpdate = true;
    body.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  });

  return (
    <>
      {/* 下の台。夜に沈む黒木。シーンのライトを受ける */}
      <instancedMesh
        ref={baseRef}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      >
        <boxGeometry args={[BASE_SIZE, BASE_HEIGHT, BASE_SIZE]} />
        <meshStandardMaterial color={BASE_COLOR} roughness={0.85} />
      </instancedMesh>

      {/*
        光る本体。ライティングは通さず(toneMapped=false)そのまま Bloom に
        拾わせる。色は instanceColor で1つずつ変えるのでここは白。
      */}
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, count]}
        frustumCulled={false}
      >
        <boxGeometry args={[BODY_SIZE, BODY_HEIGHT, BODY_SIZE]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
    </>
  );
}
