"use client";

import { Suspense, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshReflectorMaterial, OrbitControls, Stats } from "@react-three/drei";
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  Vignette,
} from "@react-three/postprocessing";
import type {
  BloomEffect,
  ChromaticAberrationEffect,
  DepthOfFieldEffect,
  VignetteEffect,
} from "postprocessing";
import { Vector2 } from "three";
import { MiyajimaTorii } from "./MiyajimaTorii";
import { WaterGlow } from "./WaterGlow";
import { SeaGlow } from "./SeaGlow";
import { ShootingStars } from "./ShootingStars";
import { Lanterns } from "./Lanterns";
import { StarfallSwarm } from "./StarfallSwarm";
import { StarfallCamera } from "./StarfallCamera";
import { ToriiHologram } from "./ToriiHologram";
import { SkyBackground, type SkyVariant } from "./SkyBackground";
import { Underwater, type UnderwaterEffectImpl } from "./UnderwaterEffect";
import { Bubbles } from "./Bubbles";
import { Credits } from "./Credits";
import styles from "./Sandbox3D.module.css";

/** 鳥居の中心。被写界深度のピント位置もここに合わせる */
const TORII_POSITION: [number, number, number] = [0, 0, -2];
/** ピントを合わせる高さ（鳥居の中ほど） */
const FOCUS_TARGET: [number, number, number] = [0, 3, -2];

/**
 * 星降る海モード中、カメラが回る中心をホログラム画面にするための注視点。
 * ToriiHologram の TORII_POSITION + FLOAT_Y(14) に合わせてある
 * (StarfallCamera.tsx の SCREEN_FOCUS と同じ値。値を変えるときは3箇所とも直すこと)。
 */
const SCREEN_FOCUS: [number, number, number] = [0, 14, -2];
/** 通常モード(星降る海OFF)でのOrbitControlsの注視点。鳥居の中ほど */
const NORMAL_ORBIT_TARGET: [number, number, number] = [0, 2, -2];

/** 色収差のズレ量。強すぎると輪郭が滲んで“ぼやけ”に見えるため控えめにする */
const ABERRATION_OFFSET = new Vector2(0.0004, 0.0006);

/** 星降る海モードの立ち上がり/収まりにかかる秒数 */
const STARFALL_FADE_SECONDS = 1.6;

/**
 * ボタンを押してから、魚の大群(StarfallSwarm)と水中フィルター(Underwater)を
 * 立ち上げるまでの遅延秒数。泡(Bubbles)はこの間も出したままだが、見た目だけ
 * 鳥居の発光と同じ「光る玉」にしておき、この秒数が経ってから泡の見た目に
 * 切り替わる(Bubbles.tsx参照)。
 */
const HEAVY_EFFECTS_DELAY_SECONDS = 20.5;

/**
 * 水中エフェクトの強さ。通常時はOFF(BASE=0)にしておき、星降る海が
 * 始まった瞬間から水に沈んでいくように FULL まで立ち上げる。
 */
const UNDERWATER_BASE = 0;
const UNDERWATER_FULL = 1;
/**
 * 転調中に水中フィルターをどれだけ弱めるか(0=そのまま, 1=完全に無効)。
 * このフィルターは赤を落として青緑に寄せるため、強いままだと転調で
 * 増やしたマゼンタ・黄の粒が青側に引き戻されて色が立たない。
 */
const UNDERWATER_SURGE_RELIEF = 0.65;

/**
 * ホログラムに映る動画がこの時刻(1:22)に達したら転調演出に入る。
 * HEAVY_EFFECTS_DELAY_SECONDSと違い、ボタンを押してからの経過時間ではなく
 * 動画自体の再生位置(currentTime)で判定する(曲の見せ場に同期させるため)。
 * StarfallCamera.tsx の DOLLY_IN_END_SECONDS(カメラがホログラムから離れ始める
 * 時刻)と同じ値。変えるときは両方直すこと。
 */
const SURGE_START_SECONDS = 82;

/**
 * 転調に入る何秒前から魚を暗くし始めるか。1:13(73秒)から暗くし始めたいので
 * SURGE_START_SECONDS(82秒)との差の9秒にしてある。
 */
const PRE_SURGE_WINDUP_SECONDS = 9;
/**
 * 暗くなり始め(windupStart)から何秒で最も暗い状態まで達するか。
 * PRE_SURGE_WINDUP_SECONDSより短くすることで、暗くなり始めるタイミングは
 * そのままに、暗くなりきるまでの速さだけ早める。最大まで達したあとは
 * 転調(SURGE_START_SECONDS)まで最も暗い状態を維持し、転調の閃光と
 * 入れ替わりで一気に明るくなる。
 */
const PRE_SURGE_RAMP_SECONDS = 0.4;
/**
 * 転調直前の暗転で、水面の光・泡をどこまで暗くするか(0=変化なし〜1=真っ暗)。
 * 魚(StarfallSwarm.tsx)側は同じ意図の値をシェーダーの定数として別に持っているので、
 * 見た目の暗さを揃えたい場合はそちらの PRE_SURGE_DARKEN も合わせて変えること。
 */
const PRE_SURGE_DARKEN = 0.75;
/**
 * 鳥居の発光は魚(PRE_SURGE_DARKEN=0.75)ほどは落とさないが、ホログラム映像
 * (ToriiHologram.tsxのPRE_SURGE_DARKEN=0.3)よりは一段暗くして、暗転で
 * 鳥居のシルエットが浮かないようにする。
 */
const TORII_PRE_SURGE_DARKEN = 0.5;

/*
  転調(動画1:22)に合わせた盛り上げ演出。参考映像でも同じ時刻で
  白い閃光を挟んでから、それまでの青一色の世界が
  マゼンタ・黄・シアン・緑のネオンが乱舞する画へ切り替わる。
  閃光で「切り替わった」瞬間ははっきり見せつつ、色自体はここでアニメーション的に
  クロスフェードさせる(短すぎると色の変化がコマ送りのように一気に見えてしまう)。
*/
/** 転調の色・光量が切り替わるまでの秒数 */
const SURGE_FADE_SECONDS = 1.4;
/**
 * 転調の瞬間に一度だけ焚く白い閃光の長さ(秒)。
 * これがあることで色が変わる瞬間が「切り替わった」とはっきり分かる。
 */
const SURGE_FLASH_SECONDS = 0.5;
/** 閃光のピーク時に足す露出。1.0で通常の倍の明るさになる */
const SURGE_FLASH_EXPOSURE = 1.15;

/**
 * ホログラムに映る動画がこの時刻(2:18)に達したら、演出をまとめて
 * フェードアウトして星降る海に入る前の見た目へ戻す(曲の終わりの余韻)。
 * 動画・音源は141.8秒でループするので、0秒へ戻ればまた最初から立ち上がる。
 */
const OUTRO_START_SECONDS = 138;
/**
 * フェードアウトにかける秒数。立ち上がり(STARFALL_FADE_SECONDS=1.6秒)より
 * ゆっくりにして、余韻を残しながら静かに引いていくようにする。
 */
const OUTRO_FADE_SECONDS = 4;

/** 反射する水面 */
function Water() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <circleGeometry args={[400, 64]} />
      <MeshReflectorMaterial
        blur={[200, 60]}
        resolution={512}
        mixBlur={1}
        mixStrength={35}
        roughness={0.6}
        depthScale={1}
        minDepthThreshold={0.85}
        color="#0a1a2e"
        metalness={0.4}
      />
    </mesh>
  );
}

/**
 * シーン本体。useFrame は Canvas の中でしか使えないため、
 * Canvas 直下のこのコンポーネントに演出のロジックをまとめている。
 */
function SceneContents({
  skyVariant,
  starfallSea,
  starfallFreeCam,
  hologramVideoRef,
}: {
  skyVariant: SkyVariant;
  starfallSea: boolean;
  starfallFreeCam: boolean;
  hologramVideoRef: RefObject<HTMLVideoElement | null>;
}) {
  /*
    「星降る海」の進行度(0〜1)。ONで1へ、OFFで0へゆっくり動く。

    surgeActivationRef / preSurgeDimRef と同じ理由で state ではなく ref:
    立ち上がり/収まり(STARFALL_FADE_SECONDS)・アウトロ(OUTRO_FADE_SECONDS)の
    間は値が毎フレーム変わるため、state だと SceneContents ツリー全体が
    その間ずっと再レンダーされる。各コンポーネントは ref を受け取り、
    自分の useFrame で uniform・マテリアルへ直接反映する。
    表示/非表示の切り替え(数フレームに一度しか起きない)だけは下の
    starfallVisible(state)で持つ。
  */
  const activationRef = useRef(0);
  /*
    赤い鳥居(MiyajimaTorii)・水面の光(WaterGlow・SeaGlow)専用の進行度(0〜1)。
    activationRef と違い、アウトロ(2:18〜)でも0へ落とさない。曲が終わって
    魚や水中フィルターが引いたあとも、鳥居と水面の光だけは灯したまま
    残しておきたいという指定のため、starfallSeaのON/OFFだけで決まる
    (inOutroを見ない)別のランプとして持つ。これも ref。
  */
  const persistActivationRef = useRef(0);
  /*
    魚の大群(StarfallSwarm)・水中フィルター(Underwater)専用の進行度(0〜1)。
    starfallSea が true になった時刻(starfallStartRef)から
    HEAVY_EFFECTS_DELAY_SECONDS 経つまでターゲットは0のまま。これも ref。
  */
  const heavyActivationRef = useRef(0);
  /*
    魚の渦・ホログラム・レンズ効果を出すかどうか。activationRef が
    0.01 を跨いだときだけ切り替える。連続値ではないので state で持ってよい
    (1セッションで数回しか変わらない)。
  */
  const [starfallVisible, setStarfallVisible] = useState(false);
  /*
    転調(1:22)の進行度(0〜1)。魚のパレットを派手なほうへ寄せる。
    ホログラム動画の再生位置(SURGE_START_SECONDS)で判定し、
    SURGE_FADE_SECONDSで一気に振り切って「切り替わった」感を出す。

    preSurgeDimRef と同じ理由で state ではなく ref: この値は
    SURGE_FADE_SECONDS(1.6秒)かけて毎フレーム変わるため、state だと
    その間ずっと SceneContents ツリー全体が再レンダーされて FPS が落ちる
    (流れ星は転調と同時に降り始めるので「流れ星で重い」ように見えるが、
     実体はこの再レンダー)。surge を使う StarfallSwarm / ToriiHologram /
    ShootingStars は ref を受け取り、自分の useFrame で uniform へ入れる。
  */
  const surgeActivationRef = useRef(0);
  /*
    転調直前だけ魚などを暗くする進行度(0〜1)。動画の再生位置(videoTime)だけで
    決まる純粋な値なので、他のactivation群と違い delta で積み上げず毎フレーム
    直接計算する。転調に入った瞬間(videoTime>=SURGE_START_SECONDS)に0へ
    戻り、閃光(surgeFlash)と入れ替わるように明るさが切り替わる。

    state ではなく ref で持つ: 暗転ランプ中は値が毎フレーム変わるため、
    state だと SceneContents ツリー全体(数千匹の StarfallSwarm 含む)が
    毎フレーム再レンダーされて FPS が落ちる。各コンポーネントは下の
    preSurgeDimRef / glowDimRef / toriiDimRef を受け取り、自分の useFrame の
    中で uniform・マテリアルへ直接反映する(bloom などのレンズ効果と同じ方式)。
  */
  const preSurgeDimRef = useRef(0);
  /*
    上の preSurgeDim から毎フレーム導く減光係数(1=そのまま, <1=暗い)。
    水面の光・泡は glowDimRef、鳥居の発光は toriiDimRef を掛ける。
    掛ける相手(activation 等)は各コンポーネントが prop で受け取る。
  */
  const glowDimRef = useRef(1);
  const toriiDimRef = useRef(1);
  // starfallSea が true になった瞬間の clock.elapsedTime。未開始は null
  const starfallStartRef = useRef<number | null>(null);
  /*
    転調の閃光の残り時間(秒)。転調に入った瞬間だけ SURGE_FLASH_SECONDS を
    セットし、以降フレームごとに減らす。再生位置が戻れば(リプレイ)
    また焚けるよう、転調していない間は「未発火」に戻す。
    stateではなくrefなのは、毎フレーム変わる値で再レンダーを起こさないため。
  */
  const surgeFlashRef = useRef(0);
  const surgeFiredRef = useRef(false);
  const dofRef = useRef<DepthOfFieldEffect>(null);
  const bloomRef = useRef<BloomEffect>(null);
  const aberrationRef = useRef<ChromaticAberrationEffect>(null);
  const vignetteRef = useRef<VignetteEffect>(null);
  const underwaterRef = useRef<UnderwaterEffectImpl>(null);
  const aberrationOffset = useRef(new Vector2()).current;

  useFrame(({ clock, gl }, delta) => {
    /*
      転調・アウトロの判定を先に済ませる。閃光の明るさ(flash)は下の
      露出・ブルームの計算で足すため、ここで確定させておく。
    */
    const videoTime = hologramVideoRef.current?.currentTime ?? 0;
    // 曲の終わり。ここに入ったら演出をまとめて畳んで元の景色へ戻す
    const inOutro = starfallSea && videoTime >= OUTRO_START_SECONDS;
    const inSurge = starfallSea && videoTime >= SURGE_START_SECONDS && !inOutro;

    /*
      転調直前の暗転(windup)。SURGE_START_SECONDSのPRE_SURGE_WINDUP_SECONDS秒前から
      暗くなり始め、PRE_SURGE_RAMP_SECONDSで0→1に達したらそこで頭打ちにして
      転調まで最も暗い状態を維持する。
      転調に入った後(inSurge)は、色・光量の切り替え(surgeActivationRef、
      SURGE_FADE_SECONDS)とまったく同じ速さで暗さを解いていく。
      ここを一瞬で0に戻すと、色は徐々に混ざっているのに明るさだけ一気に
      戻ってしまい、全体としては「一瞬で切り替わった」ように見えてしまう
      (surgeActivationRef は1フレーム前の値を参照しているが、60fps前提では
      無視できる遅れなので問題ない)。
    */
    const windupStart = SURGE_START_SECONDS - PRE_SURGE_WINDUP_SECONDS;
    let preDimNow = 0;
    if (starfallSea && !inOutro) {
      if (inSurge) {
        preDimNow = 1 - surgeActivationRef.current;
      } else if (videoTime >= windupStart) {
        preDimNow = Math.min((videoTime - windupStart) / PRE_SURGE_RAMP_SECONDS, 1);
      }
    }
    /*
      state ではなく ref へ書く(再レンダーを起こさない)。減光係数もここで
      毎フレーム導いて、各コンポーネントの useFrame から参照させる。
    */
    preSurgeDimRef.current = preDimNow;
    glowDimRef.current = 1 - preDimNow * PRE_SURGE_DARKEN;
    toriiDimRef.current = 1 - preDimNow * TORII_PRE_SURGE_DARKEN;
    // 転調直前の暗転では水中のコースティックの筋も水面の光と同じだけ薄める
    if (underwaterRef.current) {
      underwaterRef.current.causticDim = glowDimRef.current;
    }

    // アウトロ中はどの演出もターゲット0へ、立ち上がりよりゆっくり引かせる
    const target = starfallSea && !inOutro ? 1 : 0;
    const step = delta / (inOutro ? OUTRO_FADE_SECONDS : STARFALL_FADE_SECONDS);

    if (inSurge) {
      // 転調に入った最初の1フレームだけ閃光を焚く
      if (!surgeFiredRef.current) {
        surgeFiredRef.current = true;
        surgeFlashRef.current = SURGE_FLASH_SECONDS;
      }
    } else {
      // 巻き戻し・OFFで未発火に戻し、リプレイでもう一度焚けるようにする
      surgeFiredRef.current = false;
    }
    surgeFlashRef.current = Math.max(surgeFlashRef.current - delta, 0);
    // 焚いた瞬間が最大で、そこから線形に消える
    const flash =
      (surgeFlashRef.current / SURGE_FLASH_SECONDS) * SURGE_FLASH_EXPOSURE;

    // 赤い鳥居・水面の光はアウトロでも落とさないので、inOutroを見ないターゲットで動かす
    const persistTarget = starfallSea ? 1 : 0;
    const persistStep = delta / STARFALL_FADE_SECONDS;
    if (persistActivationRef.current !== persistTarget) {
      persistActivationRef.current =
        persistActivationRef.current < persistTarget
          ? Math.min(persistActivationRef.current + persistStep, persistTarget)
          : Math.max(persistActivationRef.current - persistStep, persistTarget);
    }

    // 星降る海の進行度。state ではなく ref へ積む(再レンダーを起こさない)
    const prevActivation = activationRef.current;
    if (activationRef.current !== target) {
      activationRef.current =
        activationRef.current < target
          ? Math.min(activationRef.current + step, target)
          : Math.max(activationRef.current - step, target);
    }
    const next = activationRef.current;

    // 演出が上がるほどレンズ効果を強める。
    // ブルームは光の氾濫、ボケ量はピント外の魚を大きな光の玉に変える。
    // 演出中も“見えなくなる”方向には振らない。ブルームとボケを上げすぎると
    // 画面全体が光の靄になり、魚の粒も鳥居も判別できなくなる。
    //
    // エフェクトはずっと同じ構成でマウントしたままにし、強さだけを0まで
    // 落とす。以前は EffectComposer の子要素を条件分岐で丸ごと差し替えて
    // いたが、@react-three/postprocessing はエフェクト構成が変わるたびに
    // コンポーザーを再構築するため、星降る海が終わる瞬間にレンダーループが
    // 止まり3D画面が固まるバグの原因になっていた。
    //
    // activation が変化しているフレームだけ書き換える(以前 setActivation の
    // updater が prev===target で早期リターンしていた挙動をそのまま踏襲。
    // 立ち上がり・アウトロの間だけ動く)。
    /*
      転調中はブルームを一段強める。粒ひとつひとつの滲みが増えて
      画面全体が光で満ちるため、色の切り替わりと合わさって派手さが出る。
      閃光(flash)の瞬間はさらに上乗せする。
    */
    if (next !== prevActivation) {
      if (bloomRef.current) {
        bloomRef.current.intensity =
          0.8 + next * 0.1 + surgeActivationRef.current * 0.5 + flash * 0.6;
      }
      if (dofRef.current) dofRef.current.bokehScale = next * 0.7;
      if (aberrationRef.current) {
        // 転調中は色収差も強めて、ネオンの縁に色が滲むようにする
        aberrationOffset
          .copy(ABERRATION_OFFSET)
          .multiplyScalar(next * (1 + surgeActivationRef.current * 1.5));
        aberrationRef.current.offset = aberrationOffset;
      }
      if (vignetteRef.current) vignetteRef.current.darkness = next * 0.45;

      // 映像の空はほぼ真っ暗。露出を落として夜側に寄せる。
      // 魚は toneMapped={false} でトーンマッピングを通らないため、
      // 空と鳥居だけが暗くなり、ネオンの粒はそのまま輝いて対比が立つ。
      // 転調の瞬間だけ flash を足して画面を白く飛ばす。
      gl.toneMappingExposure = 1 - next * 0.55 + flash;
    }

    // 魚の渦・ホログラム等の表示切り替え。跨いだ瞬間だけ state を更新する
    // (同じ値なら React 側で bail されるので毎フレーム呼んでも再レンダーは起きない)
    const visibleNow = next > 0.01;
    if (visibleNow !== starfallVisible) setStarfallVisible(visibleNow);

    /*
      HEAVY_EFFECTS_DELAY_SECONDS 経過してから魚の大群・水中フィルターを立ち上げる。
      アウトロ中は起点を毎フレーム「今」へ押し進め続ける。動画・音源は
      141.8秒でループして0秒から再開するが、starfallStartRef自体は
      ボタンを押した瞬間からの経過時間で判定しているため、リセットしないと
      ループ後すぐ heavyReady が立ったままになり、泡が紫/水色の光る玉の
      状態を経ずに一瞬で泡の見た目へ戻ってしまう。アウトロ中に押し進めて
      おくことで、ループ後もまたボタンを押した直後と同じ20.5秒待ちからになる。
    */
    if (inOutro) {
      starfallStartRef.current = clock.elapsedTime;
    } else if (starfallSea) {
      if (starfallStartRef.current === null) {
        starfallStartRef.current = clock.elapsedTime;
      }
    } else {
      starfallStartRef.current = null;
    }
    const heavyReady =
      starfallStartRef.current !== null &&
      clock.elapsedTime - starfallStartRef.current >= HEAVY_EFFECTS_DELAY_SECONDS;
    const heavyTarget = starfallSea && heavyReady && !inOutro ? 1 : 0;

    const prevHeavy = heavyActivationRef.current;
    if (heavyActivationRef.current !== heavyTarget) {
      heavyActivationRef.current =
        heavyActivationRef.current < heavyTarget
          ? Math.min(heavyActivationRef.current + step, heavyTarget)
          : Math.max(heavyActivationRef.current - step, heavyTarget);
    }

    /*
      水中の色かぶり・きらめき。魚の大群と同じタイミングで立ち上げる。
      転調中は弱める: このフィルターは赤を落として青緑へ寄せるため、
      かかったままだとマゼンタ・黄の粒まで青側に引き戻されて、
      せっかくのパレット切り替えが色として立たなくなる。
      heavyActivation が変化しているフレームだけ書き換える(以前
      setHeavyActivation の updater が早期リターンしていた挙動を踏襲)。
    */
    if (heavyActivationRef.current !== prevHeavy && underwaterRef.current) {
      const full =
        UNDERWATER_FULL *
        (1 - surgeActivationRef.current * UNDERWATER_SURGE_RELIEF);
      underwaterRef.current.strength =
        UNDERWATER_BASE + heavyActivationRef.current * (full - UNDERWATER_BASE);
    }

    /*
      転調の色。アウトロでは他の演出と足並みを揃えてゆっくり引かせる
      (ここだけ0.45秒で色が戻ると、引いていく最中に不自然な段差になる)。
    */
    const surgeTarget = inSurge ? 1 : 0;
    const surgeStep = delta / (inOutro ? OUTRO_FADE_SECONDS : SURGE_FADE_SECONDS);
    // state ではなく ref へ積む(再レンダーを起こさない)
    if (surgeActivationRef.current !== surgeTarget) {
      surgeActivationRef.current =
        surgeActivationRef.current < surgeTarget
          ? Math.min(surgeActivationRef.current + surgeStep, surgeTarget)
          : Math.max(surgeActivationRef.current - surgeStep, surgeTarget);
    }
  });

  return (
    <>
      <color attach="background" args={["#1c2540"]} />
      <fog attach="fog" args={["#1c2540", 20, 300]} />

      <ambientLight intensity={0.7} color="#5a6fa8" />
      <directionalLight position={[9, 14, 5]} intensity={2} color="#bcd3ff" />

      <Suspense fallback={null}>
        {/* 星降る海の間は、夕暮れを選んでいても映像と同じ夜空に切り替える */}
        <SkyBackground variant={starfallSea ? "night" : skyVariant} />
        {/*
          映像の鳥居は根本が橙色、上に行くほど赤みが強い発光をしている。
          ポイントライトの反射だけではそこまで光らないため、鳥居のマテリアル
          自体をシェーダーで自己発光させ、高さで橙→赤へ補間している
          (glow=persistActivationで星降る海が始まるほど強く光る。
          アウトロでも落とさないので、曲が終わって魚や水中フィルターが
          引いたあとも鳥居は灯ったまま残る。転調直前の暗転はtoriiDimRefで
          ホログラム映像と同じ控えめな強さだけかける。MiyajimaTorii.tsx参照)。
        */}
        <MiyajimaTorii
          position={TORII_POSITION}
          scale={0.18}
          glowRef={persistActivationRef}
          dimRef={toriiDimRef}
        />
        {/* 本殿の鳥居の真下だけを、なめらかな光の水たまりで照らす(アウトロでも落とさない。転調直前はglowDimRefで暗くなる) */}
        <WaterGlow
          position={TORII_POSITION}
          activationRef={persistActivationRef}
          dimRef={glowDimRef}
        />
        {/* 鳥居のまわりの海面を、柔らかく漂う光のムラで神秘的に満たす(こちらもアウトロで落とさない。転調直前はglowDimRefで暗くなる) */}
        <SeaGlow
          position={TORII_POSITION}
          activationRef={persistActivationRef}
          dimRef={glowDimRef}
        />
        {/*
          曲名「星降る海」にちなんだ流れ星。転調(1:22)の進行度で駆動するので、
          転調と同時に降り始め、アウトロで他の演出と一緒に引いていく。
        */}
        <ShootingStars
          position={TORII_POSITION}
          activationRef={surgeActivationRef}
        />
        {/*
          星降る海: 数千匹のネオンの魚が鳥居を包む大渦になる。
          activation ではなく heavyActivation で駆動し、水中フィルターと同じく
          HEAVY_EFFECTS_DELAY_SECONDS 経ってから立ち上がるようにする。
        */}
        <StarfallSwarm
          position={TORII_POSITION}
          activationRef={heavyActivationRef}
          surgeRef={surgeActivationRef}
          preDimRef={preSurgeDimRef}
        />
        {/*
          水中を立ち上る泡。魚の渦より広い範囲にばらまき、水に沈んだ空気感を足す。
          表示自体は星降る海に入った瞬間から(activation)。見た目だけ
          heavyActivation で切り替え、20.5秒経つまでは鳥居の発光と同じ
          光る玉、経ったら泡の見た目にする(Bubbles.tsx参照)。転調直前は
          dimRef(glowDimRef)で明るさだけ落とす(heavyActivationには掛けない
          =玉/泡の切り替わりタイミングは変えない)。
        */}
        <Bubbles
          position={TORII_POSITION}
          activationRef={activationRef}
          dimRef={glowDimRef}
          heavyActivationRef={heavyActivationRef}
        />
        {/* 鳥居の上に浮かぶホログラム。ライブ映像を流す(音はステム側から鳴らす) */}
        {starfallVisible && (
          <ToriiHologram
            position={TORII_POSITION}
            videoRef={hologramVideoRef}
            activationRef={activationRef}
            surgeRef={surgeActivationRef}
            preDimRef={preSurgeDimRef}
          />
        )}
        {/* 灯ろうは星降る海の演出中は魚の渦と喧嘩するので隠す */}
        {!starfallVisible && <Lanterns />}
        <Water />
      </Suspense>

      {/*
        星降る海モード中でも自由視点(starfallFreeCam)なら演出カメラは止める。
        動画の再生位置を渡しているのは、1:18〜1:22 のホログラムへの寄り引きに
        使うため(StarfallCamera.tsx の DOLLY_IN_START_SECONDS 参照)。
      */}
      <StarfallCamera
        active={starfallSea && !starfallFreeCam}
        activationRef={activationRef}
        videoRef={hologramVideoRef}
      />

      {/*
        通常時、または星降る海モード中でも自由視点を選んでいるときは手動操作を許可する。
        星降る海の演出カメラが動いている間だけ手動操作を止める。
      */}
      <OrbitControls
        makeDefault
        enableDamping
        enabled={!starfallSea || starfallFreeCam}
        // 星降る海モード中はホログラム画面を中心に回す。通常時は鳥居の中ほど
        target={starfallSea ? SCREEN_FOCUS : NORMAL_ORBIT_TARGET}
      />
      <Stats className={styles.stats} />

      {/*
        エフェクトは常に同じ構成でマウントし続け、強さだけを上の useFrame で
        activation に応じて0まで下げる(詳しくは useFrame 内のコメント参照)。
        鳥居にピントを合わせ、そこから大きく外れた手前の魚だけをボケ玉にする。
        focalLength はピントが合って見える奥行きの幅で、小さすぎると
        画面全体がボケて何も見えなくなるため広めに取っている。
      */}
      <EffectComposer>
        {/*
          水中エフェクトは最初に置く。ここで歪ませたあとの映像に対して
          ブルームがかかるので、水面のきらめきもいっしょに滲んで光る。
        */}
        <Underwater ref={underwaterRef} strength={UNDERWATER_BASE} />
        <DepthOfField
          ref={dofRef}
          target={FOCUS_TARGET}
          focalLength={0.9}
          bokehScale={0}
          height={480}
        />
        <Bloom ref={bloomRef} mipmapBlur luminanceThreshold={0.4} intensity={0.8} />
        {/* 色収差。レンズを通した映像らしい滲みを足す */}
        <ChromaticAberration ref={aberrationRef} offset={new Vector2(0, 0)} />
        <Vignette ref={vignetteRef} eskil={false} offset={0.3} darkness={0} />
      </EffectComposer>
    </>
  );
}

/** 3Dサンドボックス。新しい表現を試すための実験場（ここを自由に書き換えていく） */
export function Sandbox3D({
  skyVariant,
  starfallSea = false,
  starfallFreeCam = false,
  hologramVideoRef,
  onCanvasReady,
}: {
  skyVariant: SkyVariant;
  starfallSea?: boolean;
  starfallFreeCam?: boolean;
  hologramVideoRef: RefObject<HTMLVideoElement | null>;
  /** WebGLキャンバスが用意できたら渡す。録画(captureStream)の対象にする */
  onCanvasReady?: (canvas: HTMLCanvasElement) => void;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100dvh",
        background: "#0b1626",
      }}
    >
      {/*
        fov は迫力を出すため広めに取っている(50→68)。
        preserveDrawingBuffer は録画(canvas.captureStream)で確実にフレームを
        拾うために必要。描画コストはごく僅か。
      */}
      <Canvas
        camera={{ position: [0, 3, 11], fov: 68 }}
        gl={{ preserveDrawingBuffer: true }}
        onCreated={({ gl }) => onCanvasReady?.(gl.domElement)}
      >
        <SceneContents
          skyVariant={skyVariant}
          starfallSea={starfallSea}
          starfallFreeCam={starfallFreeCam}
          hologramVideoRef={hologramVideoRef}
        />
      </Canvas>

      <Credits />
    </div>
  );
}
