"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  LinearFilter,
  MeshBasicMaterial,
  NormalBlending,
  SRGBColorSpace,
  VideoTexture,
} from "three";
import { sampleCastleProjection } from "./castleProjectionPalette";
import {
  HOLOGRAM_HEIGHT,
  REPLY_GLOW_COLOR,
  REPLY_HOLOGRAM_TINT,
} from "./constants";

/**
 * 画面の縦幅。横幅は映像の実寸(1920x1080 = 16:9)に合わせる。
 * 高さは constants 側と共有する(REPLY_HOLOGRAM_Y の算出にも使うため、
 * ここで別に持つとズレて鳥居との間合いが狂う)。
 */
const SCREEN_HEIGHT = HOLOGRAM_HEIGHT;
const SCREEN_ASPECT = 1920 / 1080;
const SCREEN_WIDTH = SCREEN_HEIGHT * SCREEN_ASPECT;

/** ふわりと上下する幅と速さ。完全に静止しているとパネルが置物に見える */
const BOB_AMPLITUDE = 0.35;
const BOB_SPEED = 0.6;

/** 画面のまわりに出す光の縁の太さ */
const GLOW_MARGIN = 0.7;

/**
 * 映像に掛ける赤みの色。加算合成の meshBasicMaterial では
 * material.color が map への乗算になるので、実質ここが映像の色味になる。
 * 完全な赤(1,0,0)にすると青緑の情報が消えて潰れるため、
 * 赤を残しつつ緑青を落とす程度に留める。
 */
const TINT = new Color(REPLY_HOLOGRAM_TINT);

/**
 * 映像tintをどれだけ天守の演出色(sampleCastleProjection の多数派A)へ
 * 寄せるか(0=常にTINTのまま、1=完全にセクション色)。
 *
 * 縁の光(glowEdgeMaterialRef)はConcertStage/ToriiGateと同じく完全に
 * セクション色へ連動させるが、映像本体は実写素材なので話が別
 * ―― サビの暖色やAメロの寒色を強くかけると色情報が潰れて視認性が
 * 落ちるリスクがある(TINTが「赤を残しつつ緑青を落とす程度」に
 * 留めているのと同じ理由)。赤みを軸にしつつ、セクションの空気だけ
 * ほんのり乗る程度の弱いブレンドに留める(ユーザー指定)。
 */
const TINT_SECTION_BLEND = 0.35;

/*
  映像のすぐ後ろに敷く半透明の黒い板。ホログラムらしい透過感を保ったまま、
  背後(城・鳥居・夜空)が画面を透けて騒がしくなるのを抑える。
  ToriiHologram.tsx と同じ手当てだが、Reply には魚群が無いぶん薄くてよい。
*/
const BACKDROP_DARKEN = 0.28;

type ReplyHologramProps = {
  /** 画面の中心のワールド座標 */
  position?: [number, number, number];
  /** 映す映像。useReplySong が用意した(音声トラックの無い)要素が入る */
  videoRef: RefObject<HTMLVideoElement | null>;
  /**
   * 0=非表示 / 1=全開。Reply の進行度を持つ ref。合わせて濃くなる。
   * 立ち上がり/収まりの間ずっと値が変わるため ref で受け取り、useFrame の中で
   * 各マテリアルの不透明度へ反映する(数値 prop だと親ごと毎フレーム再レンダー)。
   */
  activationRef?: RefObject<number>;
  /**
   * 曲の再生位置(秒)を持つ ref。縁の光をConcertStage/ToriiGateと同じ
   * castleProjectionPaletteのセクション配色に連動させ、映像tintもごく
   * 弱く(TINT_SECTION_BLEND)そちらへ寄せるために使う。渡さなければ
   * 0秒として扱う(常にイントロの配色)。
   */
  songTimeRef?: RefObject<number>;
};

/**
 * ステージの鳥居の上に浮かぶホログラムの画面。Reply のライブ映像を赤みがかった
 * 色で映す。
 *
 * 加算合成で描くことで、映像の暗い部分が透けて背景が見える。
 * 不透明な板にすると「宙に浮いたテレビ」になってしまい、
 * ホログラムらしい透過感が出ない(ToriiHologram.tsx と同じ考え方)。
 */
export function ReplyHologram({
  position = [0, 0, 0],
  videoRef,
  activationRef,
  songTimeRef,
}: ReplyHologramProps) {
  const groupRef = useRef<Group>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  const glowEdgeMaterialRef = useRef<MeshBasicMaterial>(null);
  const backdropMaterialRef = useRef<MeshBasicMaterial>(null);
  const textureRef = useRef<VideoTexture | null>(null);
  /*
    sampleCastleProjection は3色ぶんの出力を要求する in-place API だが、
    ここでは多数派のAしか使わない。B/Cは使わないがuseFrameの中でnewしない
    ための使い回し用として一緒に確保しておく(ConcertStage.tsxと同じ手当て)。
    tint用のscratchも同様にここで確保する(TINT自体を直接lerpで書き換えると
    共有定数が壊れてしまうため)。
  */
  const projection = useMemo(
    () => ({ a: new Color(), b: new Color(), c: new Color(), tint: new Color() }),
    [],
  );

  // テクスチャはGPU資源を持つので、外れるときに解放する
  useEffect(() => {
    return () => {
      textureRef.current?.dispose();
      textureRef.current = null;
    };
  }, []);

  useFrame(({ clock, camera }) => {
    /*
      映像要素は ref 経由で後から入るため、再描画のきっかけがない。
      そこで毎フレーム様子を見て、入り次第この場で一度だけ貼る。
      それまでは色が黒で、加算合成では黒＝透明なので何も映らない。
    */
    const material = materialRef.current;
    const video = videoRef.current;
    if (material && video && !textureRef.current) {
      // 生成は !textureRef.current ガードで一度きり（毎フレームではない）
      // eslint-disable-next-line @react-three/no-new-in-loop
      const texture = new VideoTexture(video);
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.colorSpace = SRGBColorSpace;

      textureRef.current = texture;
      material.map = texture;
      material.needsUpdate = true;
    }

    // 進行度はref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef?.current ?? 0;
    /*
      天守のプロジェクションマッピングと同じ配色(多数派のoutA)を、
      ConcertStage/ToriiGateと同じ関数・同じ曲の再生位置で独立に算出する
      (WashLight.tsxがBeamLight.tsxと同じ考え方でセクション色を独立に
      算出しているのと同じ理屈。同じsongTimeなら必ず結果が一致する)。
    */
    const songTime = songTimeRef?.current ?? 0;
    sampleCastleProjection(songTime, projection.a, projection.b, projection.c);
    if (material && textureRef.current) {
      /*
        映像tintは赤みを軸に、セクション色をTINT_SECTION_BLENDぶんだけ
        弱く混ぜる(実写素材なので完全にセクション色へ振ると色情報が
        潰れて視認性が落ちるため。ReplyHologram.tsx冒頭のコメント参照)。
        TINT自体は複数フレーム・複数インスタンスで共有する定数なので、
        書き換え用のscratch(projection.tint)へ複製してから混ぜる。
      */
      projection.tint.copy(TINT).lerp(projection.a, TINT_SECTION_BLEND);
      material.color.copy(projection.tint);
      material.opacity = activation;
    }
    if (glowEdgeMaterialRef.current) {
      // 縁の光は純粋な合成光なので、他の演出と同じく完全にセクション色へ揃える
      glowEdgeMaterialRef.current.color.copy(projection.a);
      glowEdgeMaterialRef.current.opacity = 0.22 * activation;
    }
    if (backdropMaterialRef.current) {
      backdropMaterialRef.current.opacity = BACKDROP_DARKEN * activation;
    }

    const group = groupRef.current;
    if (!group) return;

    /*
      Reply の演出中もカメラが塔のまわりを回り込むので、板のままだと
      真横や裏側から見たときに消えてしまう。Y軸だけで向きを合わせ、
      常に正面を見せつつ画面は立てたままにする。
    */
    group.rotation.y = Math.atan2(
      camera.position.x - position[0],
      camera.position.z - position[2],
    );

    group.position.y =
      position[1] + Math.sin(clock.elapsedTime * BOB_SPEED) * BOB_AMPLITUDE;
  });

  return (
    <group ref={groupRef} position={position}>
      {/* 画面のうしろに一回り大きい光を敷いて、縁が発光しているように見せる */}
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry
          args={[SCREEN_WIDTH + GLOW_MARGIN, SCREEN_HEIGHT + GLOW_MARGIN]}
        />
        {/* opacity は useFrame で activation を反映して毎フレーム上書きする。ここは初期値 */}
        <meshBasicMaterial
          ref={glowEdgeMaterialRef}
          color={REPLY_GLOW_COLOR}
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>

      {/* 背景を沈める黒板。映像本体より先(小さい renderOrder)に描く */}
      <mesh renderOrder={2}>
        <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
        {/* opacity は useFrame で activation を反映して毎フレーム上書きする。ここは初期値 */}
        <meshBasicMaterial
          ref={backdropMaterialRef}
          color="#000000"
          transparent
          opacity={0}
          blending={NormalBlending}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>

      <mesh renderOrder={3}>
        <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
        {/* 映像が貼られるまでは黒 = 加算合成では透明。色/opacity は useFrame で上書き */}
        <meshBasicMaterial
          ref={materialRef}
          color="#000000"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
