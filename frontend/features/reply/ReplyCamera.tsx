"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Vector3 } from "three";
import {
  CASTLE_TOP_Y,
  REPLY_BASE_POSITION,
  REPLY_FOCUS,
  STAGE_Y,
} from "./constants";

/** 演出1周の長さ(秒)。これを過ぎるとまた頭から繰り返す */
const CYCLE_SECONDS = 28;

/** カメラが向き続ける点 = ホログラム画面の中心。実質ここが回る中心になる */
const FOCUS = new Vector3(...REPLY_FOCUS);
/** 塔の足元(天守の底面)。組み上げ中の周回はここを軸にする */
const BASE = new Vector3(...REPLY_BASE_POSITION);

/* ------------------------------------------------------------------ *
 * 組み上げ中(build < 1)のカメラ。参照映像(Shelter)と同じく、生成されていく
 * 天守のまわりをぐるりと回りながら、組み上げ面といっしょに昇っていく。
 * ------------------------------------------------------------------ */

/**
 * 周回の半径。正面の遠くから入って、回りながら寄っていく。
 * 天守は幅12.9なので、寄り切ると石垣が画面いっぱいに来る。
 * 引いて全景を見せるのは11秒以降(PATH)の役目。
 *
 * TO は下の MIN_ORBIT_DISTANCE(11) ぎりぎりまで詰めてある。
 * それより寄せると水平距離クランプに引っかかって寄せの終盤で
 * カメラが急に押し戻される不自然な動きになる。
 */
const BUILD_ORBIT_RADIUS_FROM = 40;
const BUILD_ORBIT_RADIUS_TO = 11.5;
/** 周回の高さ。水面近くから始めて、組み上がりに合わせて上がる */
const BUILD_ORBIT_Y_FROM = 2.5;
const BUILD_ORBIT_Y_TO = CASTLE_TOP_Y + 2;
/** 見る先の高さ。組み上げ面を追いかけるように上げていく */
const BUILD_LOOK_Y_FROM = 1;
const BUILD_LOOK_Y_TO = CASTLE_TOP_Y * 0.85;
/**
 * 組み上げ中に回る周回数。ちょうど1周。
 * 開始角と合わせて「正面から入って1周して正面へ戻る」ので、11秒の直前には
 * 必ず天守の正面に居る。そこから真後ろへ引くのが11秒以降の PATH。
 *
 * 2周だと下の BUILD_HOLD で動ける時間が短くなったぶん回転が速く、
 * 「徐々に回り込む」ではなく振り回される画になる。
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
 *
 * 参照映像(Shelter 1:21〜)と同じく、まず正面の遠くから石が湧き出すのを
 * 見せて、そこから寄りと回り込みが始まる。0にすると押した瞬間から
 * カメラが動き出すので、生成の始まりが流れて見えない。
 */
const BUILD_HOLD = 0.2;

/**
 * カメラを目標位置へ寄せる速さ(1/秒)。
 *
 * ここは「毎フレーム一定割合ずつ寄せる」ではなく delta から指数減衰で
 * 係数を作る。割合固定だと追従の速さがフレームレートに比例してしまい、
 * 低fpsの端末では周回の目標点(11秒で0.8周する)に全く追いつかず、
 * カメラが天守の軸付近に取り残される(実測で距離30のはずが5〜17だった)。
 */
const FOLLOW_RATE = 6;

/**
 * 塔の軸からこれ以上は近づけない(水平距離)。
 * 天守の底面は実測で 6.4 × 5.7 なので、その外側に余裕を持たせた値。
 * カメラが内側へ入ると黒い天守の内壁で画面が埋まってしまう。
 */
const MIN_ORBIT_DISTANCE = 11;

type Keyframe = {
  /** サイクル内の位置(0〜1) */
  t: number;
  /** カメラ位置 */
  pos: [number, number, number];
};

/**
 * 天守 → ステージ → 鳥居 → ホログラムと縦に積んだ塔を舐めるカメラワーク。
 * 星降る海が「渦の中を潜る」動きなのに対し、こちらは塔の高さを見せるため
 * 上下に大きく振りながら旋回する。
 */
const PATH: Keyframe[] = [
  // 正面やや引き。塔の全景から入る
  { t: 0.0, pos: [0, CASTLE_TOP_Y + 10, 46] },
  // 右へ流しながら降りて、天守の石垣を見上げる
  { t: 0.16, pos: [34, 6, 30] },
  // 一気に上昇して斜め上からステージを見下ろす
  { t: 0.34, pos: [40, STAGE_Y + 18, -4] },
  // 裏側へ回り込み、夜空を背に塔のシルエットを抜く
  { t: 0.52, pos: [6, CASTLE_TOP_Y, -44] },
  // 左後方から鳥居の高さまで上がる
  { t: 0.68, pos: [-36, STAGE_Y + 12, -20] },
  // 低い位置まで降りて塔全体を見上げる
  { t: 0.85, pos: [-38, 4, 24] },
  // 引きに戻ってループ
  { t: 1.0, pos: [0, CASTLE_TOP_Y + 10, 46] },
];

/**
 * PATH 全体をホログラム(FOCUS)から遠ざける倍率。1.0だと PATH 本来の距離のまま。
 * 各カットの寄り引き感は保ったまま、全体の間合いだけここで調整する。
 */
const DISTANCE_SCALE = 1.15;

/** なめらかな加減速(ease-in-out)。等速で動くと機械的に見えるため */
function smoothstep(x: number) {
  return x * x * (3 - 2 * x);
}

/**
 * PATH の隣り合うキーフレームを補間して、時刻 t のカメラ位置を得る。
 * 注視点は常に FOCUS(ホログラム画面)固定なので、ここでは扱わない。
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

  // ホログラムを支点に、向きは保ったまま距離だけ伸ばす
  outPos.sub(FOCUS).multiplyScalar(DISTANCE_SCALE).add(FOCUS);
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
   * 天守の組み上げ進行度(0〜1)を持つ ref。1未満の間は PATH ではなく
   * 天守のまわりを周回するカメラに切り替える。これも毎フレーム変わるので ref。
   */
  buildRef?: RefObject<number>;
  /**
   * 11秒を過ぎてからの「引き」の進み具合(0〜1)を持つ ref。
   * 0で天守まわりの周回、1で PATH(塔の全景)へ移りきった状態。
   */
  pullbackRef?: RefObject<number>;
};

/**
 * 「Reply」モード中だけカメラを乗っ取る。
 *
 * - 組み上げ中(build < 1): 生成されていく天守のまわりを周回しながら昇る
 * - 組み上がったあと: PATH のカット割りを繰り返す
 *
 * 押した瞬間の位置から滑らかに寄せ、OFF にした瞬間の位置から OrbitControls へ
 * 滑らかに操作を返す(StarfallCamera と同じ作り)。
 */
export function ReplyCamera({
  active,
  activationRef,
  buildRef,
  pullbackRef,
}: ReplyCameraProps) {
  const { camera } = useThree();
  const elapsed = useRef(0);
  const pos = useRef(new Vector3());
  const look = useRef(new Vector3());
  const orbitPos = useRef(new Vector3());
  const orbitLook = useRef(new Vector3());

  // 入るたびに演出を頭から始める
  useEffect(() => {
    if (active) elapsed.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    if (!active) return;

    // 進行度はどちらもref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef.current ?? 0;
    const build = buildRef?.current ?? 1;

    /*
      組み上げ中の周回 → PATH への引き継ぎ具合(0=周回のみ, 1=PATHのみ)。
      曲が11秒に達してから立ち上がる pullback をそのまま使う
      (SceneContents 側で 0→1 を作っている)。
    */
    const handoff = smoothstep(pullbackRef?.current ?? 1);

    /*
      天守のまわりの周回。BUILD_HOLD の間は正面の遠くで止まったまま
      (見る先だけが組み上げ面を追って上がっていく)、そこから smoothstep で
      ゆっくり動き出し、回り込みながら寄って昇る。

      終わりも smoothstep で速度が0に収束するので、11秒でそのまま
      PATH の引きへ滑らかに渡る。
    */
    const move = smoothstep(
      Math.min(Math.max((build - BUILD_HOLD) / (1 - BUILD_HOLD), 0), 1),
    );
    const angle = BUILD_ORBIT_START_ANGLE + move * BUILD_ORBIT_TURNS * Math.PI * 2;
    const radius =
      BUILD_ORBIT_RADIUS_FROM +
      move * (BUILD_ORBIT_RADIUS_TO - BUILD_ORBIT_RADIUS_FROM);
    orbitPos.current.set(
      BASE.x + Math.sin(angle) * radius,
      BASE.y + BUILD_ORBIT_Y_FROM + move * (BUILD_ORBIT_Y_TO - BUILD_ORBIT_Y_FROM),
      BASE.z + Math.cos(angle) * radius,
    );
    orbitLook.current.set(
      BASE.x,
      BASE.y + BUILD_LOOK_Y_FROM + build * (BUILD_LOOK_Y_TO - BUILD_LOOK_Y_FROM),
      BASE.z,
    );

    /*
      通常の PATH。handoff を掛けて進めるので、引き継ぎが始まるまでは
      頭(t=0)で止まったまま = 引き継いだ瞬間から動き出す。
    */
    elapsed.current += delta * handoff;
    const t = (elapsed.current % CYCLE_SECONDS) / CYCLE_SECONDS;
    samplePath(t, pos.current);

    // 手持ちカメラ風の細かい揺れ。周回中は入れない(意図した動きを濁らせるため)
    const shake = activation * 0.35 * handoff;
    const st = elapsed.current;
    pos.current.x += Math.sin(st * 2.7) * shake;
    pos.current.y += Math.sin(st * 3.4 + 1.1) * shake * 0.6;

    // 周回 → PATH を合成する。見る先も天守の中ほどからホログラムへ移る
    pos.current.lerp(orbitPos.current, 1 - handoff);
    look.current.copy(orbitLook.current).lerp(FOCUS, handoff);

    /*
      塔の軸から最低限の距離を確保する。

      どんな経路であれカメラが天守の内側へ入ると、天守は黒くて両面描画なので
      画面が真っ黒になり、frustumCulled=false のビームだけがリング状に見える
      という状態になる(実際にその不具合報告があった)。ここで押し出しておけば、
      上流の計算が多少おかしくてもその画にはならない。
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
    camera.lookAt(look.current);
  });

  return null;
}
