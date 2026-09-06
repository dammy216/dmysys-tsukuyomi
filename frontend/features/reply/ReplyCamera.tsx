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
import { useBuildOrbitStore, useCameraFeelStore } from "./cameraParams";
import { sampleDrone } from "./dronePath";
import { useDronePathStore } from "./dronePathStore";

/** カメラが向き続ける点 = ホログラム画面の中心。実質ここが回る中心になる */
const FOCUS = new Vector3(...REPLY_FOCUS);
/** 塔の足元(天守の底面)。組み上げ中の周回はここを軸にする */
const BASE = new Vector3(...REPLY_BASE_POSITION);

/* ------------------------------------------------------------------ *
 * 組み上げ中(build < 1)のカメラ。参照映像(Shelter)と同じく、生成されていく
 * 天守のまわりをぐるりと回りながら、組み上げ面といっしょに昇っていく。
 *
 * **ここは11秒までの演出。触らないこと。**
 * ------------------------------------------------------------------ */

/**
 * 周回は3段階に分かれる。数値そのものは cameraParams.ts の
 * BUILD_ORBIT_DEFAULTS(編集モードから触れる useBuildOrbitStore の既定値)
 * に置いてあり、ここでは毎フレームその現在値を読んで組み立てる。
 *
 *   1. 静止(holdSeconds): radiusStart のまま正面で待つ。回転もしない。
 *   2. ドリーイン(dollySeconds): まっすぐ start→mid へ前進するだけ
 *      (これも回転しない)。
 *   3. 周回: そこから回り込みながらさらに mid→to まで寄っていく。
 *
 * **ドリーインと周回の継ぎ目(mid)で速度が0に落ちないこと。**
 * 単純に「ドリーインを smoothstep で減速して止め、周回を smoothstep で
 * 0から助走する」と、前進の勢いが継ぎ目で一度完全に殺されてから
 * 回転が始まる不自然な間ができる。下の buildOrbitFrame() が継ぎ目の速度
 * (dRadius/dBuild)を2区間で厳密に一致させ、ドリーインの勢いがそのまま
 * 周回(回転)へ引き継がれるようにしてある。
 *
 * radiusTo は minOrbitDistance(11) ぎりぎりまで詰めてある。
 * それより寄せると水平距離クランプに引っかかって寄せの終盤で
 * カメラが急に押し戻される不自然な動きになる。
 */

/**
 * 周回の開始角度(ラジアン)。0 = +Z 側 = 天守の正面
 * (通常時のカメラ [0,3,11] と同じ向き)。ここだけは構図の基準なので
 * 編集対象にしていない。
 */
const BUILD_ORBIT_START_ANGLE = 0;

/* ================================================================== *
 * 11秒以降 — ドローン撮影のカメラ。
 *
 * **星降る海(StarfallCamera)とは作りから変えてある。**
 *   星降る海: XYZ のキーフレームを 24秒周期でループし、常に1点(SCREEN_FOCUS)を
 *             見続ける。曲とは無関係に同じ軌道を繰り返す。
 *   Reply:    塔を軸にした**円筒座標**のキーフレームを**曲の再生位置**に
 *             直接刺してある。ループしない1本の飛行で、曲が終わるまで
 *             二度と同じ画に戻らない。
 *
 * ドローンらしさを作っている要素は3つ:
 *   1. **バンク(ロール)** — 旋回の角速度からカメラを傾ける。これが無いと
 *      どれだけ動かしても「レール上の台車」にしか見えない。
 *   2. **注視点の高さが動く** — 高いところからは会場を見下ろし、低い
 *      ところからはホログラムを煽る。1点を見続けないので首振りが出る。
 *   3. **画角が動く** — 至近の煽りは広角(76度)で誇張し、最後の離脱は
 *      望遠(52度)に寄せて圧縮する。
 * ================================================================== */

/*
  バンク(ロール)・手持ち風の揺れ・小節周期の呼吸・追従の速さ・軸からの
  最低距離は cameraParams.ts の CAMERA_FEEL_DEFAULTS(useCameraFeelStore)へ
  移した。編集モードのパネルから触りながら詰められるようにするため。
  各値の意味はそちらのコメントを参照。
*/

/** なめらかな加減速(ease-in-out)。等速で動くと機械的に見えるため */
function smoothstep(x: number) {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

/**
 * 3次エルミート補間。p0→p1 を、両端の速度(v0, v1。区間全体を1とした
 * ローカル時間 t∈[0,1] に対する dp/dt)を指定して補間する。
 *
 * ドリーイン→周回の継ぎ目(RADIUS_JUNCTION_VELOCITY / Y_JUNCTION_VELOCITY)
 * のように、隣り合う区間の端点で同じ速度を指定すれば、区間をまたいでも
 * 速度が数式的に連続になる(=継ぎ目で勢いが途切れない)。
 */
function hermite(p0: number, v0: number, p1: number, v1: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * v0 + h01 * p1 + h11 * v1;
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
   * 天守の組み上げ進行度(0〜1)を持つ ref。1未満の間は航路ではなく
   * 天守のまわりを周回するカメラに切り替える。これも毎フレーム変わるので ref。
   */
  buildRef?: RefObject<number>;
  /**
   * 11秒を過ぎてからの「引き」の進み具合(0〜1)を持つ ref。
   * 0で天守まわりの周回、1でドローンの航路へ移りきった状態。
   */
  pullbackRef?: RefObject<number>;
  /**
   * 曲の演出強度(0〜1)を持つ ref(songStructure の replySectionEnergyAt)。
   * 揺れと呼吸の振り幅に使う。**11秒までは posHandoff=0 なので効かない。**
   */
  energyRef?: RefObject<number>;
  /**
   * 曲(=映像)の再生位置(秒)。航路はこれで直接引く(ループしない)。
   */
  songTimeRef?: RefObject<number>;
};

/**
 * 「Reply」モード中だけカメラを乗っ取る。
 *
 * - 組み上げ中(build < 1): 生成されていく天守のまわりを周回しながら昇る
 * - 組み上がったあと: 曲の構成に刺したドローンの航路を1本だけ飛ぶ
 *
 * 押した瞬間の位置から滑らかに寄せ、OFF にした瞬間の位置から OrbitControls へ
 * 滑らかに操作を返す。
 */
export function ReplyCamera({
  active,
  activationRef,
  buildRef,
  pullbackRef,
  energyRef,
  songTimeRef,
}: ReplyCameraProps) {
  const { camera } = useThree();
  const pos = useRef(new Vector3());
  const look = useRef(new Vector3());
  const orbitPos = useRef(new Vector3());
  const orbitLook = useRef(new Vector3());
  /** ドローン航路側の注視点。周回側(orbitLook)と混ぜて look を作る */
  const droneLook = useRef(new Vector3());
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
  /**
   * 見る先の向き直りが始まってからの経過秒数。位置が引ききるまでは0のまま、
   * そこから毎フレーム delta を積む。
   */
  const lookElapsed = useRef(0);

  // 入るたびに演出を頭から始める
  useEffect(() => {
    if (active) {
      lookElapsed.current = 0;
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
    const build = buildRef?.current ?? 1;
    const energy = Math.min(Math.max(energyRef?.current ?? 0.5, 0), 1);
    const songTime = songTimeRef?.current ?? 0;

    /*
      組み上げ中の周回 → ドローン航路への引き継ぎ。曲が11秒に達してから
      REPLY_PULLBACK_SECONDS かけて 0→1 で立ち上がる pullback を、
      位置用と見る先用の2つに分けて使う。
    */
    const pullback = pullbackRef?.current ?? 1;
    const posHandoff = smoothstep(Math.min(Math.max(pullback / 0.5, 0), 1));

    if (posHandoff >= 1) {
      lookElapsed.current += delta;
    } else {
      lookElapsed.current = 0;
    }
    const lookHandoff = smoothstep(Math.min(lookElapsed.current / 2.6, 1));

    /*
      天守のまわりの周回(11秒まで)。3段階に分かれる。

      1. 静止(holdSeconds): 正面の radiusStart で待つ。回転もしない。
      2. ドリーイン(dollySeconds): そこからまっすぐ start→mid へ
         前進しながら、高さも yFrom→yMid へ一緒に持ち上げる
         (まだ回転はしない)。
      3. 周回: そこから回り込みながら mid→to へ寄り、
         高さも yMid→yTo へ上がっていく(見る先は build 直結で
         このフェーズより前から継続して上がっている。下の orbitLook 参照)。

      radius・高さは**エルミート補間**で繋ぐ。ドリーイン区間は
      (速度0 → 継ぎ目の速度)、周回区間は(継ぎ目の速度 → 速度0)という
      具合に、継ぎ目(mid)の速度を両区間でぴったり同じ値にしてあるので、
      ドリーインの勢いが数式的に途切れず周回(回転)へ引き継がれる。
      回転(orbitAngle)は継ぐべき前の動きが無い(ドリーイン中は回転0固定)
      ので、そのぶんは普通に smoothstep で0から立ち上げてよい。

      値は編集モードから触れる useBuildOrbitStore の現在値。購読はせず
      getState() で毎フレーム読む(購読すると数千匹の魚を含むツリーが
      再レンダーされる)。継ぎ目の速度もその場で引き直す(四則演算数個)。
    */
    const orbit = useBuildOrbitStore.getState().values;
    const holdFraction = orbit.holdSeconds / REPLY_BUILD_END_SECONDS;
    const dollyFraction = orbit.dollySeconds / REPLY_BUILD_END_SECONDS;
    const orbitStartFraction = holdFraction + dollyFraction;
    const orbitDurationFraction = Math.max(1 - orbitStartFraction, 1e-6);
    const radiusJunctionVelocity =
      0.5 *
      ((orbit.radiusMid - orbit.radiusStart) / Math.max(dollyFraction, 1e-6) +
        (orbit.radiusTo - orbit.radiusMid) / orbitDurationFraction);
    const yJunctionVelocity =
      0.5 *
      ((orbit.yMid - orbit.yFrom) / Math.max(dollyFraction, 1e-6) +
        (orbit.yTo - orbit.yMid) / orbitDurationFraction);

    const dollyPhase = Math.min(
      Math.max((build - holdFraction) / Math.max(dollyFraction, 1e-6), 0),
      1,
    );
    const orbitPhase = Math.min(
      Math.max((build - orbitStartFraction) / orbitDurationFraction, 0),
      1,
    );
    const rotate = smoothstep(orbitPhase);
    const orbitAngle =
      BUILD_ORBIT_START_ANGLE + rotate * orbit.turns * Math.PI * 2;
    const inDolly = build < orbitStartFraction;
    const orbitRadius = inDolly
      ? hermite(
          orbit.radiusStart,
          0,
          orbit.radiusMid,
          radiusJunctionVelocity * dollyFraction,
          dollyPhase,
        )
      : hermite(
          orbit.radiusMid,
          radiusJunctionVelocity * orbitDurationFraction,
          orbit.radiusTo,
          0,
          orbitPhase,
        );
    const orbitY = inDolly
      ? hermite(
          orbit.yFrom,
          0,
          orbit.yMid,
          yJunctionVelocity * dollyFraction,
          dollyPhase,
        )
      : hermite(
          orbit.yMid,
          yJunctionVelocity * orbitDurationFraction,
          orbit.yTo,
          0,
          orbitPhase,
        );
    orbitPos.current.set(
      BASE.x + Math.sin(orbitAngle) * orbitRadius,
      BASE.y + orbitY,
      BASE.z + Math.cos(orbitAngle) * orbitRadius,
    );
    orbitLook.current.set(
      BASE.x,
      BASE.y + orbit.lookYFrom + build * (orbit.lookYTo - orbit.lookYFrom),
      BASE.z,
    );

    /*
      ドローンの航路。曲の再生位置で直接引く(ループしない)。
      keyframes は編集モードのパネル(features/editor/)から書き換えられる
      (getState() で都度読み、購読はしない=編集していないときは
      DRONE_PATH をそのままコピーした配列)。
    */
    sampleDrone(useDronePathStore.getState().keyframes, songTime, key.current);
    const angle = key.current.turn * Math.PI * 2;
    pos.current.set(
      BASE.x + Math.sin(angle) * key.current.radius,
      key.current.y,
      BASE.z + Math.cos(angle) * key.current.radius,
    );
    droneLook.current.set(BASE.x, key.current.lookY, BASE.z);

    /*
      小節周期の呼吸。ホログラムを支点にした距離の倍率として掛ける。
      ホバリング中の機体が位置を保とうとして前後する感じ。

      ※ 小節の位相(REPLY_BAR_ORIGIN)は音源から一意に決まらない
      (TRACK_NOTES.md §1.1)。ゆっくりした呼吸なので位相がずれても破綻しない。
    */
    // バンク・揺れ・呼吸・追従の味付け(編集モードから触れる)
    const feel = useCameraFeelStore.getState().values;

    if (posHandoff > 0) {
      const barPos = (songTime - REPLY_BAR_ORIGIN) / REPLY_BAR_SECONDS;
      const barPhase = barPos - Math.floor(barPos);
      const zoom =
        1 - Math.sin(barPhase * Math.PI * 2) * feel.breathAmount * energy;
      pos.current.sub(FOCUS).multiplyScalar(zoom).add(FOCUS);
    }

    // 手持ちカメラ風の細かい揺れ。周回中は入れない(意図した動きを濁らせるため)
    const shake =
      activation *
      (feel.shakeMin + (feel.shakeMax - feel.shakeMin) * energy) *
      posHandoff;
    pos.current.x += Math.sin(songTime * 2.7) * shake;
    pos.current.y += Math.sin(songTime * 3.4 + 1.1) * shake * 0.6;

    /*
      周回 → 航路を合成する。位置は posHandoff、見る先は lookHandoff と
      別々の進み具合で動かす。これで「引いている間は見る先を動かさず
      真後ろへ引き、引ききってから向き直す」という2拍の動きになる。
    */
    pos.current.lerp(orbitPos.current, 1 - posHandoff);
    look.current.copy(orbitLook.current).lerp(droneLook.current, lookHandoff);

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

      posHandoff を掛けてあるので、11秒までの周回中は常に0 = 水平のまま。
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

    const roll = bank.current * activation * posHandoff;
    forward.current.normalize();
    up.current.set(0, 1, 0);
    if (Number.isFinite(roll) && Math.abs(roll) > 0.0001) {
      up.current.applyAxisAngle(forward.current, roll);
    }
    camera.up.copy(up.current);
    camera.lookAt(look.current);

    /*
      画角。至近の煽りは広角で誇張し、離脱は望遠で圧縮する。
      activation と posHandoff を掛けてあるので、11秒まで・OFF のときは
      Canvas 既定の画角(68度)のまま。
    */
    const perspective = perspectiveRef.current;
    if (perspective && Number.isFinite(baseFov.current)) {
      const blend = activation * posHandoff;
      const fov = baseFov.current + (key.current.fov - baseFov.current) * blend;
      if (Math.abs(perspective.fov - fov) > 0.01) {
        perspective.fov = fov;
        perspective.updateProjectionMatrix();
      }
    }
  });

  return null;
}
