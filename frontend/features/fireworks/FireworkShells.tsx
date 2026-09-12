"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  ShaderMaterial,
} from "three";

import { FIREWORK_FRAGMENT, FIREWORK_VERTEX } from "./fireworkShader";
import {
  FIREWORK_PROFILES,
  emitShells,
  type FireworkKind,
  type FireworkParticle,
  type ShellPlan,
} from "./shellKinds";

/* ------------------------------------------------------------------ *
 * 花火のコンポーネント群。型ごとに1つ、どれも同じ props を取る。
 *
 *   <KikuShell shells={[{ at: 62, from: [...], to: [...] }]} ... />
 *
 * 1コンポーネント = points 1回の描画で、shells に何発積んでも増えない。
 * 逆に**型をまたぐとマテリアルの uniform が変わるので分ける必要がある**
 * ―― 型の数(6)がそのまま描画回数の上限になる、という構成。
 *
 * 玉の位置・色・開く形はすべて ShellPlan.seed から決まる決定的な値なので、
 * 曲を何周しても同じ時刻に同じ花火が上がる。
 * ------------------------------------------------------------------ */

export type FireworkShellsProps = {
  /** 上げる玉のリスト。空なら何も描かない */
  shells: readonly ShellPlan[];
  /** 曲(=ホログラム映像)の再生位置(秒)を持つ ref */
  songTimeRef: RefObject<number>;
  /**
   * 演出強度(0〜1)。そのまま全体の濃さになる。
   * 曲のフェードも掛けた値を渡すこと(合成は呼び出し側の責任)。
   */
  intensityRef: RefObject<number>;
};

/** シェーダーへ毎フレーム書く uniform。ほかは作るときに固定する */
type LiveUniforms = {
  uTime: { value: number };
  uOpacity: { value: number };
};

function buildGeometry(particles: FireworkParticle[], steps: number) {
  const total = particles.length * steps;
  const denom = Math.max(steps - 1, 1);

  const position = new Float32Array(total * 3);
  const launch = new Float32Array(total);
  const origin = new Float32Array(total * 3);
  const burst = new Float32Array(total * 3);
  const vel = new Float32Array(total * 3);
  const brk = new Float32Array(total * 4);
  const size = new Float32Array(total);
  const seed = new Float32Array(total);
  const color = new Float32Array(total * 3);
  const tint = new Float32Array(total * 3);
  const trail = new Float32Array(total);

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    for (let k = 0; k < steps; k++) {
      const idx = i * steps + k;
      const n3 = idx * 3;
      const n4 = idx * 4;

      // position は使わないが、無いと three が描画をスキップする
      position[n3] = p.burst[0];
      position[n3 + 1] = p.burst[1];
      position[n3 + 2] = p.burst[2];

      launch[idx] = p.launch;
      origin[n3] = p.origin[0];
      origin[n3 + 1] = p.origin[1];
      origin[n3 + 2] = p.origin[2];
      burst[n3] = p.burst[0];
      burst[n3 + 1] = p.burst[1];
      burst[n3 + 2] = p.burst[2];
      vel[n3] = p.vel[0];
      vel[n3 + 1] = p.vel[1];
      vel[n3 + 2] = p.vel[2];
      brk[n4] = p.breakVel[0];
      brk[n4 + 1] = p.breakVel[1];
      brk[n4 + 2] = p.breakVel[2];
      brk[n4 + 3] = p.breakAt;
      size[idx] = p.size;
      seed[idx] = p.seed;
      color[n3] = p.color.r;
      color[n3 + 1] = p.color.g;
      color[n3 + 2] = p.color.b;
      tint[n3] = p.tint.r;
      tint[n3 + 1] = p.tint.g;
      tint[n3 + 2] = p.tint.b;
      // 0 = 先頭(実時刻) 〜 1 = 尾の末端
      trail[idx] = k / denom;
    }
  }

  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(position, 3));
  geo.setAttribute("aLaunch", new BufferAttribute(launch, 1));
  geo.setAttribute("aOrigin", new BufferAttribute(origin, 3));
  geo.setAttribute("aBurst", new BufferAttribute(burst, 3));
  geo.setAttribute("aVel", new BufferAttribute(vel, 3));
  geo.setAttribute("aBreak", new BufferAttribute(brk, 4));
  geo.setAttribute("aSize", new BufferAttribute(size, 1));
  geo.setAttribute("aSeed", new BufferAttribute(seed, 1));
  geo.setAttribute("aColor", new BufferAttribute(color, 3));
  geo.setAttribute("aTint", new BufferAttribute(tint, 3));
  geo.setAttribute("aTrail", new BufferAttribute(trail, 1));
  return geo;
}

/**
 * 型と玉のリストから points 用の geometry / material を1組作る。
 * shells が変わらないかぎり作り直さない(useMemo)。
 */
function useFireworkPoints(kind: FireworkKind, shells: readonly ShellPlan[]) {
  return useMemo(() => {
    const prof = FIREWORK_PROFILES[kind];
    const particles = emitShells(kind, shells);
    const geometry = buildGeometry(particles, prof.trailSteps);

    const material = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uRise: { value: prof.rise },
        uLife: { value: prof.life },
        uDrag: { value: prof.drag },
        uGravity: { value: prof.gravity },
        uTrailSpan: { value: prof.trailSpan },
        uGlitter: { value: prof.glitter },
        uFlash: { value: prof.flash },
      },
      vertexShader: FIREWORK_VERTEX,
      fragmentShader: FIREWORK_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    return { geometry, material };
  }, [kind, shells]);
}

/**
 * 型を指定して描く汎用の花火。下の KikuShell などはこれの薄い包み。
 * 型を自分で切り替えたいとき(データ駆動で並べるとき)はこちらを直接使う。
 */
export function FireworkShells({
  kind,
  shells,
  songTimeRef,
  intensityRef,
}: FireworkShellsProps & { kind: FireworkKind }) {
  const { geometry, material } = useFireworkPoints(kind, shells);
  // 玉が1発も無い型は points ごと出さない(頂点0の描画を three へ投げない)
  const empty = shells.length === 0;

  /*
    useFrame 内で useMemo の戻り値を直接触ると react-hooks/immutability に
    引っかかるため ref 経由で書く(CornerTowers / EdoCastle と同じ手当て)。
    あわせて GPU 資源の破棄もここで行う ―― geometry / material は自前で
    作ったものなので R3F の自動破棄には乗らない。
  */
  const uniformsRef = useRef<LiveUniforms | null>(null);

  useEffect(() => {
    uniformsRef.current = material.uniforms as LiveUniforms;
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(() => {
    const uniforms = uniformsRef.current;
    if (!uniforms) return;
    uniforms.uTime.value = songTimeRef.current ?? 0;
    uniforms.uOpacity.value = Math.max(intensityRef.current ?? 0, 0);
  });

  if (empty) return null;

  return (
    /*
      位置はすべて頂点シェーダーで作るので、three の持つ境界球は当てにならない
      (開く前の1点しか入っていない)。frustumCulled を切らないと、カメラが
      振れた拍子に玉ごと消える。
    */
    <points geometry={geometry} material={material} frustumCulled={false} />
  );
}

/**
 * 芯入り菊。金の光条が放射状に伸び、その内側に色違いの芯が浮く二重の玉。
 * 曲の山(サビ頭・大サビ)に置く主役の型。
 */
export function KikuShell(props: FireworkShellsProps) {
  return <FireworkShells kind="kiku" {...props} />;
}

/**
 * 色玉。小さく丸くまとまって消える単色の玉。
 * 単体だと地味なので、時刻をずらして何発か並べて使う。
 */
export function PeonyShell(props: FireworkShellsProps) {
  return <FireworkShells kind="peony" {...props} />;
}

/**
 * 冠菊(しだれ柳)。長い金の筋がパチパチ瞬きながら垂れて落ちる。
 * 寿命が 5秒と長いので、余韻を残したいところ(セクションの終わり)に置く。
 * 落ちしろが要るので、開く高さは他の型より高めに取ること。
 */
export function KamuroShell(props: FireworkShellsProps) {
  return <FireworkShells kind="kamuro" {...props} />;
}

/**
 * 千輪。大きく開いて止まったあと、粒ひとつひとつが**もう一度**小さく咲く。
 * 開いてから 0.5秒後に二段目が来るので、そのぶん手前で上げると拍に乗る。
 */
export function SenrinShell(props: FireworkShellsProps) {
  return <FireworkShells kind="senrin" {...props} />;
}

/**
 * 型物(輪)。多色の粒が輪の上に並んだまま広がり、傾いた環が空に残る。
 * 菊や柳と違って形がはっきり出るので、静かな箇所のアクセントに向く。
 */
export function RingShell(props: FireworkShellsProps) {
  return <FireworkShells kind="ring" {...props} />;
}

/**
 * 水上の扇。水面に並べた噴出口から低い角度で末広がりに噴き上げる。
 * 打ち上げ区間が無く、指定した時刻にその場でいきなり開く。
 * `from`→`to` の水平ベクトルが噴出口を並べる向きと全長になる。
 */
export function WaterFan(props: FireworkShellsProps) {
  return <FireworkShells kind="fan" {...props} />;
}

/**
 * 大冠菊(グランドフィナーレ)。冠菊の寸法を丸ごと大きくした特大の柳で、
 * 1発でも傘が空を覆い、金の簾が7秒かけて垂れ続ける。
 *
 * **1発ぶんの粒が kamuro の1.6倍・尾も最長**なので、定期の打ち上げに
 * 混ぜる型ではない。曲の最後のフィナーレに、時間をずらした波として
 * 何発か重ねて使うこと(ReplyFireworks.tsx の FINALE_BARRAGE_* 参照)。
 * 落ちしろが要るので、開く高さは kamuro よりさらに高く取ること。
 */
export function FinaleShell(props: FireworkShellsProps) {
  return <FireworkShells kind="finale" {...props} />;
}
