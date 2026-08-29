"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Vector3 } from "three";

/** 演出1周の長さ(秒)。これを過ぎるとまた頭から繰り返す */
const CYCLE_SECONDS = 24;

/**
 * ホログラム画面のワールド座標。ToriiHologram の
 * TORII_POSITION([0, 0, -2]) + FLOAT_Y(14) に合わせてある
 * (値を変えるときは両方直すこと)。
 * カメラは常にこの点を向くので、実質ここが「カメラの回る中心」になる。
 */
const SCREEN_FOCUS = new Vector3(0, 14, -2);

type Keyframe = {
  /** サイクル内の位置(0〜1) */
  t: number;
  /** カメラ位置 */
  pos: [number, number, number];
  /**
   * 構図の基準点。カメラが実際に見る先(SCREEN_FOCUS)とは別に、
   * 「この画角でどれくらい寄る/引くか」を決める支点としてだけ使う。
   */
  compose: [number, number, number];
};

/**
 * ライブ映像のカット割りをなぞったカメラワーク。
 * 引き → 群れの中へ潜り込む → 鳥居を舐めるように旋回 → 群れを突き抜けて上昇、を繰り返す。
 */
const PATH: Keyframe[] = [
  // 引きの全景から入る
  { t: 0.0, pos: [0, 3, 12], compose: [0, 6, -2] },
  // 水面すれすれを滑りながら鳥居へ寄る
  { t: 0.15, pos: [10, 2.2, 10], compose: [-3, 4, -2] },
  // 斜め上へ回り込み、渦の全体像を見せる
  { t: 0.3, pos: [22, 10, 6], compose: [3, 6, -2] },
  // 映像の俯瞰カット。高い位置から鳥居と渦を見下ろす
  { t: 0.45, pos: [17, 22, -10], compose: [-2, 5, -2] },
  // 渦の裏側へ回り込む
  { t: 0.6, pos: [-18, 14, -20], compose: [4, 8, -2] },
  // 低い位置まで降りて鳥居を見上げる
  { t: 0.78, pos: [-14, 3, 8], compose: [2, 6, -2] },
  // 引きに戻ってループ
  { t: 1.0, pos: [0, 3, 12], compose: [0, 6, -2] },
];

/**
 * カメラを構図の基準点(compose)から遠ざける倍率。1.0だとPATH本来の距離のまま。
 * カメラは常にホログラム画面(SCREEN_FOCUS)を向くので、寄りすぎると画面が
 * 大写しになりすぎる。各カットの寄り引き感は保ったまま距離だけ伸ばす。
 */
const CAMERA_PULLBACK = 1.4;

/** なめらかな加減速(ease-in-out)。等速で動くと機械的に見えるため */
function smoothstep(x: number) {
  return x * x * (3 - 2 * x);
}

/*
  転調に合わせた寄り引き。動画の再生位置1:18(78秒)からホログラムへ寄っていき、
  1:22(82秒)の転調の瞬間に一気に離れる。PATH のカット割りとは独立して、
  「カメラとホログラムの距離」だけをこの寄り具合で上書きする。
*/
/** ホログラムへ寄り始める再生位置(1:18) */
const DOLLY_IN_START_SECONDS = 78;
/**
 * 寄り切る再生位置(1:20)。ここで最も寄った状態になり、
 * DOLLY_IN_END_SECONDS まではその画のまま静止して待つ。
 * DOLLY_IN_START〜ここが実際に「寄っていく」時間(既定で2秒)。
 */
const DOLLY_IN_SETTLE_SECONDS = 82;
/**
 * 寄り切った画から離れ始める再生位置(1:22)。
 * Sandbox3D.tsx の SURGE_START_SECONDS(転調)と同じ値にしてある。
 * 転調の白い閃光と同時にカメラが引くので、寄り切った画から一気に開ける
 * (値を変えるときは両方直すこと)。
 */
const DOLLY_IN_END_SECONDS = 82.1;
/** 寄り切ったときにホログラムまでの距離をどれだけ詰めるか(0=寄らない, 1=画面に密着) */
const DOLLY_IN_MAX = 0.47;
/**
 * 寄り/引きの間、カメラの目線を画面の中心の高さ(SCREEN_FOCUS.y)へどれだけ揃えるか。
 * 0 = PATH の高さのまま / 1 = 完全に画面と同じ高さ。
 * 1にすると見下ろし・見上げの角度が消え、画面を正面に見据えたまま動く。
 * 引く動き(pos.lerp)は「カメラ→画面」の直線に沿うので、高さを画面に
 * 揃えておかないと、そのとき PATH でカメラが高い位置にいると上へ引いてしまう。
 * 水平化は下の dollyLevel() の強さで効かせる(引き切りまで1、そのあと解除)。
 */
const DOLLY_IN_LEVEL = 0.8;
/** 引き切ったあと、水平化を解いて PATH 本来の高さへ戻すまでの秒数 */
const DOLLY_LEVEL_RELEASE_SECONDS = 3;
/**
 * 転調(DOLLY_IN_END_SECONDS)から、寄り切り → 「行き過ぎの底」まで一気に引く秒数。
 * 短いほど閃光に突き放されたような鋭い引きになる。
 */
const DOLLY_PULL_SECONDS = 1;
/**
 * 「行き過ぎの底」から AFTER_SURGE_DISTANCE へ戻る秒数。
 * DOLLY_OUT_OVERSHOOT=0 のときは戻る先が底と同じなので、実質この時間ぶん
 * その距離のまま静止するだけ(害はない)。
 */
const DOLLY_SETTLE_SECONDS = 4;
/**
 * 転調で離れたあと、曲の終わりまで居続ける距離。
 * PATH 本来の距離に対する倍率で、1.0=本来のまま / 1.1=1割遠い。
 * 転調前より一歩引いた画のまま後半を見せる。
 */
const AFTER_SURGE_DISTANCE = 1.1;
/**
 * 引くときに AFTER_SURGE_DISTANCE をどれだけ通り越すか(0=通り越さない)。
 * 一度行き過ぎてから戻ることで、閃光に突き放されたような勢いが出る。
 */
const DOLLY_OUT_OVERSHOOT = 0.3;

/*
  転調直後、PATH(旋回)の進みを一時的に遅くする。PATH の24秒周期は曲と
  同期していないので、転調のたびに「たまたま速いセグメント(渦の裏へ回り込む
  あたり)」へ突入して、引いた直後にカメラが急に速く動いて見えることがある。
  転調〜引き切りの間だけ PATH をスローにして、そのあと通常速度へ戻す。
*/
/** 転調直後の PATH の進み倍率(1=通常, 小さいほどスロー) */
const PATH_SURGE_SLOWDOWN = 0.3;
/** 転調の何秒前から PATH を緩め始めるか(閃光でごまかせる範囲で) */
const PATH_SLOWDOWN_ENTER_SECONDS = 1;
/** 引き切ったあと、PATH を通常速度へ戻すまでの秒数 */
const PATH_SLOWDOWN_RECOVER_SECONDS = 1;

/**
 * 動画の終わりの何秒前から、AFTER_SURGE_DISTANCE ぶん引いていた位置を
 * PATH 本来の距離へ戻し始めるか。動画が終わる時点で戻りきるので、
 * ループで頭へ巻き戻る瞬間に距離が飛ぶことがない。
 */
const DOLLY_RESET_SECONDS = 8;

/**
 * AFTER_SURGE_DISTANCE に相当する dolly 値。
 * 距離倍率が `1 - dolly * DOLLY_IN_MAX` で決まるので、そこから逆算する。
 */
const AFTER_SURGE_DOLLY = (1 - AFTER_SURGE_DISTANCE) / DOLLY_IN_MAX;

/**
 * 動画の再生位置から、ホログラムへの寄り具合を返す。
 * 1 = 最も寄った状態 / 0 = PATH 本来の距離 / 負 = 本来より引いた状態。
 * duration は動画の長さ(秒)。未取得(0やNaN)のときは終わり際の戻しを行わない。
 */
function dollyAmount(videoTime: number, duration: number) {
  /*
    曲の終わり。引いていた分(AFTER_SURGE_DOLLY)を PATH 本来の距離へ戻す。
    ここを先に見るのは、下の「転調後はずっと AFTER_SURGE_DOLLY」に
    先回りして終わり際だけ上書きするため。
  */
  const resetStart = duration - DOLLY_RESET_SECONDS;
  if (duration > 0 && videoTime >= resetStart) {
    const k = smoothstep(
      Math.min((videoTime - resetStart) / DOLLY_RESET_SECONDS, 1),
    );
    return AFTER_SURGE_DOLLY * (1 - k);
  }

  if (videoTime <= DOLLY_IN_START_SECONDS) return 0;

  if (videoTime < DOLLY_IN_SETTLE_SECONDS) {
    const x =
      (videoTime - DOLLY_IN_START_SECONDS) /
      (DOLLY_IN_SETTLE_SECONDS - DOLLY_IN_START_SECONDS);
    // 二乗のイーズイン。ゆっくり動き出し、寄り切る直前が一番速く吸い寄せられる
    return x * x;
  }

  // 寄り切ってから転調まではその画のまま静止して待つ
  if (videoTime < DOLLY_IN_END_SECONDS) return 1;

  const tOut = videoTime - DOLLY_IN_END_SECONDS;
  // 行き過ぎの底。閃光に突き放されたように AFTER_SURGE_DISTANCE を通り越す
  const bottom = AFTER_SURGE_DOLLY - DOLLY_OUT_OVERSHOOT;

  // 前半: 寄り切り(1)から底まで一気に引く
  if (tOut < DOLLY_PULL_SECONDS) {
    const k = smoothstep(tOut / DOLLY_PULL_SECONDS);
    return 1 + (bottom - 1) * k;
  }
  // 後半: 行き過ぎた分をゆっくり戻して AFTER_SURGE_DISTANCE へ収める
  const tSettle = tOut - DOLLY_PULL_SECONDS;
  if (tSettle >= DOLLY_SETTLE_SECONDS) return AFTER_SURGE_DOLLY;
  const k = smoothstep(tSettle / DOLLY_SETTLE_SECONDS);
  return bottom + (AFTER_SURGE_DOLLY - bottom) * k;
}

/**
 * 高さの水平化(目線を SCREEN_FOCUS.y へ寄せる)の強さ。0〜1。
 * 寄っていく間は dolly と同じ二乗イーズインで上げ、寄り切り〜引き切りまで1を
 * 保つ(= まっすぐ後ろへ引く)。引き切ったら DOLLY_LEVEL_RELEASE_SECONDS かけて
 * 0へ戻し、後半は PATH 本来の高さに任せる。
 */
function dollyLevel(videoTime: number) {
  if (videoTime <= DOLLY_IN_START_SECONDS) return 0;

  if (videoTime < DOLLY_IN_SETTLE_SECONDS) {
    const x =
      (videoTime - DOLLY_IN_START_SECONDS) /
      (DOLLY_IN_SETTLE_SECONDS - DOLLY_IN_START_SECONDS);
    return x * x;
  }

  // 寄り切り〜転調〜一気に引き切るところまでは水平を保つ
  const sharpPullEnd = DOLLY_IN_END_SECONDS + DOLLY_PULL_SECONDS;
  if (videoTime < sharpPullEnd) return 1;

  // 引き切ったら水平化を解いて PATH 本来の高さへ返す
  const r = (videoTime - sharpPullEnd) / DOLLY_LEVEL_RELEASE_SECONDS;
  return r >= 1 ? 0 : 1 - smoothstep(r);
}

/**
 * PATH(旋回)の進み倍率。転調直前〜引き切りの間だけスローにして、
 * そのあと通常速度へ戻す。転調のたびに速いセグメントへ突入して
 * 「引いた直後にカメラが急に速く動く」のを防ぐ。
 */
function pathSpeed(videoTime: number) {
  const enterStart = DOLLY_IN_END_SECONDS - PATH_SLOWDOWN_ENTER_SECONDS;
  const slowEnd = DOLLY_IN_END_SECONDS + DOLLY_PULL_SECONDS;

  if (videoTime <= enterStart) return 1;

  // 転調直前: 1 → SLOWDOWN
  if (videoTime < DOLLY_IN_END_SECONDS) {
    const k = smoothstep(
      (videoTime - enterStart) / PATH_SLOWDOWN_ENTER_SECONDS,
    );
    return 1 + (PATH_SURGE_SLOWDOWN - 1) * k;
  }

  // 転調〜引き切り: スロー維持
  if (videoTime < slowEnd) return PATH_SURGE_SLOWDOWN;

  // 引き切ったあと: SLOWDOWN → 1
  const r = (videoTime - slowEnd) / PATH_SLOWDOWN_RECOVER_SECONDS;
  if (r >= 1) return 1;
  return PATH_SURGE_SLOWDOWN + (1 - PATH_SURGE_SLOWDOWN) * smoothstep(r);
}

/**
 * PATH の隣り合うキーフレームを補間して、時刻 t のカメラ位置を得る。
 * 注視点は常に SCREEN_FOCUS(ホログラム画面)固定なので、ここでは扱わない。
 */
function samplePath(t: number, outPos: Vector3) {
  let i = 0;
  while (i < PATH.length - 2 && t > PATH[i + 1].t) i++;

  const a = PATH[i];
  const b = PATH[i + 1];
  const span = b.t - a.t || 1;
  const k = smoothstep(Math.min(Math.max((t - a.t) / span, 0), 1));

  outPos.set(
    a.pos[0] + (b.pos[0] - a.pos[0]) * k,
    a.pos[1] + (b.pos[1] - a.pos[1]) * k,
    a.pos[2] + (b.pos[2] - a.pos[2]) * k,
  );

  const composeX = a.compose[0] + (b.compose[0] - a.compose[0]) * k;
  const composeY = a.compose[1] + (b.compose[1] - a.compose[1]) * k;
  const composeZ = a.compose[2] + (b.compose[2] - a.compose[2]) * k;

  // 構図の基準点(compose)を支点に、そこへ向かう向きは保ったまま距離だけ伸ばす
  outPos.x = composeX + (outPos.x - composeX) * CAMERA_PULLBACK;
  outPos.y = composeY + (outPos.y - composeY) * CAMERA_PULLBACK;
  outPos.z = composeZ + (outPos.z - composeZ) * CAMERA_PULLBACK;
}

type StarfallCameraProps = {
  active: boolean;
  /**
   * 0〜1。演出の立ち上がり具合を持つ ref。手持ちカメラ風の揺れの強さと、
   * 立ち上がり中の寄せ速度に使う。立ち上がり/収まりの間ずっと変わるため
   * 数値 prop だと親ごと毎フレーム再レンダー。ref で受け取り useFrame で読む。
   */
  activationRef: RefObject<number>;
  /** ホログラムに映している動画。寄り引き(1:18〜1:22)の判定に再生位置を使う */
  videoRef: RefObject<HTMLVideoElement | null>;
};

/**
 * 「星降る海」モード中だけカメラを乗っ取り、PATH のカット割りを繰り返す。
 * OFF にした瞬間の位置から OrbitControls へ滑らかに操作を返すため、
 * 停止時はカメラをその場に残すだけにしている(強制的に元位置へ戻さない)。
 */
export function StarfallCamera({
  active,
  activationRef,
  videoRef,
}: StarfallCameraProps) {
  const { camera } = useThree();
  const elapsed = useRef(0);
  const pos = useRef(new Vector3());

  // 入るたびに演出を頭から始める
  useEffect(() => {
    if (active) elapsed.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    if (!active) return;

    const video = videoRef.current;
    const videoTime = video?.currentTime ?? 0;

    // PATH の進みは転調前後だけスローにする(下の pathSpeed 参照)
    elapsed.current += delta * pathSpeed(videoTime);
    const t = (elapsed.current % CYCLE_SECONDS) / CYCLE_SECONDS;
    samplePath(t, pos.current);

    /*
      1:18〜1:22 の寄り引き。PATH で決まった位置を、そのままホログラム
      (SCREEN_FOCUS)へ向かって近づける/遠ざける。カメラは常にこの点を
      向いているので、距離だけ動かせば構図を崩さず寄り引きになる。
      dolly が負のときは lerp が逆向きに働き、本来より遠ざかる。
    */
    // duration は読み込み前は NaN。dollyAmount 側で duration > 0 を見て弾く
    const dolly = dollyAmount(videoTime, video?.duration ?? 0);
    /*
      高さの水平化の強さ(0〜1)。寄り〜引き切りまで1、引き切ったら数秒で0へ。
      手持ちの揺れの抑制もこれで効かせる。以前は「寄り具合(dollyが正の間だけ)」
      で抑えていたので、引き始めて dolly が負になった瞬間に揺れがフル復活して
      「急に速く動き出す」ように見えていた。level なら引き切りまで抑えたまま、
      そのあと数秒かけて揺れが戻る。
    */
    const level = dollyLevel(videoTime);

    /*
      目線の高さを画面の中心へ揃える。PATH には俯瞰(y=22)のようなカットもあり、
      揃えないと(1)寄ったとき画面が台形に歪む(2)引くとき lerp が「カメラ→画面」
      の直線に沿うので、カメラが高い位置にいると上へ引いてしまう。
      距離を動かす前に高さを揃えておくことで、画面を正面に見据えたまま
      その面に沿って水平に寄り引きするカメラになる。
    */
    if (level > 0) {
      pos.current.y += (SCREEN_FOCUS.y - pos.current.y) * level * DOLLY_IN_LEVEL;
    }
    if (dolly !== 0) pos.current.lerp(SCREEN_FOCUS, dolly * DOLLY_IN_MAX);

    // 進行度はref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef.current ?? 0;

    // 手持ちカメラ風の細かい揺れ。躍動感を出しつつ酔わない程度に留める。
    // 寄り切っているときは同じ揺れ幅でも画面上の振れが大きくなるので抑える
    // (level で抑えるので、引き切ったあと数秒かけて揺れが戻る)
    const shake = activation * 0.35 * (1 - level * 0.85);
    const st = elapsed.current;
    pos.current.x += Math.sin(st * 2.7) * shake;
    pos.current.y += Math.sin(st * 3.4 + 1.1) * shake * 0.6;

    // 演出の立ち上がり中は現在位置から徐々に寄せる(切り替えた瞬間に飛ばない)
    camera.position.lerp(pos.current, Math.min(activation, 1) * 0.08 + 0.02);
    // 常にホログラム画面を向く = カメラが回る中心点はスクリーンになる
    camera.lookAt(SCREEN_FOCUS);
  });

  return null;
}
