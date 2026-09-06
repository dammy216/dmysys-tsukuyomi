"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import {
  REPLY_BAR_ORIGIN,
  REPLY_BAR_SECONDS,
  REPLY_BASE_POSITION,
  REPLY_BUILD_END_SECONDS,
  REPLY_FOCUS,
} from "./constants";
import { useCameraFeelStore } from "./cameraFeelParams";
import { sampleDrone } from "./dronePathType";
import { useDronePathStore } from "./dronePathStore";

/** カメラが向く先(注視点)の水平位置 = 塔の軸。高さはキーフレームの lookY */
const FOCUS = new Vector3(...REPLY_FOCUS);
/** 塔の中心(円筒座標の軸)。航路の sin/cos はここを中心に回る */
const BASE = new Vector3(...REPLY_BASE_POSITION);

/* ================================================================== *
 * Reply のドローンカメラ。
 *
 * **航路は曲の頭(0秒)から最後まで1本**(features/reply/dronePathData.ts の
 * DRONE_PATH)。塔を軸にした円筒座標(turn=回転周 / radius=水平距離 /
 * y=高さ / lookY=注視点の高さ / fov=画角)のキーフレームを、**曲の再生位置**
 * に直接刺してある。ループしない1本の飛行で、曲が終わるまで二度と同じ画に
 * 戻らない。
 *
 * 0〜11秒(天守の組み上げ中)は、旧 BUILD_ORBIT の3段周回
 * (静止→ドリーイン→周回しながら1周)を標本化したキーフレームが入っている。
 * ここは編集モードのタイムラインからも 11秒以降と同じように触れる。
 *
 * ドローンらしさを作っている要素は3つ:
 *   1. **バンク(ロール)** — 旋回の角速度からカメラを傾ける。これが無いと
 *      どれだけ動かしても「レール上の台車」にしか見えない。
 *   2. **注視点の高さが動く** — 高いところからは会場を見下ろし、低い
 *      ところからはホログラムを煽る。1点を見続けないので首振りが出る。
 *   3. **画角が動く** — 至近の煽りは広角(76度)で誇張し、最後の離脱は
 *      望遠(52度)に寄せて圧縮する。
 *
 * ただし **1〜3(と手持ち風の揺れ・小節の呼吸)は 11秒(組み上げ完了)から
 * 立ち上げる**。0〜11秒の周回中に入れると、意図した周回の動きを濁らせる
 * ため。下の droneFeel がそのランプ。
 *
 * バンク・揺れ・呼吸・追従の速さ・軸からの最低距離は cameraFeelDefaults.ts
 * の CAMERA_FEEL_DEFAULTS(useCameraFeelStore。編集モードから触れる)。
 * ================================================================== */

/**
 * 組み上げ完了(11秒)から、ドローンらしさ(バンク・手持ち揺れ・小節の呼吸・
 * 画角の誇張)を 0→1 で立ち上げる秒数。0〜11秒の周回中はすべて 0 = 素の周回。
 */
const DRONE_FEEL_RAMP_SECONDS = 0.6;

/** なめらかな加減速(ease-in-out)。等速で動くと機械的に見えるため */
function smoothstep(x: number) {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

type ReplyCameraProps = {
  active: boolean;
  /**
   * 0〜1。演出の立ち上がり具合を持つ ref。手持ちカメラ風の揺れの強さと、
   * 立ち上がり中の寄せ速度に使う。立ち上がり/収まりの間ずっと変わるため
   * 数値 prop だと親ごと毎フレーム再レンダー。ref で受け取り useFrame で読む。
   */
  activationRef: RefObject<number>;
  /**
   * 曲の演出強度(0〜1)を持つ ref(songStructure の replySectionEnergyAt)。
   * 揺れと呼吸の振り幅に使う。**11秒までは droneFeel=0 なので効かない。**
   */
  energyRef?: RefObject<number>;
  /**
   * 曲(=映像)の再生位置(秒)。航路はこれで直接引く(ループしない)。
   */
  songTimeRef?: RefObject<number>;
};

/**
 * 「Reply」モード中だけカメラを乗っ取る。曲の再生位置に刺した航路
 * (DRONE_PATH)を1本だけ飛ぶ。押した瞬間の位置から滑らかに寄せ、OFF に
 * した瞬間の位置から OrbitControls へ滑らかに操作を返す。
 */
export function ReplyCamera({
  active,
  activationRef,
  energyRef,
  songTimeRef,
}: ReplyCameraProps) {
  const { camera } = useThree();
  const pos = useRef(new Vector3());
  const look = useRef(new Vector3());
  const forward = useRef(new Vector3());
  const up = useRef(new Vector3());
  /** sampleDrone の出力先。毎フレーム作らないよう使い回す */
  const key = useRef({ turn: 0, radius: 0, y: 0, lookY: 0, fov: 68 });
  /** 前フレームの機首方位(ラジアン)。バンクを角速度から作るのに使う */
  const heading = useRef(Number.NaN);
  /** なました現在のバンク角 */
  const bank = useRef(0);
  /** Canvas 側の既定の画角。OFF のときここへ戻す */
  const baseFov = useRef(Number.NaN);
  /*
    画角を書くための ref。useFrame から useThree の戻り値のプロパティへ直接
    代入すると react-hooks/immutability に引っかかるため、一度 ref へ移してから
    触る(CornerTowers / ReplyFireworks と同じ手当て)。
    position/up は入れ物の中身を書くだけなのでこの回避は要らない。
  */
  const perspectiveRef = useRef<PerspectiveCamera | null>(null);

  // 入るたびに演出を頭から始める
  useEffect(() => {
    if (active) {
      heading.current = Number.NaN;
      bank.current = 0;
    }
  }, [active]);

  /*
    画角を書くための入口を ref へ移し、あわせて既定の画角を控えておく。
  */
  useEffect(() => {
    const perspective = camera instanceof PerspectiveCamera ? camera : null;
    perspectiveRef.current = perspective;
    if (perspective && !Number.isFinite(baseFov.current)) {
      baseFov.current = perspective.fov;
    }
  }, [camera]);

  /*
    OFF になったらロールと画角を必ず戻す。戻さないと OrbitControls が
    傾いた up ベクトルを引き継いで通常時のカメラが斜めになり、画角も
    Reply のまま(広角/望遠)に居座ってしまう。
  */
  useEffect(() => {
    if (active) return;
    const perspective = perspectiveRef.current;
    camera.up.set(0, 1, 0);
    if (perspective && Number.isFinite(baseFov.current)) {
      perspective.fov = baseFov.current;
      perspective.updateProjectionMatrix();
    }
  }, [active, camera]);

  useFrame((_, delta) => {
    if (!active) return;

    // 進行度はどちらもref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef.current ?? 0;
    const energy = Math.min(Math.max(energyRef?.current ?? 0.5, 0), 1);
    const songTime = songTimeRef?.current ?? 0;

    /*
      ドローンらしさ(バンク・揺れ・呼吸・画角の誇張)の効き具合。
      組み上げ完了(11秒)から DRONE_FEEL_RAMP_SECONDS かけて 0→1。
      0〜11秒の周回中は 0 = 素の周回。
    */
    const droneFeel = smoothstep(
      Math.min(
        Math.max(
          (songTime - REPLY_BUILD_END_SECONDS) / DRONE_FEEL_RAMP_SECONDS,
          0,
        ),
        1,
      ),
    );

    /*
      航路を曲の再生位置で直接引く(ループしない)。keyframes は編集モードの
      パネル(features/editor/)から書き換えられる(getState() で都度読み、
      購読はしない=編集していないときは DRONE_PATH をそのままコピーした配列)。
    */
    sampleDrone(useDronePathStore.getState().keyframes, songTime, key.current);
    const angle = key.current.turn * Math.PI * 2;
    pos.current.set(
      BASE.x + Math.sin(angle) * key.current.radius,
      key.current.y,
      BASE.z + Math.cos(angle) * key.current.radius,
    );
    look.current.set(BASE.x, key.current.lookY, BASE.z);

    // バンク・揺れ・呼吸・追従の味付け(編集モードから触れる)
    const feel = useCameraFeelStore.getState().values;

    /*
      小節周期の呼吸。ホログラムを支点にした距離の倍率として掛ける。
      ホバリング中の機体が位置を保とうとして前後する感じ。

      ※ 小節の位相(REPLY_BAR_ORIGIN)は音源から一意に決まらない
      (TRACK_NOTES.md §1.1)。ゆっくりした呼吸なので位相がずれても破綻しない。
    */
    if (droneFeel > 0) {
      const barPos = (songTime - REPLY_BAR_ORIGIN) / REPLY_BAR_SECONDS;
      const barPhase = barPos - Math.floor(barPos);
      const zoom =
        1 -
        Math.sin(barPhase * Math.PI * 2) * feel.breathAmount * energy * droneFeel;
      pos.current.sub(FOCUS).multiplyScalar(zoom).add(FOCUS);
    }

    // 手持ちカメラ風の細かい揺れ。周回中(droneFeel=0)は入れない
    const shake =
      activation *
      (feel.shakeMin + (feel.shakeMax - feel.shakeMin) * energy) *
      droneFeel;
    pos.current.x += Math.sin(songTime * 2.7) * shake;
    pos.current.y += Math.sin(songTime * 3.4 + 1.1) * shake * 0.6;

    /*
      塔の軸から最低限の距離を確保する。

      どんな経路であれカメラが天守の内側へ入ると、天守は黒くて両面描画なので
      画面が真っ黒になる。ここで押し出しておけば、上流の計算が多少おかしくても
      その画にはならない。
    */
    const dx = pos.current.x - BASE.x;
    const dz = pos.current.z - BASE.z;
    const flat = Math.hypot(dx, dz);
    if (flat < feel.minOrbitDistance) {
      // 真芯(flat=0)のときは向きが決まらないので、正面(+Z)へ逃がす
      const k = flat > 0.001 ? feel.minOrbitDistance / flat : 0;
      pos.current.x = BASE.x + dx * k;
      pos.current.z = BASE.z + (k === 0 ? feel.minOrbitDistance : dz * k);
    }

    /*
      非有限値が混じったフレームは、カメラを触らずに見送る。
      camera.position が一度でも NaN になるとビュー行列ごと壊れ、以降ずっと
      真っ黒のまま復帰しない。1フレーム止まるだけなら見た目には出ない。
    */
    if (
      !Number.isFinite(pos.current.x) ||
      !Number.isFinite(pos.current.y) ||
      !Number.isFinite(pos.current.z) ||
      !Number.isFinite(look.current.x) ||
      !Number.isFinite(look.current.y) ||
      !Number.isFinite(look.current.z)
    ) {
      return;
    }

    /*
      演出の立ち上がり中は現在位置から徐々に寄せる(切り替えた瞬間に飛ばない)。
      係数は delta からの指数減衰にして、fps が変わっても同じ速さで寄るようにする。
    */
    const follow =
      1 - Math.exp(-feel.followRate * delta * Math.min(activation, 1));
    camera.position.lerp(pos.current, follow);

    /*
      バンク(ロール)。**ドローンらしさの主役。**

      機首方位の変化率(=旋回の角速度)からロール角を作る。実機は旋回時に
      内側へ倒れるので、角速度に比例して傾けると一気にそれらしくなる。
      なました上で、進行方向(forward)まわりに up を回して camera.lookAt へ
      渡す(lookAt は camera.up を基準に姿勢を決める)。

      droneFeel を掛けてあるので、11秒までの周回中は常に0 = 水平のまま。
    */
    forward.current.copy(look.current).sub(camera.position);
    const flatLen = Math.hypot(forward.current.x, forward.current.z);
    if (flatLen > 0.001 && delta > 0) {
      const nextHeading = Math.atan2(forward.current.x, forward.current.z);
      if (Number.isFinite(heading.current)) {
        // 角度差は必ず -π〜π に畳む(±πをまたぐとき暴れるため)
        let d = nextHeading - heading.current;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        const target = Math.max(
          -feel.bankMax,
          Math.min(feel.bankMax, (d / delta) * feel.bankGain),
        );
        bank.current +=
          (target - bank.current) * (1 - Math.exp(-feel.bankSmooth * delta));
      }
      heading.current = nextHeading;
    }

    const roll = bank.current * activation * droneFeel;
    forward.current.normalize();
    up.current.set(0, 1, 0);
    if (Number.isFinite(roll) && Math.abs(roll) > 0.0001) {
      up.current.applyAxisAngle(forward.current, roll);
    }
    camera.up.copy(up.current);
    camera.lookAt(look.current);

    /*
      画角。至近の煽りは広角で誇張し、離脱は望遠で圧縮する。
      activation と droneFeel を掛けてあるので、11秒まで・OFF のときは
      Canvas 既定の画角(68度)のまま。
    */
    const perspective = perspectiveRef.current;
    if (perspective && Number.isFinite(baseFov.current)) {
      const blend = activation * droneFeel;
      const fov = baseFov.current + (key.current.fov - baseFov.current) * blend;
      if (Math.abs(perspective.fov - fov) > 0.01) {
        perspective.fov = fov;
        perspective.updateProjectionMatrix();
      }
    }
  });

  return null;
}
