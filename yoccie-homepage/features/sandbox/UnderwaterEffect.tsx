"use client";

import { Effect } from "postprocessing";
import { Uniform } from "three";
import type { WebGLRenderer, WebGLRenderTarget } from "three";
import { wrapEffect } from "@react-three/postprocessing";

/*
  画面全体を「水の中から見上げている」ように見せるポストエフェクト。
  ライブ映像の水面越しカット(0:21〜0:23)を狙っていて、要素は2つ:

  1. mainImage で青緑にかぶらせ、水を通した色にする
  2. 横に伸びた白青のきらめき(コースティクス)を加算で重ねる

  以前は mainUv でUVそのものをうねらせていたが、ホログラム映像
  (ToriiHologram)まで一緒に波打って見えてしまうため廃止した。
  ピクセル位置は動かさず、色を足すだけにして画面全体を静止させている。
  2は画面の上ほど強い。上を水面側とみなすことで、下に行くほど
  深く沈んでいくような奥行きが出る。
*/
const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uStrength;
uniform float uAspect;
// 1=そのまま / <1=転調直前の暗転でコースティックの筋・ベールを薄める
uniform float uCausticDim;

/*
  水面で屈折した光が作る、横に伸びた明るい筋。
  波の山だけを pow で尖らせると、なだらかな明暗ではなく
  細い光の筋として立ち上がる。
*/
float causticBand(vec2 p, float t) {
  float v = sin(p.x * 6.0 + t * 1.1 + sin(p.y * 9.0 - t * 1.4) * 2.2)
          + sin(p.y * 20.0 - t * 2.0 + sin(p.x * 2.5 + t * 0.7) * 1.8);
  v *= 0.5;
  return pow(max(v, 0.0), 5.0);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 color = inputColor.rgb;
  if (uStrength <= 0.001) {
    outputColor = vec4(color, inputColor.a);
    return;
  }

  vec2 p = vec2(uv.x * uAspect, uv.y);
  float t = uTime;

  // 水を通した色かぶり。赤を落として青緑に寄せる
  vec3 waterTint = color * vec3(0.6, 0.94, 1.08);
  color = mix(color, waterTint, uStrength * 0.75);

  // 水面のきらめき。上ほど強く、下は減衰させて“深さ”を出す。
  // 転調直前の暗転(uCausticDim)では魚・水面の光と一緒に筋も薄める
  float top = smoothstep(0.15, 1.0, uv.y);
  color += vec3(0.45, 0.85, 1.0) * causticBand(p, t) * top * uStrength * 0.7 * uCausticDim;

  // 画面のいちばん上。水面直下の明るいベール
  float veil = smoothstep(0.72, 1.0, uv.y);
  color += vec3(0.30, 0.62, 0.78) * veil * uStrength * 0.2 * uCausticDim;

  outputColor = vec4(color, inputColor.a);
}
`;

/** 水中エフェクト本体。強さ(strength)は毎フレーム外から書き換える想定 */
export class UnderwaterEffectImpl extends Effect {
  constructor({ strength = 1 }: { strength?: number } = {}) {
    super("UnderwaterEffect", fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ["uTime", new Uniform(0)],
        ["uStrength", new Uniform(strength)],
        ["uAspect", new Uniform(1)],
        ["uCausticDim", new Uniform(1)],
      ]),
    });
  }

  /** 0で無効、1でフル。Sandbox3D の useFrame から書き換える */
  get strength() {
    return this.uniforms.get("uStrength")!.value as number;
  }

  set strength(value: number) {
    this.uniforms.get("uStrength")!.value = value;
  }

  /** コースティックの筋・ベールの減光係数(1=そのまま, <1=暗い)。Sandbox3D から書き換える */
  get causticDim() {
    return this.uniforms.get("uCausticDim")!.value as number;
  }

  set causticDim(value: number) {
    this.uniforms.get("uCausticDim")!.value = value;
  }

  /*
    時間は自前で積む。EffectComposer 側の time を使うと
    他のエフェクトと共有されて調整しづらいため。
  */
  update(_renderer: WebGLRenderer, _inputBuffer: WebGLRenderTarget, deltaTime: number) {
    const time = this.uniforms.get("uTime")!;
    time.value = (time.value as number) + deltaTime;
  }

  /** 波の形が画面比で歪まないようにアスペクト比を渡す */
  setSize(width: number, height: number) {
    this.uniforms.get("uAspect")!.value = height > 0 ? width / height : 1;
  }
}

/** EffectComposer の子として置く水中エフェクト */
export const Underwater = wrapEffect(UnderwaterEffectImpl);
