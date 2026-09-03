"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Mesh, MeshStandardMaterial } from "three";
import type { Group, Material, PointLight } from "three";
import { CASTLE_SCALE, CASTLE_TOP_Y, REPLY_GLOW_COLOR } from "./constants";
import {
  applyCastleBuildShader,
  BUILD_TOP_Y,
  type BuildUniforms,
  createCastleBuildUniforms,
  PROJECTION_INTENSITY_MAX,
} from "./castleBuildShader";

const MODEL_PATH = "/3DModel/944e48f240cc449abb5ecc969051b155/scene.gltf";

/*
  テクスチャ(フォトグラメトリの焼き込み写真)は使わない。天守は黒く沈めておき、
  Reply.mp4 の 0:07〜0:11 と同じく「暗い城にステージ照明が這う」画を作る。
  スキャンの baseColor には昼の陰影が焼き込まれていて、夜の景色に置くと
  そこだけ写真が浮いてしまうため。組み上げ + 投影光のシェーダーは隅櫓
  (CornerTowers)と共有で castleBuildShader.ts にある。
*/
/** 地の色。ほぼ黒。形を作るのは投影光とポイントライトだけ */
const BODY_COLOR = "#0a0708";

/** 足元から天守を舐め上げる赤いライト。輪郭を夜空から浮かせる */
const UPLIGHT_INTENSITY_MAX = 420;
/** 裏からの縁取り。屋根の稜線を夜空から切り出す */
const RIMLIGHT_INTENSITY_MAX = 260;

type PreparedCastle = {
  scene: Group;
  materials: MeshStandardMaterial[];
  buildUniforms: BuildUniforms;
};

/**
 * シーンを複製し、
 *  - baseColor を emissiveMap に流用した自己発光
 *  - 下から組み上がる演出(セル単位で切り落とす + 面で光る帯)
 * を仕込んだマテリアルへ差し替える。GLTFキャッシュのマテリアルを直接
 * 触らないよう必ず clone する(MiyajimaTorii.tsx と同じ手当て)。
 */
function usePreparedCastle(): PreparedCastle {
  const { scene } = useGLTF(MODEL_PATH);

  return useMemo(() => {
    const clone = scene.clone(true);
    const materials: MeshStandardMaterial[] = [];
    // 天守1棟ぶんの共有 uniform(castleBuildShader.ts のコメント参照)
    const buildUniforms = createCastleBuildUniforms();

    /*
      元マテリアル → 差し替え後、のキャッシュ。

      この GLTF はメッシュ4つが同じマテリアル1個を参照している。メッシュごとに
      作り直すと、three は customProgramCacheKey(既定は onBeforeCompile の
      ソース文字列)が同じマテリアル同士でシェーダープログラムを共有し、
      **2個目以降では onBeforeCompile を呼ばない**。すると uniform が渡らず
      uBuildOn=0 のまま = 組み上げ演出が効かない。1個だけ作って共有する。
    */
    const converted = new Map<Material, MeshStandardMaterial>();

    clone.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const source = child.material;
      const list = Array.isArray(source) ? source : [source];
      const next = list.map((mat: Material) => {
        const done = converted.get(mat);
        if (done) return done;

        /*
          このモデルは KHR_materials_unlit 付きなので、GLTFLoader が作るのは
          MeshBasicMaterial。unlit のままだとライトも emissive も一切効かず、
          焼き込まれた昼のテクスチャがベタっと出るだけになる(組み上げ用の
          onBeforeCompile も MeshStandard 前提のチャンク名なので当たらない)。
          ここで MeshStandardMaterial へ作り替える。

          テクスチャ(map)は引き継がない。スキャンの写真には昼の陰影が
          焼き込まれていて夜の景色から浮くため、鳥居と同じく「建物自体が
          高さで橙→赤に光る」表現へ置き換える(発光は下のシェーダー側)。
        */
        const src = mat as Material & {
          side?: MeshStandardMaterial["side"];
        };
        const copy = new MeshStandardMaterial({
          color: BODY_COLOR,
          side: src.side,
          transparent: mat.transparent,
          alphaTest: mat.alphaTest,
          // 石垣・瓦。てかりは出さない
          roughness: 0.9,
          metalness: 0,
        });

        /*
          組み上げ + 投影光シェーダーを仕込む(castleBuildShader.ts)。
          cacheKey は個体ごとに一意にして、将来マテリアルが増えても three が
          必ず onBeforeCompile を呼ぶようにする(uniform は同じ参照を配る)。
        */
        applyCastleBuildShader(
          copy,
          buildUniforms,
          `edo-castle-build-${converted.size}`,
        );

        converted.set(mat, copy);
        materials.push(copy);
        return copy;
      });
      child.material = Array.isArray(source) ? next : next[0];
    });

    return { scene: clone, materials, buildUniforms };
  }, [scene]);
}

type EdoCastleProps = {
  /** 城の底面を置くワールド座標。モデルは底面がちょうど y=0 に来る */
  position?: [number, number, number];
  /**
   * Reply の進行度(0〜1)を持つ ref。自己発光と足元のライトをこれに連動させる。
   * 立ち上がり/収まりの間ずっと値が変わるため、数値 prop だと親ごと
   * 毎フレーム再レンダーされる。ref で受け取り useFrame の中で反映する。
   */
  activationRef?: RefObject<number>;
  /**
   * 組み上げの進行度(0〜1)を持つ ref。0で何も無い状態、1で天守が完成。
   * これも毎フレーム変わるので ref で受け取る。
   */
  buildRef?: RefObject<number>;
  /**
   * ステージ照明の点灯具合(0〜1)を持つ ref。曲が11秒に達してから立ち上がる。
   * 投影光(プロジェクションマッピング)はこれに連動させ、組み上げ中の天守は
   * 黒いシルエットのままにしておく。
   */
  lightsRef?: RefObject<number>;
};

/**
 * 【3DScan】江戸城 寛永度天守閣 (Sketchfab Standard License)
 * https://sketchfab.com/3d-models/3dscan-edo-castle-944e48f240cc449abb5ecc969051b155
 * by BENA-3DSolution (https://sketchfab.com/BENA-ArchitecturalModeling)
 *
 * Reply モードの土台。星降る海で鳥居が立っていた位置にそのまま置き換わり、
 * 天守の上へステージ → 宮島の鳥居 → ホログラムと積み上がる。
 * 押した直後は下から組み上がって現れる(CastleAssembly.tsx の飛来ブロックと対)。
 */
export function EdoCastle({
  position = [0, 0, 0],
  activationRef,
  buildRef,
  lightsRef,
}: EdoCastleProps) {
  const { scene, materials, buildUniforms } = usePreparedCastle();
  /*
    useFrame 内で useMemo の戻り値を直接書き換えると react-hooks/immutability に
    引っかかるため、ref へコピーしてそちら経由で触る(MiyajimaTorii.tsx と同じ)。
  */
  const materialsRef = useRef<MeshStandardMaterial[]>([]);
  const uniformsRef = useRef<BuildUniforms | null>(null);
  const uplightRef = useRef<PointLight>(null);
  const rimlightRef = useRef<PointLight>(null);

  useEffect(() => {
    materialsRef.current = materials;
    uniformsRef.current = buildUniforms;
    /*
      GLTF から複製ではなく作り直したマテリアルなので、外れるときに解放する
      (テクスチャは useGLTF のキャッシュと共有しているので dispose しない)。
    */
    return () => {
      materials.forEach((mat) => mat.dispose());
    };
  }, [materials, buildUniforms]);

  useFrame(({ clock }) => {
    // 進行度はどちらもref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef?.current ?? 0;
    const build = buildRef?.current ?? 1;
    const lights = lightsRef?.current ?? 1;

    /*
      uniform は全マテリアルで共有しているので1回書けば足りる
      (シェーダーのコンパイル前でも、この値がそのまま初期値として渡る)。

      - 投影光: 天守に這うステージ照明。強さは activation に連動
      - 組み上げ面: base(position[1])から BUILD_TOP_Y まで上がる。
        組み上がりきったら uBuildOn=0 にして分岐ごと止める(以降は素通し)
    */
    const uniforms = uniformsRef.current;
    if (uniforms) {
      // 投影光は11秒(lights)から。それまで天守は黒いシルエットのまま
      uniforms.uProjStrength.value = activation * lights * PROJECTION_INTENSITY_MAX;
      uniforms.uProjTime.value = clock.elapsedTime;
      uniforms.uProjBaseY.value = position[1];
      uniforms.uProjTopY.value = position[1] + CASTLE_TOP_Y;
      uniforms.uBuildY.value = position[1] + build * BUILD_TOP_Y;
      uniforms.uBuildOn.value = build < 1 ? 1 : 0;
    }

    /*
      ライトは組み上がりに合わせて立ち上げる。まだ天守が無いうちから
      煌々と照らしていると、何も無い空間が光って見えてしまう。
    */
    const lightGain = activation * build;
    if (uplightRef.current) {
      uplightRef.current.intensity = lightGain * UPLIGHT_INTENSITY_MAX;
    }
    if (rimlightRef.current) {
      rimlightRef.current.intensity = lightGain * RIMLIGHT_INTENSITY_MAX;
    }
  });

  return (
    <group position={position}>
      <primitive object={scene} scale={CASTLE_SCALE} />
      {/* 石垣のあたりから天守を舐め上げる赤いライト */}
      <pointLight
        ref={uplightRef}
        position={[0, 1.5, 6]}
        color={REPLY_GLOW_COLOR}
        distance={44}
        decay={1.6}
        intensity={0}
      />
      {/* 裏手からの縁取り。屋根の稜線を夜空から浮かせる */}
      <pointLight
        ref={rimlightRef}
        position={[-4, CASTLE_TOP_Y * 0.75, -10]}
        color="#ffd8b0"
        distance={50}
        decay={1.7}
        intensity={0}
      />
    </group>
  );
}

useGLTF.preload(MODEL_PATH);
