"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
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

/*
  Reply演出中、灯籠は水面を離れて天守のまわりへ集まる(gatherRef で駆動)。

  頂上の一点に収束させるのではなく、**天守を取り囲む輪の中に散らばせる**。
  新しい乱数は増やさず、水面での元の角度(atan2(z, x))はそのまま引き継ぐ
  (もともと一様にばら撒いてあるので、これだけで方位はまんべんなく揃う)。
  半径は元の距離を GATHER_RADIUS_MIN〜MAX の輪へ写像し直し、高さは
  gatherHeightT(0〜1の個体差)で GATHER_HEIGHT_MIN〜MAX へ一様に振り分ける。
*/
/** 集まりきったあとの漂い(円軌道の半径)。固まって静止して見えないようにする */
const GATHER_DRIFT_RADIUS = 1.2;
/**
 * 集まる速さに個体差を付ける幅(gatherRef の値換算)。0だと全灯籠が
 * 完全に同時に動いてしまい、画像のように何本もの筋が違うタイミングで
 * 中心へ吸い込まれていく感じが出ない。
 */
const GATHER_DELAY_SPREAD = 0.4;
/** 集まりきったときの明るさの上乗せ(1.0で+100%)。中心ほど白く光る画に寄せる */
const GATHER_BRIGHT_BOOST = 0.6;

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
  /** 集まる動き出しをずらすための個体差(0〜1) */
  gatherDelay: number;
  /** 集まったときの高さを GATHER_HEIGHT_MIN〜MAX から選ぶ位置(0〜1) */
  gatherHeightT: number;
};

/** なめらかな加減速(ease-in-out)。等速で動くと機械的に見える */
function smoothstep(x: number) {
  return x * x * (3 - 2 * x);
}
function clamp01(x: number) {
  return Math.min(Math.max(x, 0), 1);
}

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
        gatherDelay: random(),
        gatherHeightT: random(),
      });
    }
    return items;
  }, [count, radius, innerRadius]);
}

type LanternsProps = {
  count?: number;
  radius?: number;
  innerRadius?: number;
  /**
   * Reply演出の進み具合(0〜1)を持つ ref。0で通常どおり水面に浮かび、1で
   * gatherCenter のまわり(輪の内側)へ集まる。星降る海の activationRef と
   * 同じ理由で数値 prop ではなく ref(毎フレーム変わる値なので、state だと
   * 灯籠900個ぶんの再レンダーが走る)。省略時は常に水面のまま。
   */
  gatherRef?: RefObject<number>;
  /** 集まる中心(x, z)。天守の位置を渡す想定。省略時は原点 */
  gatherCenter?: [number, number];
  /** 集まる輪の内側の半径。天守の外壁のすぐ外あたりを渡す想定 */
  gatherRadiusMin?: number;
  /** 集まる輪の外側の半径 */
  gatherRadiusMax?: number;
  /** 集まる高さの下限。天守の低いところ(石垣あたり)を渡す想定 */
  gatherHeightMin?: number;
  /** 集まる高さの上限。天守の頂部より少し上あたりを渡す想定 */
  gatherHeightMax?: number;
  /**
   * カメラが引いたあと、輪をさらに広げる進み具合(0〜1)を持つ ref。
   * 11秒直後の輪(gatherRadius/HeightMin/Max)のままだと、そのあとカメラが
   * 大きく引くカット(ReplyCamera の PATH)では画面の隅に小さく寄るだけに
   * なってしまう。この値を上げると expandRadius/Height の広い範囲へ
   * ブレンドし、引いた画でも画面いっぱいに灯籠がある見た目を保つ。
   * 省略時は常に gatherRadius/Height のまま(広げない)。
   */
  expandRef?: RefObject<number>;
  /** 広げきったときの輪の内側の半径 */
  expandRadiusMin?: number;
  /** 広げきったときの輪の外側の半径。引きの画角に合わせて大きく取る */
  expandRadiusMax?: number;
  /** 広げきったときの高さの下限 */
  expandHeightMin?: number;
  /** 広げきったときの高さの上限。塔の上のホログラムあたりまで届かせる */
  expandHeightMax?: number;
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
 *
 * Reply演出中は gatherRef で天守を取り囲む輪の中へ散らばって集まり
 * (頂上の一点に集中させるのではなく周囲を囲む見た目にする指定。
 * gatherRadiusMin/Max・gatherHeightMin/Max のコメント参照)、
 * さらに expandRef でカメラが引いたぶん輪を大きく広げる
 * (expandRadiusMin/Max・expandHeightMin/Max のコメント参照)。
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
  gatherRef,
  gatherCenter,
  gatherRadiusMin = 7,
  gatherRadiusMax = 16,
  gatherHeightMin = 2,
  gatherHeightMax = 18,
  expandRef,
  expandRadiusMin = gatherRadiusMin,
  expandRadiusMax = gatherRadiusMax,
  expandHeightMin = gatherHeightMin,
  expandHeightMax = gatherHeightMax,
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
    const gather = gatherRef?.current ?? 0;
    const gatherCx = gatherCenter?.[0] ?? 0;
    const gatherCz = gatherCenter?.[1] ?? 0;

    /*
      カメラが引いたぶん、輪を expandRadius/Height の広い範囲へブレンドする。
      1周ぶんの計算なので毎フレームここで求めて全灯籠で使い回す
      (per-lantern の値ではない)。

      expandRef(replyPullbackRef)は0→1の等速な一次ランプで、1に達した
      瞬間に頭打ちになる値。そのまま使うと広がる速度が最後まで一定のまま
      急停止し、「ピタッと止まる」感じになる。smoothstep で受けて、
      広がり終わりにかけて自然に減速させる。
    */
    const expand = smoothstep(clamp01(expandRef?.current ?? 0));
    const radiusMin = gatherRadiusMin + (expandRadiusMin - gatherRadiusMin) * expand;
    const radiusMax = gatherRadiusMax + (expandRadiusMax - gatherRadiusMax) * expand;
    const heightMin = gatherHeightMin + (expandHeightMin - gatherHeightMin) * expand;
    const heightMax = gatherHeightMax + (expandHeightMax - gatherHeightMax) * expand;

    for (let i = 0; i < items.length; i++) {
      const data = items[i];
      const bob = Math.sin(elapsed * data.speed + data.phase) * BOB_AMPLITUDE;
      const waterY = BASE_Y + bob;

      /*
        個体差(gatherDelay)ぶん動き出しを遅らせる。gather はそのまま
        0〜1で頭打ちになる値なので、遅らせたぶん実質の移動時間が短くなり
        (=速く動く)、画像のように筋を引いて吸い込まれる感じになる。
      */
      const delay = data.gatherDelay * GATHER_DELAY_SPREAD;
      const eased = smoothstep(clamp01((gather - delay) / (1 - delay)));

      let px = data.x;
      let pz = data.z;
      let py = waterY;

      if (eased > 0) {
        /*
          天守を取り囲む輪の上に集める(このファイル冒頭のコメント参照)。
          方位(angle)は元の水面での位置をそのまま使う=一様に散らばったまま。
          半径だけ、元の距離(innerRadius〜radius)を輪の内外径へ写像し直す。
        */
        const dist = Math.hypot(data.x, data.z);
        const distT = clamp01((dist - innerRadius) / (radius - innerRadius || 1));
        const angle = Math.atan2(data.z, data.x);
        const targetRadius = radiusMin + (radiusMax - radiusMin) * distT;

        const targetX = gatherCx + Math.cos(angle) * targetRadius;
        const targetZ = gatherCz + Math.sin(angle) * targetRadius;
        const targetY = heightMin + (heightMax - heightMin) * data.gatherHeightT;

        // 集まりきったあとも止まって見えないよう、ゆっくり円軌道で漂わせる
        const driftAngle = elapsed * data.speed * 0.6 + data.phase;
        const drift = eased * GATHER_DRIFT_RADIUS;

        px += (targetX - data.x) * eased + Math.cos(driftAngle) * drift;
        pz += (targetZ - data.z) * eased + Math.sin(driftAngle) * drift;
        py += (targetY - waterY) * eased;
      }

      dummy.position.set(px, py, pz);
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
      // 集まりきるほど白熱させる。画像のように中心が眩しく光る画に寄せる
      const brightBoost = 1 + eased * GATHER_BRIGHT_BOOST;
      scratchColor.copy(GLOW_COLOR).multiplyScalar(flicker * brightBoost);
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
