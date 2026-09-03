"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  ShaderMaterial,
} from "three";
import { BEAM_COLORS, CASTLE_HALF_DEPTH, CASTLE_HALF_WIDTH } from "./constants";

/**
 * 本数。参照映像(Reply.mp4 0:07〜)では天守の左右から何本も伸びているので、
 * 一周ぐるりと配置して、どの角度から見ても数本が画に入るようにする。
 */
const BEAM_COUNT = 12;
/**
 * ビームの長さ。
 *
 * 70では引きの画で先端が画面内に収まってしまい、光が途中でぶつ切りに
 * なっているのが見えていた。空へ抜けきる長さまで伸ばして、さらに
 * シェーダー側で先端を完全に減衰させて切れ目を消す(BEAM_FRAGMENT 参照)。
 * 水面(半径400)の内側には収まるので、伸ばしても地面から飛び出さない。
 */
const BEAM_LENGTH = 200;
/**
 * 先端の半径。根元は0(コーンの頂点)で、先へ行くほど広がる。
 * 細すぎると引きの画で線にもならず消えるので、太めに取る。
 * BEAM_LENGTH と比例させてあり(70:6 と同じ広がり角)、長さを変えても
 * ビームの太さの印象は変わらない。
 */
const BEAM_RADIUS = 17;
/** 光源の高さ。水面のすぐ上から放つ */
const BEAM_ORIGIN_Y = 2.5;
/**
 * 光源を天守の中心からどれだけ外へ出すか。
 *
 * **天守の外周より外に出すこと。** 固定値(7)にしていたころは、
 * CASTLE_SCALE を上げて天守が大きくなった結果、光源が天守の内側に埋まり、
 * ビームが石垣の途中から生えているように見えていた。天守の底面の広がり
 * (実測で半径約19.7)に追従させて、常に外側から放つようにする。
 */
const BEAM_ORIGIN_RADIUS =
  Math.max(CASTLE_HALF_WIDTH, CASTLE_HALF_DEPTH) * 1.4;

/** 鉛直からの傾き(ラジアン)。大きいほど寝て、外へ広がる */
const BEAM_TILT_BASE = 0.62;
/** 首振りの幅と速さ。全部が同じ動きだと機械的なので位相をずらす */
const BEAM_SWING = 0.22;
const BEAM_SWING_SPEED = 0.55;
/** 全体をゆっくり回す速さ(ラジアン/秒) */
const BEAM_SPIN_SPEED = 0.12;

/** 明滅。曲に合わせた解析まではせず、緩やかな脈動だけ入れる */
const BEAM_PULSE_SPEED = 2.3;
const BEAM_PULSE_DEPTH = 0.35;

/** ビーム1本の最大の濃さ。加算合成なので上げすぎると空が白飛びする */
const BEAM_OPACITY_MAX = 0.85;

const BEAM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

/*
  コーンの側面に光の減衰を描く。ConeGeometry の uv.y は底面0・頂点1で、
  頂点側を光源(根元)に持ってきてあるので、vUv.y が1に近いほど根元。
  根元を強く、先へ向かって細く消していく。
*/
const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;

  void main() {
    /*
      根元(vUv.y=1)が最も強い。先端へ向かって落とすが、落としすぎると
      空へ抜けていく部分が消えてビームに見えなくなるので、下限を高く取る。
    */
    float y = clamp(vUv.y, 0.0, 1.0);
    float along = mix(0.3, 1.0, pow(y, 1.4));
    // 根元の一点だけ極端に光るのを避ける
    along *= 1.0 - smoothstep(0.93, 1.0, y) * 0.55;
    /*
      先端(vUv.y=0)は完全に0まで落とす。ここを 0.3 で打ち切っていたころは
      コーンの底面の縁がそのまま「光の切れ目」として見えていた。
      BEAM_LENGTH が200あるので、この 0.28 の帯だけで56ワールド単位ぶん
      かけて消えることになり、空へ溶けていくように見える。
    */
    along *= smoothstep(0.0, 0.28, y);

    /*
      コーンをそのまま塗ると、光の筒ではなく半透明の円錐に見えてしまう。
      視線に対して寝ている面(＝シルエットの縁)ほど、光の筒を長く貫いて
      見ていることになるので明るくする。これで中身の詰まった塊ではなく
      「空へ伸びる光の筋」として読める。

      **pow の底は必ず 0 以上に丸めること。**
      正規化ベクトル同士の内積は理論上 |dot| <= 1 だが、浮動小数点誤差で
      1.0000001 のような値が出る。すると 1.0 - abs(dot) が -1e-7 になり、
      GLSL の pow は負の底に対して未定義 = NaN を返す。この NaN が加算合成で
      フレームバッファへ書き込まれると、そのピクセルは黒くなるだけでなく
      **下に描いてあった天守やステージごと壊す**。コーン面がカメラを正面から
      向くほど(＝カメラが近いほど広範囲で)起きるため、「近いと画面が真っ黒・
      遠ざかると治る」という形で表面化していた。
    */
    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vViewDir);
    float facing = clamp(abs(dot(n, v)), 0.0, 1.0);
    float graze = pow(max(1.0 - facing, 0.0), 1.6);

    // 念のため出力もクランプしておく(NaN/負値をフレームバッファへ流さない)
    float a = clamp(along * graze * uOpacity, 0.0, 1.0);
    gl_FragColor = vec4(uColor * a, a);
  }
`;

type Beam = {
  /** 円周上の配置角(ラジアン) */
  angle: number;
  /** 首振りの位相 */
  phase: number;
  color: Color;
};

type StageBeamsProps = {
  /** 天守の底面のワールド座標。EdoCastle と同じ値を渡す */
  position?: [number, number, number];
  /**
   * ビームの出具合(0〜1)を持つ ref。11秒の瞬間に立ち上げる。
   * 毎フレーム変わるので数値 prop ではなく ref で受け取る。
   */
  activationRef: RefObject<number>;
};

/**
 * 天守の背後から放射状に伸びるサーチライト。
 *
 * Reply.mp4 の 0:07〜0:11 で、暗い天守の左右から緑・マゼンタ・橙のビームが
 * 何本も空へ抜けていくカットが指定。曲が11秒に達した瞬間に点灯する
 * (SceneContents 側で activationRef を立ち上げる)。
 *
 * 実際のボリュームライトは重いので、加算合成のコーンを並べた見立て。
 * 12本 × 三角形数十枚なので描画コストは無視できる。
 */
export function StageBeams({
  position = [0, 0, 0],
  activationRef,
}: StageBeamsProps) {
  const groupRef = useRef<Group>(null);
  const materialsRef = useRef<ShaderMaterial[]>([]);

  const beams = useMemo<Beam[]>(() => {
    const list: Beam[] = [];
    for (let i = 0; i < BEAM_COUNT; i++) {
      list.push({
        angle: (i / BEAM_COUNT) * Math.PI * 2,
        // 隣どうしが揃わないよう、位相を黄金角でずらす
        phase: i * 2.399,
        color: new Color(BEAM_COLORS[i % BEAM_COLORS.length]),
      });
    }
    return list;
  }, []);

  /*
    コーンは既定で頂点が +h/2・底面が -h/2。回して平行移動し、
    「頂点が原点、+Y方向へ広がりながら伸びる」形にしておく。
    こうしておくと、あとは group を傾けるだけで狙った向きへ撃てる。
  */
  const geometry = useMemo(() => {
    const g = new ConeGeometry(BEAM_RADIUS, BEAM_LENGTH, 18, 1, true);
    g.rotateX(Math.PI);
    g.translate(0, BEAM_LENGTH / 2, 0);
    return g;
  }, []);

  const materials = useMemo(
    () =>
      beams.map(
        (b) =>
          new ShaderMaterial({
            uniforms: {
              uColor: { value: b.color },
              uOpacity: { value: 0 },
            },
            vertexShader: BEAM_VERTEX,
            fragmentShader: BEAM_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: AdditiveBlending,
            side: DoubleSide,
            toneMapped: false,
          }),
      ),
    [beams],
  );

  useEffect(() => {
    materialsRef.current = materials;
    // GPU資源なので外れるときに解放する
    return () => {
      materials.forEach((m) => m.dispose());
      geometry.dispose();
    };
  }, [materials, geometry]);

  useFrame(({ clock }) => {
    // 出具合はref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef.current ?? 0;
    const t = clock.elapsedTime;

    const group = groupRef.current;
    if (group) {
      // 全体をゆっくり回す。首振りは各ビームの傾きで付ける
      group.rotation.y = t * BEAM_SPIN_SPEED;
      group.children.forEach((child, i) => {
        const beam = beams[i];
        /*
          傾けるのは中の mesh。外側の group は配置角(Y回転)を持っているので、
          そこへ X 回転を足すと Euler の合成順(three既定のXYZ)の都合で
          全ビームが同じ方向へ倒れてしまう。親でY、子でXと分けるのが正しい。
        */
        const mesh = child.children[0];
        if (!beam || !mesh) return;
        mesh.rotation.x =
          BEAM_TILT_BASE +
          Math.sin(t * BEAM_SWING_SPEED + beam.phase) * BEAM_SWING;
      });
    }

    materialsRef.current.forEach((mat, i) => {
      const pulse =
        1 - BEAM_PULSE_DEPTH * (0.5 + 0.5 * Math.sin(t * BEAM_PULSE_SPEED + i));
      mat.uniforms.uOpacity.value = activation * BEAM_OPACITY_MAX * pulse;
    });
  });

  return (
    <group ref={groupRef} position={position}>
      {beams.map((beam, i) => (
        /*
          外側の group で配置角を決め、内側の mesh を傾ける。
          傾きは毎フレーム useFrame から書き換えるのでここは初期値。
        */
        <group
          key={beam.angle}
          position={[
            Math.sin(beam.angle) * BEAM_ORIGIN_RADIUS,
            BEAM_ORIGIN_Y,
            Math.cos(beam.angle) * BEAM_ORIGIN_RADIUS,
          ]}
          rotation={[0, beam.angle, 0]}
        >
          <mesh
            geometry={geometry}
            material={materials[i]}
            rotation={[BEAM_TILT_BASE, 0, 0]}
            // 空へ長く伸びるので、天守の bbox ではカリングされてしまう
            frustumCulled={false}
          />
        </group>
      ))}
    </group>
  );
}
