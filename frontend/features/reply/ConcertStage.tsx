"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
} from "three";
import type { WebGLProgramParametersWithUniforms } from "three";
import { useFrame } from "@react-three/fiber";
import { sampleCastleProjection } from "./castleProjectionPalette";
import { REPLY_GLOW_COLOR, STAGE_RADIUS, STAGE_THICKNESS } from "./constants";

/**
 * 縁のライトアップの最大の明るさ。他の発光(天守の投影・ビーム等)と比べて
 * 見劣りするという指摘(ユーザー)で、以前の0.45から引き上げた。
 * additive合成 + toneMapped=false なので、1を超える値もそのままブルームの
 * 種になる(下の RIM_CHASE_PEAK が主にそれを担う)。
 */
const RIM_OPACITY_MAX = 0.9;
/** 周回する光の速さ(1周/秒)。ゆっくり回るくらいが上品なので遅めに */
const RIM_CHASE_SPEED = 0.15;
/**
 * 尾の長さ(リング1周を1とした割合)。「もっと尾を長くして」で0.4まで
 * 伸ばしたが、ユーザー指定で「尾の長さは元に戻して、代わりに頭を2つにする」
 * (下の RIM_CHASE_HEAD_COUNT 参照)方針になったため、0.1へ戻す。
 */
const RIM_CHASE_TAIL_LENGTH = 0.2;
/**
 * 周回する頭の数。1つだと寂しいとの指定で、リングを等間隔に分けた位置に
 * 複数の頭を置く(2つなら真裏の位置に1つ追加)。頭どうしは同じ速さ・
 * 同じ尾の長さで、位相だけ 1/RIM_CHASE_HEAD_COUNT ずつずらして周回する。
 */
const RIM_CHASE_HEAD_COUNT = 2;
/** 光の帯が通り過ぎたあとの地の明るさ(1=素の色そのまま)。もう少し暗くしたい指定で0.4から下げた */
const RIM_CHASE_FLOOR = 0.1;
/** 光の帯のピークの明るさ倍率。1を超えてブルームに沈み込む強さにする */
const RIM_CHASE_PEAK = 2.6;

type GlowMaterial = MeshBasicMaterial & {
  userData: { shader?: WebGLProgramParametersWithUniforms };
};

type ConcertStageProps = {
  /** 甲板の上面を置くワールド座標 */
  position?: [number, number, number];
  /**
   * Reply の進行度(0〜1)を持つ ref。縁のライトアップの明るさをこれに
   * 連動させる。立ち上がり/収まりの間ずっと変わるため ref で受け取り
   * useFrame で読む(数値 prop だと親ごと毎フレーム再レンダー)。
   */
  activationRef?: RefObject<number>;
  /**
   * 曲の再生位置(秒)を持つ ref。縁のリングの色を castleProjectionPalette の
   * セクション配色(EdoCastle/CornerTowers が天守に纏わせているのと同じ色)に
   * 連動させるために使う。渡さなければ 0 秒として扱う(常にイントロの配色)。
   */
  songTimeRef?: RefObject<number>;
};

/**
 * 天守の上に張り出すライブステージ。円形の甲板に、宮島鳥居(小×2)と
 * 大鳥居(ToriiGate、中央)を横一列に載せる構成が指定
 * (鳥居側の配置は SceneContents.tsx 参照)。
 *
 * シンプルな黒い甲板+ 縁のわずかなライトアップ。真っ黒だけだと寂しい
 * という指定で、以前の派手な光る円盤・縁取りは戻さず、輪郭を淡く
 * 浮かせる程度のリングだけ足してある。
 */
/**
 * 縁のリング専用マテリアルを1回だけ作る。CylinderGeometry(openEnded)の
 * UV.x は円周を0〜1で一周する値になるので、これを角度の代わりに使って
 * 「光の帯が周回する」アニメーションを作る(ユーザー指定「光が枠の中を
 * ぐるぐる回っているようなアニメーションをつけてほしい」)。
 *
 * 標準の vUv varying は USE_UV が立っていないと生成されないことがある
 * (map等を使っていないため)ので、自前の varying(vRingUv)を仕込んで
 * uv 属性を直接渡す ―― ToriiGate.tsx / MiyajimaTorii.tsx の高さグラデーション
 * と同じ「onBeforeCompileでシェーダーを拡張し、shader を userData に控えて
 * useFrameからuniformを直接更新する」手法。
 */
function createRimMaterial(): GlowMaterial {
  const material = new MeshBasicMaterial({
    color: REPLY_GLOW_COLOR,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
  }) as GlowMaterial;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uChaseTime = { value: 0 };

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vRingUv;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRingUv = uv;");

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uChaseTime;\nvarying vec2 vRingUv;",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        /*
          頭(いちばん明るい点)は uChaseTime に応じて円周(vRingUv.x, 0〜1)を
          +方向へ巡る。**尾は進行方向の後ろだけに伸びる非対称の減衰**
          (以前は頭の前後対称に短く光るだけの帯だった)。
          「頭から見てどれだけ後ろ(進んできた側)か」を distanceBehind とする:
          頭のuv座標そのものでは0、頭が来た方向(-u側)へ辿るほど増え、
          頭の目の前(+u側、まだ通っていない場所)でちょうど1に戻って
          ループする(継ぎ目なく後ろへ辿れるのはfractの巻き戻りのおかげ)。

          **頭は RIM_CHASE_HEAD_COUNT 個、リングを等間隔に分けた位置に立てる**
          (ユーザー指定「尾の長さは元に戻して、代わりに2つにして」)。
          頭ごとに 1/HEAD_COUNT ずつ位相をずらして同じ式を評価し、
          いちばん明るい頭の寄与を採用する(max。重ならない程度に尾を短く
          してあるので、単純な足し算にすると重なった瞬間だけ不自然に
          明るくなる心配もない)。
        */
        float ringChase = 0.0;
        for (int ringHeadI = 0; ringHeadI < ${RIM_CHASE_HEAD_COUNT}; ringHeadI++) {
          float ringHeadPhase = float(ringHeadI) / ${RIM_CHASE_HEAD_COUNT.toFixed(1)};
          float ringDistanceBehind = fract(uChaseTime * ${RIM_CHASE_SPEED.toFixed(4)} - vRingUv.x + ringHeadPhase);
          ringChase = max(ringChase, smoothstep(${RIM_CHASE_TAIL_LENGTH.toFixed(4)}, 0.0, ringDistanceBehind));
        }
        diffuseColor.rgb *= mix(${RIM_CHASE_FLOOR.toFixed(4)}, ${RIM_CHASE_PEAK.toFixed(4)}, ringChase);`,
      );

    material.userData.shader = shader;
  };

  return material;
}

export function ConcertStage({
  position = [0, 0, 0],
  activationRef,
  songTimeRef,
}: ConcertStageProps) {
  const rimMaterial = useMemo(() => createRimMaterial(), []);
  /*
    useFrame内でuseMemoの戻り値を直接書き換えるとreact-hooks/immutabilityに
    引っかかるため、refへコピーしてそちら経由で触る(ToriiGate.tsxと同じ手当て)。
  */
  const rimMaterialRef = useRef<GlowMaterial>(rimMaterial);
  useEffect(() => {
    rimMaterialRef.current = rimMaterial;
    return () => rimMaterial.dispose();
  }, [rimMaterial]);

  /*
    sampleCastleProjection は3色ぶんの出力を要求する in-place API だが、
    このリングは1色(多数派のA)しか使わない。B/Cは使わないが useFrame の
    中で new しないための使い回し用として一緒に確保しておく。
  */
  const projection = useMemo(
    () => ({ a: new Color(), b: new Color(), c: new Color() }),
    [],
  );

  useFrame(({ clock }) => {
    const material = rimMaterialRef.current;
    // 進行度はref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef?.current ?? 0;
    material.opacity = activation * RIM_OPACITY_MAX;
    /*
      縁のリングは天守のプロジェクションマッピングと同じ配色(多数派の
      outA)で揃える。EdoCastle/CornerTowers と同じ関数・同じ曲の再生位置
      (songTimeRef)で呼ぶので、独立に計算しても天守側の色と必ず一致する
      (WashLight.tsx が BeamLight.tsx と同じ考え方でセクション色を独立に
      算出しているのと同じ理屈)。
    */
    const songTime = songTimeRef?.current ?? 0;
    sampleCastleProjection(songTime, projection.a, projection.b, projection.c);
    material.color.copy(projection.a);

    /*
      周回する光の位相は clock.elapsedTime で回す(EdoCastle.tsx の
      uProjTime と同じ ―― 曲の進行に依存しない、常時回り続ける演出のため)。
      シェーダーはWebGLが初回コンパイルするまで生成されない(マウント直後の
      数フレームは未生成のことがある)ため、存在チェックしてから触る。
    */
    const shader = material.userData.shader;
    if (shader) shader.uniforms.uChaseTime.value = clock.elapsedTime;
  });

  return (
    <group position={position}>
      {/* 甲板本体。上面がちょうど position の高さに来るよう半分だけ下げる */}
      <mesh position={[0, -STAGE_THICKNESS / 2, 0]}>
        <cylinderGeometry
          args={[STAGE_RADIUS, STAGE_RADIUS * 0.94, STAGE_THICKNESS, 64]}
        />
        <meshStandardMaterial color="#0a0a0a" roughness={0.8} metalness={0} />
      </mesh>

      {/* 縁を一周するライン。光の帯が周回しながら、真っ黒な甲板を夜空から浮かせる */}
      <mesh position={[0, -STAGE_THICKNESS / 2, 0]} material={rimMaterial}>
        <cylinderGeometry
          args={[
            STAGE_RADIUS * 1.005,
            STAGE_RADIUS * 1.005,
            STAGE_THICKNESS * 0.45,
            64,
            1,
            true,
          ]}
        />
      </mesh>
    </group>
  );
}
