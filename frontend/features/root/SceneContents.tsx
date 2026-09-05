"use client";

import { Suspense, useEffect, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
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
import type { Group } from "three";
import {
  MiyajimaTorii,
  WaterGlow,
  SeaGlow,
  Lanterns,
  SkyBackground,
} from "@/features/scenery";
import {
  ShootingStars,
  StarfallSwarm,
  StarfallCamera,
  ToriiHologram,
  Bubbles,
  Underwater,
  type UnderwaterEffectImpl,
} from "@/features/starfall-sea";
import {
  CastleAssembly,
  ConcertStage,
  CornerTowers,
  EdoCastle,
  ReplyCamera,
  ReplyFireworks,
  ReplyHologram,
  StageBeams,
  ToriiGate,
  replyFadeGainAt,
  replySectionEnergyAt,
  REPLY_BASE_POSITION,
  REPLY_BUILD_END_SECONDS,
  REPLY_CASTLE_BUILD_END_SECONDS,
  REPLY_FADE_SECONDS,
  REPLY_FLASH_EXPOSURE,
  REPLY_FLASH_SECONDS,
  REPLY_LIGHTS_FADE_SECONDS,
  REPLY_PULLBACK_SECONDS,
  REPLY_FOCUS,
  REPLY_HOLOGRAM_Y,
  REPLY_OUTRO_FADE_SECONDS,
  REPLY_OUTRO_LEAD_SECONDS,
  REPLY_TORII_CENTER_Z_OFFSET,
  REPLY_TORII_GATE_HEIGHT,
  REPLY_TORII_SIDE_OFFSET,
  REPLY_TORII_SIDE_ROTATION,
  REPLY_TORII_SIDE_SCALE,
  REPLY_TORII_SIDE_Z_OFFSET,
  STAGE_Y,
} from "@/features/reply";
import { Water } from "./Water";
import { initTheatreStudio } from "./theatre";
import {
  ABERRATION_OFFSET,
  HEAVY_EFFECTS_DELAY_SECONDS,
  OUTRO_FADE_SECONDS,
  OUTRO_START_SECONDS,
  PRE_SURGE_DARKEN,
  PRE_SURGE_RAMP_SECONDS,
  PRE_SURGE_WINDUP_SECONDS,
  STARFALL_FADE_SECONDS,
  SURGE_FADE_SECONDS,
  SURGE_FLASH_EXPOSURE,
  SURGE_FLASH_SECONDS,
  SURGE_START_SECONDS,
  TORII_PRE_SURGE_DARKEN,
  UNDERWATER_BASE,
  UNDERWATER_FULL,
  UNDERWATER_SURGE_RELIEF,
} from "./timings";
import { useSceneStore } from "./store";
import { SceneStats } from "./SceneStats";

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

/**
 * Replyが終わったとき、天守のまわりに集まった灯籠が水面へ戻るのにかける秒数。
 * replyBuildRef は reply を止めた瞬間に0へ飛ぶ(天守の組み上げ演出はそれで
 * 問題ないが、灯籠がワープして見えると目立つ)ので、戻すときだけこの秒数で
 * ゆっくり追従させる(下の lanternGatherRef 参照)。
 */
const LANTERN_GATHER_RELEASE_SECONDS = 3;

/**
 * 灯籠の総数。Lanterns.tsx 側のデフォルト(900)より増やす指定なので、
 * root(この SceneContents.tsx)側で明示的に渡す(Lanterns 自体のデフォルト
 * は変えない)。
 */
const LANTERN_COUNT = 1200;

/**
 * 灯籠が Reply 中に集まる位置(塔を取り囲む、上に大きく広がった散らばり)。
 * 11秒かけてここへ集まりきる。以前は 11秒で「天守まわりの小さい輪」に集めて
 * から引きに合わせてさらに外へ広げていたが、その「広がる」動きはやめて、
 * 最初から広がった位置へ 11秒かけて集める指定に変えた。
 *
 * 半径の下限は0(=塔のすぐ際まで、輪ではなく塗りつぶした円に近い分布)。
 * 近すぎて塔の中に来た分は不透明メッシュに隠れるだけなので問題にならない。
 * 高さの下限は水面すれすれ(0.5)。上げるほどその高さより下が空白になる。
 * 上限は PATH(引きの全景)で画面いっぱいに灯籠が残る広さに合わせてある。
 */
const LANTERN_GATHER_RADIUS_MIN = 0;
const LANTERN_GATHER_RADIUS_MAX = 60;
const LANTERN_GATHER_HEIGHT_MIN = 0.5;
const LANTERN_GATHER_HEIGHT_MAX = REPLY_HOLOGRAM_Y + 40;


/**
 * シーン本体。useFrame は Canvas の中でしか使えないため、
 * Canvas 直下のこのコンポーネントに演出のロジックをまとめている。
 */
export function SceneContents({
  hologramVideoRef,
  replyVideoRef,
}: {
  hologramVideoRef: RefObject<HTMLVideoElement | null>;
  /** Reply のホログラムに映す映像。useReplySong が用意する */
  replyVideoRef: RefObject<HTMLVideoElement | null>;
}) {
  const skyVariant = useSceneStore((s) => s.skyVariant);
  const starfallPlaying = useSceneStore((s) => s.starfallPlaying);
  const replyPlaying = useSceneStore((s) => s.replyPlaying);
  const freeCam = useSceneStore((s) => s.freeCam);
  const editorMode = useSceneStore((s) => s.editorMode);

  /*
    Theatre.js の Studio パネル起動は SceneContents から1箇所だけ呼ぶ
    (ReplyCamera / StarfallCamera など各演出カメラは呼ばない)。
    実体は features/root/theatre.ts の initTheatreStudio。開発時のみ・
    一度きりに絞ってあるので、ここでの呼び出しは常に安全。
  */
  useEffect(() => {
    initTheatreStudio();
  }, []);

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
    残しておきたいという指定のため、starfallPlayingのON/OFFだけで決まる
    (inOutroを見ない)別のランプとして持つ。これも ref。
  */
  const persistActivationRef = useRef(0);
  /*
    魚の大群(StarfallSwarm)・水中フィルター(Underwater)専用の進行度(0〜1)。
    starfallPlaying が true になった時刻(starfallStartRef)から
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
  // starfallPlaying が true になった瞬間の clock.elapsedTime。未開始は null
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

  /*
    Reply の進行度(0〜1)。星降る海の activationRef と同じ役割で、
    江戸城の自己発光・ステージの光・ホログラムの濃さをこれ1本で駆動する。
    立ち上がり/収まりの間ずっと値が変わるため、state ではなく ref。
  */
  const replyActivationRef = useRef(0);
  /*
    組み上げ進行度(0〜1)。押した瞬間から REPLY_BUILD_END_SECONDS(11秒)かけて
    0→1 まで上がる。隅櫓(CornerTowers)・隅櫓ぶんの飛来ブロック・灯籠の集合・
    レンズ効果・11秒の閃光トリガーなど、天守本体**以外**の「11秒を基準にする」
    ものはこれを使う。毎フレーム変わるので ref。
  */
  const replyBuildRef = useRef(0);
  /*
    天守**本体**だけの組み上げ進行度(0〜1)。REPLY_CASTLE_BUILD_END_SECONDS
    (11秒-0.8=10.2秒)かけて0→1になる別の ref。指定で「天守のブロックが
    飛来する演出だけ0.8秒早く終わらせる、周りはそのまま」なので、
    EdoCastle のシェーダーと CastleAssembly の天守ぶんのブロックだけこちらを
    渡し、隅櫓・カメラの引き・照明点灯は上の replyBuildRef(11秒)のまま触らない。
  */
  const replyCastleBuildRef = useRef(0);
  /*
    灯籠が天守のまわりへ集まる進み具合(0〜1)。指定で「11秒に向けて集まる」
    なので replyBuildRef(=曲の再生位置/11秒)の立ち上がりをそのまま使うが、
    reply を止めたときは replyBuildRef のように0へ瞬断せず、
    LANTERN_GATHER_RELEASE_SECONDS かけてゆっくり水面へ戻す(下のuseFrame参照)。
  */
  const lanternGatherRef = useRef(0);
  /*
    ステージ・鳥居・ホログラム用の進行度(0〜1)。天守が STAGE_IN_FROM まで
    組み上がってから 0→1 へ上げる。組み上げと同時に出すと、まだ何も無い空中に
    ステージだけが浮いた画になってしまう。
  */
  const replyStageRef = useRef(0);
  /*
    ステージ以上とビームの表示切り替えは、**state ではなく group.visible** で行う。

    11秒ちょうどで state を切り替えるとその瞬間に SceneContents が再レンダーされ、
    @react-three/postprocessing の EffectComposer が作り直されて描画が壊れる
    (このリポジトリでは以前 星降る海 の終わりで「3D画面が固まる」形で踏んでいる。
    下の EffectComposer のコメント参照)。11秒は演出の山なので、そこで
    再レンダーを起こさないよう ref で visible を切る。
  */
  const replyStageGroupRef = useRef<Group>(null);
  const replyBeamsGroupRef = useRef<Group>(null);
  /*
    11秒を過ぎてからの「カメラの引き」具合(0〜1)。ReplyCamera はこれで
    周回から PATH(引きの全景)へ移る。REPLY_PULLBACK_SECONDS かけてゆっくり。
  */
  const replyPullbackRef = useRef(0);
  /*
    11秒でのステージ照明の点灯具合(0〜1)。投影光・ビーム・ステージ・鳥居・
    ホログラムをこれで一斉に点ける。カメラの引きと違い REPLY_LIGHTS_FADE_SECONDS
    で素早く上げる(組み上げ中の光る帯が消えるのと入れ違いにするため。
    ここを遅くすると天守が数秒真っ黒に沈む)。
  */
  const replyLightsRef = useRef(0);
  /*
    曲(=ホログラム映像)の再生位置(秒)。ステージ照明(StageBeams)の首振り・
    明滅・色替えを 170bpm のビートグリッドに乗せるために渡す。
    シーンの経過時間ではなく曲の時計を使うので、押し直してもループしても
    照明が曲と同じ位相をなぞる。
  */
  const replySongTimeRef = useRef(0);
  /*
    曲の演出強度(0〜1)。songStructure の replySectionEnergyAt をそのまま入れる。
    セクションの段(イントロ→Aメロ→サビ→アウトロ)をここ1本で持ち、カメラの
    巡航速度・レンズ効果・花火の量を全部これで振る。11秒までは ReplyCamera 側の
    posHandoff が0なので効かない(11秒までの演出は従来のまま)。
  */
  const replyEnergyRef = useRef(0);
  /*
    曲の終わりのフェード(0〜1)。実測のフェード曲線(TRACK_NOTES.md §2.3)。
    121.0秒までは1で、そこから 127.37秒の無音へ向けて落ちる。等速フェードだと
    音より先に絵が消えるので、露出・ブルーム・花火にこれを掛ける。
  */
  const replyFadeRef = useRef(1);
  /*
    花火の濃さ。energy と fade を掛け合わせたもの。ReplyFireworks へ渡す。
  */
  const replyFireworksRef = useRef(0);
  /*
    11秒の点灯の瞬間だけ焚く閃光の残り時間(秒)。露出とブルームを一段持ち上げて
    「会場の照明が一斉に入った」瞬間を立たせる(星降る海の転調の閃光と同じ手)。
  */
  const replyFlashRef = useRef(0);
  const replyFlashFiredRef = useRef(false);
  /*
    江戸城・ステージ・鳥居・ホログラムを出すかどうか。
    replyActivation が 0.01 を跨いだときだけ切り替えるので state でよい。
  */
  const [replyVisible, setReplyVisible] = useState(false);

  useFrame(({ clock, gl }, delta) => {
    /*
      転調・アウトロの判定を先に済ませる。閃光の明るさ(flash)は下の
      露出・ブルームの計算で足すため、ここで確定させておく。
    */
    const videoTime = hologramVideoRef.current?.currentTime ?? 0;
    // 曲の終わり。ここに入ったら演出をまとめて畳んで元の景色へ戻す
    const inOutro = starfallPlaying && videoTime >= OUTRO_START_SECONDS;
    const inSurge = starfallPlaying && videoTime >= SURGE_START_SECONDS && !inOutro;

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
    if (starfallPlaying && !inOutro) {
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
    const target = starfallPlaying && !inOutro ? 1 : 0;
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
    const persistTarget = starfallPlaying ? 1 : 0;
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
    } else if (starfallPlaying) {
      if (starfallStartRef.current === null) {
        starfallStartRef.current = clock.elapsedTime;
      }
    } else {
      starfallStartRef.current = null;
    }
    const heavyReady =
      starfallStartRef.current !== null &&
      clock.elapsedTime - starfallStartRef.current >= HEAVY_EFFECTS_DELAY_SECONDS;
    const heavyTarget = starfallPlaying && heavyReady && !inOutro ? 1 : 0;

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

    /*
      ここから Reply。星降る海とは排他(store の toggle で担保)なので、
      上の一連の値はすべて0へ向かっている前提で独立に積んでよい。

      アウトロは映像の長さから逆算する: 映像は130.03秒で、その
      REPLY_OUTRO_LEAD_SECONDS 手前から演出を畳み始めて余韻を作る
      (星降る海の OUTRO_START_SECONDS は絶対秒だが、こちらは動画の
      duration から引くので曲を差し替えても追従する)。
    */
    const replyVideo = replyVideoRef.current;
    /*
      再生位置は必ず有限値に正規化してから使う。

      ここが NaN になると build / pullback / lights が芋づるで NaN になり、
      ReplyCamera が camera.position を NaN にしてビュー行列が壊れる。
      そうなると frustumCulled=false のもの(ビーム・飛来ブロック)以外は
      全部カリングされ、「真っ黒な画面にビームのリングだけ」という状態になる。
      メディア要素の currentTime / duration は読み込み前や異常時に
      NaN を返しうるので、入口で塞ぐ。
    */
    const replyTimeRaw = replyVideo?.currentTime ?? 0;
    const replyTime = Number.isFinite(replyTimeRaw) ? replyTimeRaw : 0;
    // ステージ照明のビートグリッド用。曲の時計そのものを子へ渡す
    replySongTimeRef.current = replyTime;
    /*
      曲の構成から演出強度とフェードを引く(features/reply/songStructure.ts)。
      止めている間は 0 / 1 に戻して、次に押したとき頭から立ち上がるようにする。
    */
    replyEnergyRef.current = replyPlaying ? replySectionEnergyAt(replyTime) : 0;
    replyFadeRef.current = replyPlaying ? replyFadeGainAt(replyTime) : 1;
    const replyDurationRaw = replyVideo?.duration ?? 0;
    const replyDuration = Number.isFinite(replyDurationRaw) ? replyDurationRaw : 0;
    const replyInOutro =
      replyPlaying &&
      replyDuration > 0 &&
      replyTime >= replyDuration - REPLY_OUTRO_LEAD_SECONDS;

    const replyTarget = replyPlaying && !replyInOutro ? 1 : 0;
    const replyStep =
      delta / (replyInOutro ? REPLY_OUTRO_FADE_SECONDS : REPLY_FADE_SECONDS);
    if (replyActivationRef.current !== replyTarget) {
      replyActivationRef.current =
        replyActivationRef.current < replyTarget
          ? Math.min(replyActivationRef.current + replyStep, replyTarget)
          : Math.max(replyActivationRef.current - replyStep, replyTarget);
    }
    const replyNext = replyActivationRef.current;

    /*
      天守の組み上げ・カメラの引き・ステージ照明。どれも**曲の再生位置**で
      決める(ボタンを押してからの経過ではない)。曲が REPLY_BUILD_END_SECONDS
      (11秒)に達するまで組み上げ＋天守まわりの周回カメラ。11秒を過ぎたら
        - カメラ: REPLY_PULLBACK_SECONDS かけてゆっくり引く
        - 照明: REPLY_LIGHTS_FADE_SECONDS でパッと点ける(組み上げの光る帯が
          消えるのと入れ違いにする。ここを遅らせると暗転バグになる)
    */
    if (replyPlaying) {
      replyBuildRef.current = Math.min(
        Math.max(replyTime / REPLY_BUILD_END_SECONDS, 0),
        1,
      );
      // 天守本体だけ0.8秒早く終わる別の進行度(上の replyCastleBuildRef のコメント参照)
      replyCastleBuildRef.current = Math.min(
        Math.max(replyTime / REPLY_CASTLE_BUILD_END_SECONDS, 0),
        1,
      );
      const sinceEnd = replyTime - REPLY_BUILD_END_SECONDS;
      replyPullbackRef.current = Math.min(
        Math.max(sinceEnd / REPLY_PULLBACK_SECONDS, 0),
        1,
      );
      replyLightsRef.current = Math.min(
        Math.max(sinceEnd / REPLY_LIGHTS_FADE_SECONDS, 0),
        1,
      );
    } else {
      replyBuildRef.current = 0;
      replyCastleBuildRef.current = 0;
      replyPullbackRef.current = 0;
      replyLightsRef.current = 0;
    }

    /*
      灯籠の集合(Lanterns.tsx の gatherRef)。上がるときは replyBuildRef と
      まったく同じ値(=11秒に向けてリアルタイムに追従)。下がるとき(reply終了)
      だけ LANTERN_GATHER_RELEASE_SECONDS で緩めて、replyBuildRef の瞬断を隠す。
    */
    if (replyBuildRef.current >= lanternGatherRef.current) {
      lanternGatherRef.current = replyBuildRef.current;
    } else {
      lanternGatherRef.current = Math.max(
        lanternGatherRef.current - delta / LANTERN_GATHER_RELEASE_SECONDS,
        replyBuildRef.current,
      );
    }

    /*
      ステージから上(ステージ・鳥居・ホログラム)は、曲が11秒に達したら
      照明と一緒に点ける。組み上げ中は天守だけが黒く積み上がっていき、
      11秒の瞬間に投影光・ビームと同時にステージ以上が点いて一気に会場が
      立ち上がる。smoothstep で入れて、載る瞬間にポップしないようにする。
    */
    const stageIn = replyLightsRef.current;
    replyStageRef.current = replyNext * stageIn * stageIn * (3 - 2 * stageIn);

    /*
      表示の切り替えは group.visible で行い、再レンダーを起こさない
      (上の replyStageGroupRef のコメント参照)。
    */
    if (replyStageGroupRef.current) {
      replyStageGroupRef.current.visible = replyStageRef.current > 0.005;
    }
    if (replyBeamsGroupRef.current) {
      replyBeamsGroupRef.current.visible = replyLightsRef.current > 0.005;
    }

    /*
      11秒の点灯で一度だけ閃光を焚く。組み上げが終わった最初のフレームで発火し、
      以降フレームごとに減らす。巻き戻し(ループ)で未発火に戻して再点火できる。
    */
    if (replyPlaying && replyBuildRef.current >= 1) {
      if (!replyFlashFiredRef.current) {
        replyFlashFiredRef.current = true;
        replyFlashRef.current = REPLY_FLASH_SECONDS;
      }
    } else {
      replyFlashFiredRef.current = false;
    }
    replyFlashRef.current = Math.max(replyFlashRef.current - delta, 0);
    const replyFlash =
      (replyFlashRef.current / REPLY_FLASH_SECONDS) * REPLY_FLASH_EXPOSURE;

    /*
      Reply のレンズ効果。星降る海と違い毎フレーム書く(組み上げ中は
      build に連動して色収差とブルームが上がり続けるため、変化フレームだけの
      書き込みでは足りない)。プロパティ代入が数個なのでコストは無視できる。

      - 色収差: 組み上げが進むほど強め、寄りの速度感を出す。11秒で解ける
      - ブルーム: 演出中は底上げ。組み上げ中はさらに乗せ、閃光でもう一段
      - ビネット: 組み上げ中だけ強めて、天守へ視線を集めるトンネル感を作る
      - 露出: 夜側へ落とし、11秒の閃光でだけ持ち上げる
    */
    if (replyNext > 0.001) {
      const build = replyBuildRef.current;
      // 組み上げ中は1、11秒以降は0へ抜ける
      const rush = 1 - replyLightsRef.current;
      /*
        11秒以降だけ曲の構成に乗せる。lit は11秒までは0なので、energy 由来の
        項はすべて0倍 = 11秒までのレンズ効果は従来のまま。
      */
      const lit = replyLightsRef.current;
      const energy = replyEnergyRef.current;
      const fade = replyFadeRef.current;
      // サビで開き、静かな所で締まる連続量(TRACK_NOTES.md §5-2)
      const lift = lit * energy;

      if (aberrationRef.current) {
        aberrationOffset
          .copy(ABERRATION_OFFSET)
          .multiplyScalar(replyNext * (0.5 + build * rush * 2.2 + lift * 0.3));
        aberrationRef.current.offset = aberrationOffset;
      }
      if (bloomRef.current) {
        /*
          サビの上乗せは控えめにする。ここを大きくすると光が滲んで面で
          繋がってしまい、天守やビームの輪郭が溶けて「ぼやけた」絵になる。
        */
        bloomRef.current.intensity =
          0.8 +
          replyNext * 0.45 +
          build * rush * 0.5 +
          replyFlash * 0.9 +
          lift * 0.3 * fade;
      }
      if (vignetteRef.current) {
        // 盛り上がりでトンネル感を緩めて、会場の広がりを見せる
        vignetteRef.current.darkness =
          replyNext * (0.35 + rush * 0.35 - lift * 0.12);
      }
      /*
        **被写界深度(bokehScale)はここでは触らない。**

        DepthOfField のピント位置は FOCUS_TARGET([0,3,-2] = 鳥居の中ほど)に
        固定されていて、これは星降る海の被写体に合わせたもの。Reply の被写体は
        塔の上のホログラム(REPLY_HOLOGRAM_Y ≒ 45)なので、カメラから見た
        奥行きが大きく食い違う。しかも focalLength は 0.9 ワールド単位しか
        なく、ピントの合う帯がごく薄い。この状態で bokehScale を上げると
        **画面のほぼ全部がピント範囲の外**に落ちて、絵全体がぼやける。

        Reply でボケを使いたくなったら、まず dofRef.target を REPLY_FOCUS へ
        差し替え、focalLength も塔の大きさに合わせて広げること。
      */
      /*
        夜側に寄せる。星降る海(0.55)より浅くして城のディテールを残す。
        曲の終わりは実測のフェード曲線(replyFadeRef)で絵ごと落として、
        音と同じ形で消えるようにする。
      */
      gl.toneMappingExposure =
        (1 - replyNext * 0.4 + replyFlash + lift * 0.16) *
        (1 - lit * replyNext * (1 - fade) * 0.85);
    }

    /*
      花火の濃さ。曲の構成(energy)にフェードを掛けたもの。
      11秒より前は lights=0 なので必ず0 = 花火は上がらない。
    */
    replyFireworksRef.current =
      replyNext * replyLightsRef.current * replyFadeRef.current;

    const replyVisibleNow = replyNext > 0.01;
    if (replyVisibleNow !== replyVisible) setReplyVisible(replyVisibleNow);
  });

  return (
    <>
      <fog attach="fog" args={["#1c2540", 20, 300]} />

      <ambientLight intensity={0.7} color="#5a6fa8" />
      <directionalLight position={[9, 14, 5]} intensity={2} color="#bcd3ff" />

      {/*
        空の読み込み中だけ出す下地。**Suspense の fallback に置くのが要点**で、
        ここを外に出して常設すると SkyBackground(`attach="background"` /
        `attach="environment"`) と同じ scene.background を奪い合う。
        二重アタッチは後勝ちなので、再レンダーの度に適用順で空が消えたり
        戻ったりする(環境光も一緒に落ちるため、黒い天守が真っ黒に沈み、
        自己発光のビームだけが残る「真っ黒画面」になっていた)。
      */}
      <Suspense fallback={<color attach="background" args={["#1c2540"]} />}>
        {/*
          演出モード(星降る海 / Reply)の間は、夕暮れを選んでいても夜空に
          切り替える。Reply だけはオーロラ(aurora-vertical)ではなく
          nightsky-vertical(下半分は黒画像)を使う専用の "reply" バリアント
          (SkyBackground.tsx 参照)。
        */}
        <SkyBackground
          variant={replyPlaying ? "reply" : starfallPlaying ? "night" : skyVariant}
        />
        {/*
          映像の鳥居は根本が橙色、上に行くほど赤みが強い発光をしている。
          ポイントライトの反射だけではそこまで光らないため、鳥居のマテリアル
          自体をシェーダーで自己発光させ、高さで橙→赤へ補間している
          (glow=persistActivationで星降る海が始まるほど強く光る。
          アウトロでも落とさないので、曲が終わって魚や水中フィルターが
          引いたあとも鳥居は灯ったまま残る。転調直前の暗転はtoriiDimRefで
          ホログラム映像と同じ控えめな強さだけかける。MiyajimaTorii.tsx参照)。

          Reply中はここには江戸城が建つので、地上の鳥居は隠して
          ステージの上の鳥居(下の Reply ブロック)へ役目を渡す。
        */}
        {!replyVisible && (
          <MiyajimaTorii
            position={TORII_POSITION}
            scale={0.18}
            glowRef={persistActivationRef}
            dimRef={toriiDimRef}
          />
        )}
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
        {/*
          Reply: 星降る海で鳥居が立っていた位置に江戸城が建ち、その天守の上へ
          ステージ → 宮島の鳥居 → ホログラム、と縦に積み上がる。
          高さはすべて features/reply/constants.ts で実測値から算出している。
        */}
        {replyVisible && (
          <>
            <EdoCastle
              position={REPLY_BASE_POSITION}
              activationRef={replyActivationRef}
              buildRef={replyCastleBuildRef}
              lightsRef={replyLightsRef}
            />
            {/*
              天守を組み上げる飛来ブロック。天守ぶんは replyCastleBuildRef
              (0.8秒早く終わる)、隅櫓ぶんは従来どおり replyBuildRef で分けている。
            */}
            <CastleAssembly
              position={REPLY_BASE_POSITION}
              buildRef={replyCastleBuildRef}
              towerBuildRef={replyBuildRef}
            />
            {/*
              江戸城の四隅に立つ隅櫓。天守本体とは違い、こちらは従来どおり
              replyBuildRef(11秒)のまま(指定で「周りは今のまま」)。
            */}
            <CornerTowers
              position={REPLY_BASE_POSITION}
              buildRef={replyBuildRef}
              activationRef={replyActivationRef}
              lightsRef={replyLightsRef}
            />
            {/*
              曲が11秒に達した瞬間、背後から放射状に伸びるサーチライトが点く。
              11秒での再レンダーを避けるため、出し入れは group.visible で行う
              (上の replyStageGroupRef のコメント参照)。visible は useFrame が書く。
            */}
            <group ref={replyBeamsGroupRef} visible={false}>
              <StageBeams
                position={REPLY_BASE_POSITION}
                activationRef={replyLightsRef}
                songTimeRef={replySongTimeRef}
              />
            </group>
            {/*
              打ち上げ花火。Bメロ後半(55秒)から溜めで疎に、サビ(62秒)〜後半は
              2小節に1発、106秒の最後の歌詞で大玉。アウトロ以降は上げない。
              玉の配置・色は添字から決まる決定的な値なので、何周しても同じ
              位置に同じ花火が上がる(詳しくは ReplyFireworks.tsx)。
              上げる時刻の判定はシェーダー内の再生位置だけで決まるので、
              ここでは出しっぱなしにして濃さ(intensityRef)だけで制御する。
            */}
            <ReplyFireworks
              songTimeRef={replySongTimeRef}
              intensityRef={replyFireworksRef}
            />
            {/*
              ステージから上。天守が組み上がって照明が入る11秒から載せる。
              組み上げと同時に出すと、まだ何も無い空中にステージだけが浮いて見える。
              こちらも group.visible で出し入れする。
            */}
            <group ref={replyStageGroupRef} visible={false}>
              <ConcertStage
                position={[REPLY_BASE_POSITION[0], STAGE_Y, REPLY_BASE_POSITION[2]]}
                activationRef={replyStageRef}
              />
              {/*
                ステージに載せる鳥居は3つ。中央奥に主役の大鳥居(ToriiGate)、
                手前の左右に宮島鳥居(小)を斜めに置く指定。左右は中心から
                X(REPLY_TORII_SIDE_OFFSET)だけ離し、Zは3体の重心がステージ
                (甲板)の中心に来るよう REPLY_TORII_CENTER_Z_OFFSET(中央・奥)/
                REPLY_TORII_SIDE_Z_OFFSET(左右・手前)に振り分けてある
                (constants.ts のコメント参照。中央をZ=0に置いたままだと
                重心が手前へずれる)。くぐる向き(鳥居を貫く軸)がステージの
                外側を向くよう REPLY_TORII_SIDE_ROTATION ぶん振ってある
                (左鳥居は外=-X側、右鳥居は外=+X側を向く)。
                地上の鳥居と同じ発光シェーダーを使うが、転調の概念が無いので
                dimRef は渡さない(常に減光なし)。
              */}
              <MiyajimaTorii
                position={[
                  REPLY_BASE_POSITION[0] - REPLY_TORII_SIDE_OFFSET,
                  STAGE_Y,
                  REPLY_BASE_POSITION[2] + REPLY_TORII_SIDE_Z_OFFSET,
                ]}
                rotation={[0, -REPLY_TORII_SIDE_ROTATION, 0]}
                scale={REPLY_TORII_SIDE_SCALE}
                glowRef={replyStageRef}
              />
              <ToriiGate
                position={[
                  REPLY_BASE_POSITION[0],
                  STAGE_Y,
                  REPLY_BASE_POSITION[2] + REPLY_TORII_CENTER_Z_OFFSET,
                ]}
                scale={REPLY_TORII_GATE_HEIGHT}
                glowRef={replyStageRef}
              />
              <MiyajimaTorii
                position={[
                  REPLY_BASE_POSITION[0] + REPLY_TORII_SIDE_OFFSET,
                  STAGE_Y,
                  REPLY_BASE_POSITION[2] + REPLY_TORII_SIDE_Z_OFFSET,
                ]}
                rotation={[0, REPLY_TORII_SIDE_ROTATION, 0]}
                scale={REPLY_TORII_SIDE_SCALE}
                glowRef={replyStageRef}
              />
              <ReplyHologram
                position={[
                  REPLY_BASE_POSITION[0],
                  REPLY_HOLOGRAM_Y,
                  REPLY_BASE_POSITION[2],
                ]}
                videoRef={replyVideoRef}
                activationRef={replyStageRef}
              />
            </group>
          </>
        )}
        {/*
          灯ろうは星降る海の間は魚の渦と喧嘩するので隠す。Reply中は隠さず、
          gatherRef(lanternGatherRef)で11秒かけて、最初から広がった散らばり位置
          (LANTERN_GATHER_* 定数)へ集める。11秒後に外へ広げる演出はやめたので
          expandRef は渡さない。
        */}
        {!starfallVisible && (
          <Lanterns
            count={LANTERN_COUNT}
            gatherRef={lanternGatherRef}
            gatherCenter={[REPLY_BASE_POSITION[0], REPLY_BASE_POSITION[2]]}
            gatherRadiusMin={LANTERN_GATHER_RADIUS_MIN}
            gatherRadiusMax={LANTERN_GATHER_RADIUS_MAX}
            gatherHeightMin={LANTERN_GATHER_HEIGHT_MIN}
            gatherHeightMax={LANTERN_GATHER_HEIGHT_MAX}
          />
        )}
        <Water />
      </Suspense>

      {/*
        星降る海モード中でも自由視点(freeCam)なら演出カメラは止める。
        動画の再生位置を渡しているのは、1:18〜1:22 のホログラムへの寄り引きに
        使うため(StarfallCamera.tsx の DOLLY_IN_START_SECONDS 参照)。
      */}
      <StarfallCamera
        active={starfallPlaying && !freeCam}
        activationRef={activationRef}
        videoRef={hologramVideoRef}
      />
      {/*
        Reply の演出カメラ。塔の高さを見せるため上下に大きく振りながら旋回する
        (星降る海と同じく、押した位置から PATH へ滑らかに寄せるだけ)。
      */}
      <ReplyCamera
        active={replyPlaying && !freeCam}
        activationRef={replyActivationRef}
        buildRef={replyBuildRef}
        pullbackRef={replyPullbackRef}
        energyRef={replyEnergyRef}
        songTimeRef={replySongTimeRef}
        videoRef={replyVideoRef}
      />

      {/*
        通常時、または演出モード中でも自由視点を選んでいるときは手動操作を許可する。
        演出カメラが動いている間だけ手動操作を止める。
      */}
      <OrbitControls
        makeDefault
        enableDamping
        enabled={(!starfallPlaying && !replyPlaying) || freeCam}
        /*
          演出モード中はそれぞれのホログラム画面を中心に回す。通常時は鳥居の中ほど。
          Reply のホログラムは塔の上(y≒29)にあるので、星降る海とは注視点が大きく違う。
        */
        target={
          replyPlaying
            ? REPLY_FOCUS
            : starfallPlaying
              ? SCREEN_FOCUS
              : NORMAL_ORBIT_TARGET
        }
      />
      {/* 編集モード中は EditorToolbar が自前でFPSを出すので、こちらは隠す */}
      {!editorMode && <SceneStats />}

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
