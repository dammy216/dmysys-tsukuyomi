"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  DoubleSide,
  Group,
  LinearFilter,
  MeshBasicMaterial,
  NormalBlending,
  SRGBColorSpace,
  VideoTexture,
} from "three";

/** 画面の縦幅。横幅は映像に合わせて16:9で決まる */
const SCREEN_HEIGHT = 9;
const SCREEN_WIDTH = SCREEN_HEIGHT * (16 / 9);

/** 鳥居(上端がおよそy=7)の上に浮かせる高さ */
const FLOAT_Y = 14;

/** ふわりと上下する幅と速さ。完全に静止しているとパネルが置物に見える */
const BOB_AMPLITUDE = 0.35;
const BOB_SPEED = 0.6;

/** 画面のまわりに出す光の縁の太さ */
const GLOW_MARGIN = 0.7;

/**
 * 転調(1:22)後、魚が SURGE_COLOR_GAIN 分明るくなって画面の手前を
 * 加算合成で埋めてしまうため、映像側もその分だけ明るく張り合わせて
 * 埋もれにくくする。
 *
 * ただし乗算(scale)で持ち上げる以上、影響が一番大きいのは
 * 元から明るい部分(映像のハイライト)で、輝度1.0付近の画素はすぐ
 * 頭打ち(toneMapped=false かつ加算合成なので clamp されて白飛び)し、
 * さらに Bloom(luminanceThreshold=0.4)がそこへ乗って画面全体が
 * 白く滲む。逆に暗い部分(魚の光に埋もれて見えにくい箇所)は
 * 乗算では持ち上がらないので、狙った効果もあまり出ない。
 * そのため上乗せ量は控えめに留め、白飛びより「気持ち負けにくくなる」
 * 程度に留める(強い対抗策は StarfallSwarm.tsx の SCREEN_CLEAR_RADIUS
 * 側=魚を画面から遠ざける方に持たせている)。
 */
const SURGE_BRIGHTNESS_BOOST = 0.18;

/**
 * 転調直前の暗転(preDim)で、映像をどこまで暗くするか(0=変化なし〜1=真っ暗)。
 * 魚(StarfallSwarm.tsxのPRE_SURGE_DARKEN=0.75)ほど強くはせず、
 * 「少し暗くなる」程度に抑える。
 */
const PRE_SURGE_DARKEN = 0.3;

/*
  画面の輝度を上げる(SURGE_BRIGHTNESS_BOOST)だけでは、映像のハイライトが
  先に白飛びしてしまい効果が薄い(上のコメント参照)。加算合成は足し算しか
  できないので、そもそも魚の光を弱める側でないと根本的には効かない。

  そこで映像のすぐ後ろに、通常の(加算ではない)半透明の黒い板を挟む。
  StarfallSwarm.tsx が魚を renderOrder=1 で最後に描いているため、この板を
  さらに後ろ(大きい renderOrder)に置くと「そこまでに積み上がった色」を
  黒でうっすら覆い焼き込める。魚の光をここで一段沈めてから、映像本体を
  さらにそのあと(最大の renderOrder)に描けば、映像自体は暗くならずに
  背後の魚の主張だけ弱められる。
  ホログラムらしい透過感を壊さないよう、黒さは控えめに留める。
*/
/** 通常時の黒板の濃さ(0=無し〜1=完全に黒で塗りつぶす) */
const BACKDROP_DARKEN = 0.32;
/** 転調中に上乗せする濃さ。魚が SURGE_COLOR_GAIN で明るくなる分の埋め合わせ */
const BACKDROP_SURGE_EXTRA = 0.18;

type ToriiHologramProps = {
  /** 鳥居の中心位置。ここを基準に上へ浮かべる */
  position?: [number, number, number];
  /** 映す映像。useStarfallSong が用意したミュート済みの要素が入る */
  videoRef: RefObject<HTMLVideoElement | null>;
  /**
   * 0=非表示 / 1=全開。星降る海の進行度を持つ ref。合わせて濃くなる。
   * 立ち上がり/収まりの間ずっと値が変わるため、preDimRef と同じく ref で
   * 受け取り useFrame の中で各マテリアルの不透明度へ反映する
   * (数値 prop だと親ごと毎フレーム再レンダー)。
   */
  activationRef?: RefObject<number>;
  /**
   * 転調(動画1:22)の進行度(0〜1)を持つ ref。Sandbox3D側で StarfallSwarm と
   * 同じ値を毎フレーム更新する。魚の発光に埋もれないよう映像の輝度を上乗せする。
   * SURGE_FADE_SECONDS の間ずっと値が変わるため、preDimRef と同じく ref で
   * 受け取り useFrame の中でマテリアルへ反映する(数値 prop だと毎フレーム再レンダー)。
   */
  surgeRef?: RefObject<number>;
  /**
   * 転調直前の暗転の進行度(0〜1)を持つ ref。Sandbox3D側で StarfallSwarm と
   * 同じ値を毎フレーム更新する。魚ほどではなく少しだけ映像を暗くする。
   * 暗転ランプ中の毎フレーム再レンダーを避けるため prop(数値)ではなく ref。
   */
  preDimRef?: RefObject<number>;
};

/**
 * 鳥居の上に浮かぶホログラムの画面。ライブ映像をそのまま映す。
 *
 * 加算合成で描くことで、映像の暗い部分が透けて背景の魚が見える。
 * 不透明な板にすると「宙に浮いたテレビ」になってしまい、
 * ホログラムらしい透過感が出ない。
 */
export function ToriiHologram({
  position = [0, 0, 0],
  videoRef,
  activationRef,
  surgeRef,
  preDimRef,
}: ToriiHologramProps) {
  const groupRef = useRef<Group>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  // 光の縁・黒板は surge / preDim を掛けるので useFrame から触る
  const glowEdgeMaterialRef = useRef<MeshBasicMaterial>(null);
  const backdropMaterialRef = useRef<MeshBasicMaterial>(null);
  const textureRef = useRef<VideoTexture | null>(null);

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
      const texture = new VideoTexture(video);
      texture.minFilter = LinearFilter;
      texture.magFilter = LinearFilter;
      texture.colorSpace = SRGBColorSpace;

      textureRef.current = texture;
      material.map = texture;
      material.needsUpdate = true;
    }
    /*
      転調で魚が明るくなる(SURGE_COLOR_GAIN)ぶんに合わせて映像の輝度を上げ、
      転調直前(preDim)は逆に少し暗くする。surge / preDim はどちらも ref 経由
      (数値 prop だと転調・暗転の遷移中ずっと毎フレーム再レンダーしてFPSが落ちる)。
      光の縁(glowEdge)・黒板(backdrop)の不透明度もここで一緒に反映する。
    */
    const activation = activationRef?.current ?? 0;
    const surge = surgeRef?.current ?? 0;
    const preDim = preDimRef?.current ?? 0;
    const surgeBoost = 1 + surge * SURGE_BRIGHTNESS_BOOST;
    const dimFactor = 1 - preDim * PRE_SURGE_DARKEN;
    if (material && textureRef.current) {
      material.color.setScalar(surgeBoost * dimFactor);
      // 映像本体の不透明度。activation もref経由(数値propだと親ごと毎フレーム再レンダー)
      material.opacity = activation;
    }
    if (glowEdgeMaterialRef.current) {
      glowEdgeMaterialRef.current.opacity =
        0.22 * activation * surgeBoost * dimFactor;
    }
    if (backdropMaterialRef.current) {
      backdropMaterialRef.current.opacity =
        Math.min(BACKDROP_DARKEN + surge * BACKDROP_SURGE_EXTRA, 0.6) * activation;
    }

    const group = groupRef.current;
    if (!group) return;

    /*
      星降る海の演出中はカメラが360度回り込むので、板のままだと
      真横や裏側から見たときに消えてしまう。Y軸だけで向きを合わせ、
      常に正面を見せつつ画面は立てたままにする。
    */
    group.rotation.y = Math.atan2(
      camera.position.x - position[0],
      camera.position.z - position[2],
    );

    group.position.y =
      position[1] +
      FLOAT_Y +
      Math.sin(clock.elapsedTime * BOB_SPEED) * BOB_AMPLITUDE;
  });

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1] + FLOAT_Y, position[2]]}
    >
      {/* 画面のうしろに一回り大きい光を敷いて、縁が発光しているように見せる */}
      <mesh position={[0, 0, -0.05]}>
        <planeGeometry
          args={[SCREEN_WIDTH + GLOW_MARGIN, SCREEN_HEIGHT + GLOW_MARGIN]}
        />
        {/* opacity は useFrame で activation/surge/preDim ぶん反映して毎フレーム上書きする。ここは初期値 */}
        <meshBasicMaterial
          ref={glowEdgeMaterialRef}
          color="#5de3e6"
          transparent
          opacity={0}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
      </mesh>

      {/*
        魚(renderOrder=1、StarfallSwarm.tsx参照)より後に描いて、そこまでに
        積み上がった色をうっすら黒で覆い焼きする。映像本体は加算合成なので
        ここでは沈められない(このあと更に上に重ねて描くため)。
      */}
      <mesh renderOrder={2}>
        <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
        {/* opacity は useFrame で activation/surge ぶん反映して毎フレーム上書きする。ここは初期値 */}
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
        {/* 映像が貼られるまでは黒 = 加算合成では透明。opacity は useFrame で activation を反映 */}
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
