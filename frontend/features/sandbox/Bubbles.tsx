"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  Points,
} from "three";
import type { ShaderMaterial } from "three";

/** シード値から0〜1の疑似乱数を返す決定的なジェネレータ（mulberry32） */
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

/** 泡の数。星降る海の演出全体を覆うため、鳥居まわりの魚の群れよりは広く薄くばらまく */
const BUBBLE_COUNT = 180;
/** 泡が漂う半径。StarfallSwarm の渦(半径5〜24)を内側に含む、少し広めの範囲 */
const RADIUS_MIN = 1.5;
const RADIUS_MAX = 34;
/**
 * 泡が上る高さの範囲。上端は魚の渦の上端(46)より少し高いところで消える。
 * 下端は水面(y=0)。水面はMeshReflectorMaterialの不透明な板でそれより
 * 下は常にカメラから見えないため、下端を0未満にすると無駄になる。
 */
const HEIGHT_MIN = 0;
const HEIGHT_MAX = 50;
/** 下端から上端まで上りきるのにかかる秒数の範囲。小粒ほど速く、大粒ほどゆっくり上る */
const RISE_SECONDS_MIN = 9;
const RISE_SECONDS_MAX = 22;
/** 左右にゆれる幅と速さ。水流に押されて蛇行しながら上るように見せる */
const SWAY_AMPLITUDE = 0.6;
const SWAY_SPEED_MIN = 0.4;
const SWAY_SPEED_MAX = 1.1;
/** 見た目の大きさ(ピクセル基準の係数)。小粒〜やや大きめの泡を混ぜる */
const SIZE_MIN = 90;
const SIZE_MAX = 320;
/** 泡そのものの最大不透明度。activation(0〜1)を掛けて星降る海の強さに連動させる */
const MAX_OPACITY = 0.55;

/*
  泡は星降る海に入った瞬間から出すが、魚の大群・水中フィルターが立ち上がる
  (heavyActivation>0になる)までは「泡」ではなく鳥居の発光と同じネオンの
  光る玉として見せる。heavyActivation>0になった瞬間、テクスチャと色を
  実際の泡(リング状で輪郭が光る見た目)に切り替える。
*/
/** 光る玉フェーズの色。鳥居の発光・レンズ効果と同じネオンシアン */
const ORB_COLOR = "#5de3e6";
/** 泡フェーズの色。水中の泡らしい淡い水色 */
const BUBBLE_COLOR = "#bfe9ff";
/*
  参考映像(星降る海.mp4 0:21以前)のボケた光の玉は、シアン一色ではなく
  マゼンタ〜紫がかったものが混ざっている。それを再現するため、一部の粒
  だけ色をこちらへ寄せる(TINT_RATIOの確率で紫寄りになる。粒ごとにaTint
  として持たせる)。0:21以降(=heavyActivationが立ち上がって泡フェーズに
  切り替わった後)は通常の泡の色に戻したいので、紫みは光る玉フェーズ限定
  にし、uMixが上がるにつれて紫みも一緒に消えるようにする(BUBBLE_TINT_COLOR
  は不要になったので置いていない)。
*/
/** 光る玉フェーズの紫みの色 */
const ORB_TINT_COLOR = "#c86bff";
/** 紫寄りになる粒の割合 */
const TINT_RATIO = 0.5;

type BubbleData = {
  radius: number;
  angle: number;
  /** 全員が同時に下端から上り始めないための、上り周期内でのずらし量(秒) */
  risePhase: number;
  riseSeconds: number;
  swaySpeed: number;
  swayPhase: number;
  /** z側のゆれの位相。x側と周波数比をずらして円軌道ではない不規則なふらつきにする */
  swayPhaseZ: number;
  size: number;
  opacityScale: number;
  /** 紫寄りにする度合い(0〜1)。ほとんどは0で、TINT_RATIOの確率で1に近い値になる */
  tint: number;
};

function useBubbleField(count: number): BubbleData[] {
  return useMemo(() => {
    const random = mulberry32(9001 + count);
    const items: BubbleData[] = [];
    for (let i = 0; i < count; i++) {
      const riseSeconds =
        RISE_SECONDS_MIN + random() * (RISE_SECONDS_MAX - RISE_SECONDS_MIN);
      items.push({
        radius: RADIUS_MIN + random() * (RADIUS_MAX - RADIUS_MIN),
        angle: random() * Math.PI * 2,
        risePhase: random() * riseSeconds,
        riseSeconds,
        swaySpeed: SWAY_SPEED_MIN + random() * (SWAY_SPEED_MAX - SWAY_SPEED_MIN),
        swayPhase: random() * Math.PI * 2,
        swayPhaseZ: random() * Math.PI * 2,
        size: SIZE_MIN + random() * (SIZE_MAX - SIZE_MIN),
        opacityScale: 0.5 + random() * 0.5,
        tint: random() < TINT_RATIO ? 0.7 + random() * 0.3 : 0,
      });
    }
    return items;
  }, [count]);
}

/*
  丸い縁だけがうっすら光り、中心は透ける「泡」らしいスプライトを
  キャンバスに焼いてテクスチャにする。単純な白丸だと水玉にしか
  見えないため、リング状のグラデーションで水中の泡の屈折っぽさを出す。
  さらに左上寄りに小さな点ハイライトを重ね、ガラス玉のような
  反射があるように見せる(リングだけだと平面のドーナツに見えてしまう)。
*/
function createBubbleTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const center = size / 2;
  const gradient = ctx.createRadialGradient(
    center,
    center,
    size * 0.08,
    center,
    center,
    center,
  );
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.58, "rgba(255,255,255,0.05)");
  gradient.addColorStop(0.74, "rgba(255,255,255,0.55)");
  gradient.addColorStop(0.88, "rgba(255,255,255,0.95)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const highlightX = size * 0.36;
  const highlightY = size * 0.34;
  const highlightRadius = size * 0.14;
  const highlight = ctx.createRadialGradient(
    highlightX,
    highlightY,
    0,
    highlightX,
    highlightY,
    highlightRadius,
  );
  highlight.addColorStop(0, "rgba(255,255,255,0.95)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.arc(highlightX, highlightY, highlightRadius, 0, Math.PI * 2);
  ctx.fill();

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/*
  中心が芯まで明るく、縁になだらかに溶けていく単純な光の玉のスプライト。
  リングやハイライトを持たせず芯を潰すことで、泡の質感ではなく
  鳥居の発光と同じ「光の粒」に見えるようにする。
*/
function createOrbTexture(): CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.85)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.25)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/*
  PointsMaterial は頂点ごとにサイズ/不透明度を変えられないため、
  自前のShaderMaterialで aSize / aOpacity を読む。sizeAttenuation相当は
  gl_PointSize を -mvPosition.z で割ることで手動で再現している。

  実際の泡は水面に近づく(水圧が下がる)ほどわずかに膨らむ。
  position.y(下端〜上端の高さ)をそのまま使って、上るほど
  少しだけ大きくなる係数(growth)をかけている。
*/
const vertexShader = /* glsl */ `
attribute float aSize;
attribute float aOpacity;
attribute float aTint;
uniform float uHeightMin;
uniform float uHeightMax;
varying float vOpacity;
varying float vTint;

void main() {
  vOpacity = aOpacity;
  vTint = aTint;
  float heightT = clamp((position.y - uHeightMin) / (uHeightMax - uHeightMin), 0.0, 1.0);
  float growth = mix(0.75, 1.25, heightT);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * growth / -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uOrbMap;
uniform sampler2D uBubbleMap;
uniform vec3 uOrbColor;
uniform vec3 uBubbleColor;
uniform vec3 uOrbTintColor;
// 0=光る玉 / 1=泡。heavyActivationをそのまま渡し、なめらかにクロスフェードする
uniform float uMix;
uniform float uOpacity;
varying float vOpacity;
varying float vTint;

void main() {
  vec4 orbTex = texture2D(uOrbMap, gl_PointCoord);
  vec4 bubbleTex = texture2D(uBubbleMap, gl_PointCoord);
  vec4 tex = mix(orbTex, bubbleTex, uMix);

  vec3 baseColor = mix(uOrbColor, uBubbleColor, uMix);
  // 参考映像にあるマゼンタ〜紫のボケた光は光る玉フェーズだけの表現。
  // uMixが泡フェーズへ進むにつれて紫みも一緒に消え、通常の泡の色に戻る
  float tintAmount = vTint * (1.0 - uMix);
  vec3 color = mix(baseColor, uOrbTintColor, tintAmount);

  gl_FragColor = vec4(color, tex.a * vOpacity * uOpacity);
}
`;

type BubblesProps = {
  /** 泡の中心(鳥居の位置)。半径・角度はここからのオフセット */
  position: [number, number, number];
  /**
   * 星降る海の進行度(0〜1)を持つ ref。強さと表示/非表示をここに連動させる。
   * 立ち上がり/収まりの間ずっと値が変わるため、数値 prop だと親ごと毎フレーム
   * 再レンダーされる。ref で受け取り useFrame の中で uniform へ入れる。
   */
  activationRef?: RefObject<number>;
  /**
   * 転調直前の暗転の減光係数(1=そのまま, <1=暗い)を持つ ref。
   * Sandbox3D が毎フレーム更新する。再レンダーを避けるため prop ではなく
   * ref で受け取り、useFrame の中で不透明度に掛ける(玉/泡の切り替わり
   * タイミングを決める heavyActivation には掛けない)。
   */
  dimRef?: RefObject<number>;
  /**
   * 魚の大群・水中フィルターの進行度(0〜1)を持つ ref。0=「光る玉」の見た目、
   * 1=泡の見た目で、HEAVY_EFFECTS_DELAY_SECONDS経過後にこの値自体が
   * アニメーションするのに合わせて見た目もなめらかにクロスフェードする。
   */
  heavyActivationRef?: RefObject<number>;
  count?: number;
};

/**
 * 星降る海モード中、水中を立ち上る粒。
 * 位置は毎フレーム計算してPointsのpositionバッファへ直接書き込む
 * (粒ごとの個体差は円周上の初期角度・上る速さ・大きさ・左右のゆれで出している)。
 *
 * 星降る海に入った瞬間から出し続けるが、見た目は heavyActivation に応じて
 * 「光る玉」(鳥居の発光と同じネオン)から「泡」(水中の泡らしい見た目)へ
 * なめらかにクロスフェードする(2枚のテクスチャ・色をシェーダーでmix)。
 */
export function Bubbles({
  position,
  activationRef,
  dimRef,
  heavyActivationRef,
  count = BUBBLE_COUNT,
}: BubblesProps) {
  const items = useBubbleField(count);
  const pointsRef = useRef<Points>(null);
  // マテリアルは <shaderMaterial> のrefから触る(useMemoで作った値を
  // useFrame内で直接書き換えるとreact-hooks/immutabilityに引っかかるため)
  const materialRef = useRef<ShaderMaterial>(null);
  const orbTexture = useMemo(() => createOrbTexture(), []);
  const bubbleTexture = useMemo(() => createBubbleTexture(), []);
  const uniforms = useMemo(
    () => ({
      uOrbMap: { value: orbTexture },
      uBubbleMap: { value: bubbleTexture },
      uOrbColor: { value: new Color(ORB_COLOR) },
      uBubbleColor: { value: new Color(BUBBLE_COLOR) },
      uOrbTintColor: { value: new Color(ORB_TINT_COLOR) },
      uMix: { value: 0 },
      uOpacity: { value: MAX_OPACITY },
      uHeightMin: { value: HEIGHT_MIN },
      uHeightMax: { value: HEIGHT_MAX },
    }),
    [orbTexture, bubbleTexture],
  );

  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const opacities = new Float32Array(count);
    const tints = new Float32Array(count);
    items.forEach((data, i) => {
      sizes[i] = data.size;
      opacities[i] = data.opacityScale;
      tints[i] = data.tint;
    });
    geo.setAttribute("position", new BufferAttribute(positions, 3));
    geo.setAttribute("aSize", new BufferAttribute(sizes, 1));
    geo.setAttribute("aOpacity", new BufferAttribute(opacities, 1));
    geo.setAttribute("aTint", new BufferAttribute(tints, 1));
    return geo;
  }, [count, items]);

  useFrame(({ clock }) => {
    if (!pointsRef.current) return;
    const positionAttr = geometry.getAttribute("position") as BufferAttribute;
    const elapsed = clock.elapsedTime;
    const span = HEIGHT_MAX - HEIGHT_MIN;

    items.forEach((data, i) => {
      // 0〜1で下端→上端。剰余で折り返し、上まで来たら下からまた上り直す
      const progress =
        ((elapsed + data.risePhase) % data.riseSeconds) / data.riseSeconds;
      const y = HEIGHT_MIN + progress * span;

      /*
        現実の泡は水の抵抗で左右に不規則にふらつきながら上る。
        x/zを同じ位相のsin一本で動かすと直線往復に見えてしまうため、
        周波数比をずらした別々のsinで動かし、ジグザグの軌道にする。
      */
      const swayX = Math.sin(elapsed * data.swaySpeed + data.swayPhase) * SWAY_AMPLITUDE;
      const swayZ =
        Math.sin(elapsed * data.swaySpeed * 1.37 + data.swayPhaseZ) *
        SWAY_AMPLITUDE *
        0.8;
      const x = position[0] + Math.cos(data.angle) * data.radius + swayX;
      const z = position[2] + Math.sin(data.angle) * data.radius + swayZ;

      positionAttr.setXYZ(i, x, position[1] + y, z);
    });

    positionAttr.needsUpdate = true;

    // 進行度・玉/泡の切り替え・転調直前の暗転はすべてref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef?.current ?? 0;
    if (materialRef.current) {
      materialRef.current.uniforms.uOpacity.value =
        MAX_OPACITY * activation * (dimRef?.current ?? 1);
      // heavyActivation(0〜1)をそのままmix係数にして、光る玉→泡へなめらかに変える
      materialRef.current.uniforms.uMix.value = heavyActivationRef?.current ?? 0;
    }
    // 減光は明るさだけなので、表示判定は素の activation で見る
    pointsRef.current.visible = activation > 0.02;
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
