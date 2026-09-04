"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import {
  REPLY_BAR_ORIGIN,
  REPLY_BAR_SECONDS,
  REPLY_BASE_POSITION,
  REPLY_FOCUS,
  STAGE_Y,
} from "./constants";

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
 * 周回の半径。正面の遠くから入って、回りながら寄っていく。
 * 天守は幅12.9なので、寄り切ると石垣が画面いっぱいに来る。
 * 引いて全景を見せるのは11秒以降(DRONE_PATH)の役目。
 *
 * TO は下の MIN_ORBIT_DISTANCE(11) ぎりぎりまで詰めてある。
 * それより寄せると水平距離クランプに引っかかって寄せの終盤で
 * カメラが急に押し戻される不自然な動きになる。
 */
const BUILD_ORBIT_RADIUS_FROM = 40;
const BUILD_ORBIT_RADIUS_TO = 11.5;
/**
 * 周回の高さ。組み上がりに合わせて上がっていく。
 *
 * FROM は水面すれすれ(2.5)ではなく、天守の高さ(36)の1/3ほどの位置から
 * 始める。低い位置から見上げると、飛来するブロックと石垣が重なって
 * 何が起きているのか読み取りにくい。少し上から見下ろすことで、
 * ブロックが四方から集まってくる広がりが最初から見える。
 *
 * TO は**ステージの甲板より少しだけ上**。11秒でステージ・鳥居・ホログラムが
 * 一斉に点くので、そこを見下ろす位置に居ると、せっかく現れたステージを
 * 上から潰した画になってしまう。甲板とほぼ同じ高さに着けておくことで、
 * ステージをほぼ真正面から(甲板の面が少し見える程度の伏角で)とらえる。
 */
const BUILD_ORBIT_Y_FROM = 12;
const BUILD_ORBIT_Y_TO = STAGE_Y + 2;
/**
 * 見る先の高さ。組み上げ面を追いかけるように上げていく。
 * カメラを上げたぶん FROM も上げて、見下ろす角度が付きすぎないようにする。
 */
const BUILD_LOOK_Y_FROM = 5;
/**
 * 組み上がりきる11秒ちょうどの注視点 = ステージの甲板の高さ。
 *
 * camera.lookAt はここを画面のど真ん中に置くので、照明が一斉に点く11秒の
 * 瞬間、ステージがちょうど中央に来る。
 */
const BUILD_LOOK_Y_TO = STAGE_Y;
/**
 * 組み上げ中に回る周回数。ちょうど1周。
 * 開始角と合わせて「正面から入って1周して正面へ戻る」ので、11秒の直前には
 * 必ず天守の正面に居る。そこから真後ろへ引くのが11秒以降の飛行。
 */
const BUILD_ORBIT_TURNS = 1;
/**
 * 周回の開始角度(ラジアン)。0 = +Z 側 = 天守の正面
 * (通常時のカメラ [0,3,11] と同じ向き)。
 */
const BUILD_ORBIT_START_ANGLE = 0;
/**
 * 動き出すまで「正面から見ているだけ」の時間(build の割合)。
 * 0.2 = 11秒のうち最初の約2.2秒。
 */
const BUILD_HOLD = 0.2;

/**
 * カメラを目標位置へ寄せる速さ(1/秒)。
 *
 * ここは「毎フレーム一定割合ずつ寄せる」ではなく delta から指数減衰で
 * 係数を作る。割合固定だと追従の速さがフレームレートに比例してしまい、
 * 低fpsの端末では周回の目標点に全く追いつかず、カメラが天守の軸付近に
 * 取り残される。
 */
const FOLLOW_RATE = 6;

/**
 * 塔の軸からこれ以上は近づけない(水平距離)。
 * 天守の底面は実測で 6.4 × 5.7 なので、その外側に余裕を持たせた値。
 * カメラが内側へ入ると黒い天守の内壁で画面が埋まってしまう。
 */
const MIN_ORBIT_DISTANCE = 11;

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

/** ドローンの航路のキーフレーム。塔の軸を中心にした円筒座標で持つ */
type DroneKey = {
  /** 曲中の時刻(秒)。**曲の構成(TRACK_NOTES.md §3)の境界に合わせてある** */
  t: number;
  /**
   * 塔の軸まわりの回転(周)。**単調に増やすこと。**
   * 隣り合うキーの差がそのまま旋回量になるので、差が大きいほど速く回る
   * (= バンクも深くなる)。戻すと逆回転して見える。
   */
  turn: number;
  /** 軸からの水平距離 */
  radius: number;
  /** カメラの高さ */
  y: number;
  /** 注視点の高さ(塔の軸上)。カメラの y との差が伏角/仰角になる */
  lookY: number;
  /** 画角(度) */
  fov: number;
};

/**
 * 航路。**時刻は曲の構成の境界そのもの**なので、ここを触るときは
 * TRACK_NOTES.md §3 の表と突き合わせること。
 *
 * 半径の下限に注意: 天守は高さ約36・底面の半径約14.9あるので、
 * **y が 38 より低いキーでは radius を 20 以上**にしないと石垣に潜る。
 */
const DRONE_PATH: readonly DroneKey[] = [
  // 11秒: 引きの着地点。ここは従来の引きと同じ間合いに合わせてある
  { t: 11.0, turn: 0.0, radius: 53, y: 46, lookY: 45, fov: 68 },
  // イントロ2: 上昇しながら寄る
  { t: 15.0, turn: 0.09, radius: 45, y: 52, lookY: 43, fov: 66 },
  { t: 19.0, turn: 0.2, radius: 37, y: 60, lookY: 37, fov: 64 },
  // 歌前の間: 最高高度でホバリング。会場を見下ろす
  { t: 23.0, turn: 0.28, radius: 34, y: 65, lookY: 35, fov: 64 },
  // Aメロ: ゆっくり降りながら、見下ろし→水平へ
  { t: 27.5, turn: 0.32, radius: 33, y: 64, lookY: 36, fov: 66 },
  { t: 33.5, turn: 0.43, radius: 32, y: 57, lookY: 40, fov: 66 },
  { t: 39.0, turn: 0.54, radius: 31, y: 50, lookY: 44, fov: 66 },
  { t: 45.0, turn: 0.66, radius: 29, y: 44, lookY: 45, fov: 66 },
  // Bメロ: 螺旋で降りながら詰める。旋回が速くなってバンクが付き始める
  { t: 49.5, turn: 0.76, radius: 27, y: 40, lookY: 45, fov: 68 },
  { t: 55.0, turn: 0.96, radius: 24, y: 35, lookY: 45, fov: 70 },
  { t: 59.0, turn: 1.14, radius: 22, y: 31, lookY: 44, fov: 72 },
  // サビ: 最も低く近い煽り。広角で誇張する
  { t: 62.0, turn: 1.28, radius: 21, y: 28, lookY: 45, fov: 76 },
  // サビ中: 一気に開けて大きく回る(10.5秒で0.64周=最速。バンクが深く出る)
  { t: 67.5, turn: 1.62, radius: 30, y: 40, lookY: 45, fov: 72 },
  { t: 72.5, turn: 1.92, radius: 42, y: 54, lookY: 43, fov: 68 },
  { t: 78.5, turn: 2.28, radius: 34, y: 60, lookY: 39, fov: 68 },
  // 後半: 振り戻して寄る
  { t: 83.0, turn: 2.52, radius: 25, y: 45, lookY: 45, fov: 74 },
  // フライバイ: 外へ抜けてから低く戻る
  { t: 90.0, turn: 2.92, radius: 46, y: 38, lookY: 42, fov: 70 },
  { t: 96.0, turn: 3.22, radius: 31, y: 31, lookY: 44, fov: 72 },
  // 至近をかすめる。最後の歌詞へ向けて上昇に転じる
  { t: 101.0, turn: 3.48, radius: 23, y: 33, lookY: 45, fov: 76 },
  { t: 106.0, turn: 3.76, radius: 31, y: 48, lookY: 45, fov: 70 },
  // アウトロ: 望遠に寄せながら引き上げていく
  { t: 107.0, turn: 3.82, radius: 35, y: 51, lookY: 45, fov: 68 },
  { t: 114.0, turn: 4.02, radius: 62, y: 60, lookY: 44, fov: 62 },
  // フェード: 圧縮した望遠で静かに離脱する
  { t: 121.3, turn: 4.18, radius: 88, y: 68, lookY: 42, fov: 56 },
  { t: 127.5, turn: 4.28, radius: 108, y: 74, lookY: 40, fov: 52 },
] as const;

/**
 * バンク(ロール)の強さ。旋回の角速度[rad/s]に掛ける。
 * サビの最速区間(約0.38rad/s)で 0.23rad ≒ 13度 傾く。
 */
const BANK_GAIN = 0.6;
/** バンクの上限(ラジアン)。約17度。これ以上倒すと曲芸になる */
const BANK_MAX = 0.3;
/**
 * バンクの追従の速さ(1/秒)。角速度をそのまま入れるとキーの切れ目で
 * カクつくので、ここで一段なまらせて「機体が傾いていく」動きにする。
 */
const BANK_SMOOTH = 2.2;

/**
 * 1小節(1.41秒)周期の、ごく浅い寄り引き。ホログラムを支点にした距離の倍率。
 *
 * 170bpm は1拍0.35秒とかなり速いので、拍で動かすとチカチカする。
 * TRACK_NOTES.md §5-1 の通り**小節を基本単位**にして、ホバリング中の機体が
 * 位置を保とうとして揺れているくらいの浅さに留める。
 */
const BREATH_AMOUNT = 0.014;

/** 手持ち風の揺れ。静かな所と盛り上がりで振り幅を変える */
const SHAKE_MIN = 0.18;
const SHAKE_MAX = 0.5;

/** なめらかな加減速(ease-in-out)。等速で動くと機械的に見えるため */
function smoothstep(x: number) {
  const k = x < 0 ? 0 : x > 1 ? 1 : x;
  return k * k * (3 - 2 * k);
}

/** 航路を時刻 t(秒) で標本化する。返り値は破壊的に out へ書く */
function sampleDrone(
  t: number,
  out: { turn: number; radius: number; y: number; lookY: number; fov: number },
) {
  const last = DRONE_PATH.length - 1;
  if (t <= DRONE_PATH[0].t) {
    const k = DRONE_PATH[0];
    out.turn = k.turn;
    out.radius = k.radius;
    out.y = k.y;
    out.lookY = k.lookY;
    out.fov = k.fov;
    return;
  }
  if (t >= DRONE_PATH[last].t) {
    const k = DRONE_PATH[last];
    out.turn = k.turn;
    out.radius = k.radius;
    out.y = k.y;
    out.lookY = k.lookY;
    out.fov = k.fov;
    return;
  }

  let i = 0;
  while (i < last - 1 && t > DRONE_PATH[i + 1].t) i++;
  const a = DRONE_PATH[i];
  const b = DRONE_PATH[i + 1];
  const span = b.t - a.t || 1;
  const k = smoothstep((t - a.t) / span);

  out.turn = a.turn + (b.turn - a.turn) * k;
  out.radius = a.radius + (b.radius - a.radius) * k;
  out.y = a.y + (b.y - a.y) * k;
  out.lookY = a.lookY + (b.lookY - a.lookY) * k;
  out.fov = a.fov + (b.fov - a.fov) * k;
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
      天守のまわりの周回(11秒まで)。BUILD_HOLD の間は正面の遠くで止まったまま
      (見る先だけが組み上げ面を追って上がっていく)、そこから smoothstep で
      ゆっくり動き出し、回り込みながら寄って昇る。
    */
    const move = smoothstep(
      Math.min(Math.max((build - BUILD_HOLD) / (1 - BUILD_HOLD), 0), 1),
    );
    const orbitAngle =
      BUILD_ORBIT_START_ANGLE + move * BUILD_ORBIT_TURNS * Math.PI * 2;
    const orbitRadius =
      BUILD_ORBIT_RADIUS_FROM +
      move * (BUILD_ORBIT_RADIUS_TO - BUILD_ORBIT_RADIUS_FROM);
    orbitPos.current.set(
      BASE.x + Math.sin(orbitAngle) * orbitRadius,
      BASE.y + BUILD_ORBIT_Y_FROM + move * (BUILD_ORBIT_Y_TO - BUILD_ORBIT_Y_FROM),
      BASE.z + Math.cos(orbitAngle) * orbitRadius,
    );
    orbitLook.current.set(
      BASE.x,
      BASE.y + BUILD_LOOK_Y_FROM + build * (BUILD_LOOK_Y_TO - BUILD_LOOK_Y_FROM),
      BASE.z,
    );

    /* --- ドローンの航路。曲の再生位置で直接引く(ループしない) --- */
    sampleDrone(songTime, key.current);
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
    if (posHandoff > 0) {
      const barPos = (songTime - REPLY_BAR_ORIGIN) / REPLY_BAR_SECONDS;
      const barPhase = barPos - Math.floor(barPos);
      const zoom =
        1 - Math.sin(barPhase * Math.PI * 2) * BREATH_AMOUNT * energy;
      pos.current.sub(FOCUS).multiplyScalar(zoom).add(FOCUS);
    }

    // 手持ちカメラ風の細かい揺れ。周回中は入れない(意図した動きを濁らせるため)
    const shake =
      activation * (SHAKE_MIN + (SHAKE_MAX - SHAKE_MIN) * energy) * posHandoff;
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
    if (flat < MIN_ORBIT_DISTANCE) {
      // 真芯(flat=0)のときは向きが決まらないので、正面(+Z)へ逃がす
      const k = flat > 0.001 ? MIN_ORBIT_DISTANCE / flat : 0;
      pos.current.x = BASE.x + dx * k;
      pos.current.z = BASE.z + (k === 0 ? MIN_ORBIT_DISTANCE : dz * k);
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
    const follow = 1 - Math.exp(-FOLLOW_RATE * delta * Math.min(activation, 1));
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
          -BANK_MAX,
          Math.min(BANK_MAX, (d / delta) * BANK_GAIN),
        );
        bank.current += (target - bank.current) * (1 - Math.exp(-BANK_SMOOTH * delta));
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
