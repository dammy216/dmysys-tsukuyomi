"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshBasicMaterial,
} from "three";

import { CASTLE_TOP_Y } from "./constants";
import { LATTER_BARRAGE_BURST_AT } from "./ReplyFireworks";

/*
  LATTER入り(84.5秒)の花火の同時爆発(ReplyFireworks.tsx の
  LATTER_BARRAGE_BURST_AT)と同じ瞬間に、天守の上空で魚の大群が紙吹雪のように
  弾けて散る一回限りの演出(ユーザー指定)。

  見た目(ネオン色の紡錘形の魚)は features/starfall-sea/StarfallSwarm.tsx の
  「星降る海」モードの魚群から流用している(createFishGeometry/COLOR_PALETTE)。
  ただし動きは全くの別物 ―― あちらは筒の中を延々と周回する permanent な群れ、
  こちらは打ち上げ花火の破片と同じ「初速を持って飛び出し、重力で弧を描いて
  落ちながらフェードアウトする」ワンショットの放物運動。
  1回しか再生されない曲の前提(SceneContents.tsx の他のReply系コンポーネントと
  同じ)なので、ループはしない。
*/

/**
 * 水色・オレンジ・黄緑・ピンクの4色ネオン。
 * StarfallSwarm.tsx の COLOR_PALETTE と同じ配色を、このファイル用に
 * コピーしてある(export されていないため。転調(surge)の概念は今回不要なので
 * 固定パレットとしてそのまま使う)。
 */
const COLOR_PALETTE = [
  "#7fd4ff", // 水色
  "#ffa64d", // オレンジ
  "#dce82c", // 黄色寄りの黄緑
  "#ff8fc4", // 薄めのピンク
];

/**
 * 色の明るさ倍率。StarfallSwarm.tsx の COLOR_GAIN と同じ理由
 * (加算合成なので重なりだけで白飽和するため、1匹あたりは控えめでよい)。
 */
const COLOR_GAIN = 1.35;

/**
 * 紙吹雪として飛び出す魚の数。「たくさん」の指定に沿う数百体
 * (ワンショットなので permanentな群れ(StarfallSwarmの4万体)ほどは要らない)。
 */
const FISH_COUNT = 600;

/**
 * 発生源。天守の上空、ReplyFireworks.tsx の花火が弾ける範囲
 * (BURST_Y_MIN=CASTLE_TOP_Y+14 〜 BURST_Y_MAX=CASTLE_TOP_Y+58)の
 * 中間あたりを中心にした小さな球状の範囲。1点から放射状に飛び出すのではなく、
 * この球の中のランダムな点それぞれから各個体が飛び出す。
 * X/Zは0を中心(=<instancedMesh position>で渡された基準位置がそのまま原点になる)。
 */
const BURST_ORIGIN_CENTER_Y = CASTLE_TOP_Y + 36;
/** 球の半径。小さめに絞って「天守の上空のある一点」に見えるようにする */
const BURST_ORIGIN_RADIUS = 14;

/**
 * 初速の大きさ(units/秒)。features/fireworks/shellKinds.ts の菊(speed=20)と
 * 同じ桁数を基準に、個体ごとに少しばらつかせてある。
 */
const LAUNCH_SPEED_MIN = 14;
const LAUNCH_SPEED_MAX = 30;
/**
 * 初速の向きを上向きにどれだけ寄せるか(0=完全にランダムな全方位、
 * 1=真上のみ)。全方位のままだと下向きに飛ぶ個体も出て打ち上げ花火らしく
 * 見えないため、花火の破片と同じように上方向へ寄せる。
 */
const UPWARD_BIAS = 0.45;

/**
 * 重力(units/秒²)。features/fireworks/shellKinds.ts の菊(gravity=7)より
 * 少し強め ―― こちらは抵抗(drag)を持たない単純な等加速度運動なので、
 * 弧を描いて落ちる様子をこの短い寿命(2.5〜4秒)の間で見せるには
 * drag込みの花火の値より強い重力が要る。
 */
const GRAVITY = 15;

/** 1匹が生きる時間(秒)。この間にフェードアウトして消える(ユーザー指定「2.5〜4秒程度」) */
const LIFE_MIN = 2.5;
const LIFE_MAX = 4.0;
/**
 * 寿命に対して何割を過ぎたらフェードを始めるか。序盤は等倍のまま弾けた
 * 勢いを見せ、後半だけ smoothstep でスケールを0へ絞って消す
 * (StarfallSwarmのuActivationと同じ「スケールを絞って消す」手法)。
 */
const FADE_START_FRAC = 0.55;

/**
 * 1匹あたりの見た目の大きさ。渦の中の背景粒(StarfallSwarm)より近くで
 * 見える主役の演出なので、そちらのSCALE_MAXよりだいぶ大きく取る。
 */
const SCALE_MIN = 0.7;
const SCALE_MAX = 1.9;

function seededRandom(seed: number) {
  let a = seed | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * 魚1匹ぶんの形。StarfallSwarm.tsx の createFishGeometry() をそのままコピーした
 * もの(exportされていないため)。鼻先・尾の付け根・左右・背腹・尾びれの
 * 8頂点だけの簡易紡錘形。進行方向は +Z(下の頂点シェーダでこの軸を
 * 速度方向へ向ける)。
 */
function createFishGeometry(): BufferGeometry {
  /** 胴の半幅(横) */
  const w = 0.16;
  /** 胴の半高(縦)。魚は横より縦に平たいので高さを取る */
  const h = 0.3;
  /** 尾びれの半高 */
  const fin = 0.42;

  // prettier-ignore
  const positions = new Float32Array([
    0, 0, 1.0,     // 0 鼻先
    0, 0, -1.0,    // 1 尾の付け根
    w, 0, 0,       // 2 右
    -w, 0, 0,      // 3 左
    0, h, 0,       // 4 背
    0, -h, 0,      // 5 腹
    0, fin, -1.5,  // 6 尾びれ上
    0, -fin, -1.5, // 7 尾びれ下
  ]);

  // prettier-ignore
  const indices = new Uint16Array([
    0, 2, 4,  0, 4, 3,  0, 3, 5,  0, 5, 2,
    1, 4, 2,  1, 3, 4,  1, 5, 3,  1, 2, 5,
    1, 6, 7,
  ]);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

type ConfettiFish = {
  origin: [number, number, number];
  velocity: [number, number, number];
  life: number;
  scale: number;
  color: Color;
};

/**
 * 個体1匹ぶんの発生位置・初速・寿命・大きさ・色を決める。乱数はここで
 * 一度だけ引き、毎フレームは使わない(GPU側は位置と向きを頂点シェーダで
 * 計算するので、CPU側はuElapsedを1つ書くだけで済む)。
 */
function createFish(i: number): ConfettiFish {
  const seed = i * 977;

  // 球内のランダムな発生点(体積が一様になるよう半径は立方根で分布させる)
  const azimuth = seededRandom(seed) * Math.PI * 2;
  const cosTheta = seededRandom(seed + 1) * 2 - 1;
  const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
  const r = BURST_ORIGIN_RADIUS * Math.cbrt(seededRandom(seed + 2));
  const origin: [number, number, number] = [
    r * sinTheta * Math.cos(azimuth),
    BURST_ORIGIN_CENTER_Y + r * cosTheta,
    r * sinTheta * Math.sin(azimuth),
  ];

  // 全方位のランダムな向きを作り、上向き(0,1,0)へ UPWARD_BIAS ぶん寄せる
  const azimuth2 = seededRandom(seed + 3) * Math.PI * 2;
  const cosTheta2 = seededRandom(seed + 4) * 2 - 1;
  const sinTheta2 = Math.sqrt(Math.max(0, 1 - cosTheta2 * cosTheta2));
  const rawDir: [number, number, number] = [
    sinTheta2 * Math.cos(azimuth2),
    cosTheta2,
    sinTheta2 * Math.sin(azimuth2),
  ];
  const biased: [number, number, number] = [
    rawDir[0] * (1 - UPWARD_BIAS),
    rawDir[1] * (1 - UPWARD_BIAS) + UPWARD_BIAS,
    rawDir[2] * (1 - UPWARD_BIAS),
  ];
  const biasedLen = Math.hypot(biased[0], biased[1], biased[2]) || 1;
  const speed =
    LAUNCH_SPEED_MIN + seededRandom(seed + 5) * (LAUNCH_SPEED_MAX - LAUNCH_SPEED_MIN);
  const velocity: [number, number, number] = [
    (biased[0] / biasedLen) * speed,
    (biased[1] / biasedLen) * speed,
    (biased[2] / biasedLen) * speed,
  ];

  const life = LIFE_MIN + seededRandom(seed + 6) * (LIFE_MAX - LIFE_MIN);
  const scale = SCALE_MIN + seededRandom(seed + 7) * (SCALE_MAX - SCALE_MIN);
  const colorIndex = Math.min(
    COLOR_PALETTE.length - 1,
    Math.floor(seededRandom(seed + 8) * COLOR_PALETTE.length),
  );
  const color = new Color(COLOR_PALETTE[colorIndex]).multiplyScalar(COLOR_GAIN);

  return { origin, velocity, life, scale, color };
}

/*
  頂点シェーダ側で、発生位置(aOrigin)+初速(aVelocity)*t+0.5*重力*t^2 の
  等加速度運動を全個体並列に計算する。CPU側の毎フレームの仕事は
  uElapsed(バースト時刻からの経過秒数)を1つ書くだけ。

  向きの決め方(fwd/side/upの基底の組み方)は StarfallSwarm.tsx の
  SWARM_SHADER_BODY と同じ考え方 ―― 現在の速度ベクトルの方向へ+Z軸を向ける。
*/
const CONFETTI_SHADER_HEAD = /* glsl */ `
uniform float uElapsed;
attribute vec3 aOrigin;
attribute vec3 aVelocity;
attribute vec2 aParams; // x:life(秒) y:scale
const float CONFETTI_GRAVITY = ${GRAVITY.toFixed(2)};
const float CONFETTI_FADE_START_FRAC = ${FADE_START_FRAC.toFixed(3)};
`;

const CONFETTI_SHADER_BODY = /* glsl */ `
  float life = aParams.x;
  // 寿命を過ぎたら位置の計算はそこで止める(フェードで見えなくなっているので
  // 動き続けても見た目には影響しないが、無駄に遠くへ飛ばさないため clamp する)
  float t = clamp(uElapsed, 0.0, life);

  vec3 gravity = vec3(0.0, -CONFETTI_GRAVITY, 0.0);
  vec3 pos = aOrigin + aVelocity * t + 0.5 * gravity * t * t;
  // 位置を時間で微分した「その瞬間の速度」の向きへ頭を向ける
  vec3 vel = aVelocity + gravity * t;

  float velLen = length(vel);
  vec3 fwd = velLen > 1e-4 ? vel / velLen : vec3(0.0, 0.0, 1.0);

  /*
    進行方向から姿勢の基底を組み立てる(StarfallSwarm.tsx SWARM_SHADER_BODY と
    同じ式)。「+Z を進行方向に、+X を (worldUp × 進行方向) に向ける」だけ。
  */
  vec2 sideXZ = vec2(fwd.z, -fwd.x);
  float sideLen = length(sideXZ);
  sideXZ = sideLen > 1e-5 ? sideXZ / sideLen : vec2(1.0, 0.0);
  vec3 sideV = vec3(sideXZ.x, 0.0, sideXZ.y);
  vec3 upV = vec3(
    fwd.y * sideXZ.y,
    fwd.z * sideXZ.x - fwd.x * sideXZ.y,
    -fwd.y * sideXZ.x
  );

  /*
    フェードは不透明度ではなくスケールを0へ絞って表現する
    (StarfallSwarmのuActivationと同じ手法)。寿命の前半(FADE_START_FRAC未満)は
    等倍のまま、後半でsmoothstepしながら0へ絞る。バースト前(uElapsed<0)は
    step()でまるごと0にして隠す。
  */
  float progress = life > 0.0 ? t / life : 0.0;
  float fade = 1.0 - smoothstep(CONFETTI_FADE_START_FRAC, 1.0, progress);
  fade *= step(0.0, uElapsed);

  float s = aParams.y * fade;

  vec3 transformed =
      sideV * (position.x * s)
    + upV   * (position.y * s)
    + fwd   * (position.z * s)
    + pos;
`;

type ReplyConfettiFishProps = {
  /** 曲(=ホログラム映像)の再生位置(秒)を持つ ref */
  songTimeRef: RefObject<number>;
  /** 塔の中心。天守の上空を発生源にするための基準位置 */
  position?: [number, number, number];
};

/**
 * LATTER入り(84.5秒)の花火の同時爆発と同じ瞬間に、天守の上空でネオン色の
 * 魚が紙吹雪のように弾けて散る一回限りのバースト演出。
 *
 * 1つの InstancedMesh にまとめて描くので、匹数を増やしても描画命令は1回で済む。
 */
export function ReplyConfettiFish({
  songTimeRef,
  position = [0, 0, 0],
}: ReplyConfettiFishProps) {
  const meshRef = useRef<InstancedMesh>(null);

  /*
    毎フレーム変わる唯一の値。useFrame からはここへ書き込むだけで
    全個体の位置・向き・フェードが動く(StarfallSwarmのuniformsRefと同じ理由で
    useMemoではなくrefに持つ)。
  */
  const uniformsRef = useRef({ uElapsed: { value: -1 } });

  const fish = useMemo<ConfettiFish[]>(
    () => Array.from({ length: FISH_COUNT }, (_, i) => createFish(i)),
    [],
  );

  const geometry = useMemo(() => {
    const geo = createFishGeometry();

    const origins = new Float32Array(FISH_COUNT * 3);
    const velocities = new Float32Array(FISH_COUNT * 3);
    const params = new Float32Array(FISH_COUNT * 2);

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const o3 = i * 3;
      origins[o3] = f.origin[0];
      origins[o3 + 1] = f.origin[1];
      origins[o3 + 2] = f.origin[2];
      velocities[o3] = f.velocity[0];
      velocities[o3 + 1] = f.velocity[1];
      velocities[o3 + 2] = f.velocity[2];

      const o2 = i * 2;
      params[o2] = f.life;
      params[o2 + 1] = f.scale;
    }

    geo.setAttribute("aOrigin", new InstancedBufferAttribute(origins, 3));
    geo.setAttribute("aVelocity", new InstancedBufferAttribute(velocities, 3));
    geo.setAttribute("aParams", new InstancedBufferAttribute(params, 2));

    return geo;
  }, [fish]);

  /*
    素の meshBasicMaterial を onBeforeCompile で差し替える(StarfallSwarmと
    同じ理由 ―― 加算合成・霧・トーンマッピング無効を three 側の扱いのまま
    活かすため、頂点の配置だけを乗っ取る)。
  */
  const material = useMemo(() => {
    const mat = new MeshBasicMaterial({
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      side: DoubleSide,
      opacity: 0.95,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uElapsed = uniformsRef.current.uElapsed;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${CONFETTI_SHADER_HEAD}`)
        .replace("#include <begin_vertex>", CONFETTI_SHADER_BODY);
    };
    // onBeforeCompile で書き換えたシェーダーを他のマテリアルと混同させない
    mat.customProgramCacheKey = () => "reply-confetti-fish";

    return mat;
  }, []);

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  /*
    色は instanceColor で送る(<color_vertex>がそのまま処理する)。行列は
    使わないが<project_vertex>が必ず掛けるので単位行列だけ入れておく
    (StarfallSwarmと同じ理由。ゼロ埋めのままだと全個体が潰れて消える)。
  */
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    fish.forEach((f, i) => mesh.setColorAt(i, f.color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    const arr = mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < fish.length; i++) {
      const o = i * 16;
      arr[o] = 1;
      arr[o + 5] = 1;
      arr[o + 10] = 1;
      arr[o + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [fish]);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const elapsed = (songTimeRef.current ?? 0) - LATTER_BARRAGE_BURST_AT;

    /*
      バースト前、または全個体がフェードアウトしきった後(寿命の最大値
      LIFE_MAXを過ぎたら誰も見えていない)は描画ごと省く。
      一回限りのイベントなので、シークで戻ればまた自動的に隠れる。
    */
    if (elapsed < 0 || elapsed > LIFE_MAX) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;

    // CPU側の毎フレームの仕事はこの1行だけ。位置と向きは頂点シェーダが並列に計算する
    uniformsRef.current.uElapsed.value = elapsed;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, FISH_COUNT]}
      position={position}
      /*
        頂点シェーダ側で位置を決めるので、three の boundingSphere とは
        一致しない。視錐台カリングに任せると群れごと消えることがある
        (StarfallSwarmと同じ理由)。
      */
      frustumCulled={false}
    />
  );
}

