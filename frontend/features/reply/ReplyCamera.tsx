"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { types } from "@theatre/core";
import { useEffect, useRef, type RefObject } from "react";
import { PerspectiveCamera, Vector3 } from "three";
import { exposeDevSeed, getStudio, sceneProject } from "@/features/root/theatre";
import { useSceneStore } from "@/features/root/store";
import {
  REPLY_BAR_ORIGIN,
  REPLY_BAR_SECONDS,
  REPLY_BASE_POSITION,
  REPLY_BUILD_END_SECONDS,
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
 * 周回の半径。3段階に分かれる。
 *   1. 静止(BUILD_HOLD_SECONDS): START のまま正面で待つ。回転もしない。
 *   2. ドリーイン(BUILD_DOLLY_SECONDS): まっすぐ START→MID へ前進する
 *      だけ(これも回転しない)。
 *   3. 周回: そこから回り込みながらさらに MID→TO まで寄っていく。
 *
 * **ドリーインと周回の継ぎ目(MID)で速度が0に落ちないこと。**
 * 単純に「ドリーインを smoothstep で減速して止め、周回を smoothstep で
 * 0から助走する」と、前進の勢いが継ぎ目で一度完全に殺されてから
 * 回転が始まる不自然な間ができる。下の RADIUS_JUNCTION_VELOCITY /
 * Y_JUNCTION_VELOCITY と useFrame 内の Hermite 補間で、継ぎ目の速度
 * (dRadius/dBuild)を2区間で厳密に一致させ、ドリーインの勢いがそのまま
 * 周回(回転)へ引き継がれるようにしてある。
 *
 * TO は下の MIN_ORBIT_DISTANCE(11) ぎりぎりまで詰めてある。
 * それより寄せると水平距離クランプに引っかかって寄せの終盤で
 * カメラが急に押し戻される不自然な動きになる。
 */
const BUILD_ORBIT_RADIUS_START = 70;
const BUILD_ORBIT_RADIUS_MID = 34;
const BUILD_ORBIT_RADIUS_TO = 11.5;
/**
 * Reply を押してから、前進を始めるまでの秒数。この間は正面の START で静止する
 * (組み上げ面が最初に生えてくる様子を、動かず見せる)。
 */
const BUILD_HOLD_SECONDS = 2.5;
/**
 * 静止のあと、前進(START→MID)にかける秒数。ここもまだ回転はしない。
 * 天守は幅12.9なので、寄り切ると石垣が画面いっぱいに来る。
 * 引いて全景を見せるのは11秒以降(DRONE_PATH)の役目。
 */
const BUILD_DOLLY_SECONDS = 3.5;
/** 上2つを build(0〜1) の割合に換算したもの */
const BUILD_HOLD_FRACTION = BUILD_HOLD_SECONDS / REPLY_BUILD_END_SECONDS;
const BUILD_DOLLY_FRACTION = BUILD_DOLLY_SECONDS / REPLY_BUILD_END_SECONDS;
/** ドリーインが終わり、周回が始まる build の割合 */
const BUILD_ORBIT_START_FRACTION = BUILD_HOLD_FRACTION + BUILD_DOLLY_FRACTION;
/** 周回フェーズの長さ(build の割合)。Hermite の区間長として使う */
const BUILD_ORBIT_DURATION_FRACTION = 1 - BUILD_ORBIT_START_FRACTION;
/**
 * 周回の高さ。組み上がりに合わせて上がっていく(radius と同じ3段階)。
 *
 * FROM は水面すれすれ(2.5)ではなく、天守の高さ(36)の1/3ほどの位置から
 * 始める。低い位置から見上げると、飛来するブロックと石垣が重なって
 * 何が起きているのか読み取りにくい。少し上から見下ろすことで、
 * ブロックが四方から集まってくる広がりが最初から見える。
 *
 * MID はドリーインが終わる時点の高さ。radius と同様、継ぎ目の速度を
 * Hermite で揃えるので「前進しながら一緒に上がっていた勢い」のまま
 * 周回の上昇へ引き継がれる。
 *
 * TO は**ステージの甲板より少しだけ上**。11秒でステージ・鳥居・ホログラムが
 * 一斉に点くので、そこを見下ろす位置に居ると、せっかく現れたステージを
 * 上から潰した画になってしまう。甲板とほぼ同じ高さに着けておくことで、
 * ステージをほぼ真正面から(甲板の面が少し見える程度の伏角で)とらえる。
 */
const BUILD_ORBIT_Y_FROM = 2;
const BUILD_ORBIT_Y_MID = 16;
const BUILD_ORBIT_Y_TO = STAGE_Y + 2;

/**
 * ドリーイン→周回の継ぎ目(MID)で共有する速度(dRadius/dBuild, dY/dBuild)。
 *
 * 前後2区間それぞれの平均勾配(距離/区間の長さ)を平均するだけの
 * 簡便な式(Catmull-Rom スプラインの内部接線と同じ考え方)。これを
 * Hermite 補間の両区間の端点で共通の接線として使うことで、継ぎ目の
 * 前後で速度が数式的に一致する(=体感で勢いが途切れない)。
 */
const RADIUS_JUNCTION_VELOCITY =
  0.5 *
  ((BUILD_ORBIT_RADIUS_MID - BUILD_ORBIT_RADIUS_START) / BUILD_DOLLY_FRACTION +
    (BUILD_ORBIT_RADIUS_TO - BUILD_ORBIT_RADIUS_MID) / BUILD_ORBIT_DURATION_FRACTION);
const Y_JUNCTION_VELOCITY =
  0.5 *
  ((BUILD_ORBIT_Y_MID - BUILD_ORBIT_Y_FROM) / BUILD_DOLLY_FRACTION +
    (BUILD_ORBIT_Y_TO - BUILD_ORBIT_Y_MID) / BUILD_ORBIT_DURATION_FRACTION);
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

/*
  以下 DroneKey 型 / DRONE_PATH は Theatre.js 移行後は実行時に使わない
  参照用データ。Studio でキーフレームを打ち直す/調整する際、元の値を
  見ながら作業するために残してある(下の droneSheet/droneObj 参照)。
*/

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

/**
 * 11秒までの周回カメラ(BUILD_ORBIT_*・hermite。上のコメント通りここは
 * 触らない)を、Theatre.js のタイムラインへシードするためだけに**同じ式で
 * 再計算する**サンプリング関数。**カメラの実際の描画ロジック
 * (useFrame内。下を参照)はこの関数を使わず、既存のhermite計算式を
 * そのまま実行し続ける**(seedReplyBuildOrbitKeyframes 用の副産物)。
 *
 * turn は DRONE_PATH と同じ「回転数」表現に揃えるが、そのままだと build=1
 * (t=11)で1.0(=1回転)になり、DRONE_PATH[0].turn=0 と数値上ズレる
 * (sin/cosは2π周期なので見た目は同じ角度だが、Theatre側は生の数値を
 * 線形補間するので、そのままだと11秒の継ぎ目で逆回転する不具合になる)。
 * BUILD_ORBIT_TURNS ぶん引いて、t=11 でちょうど 0 に着地するよう
 * 通し番号にしてある(t=0 の時点では turn=-BUILD_ORBIT_TURNS)。
 */
function sampleBuildOrbit(t: number) {
  const build = Math.min(Math.max(t / REPLY_BUILD_END_SECONDS, 0), 1);
  const dollyPhase = Math.min(
    Math.max((build - BUILD_HOLD_FRACTION) / BUILD_DOLLY_FRACTION, 0),
    1,
  );
  const orbitPhase = Math.min(
    Math.max(
      (build - BUILD_ORBIT_START_FRACTION) / BUILD_ORBIT_DURATION_FRACTION,
      0,
    ),
    1,
  );
  const rotate = smoothstep(orbitPhase);
  const inDolly = build < BUILD_ORBIT_START_FRACTION;
  const orbitRadius = inDolly
    ? hermite(
        BUILD_ORBIT_RADIUS_START,
        0,
        BUILD_ORBIT_RADIUS_MID,
        RADIUS_JUNCTION_VELOCITY * BUILD_DOLLY_FRACTION,
        dollyPhase,
      )
    : hermite(
        BUILD_ORBIT_RADIUS_MID,
        RADIUS_JUNCTION_VELOCITY * BUILD_ORBIT_DURATION_FRACTION,
        BUILD_ORBIT_RADIUS_TO,
        0,
        orbitPhase,
      );
  const orbitY = inDolly
    ? hermite(
        BUILD_ORBIT_Y_FROM,
        0,
        BUILD_ORBIT_Y_MID,
        Y_JUNCTION_VELOCITY * BUILD_DOLLY_FRACTION,
        dollyPhase,
      )
    : hermite(
        BUILD_ORBIT_Y_MID,
        Y_JUNCTION_VELOCITY * BUILD_ORBIT_DURATION_FRACTION,
        BUILD_ORBIT_Y_TO,
        0,
        orbitPhase,
      );
  return {
    turn: (rotate - 1) * BUILD_ORBIT_TURNS,
    radius: orbitRadius,
    y: BASE.y + orbitY,
    lookY:
      BASE.y + BUILD_LOOK_Y_FROM + build * (BUILD_LOOK_Y_TO - BUILD_LOOK_Y_FROM),
    fov: DRONE_PATH[0].fov,
  };
}

/**
 * project="Scene" → sheet=feature名("Reply") → object=対象名("Drone Path")
 * の命名規則(features/root/theatre.ts 参照)。Studio でキーフレームを
 * 打ち込み済み(下の useFrame で droneObj.value を読んでカメラを駆動する)。
 * Studio パネル自体は開発時のみ起動。
 */
const droneSheet = sceneProject.sheet("Reply");
const droneObj = droneSheet.object("Drone Path", {
  turn: types.number(0, { range: [-1, 4.5], nudgeMultiplier: 0.01 }),
  radius: types.number(53, { range: [15, 120] }),
  y: types.number(46, { range: [20, 80] }),
  lookY: types.number(45, { range: [30, 50] }),
  fov: types.number(68, { range: [45, 80] }),
});

/**
 * DRONE_PATH(参考データ、上のコメント参照)を実際の Theatre.js キーフレームへ
 * 一括投入する、一度きりの移行スクリプト。開発時のみ
 * `window.seedReplyDroneKeyframes()` として呼べる。
 *
 * **事前準備が必要**: Studio の Details Panel で `turn`/`radius`/`y`/
 * `lookY`/`fov` の5つそれぞれを右クリック →「Sequence this prop」で
 * 先にシーケンス化しておくこと(studio.transaction の set() は、対象の
 * プロップが既にシーケンス化されていないとキーフレームにならず、
 * 単なる静的値の上書きになる。プロップをシーケンス化する操作自体は
 * Theatre.js の公開APIには無く、Studio UIでの操作が必要)。
 */
async function seedReplyDroneKeyframes() {
  const studio = getStudio();
  if (!studio) {
    console.warn("[Reply] Theatre studio がまだ初期化されていません");
    return;
  }
  for (const key of DRONE_PATH) {
    droneSheet.sequence.position = key.t;
    /*
      position の代入直後に transaction を呼ぶと、Theatre内部の反応系が
      新しい再生位置をまだ反映していない状態で set() が実行され、
      キーフレームが意図した時刻からズレて密集してしまう(実際に発生した不具合。
      1フレーム固定待ちでは足りなかった)。
      droneSheet.sequence.position を読み直して、実際に代入した値に
      落ち着くまでフレームを待つ(最大60フレーム=約1秒でタイムアウト)。
    */
    for (
      let i = 0;
      i < 60 && Math.abs(droneSheet.sequence.position - key.t) > 1e-6;
      i++
    ) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    studio.transaction(({ set }) => {
      set(droneObj.props.turn, key.turn);
      set(droneObj.props.radius, key.radius);
      set(droneObj.props.y, key.y);
      set(droneObj.props.lookY, key.lookY);
      set(droneObj.props.fov, key.fov);
    });
  }
  console.log(
    `[Reply] ${DRONE_PATH.length}個のキーフレームを投入した(最終position=${droneSheet.sequence.position})。Studioで確認できたら、useFrame内のsampleDrone呼び出しをdroneObj.valueの読み出しに戻すこと。`,
  );
}
exposeDevSeed("seedReplyDroneKeyframes", seedReplyDroneKeyframes);

/**
 * 0〜11秒(周回カメラ。BUILD_ORBIT_*・hermite)を sampleBuildOrbit() で
 * サンプリングして、既存の Drone Path(11秒〜)キーフレームの手前へ続く
 * キーフレームとして打ち込む、一度きりの移行スクリプト。開発時のみ
 * `window.seedReplyBuildOrbitKeyframes()` として呼べる。
 *
 * 事前準備は seedReplyDroneKeyframes と同じ(turn/radius/y/lookY/fov を
 * Studio で「Sequence this prop」済みであること)。既に済んでいれば
 * 改めて実行不要。
 *
 * **DRONE_PATH と同じ発想で、区間の境目を中心にした少数のキーフレーム
 * に絞ってある**(以前0.25秒刻みで打った44個は手で調整するには多すぎた)。
 *   - 0 / 2.5: 静止(HOLD)区間の両端。値は同じなので実質フラットになる
 *   - 4.0: ドリーイン(DOLLY)区間の中間点。radius/yのエルミート曲線の
 *     カーブ形状を拾うため
 *   - 6.0: ドリーイン→周回の継ぎ目(BUILD_HOLD_SECONDS+BUILD_DOLLY_SECONDS)
 *   - 7.5 / 9.0: 周回(ORBIT)区間の中間点。turnのsmoothstepイーズと
 *     radius/yのエルミート曲線、両方のカーブ形状を拾うため
 *   - lookYはbuildに対して単純な直線(区間で変わらない)なので、点を
 *     間引いても崩れない。
 *
 * **11.0秒ちょうどのキーフレームは打たない**(既存の DRONE_PATH[0] の
 * キーフレームとぶつかるため。9.0秒までを打ち、そこから先は既存の
 * キーフレームへ繋がる)。
 *
 * 以前0.25秒刻みで打った分が残っている場合は、Studio上で0〜11秒の
 * キーフレームを先に削除してから実行すること。
 */
async function seedReplyBuildOrbitKeyframes() {
  const studio = getStudio();
  if (!studio) {
    console.warn("[Reply] Theatre studio がまだ初期化されていません");
    return;
  }
  const SAMPLE_TIMES = [0, 2.5, 4.0, 6.0, 7.5, 9.0];
  for (const t of SAMPLE_TIMES) {
    const sample = sampleBuildOrbit(t);
    droneSheet.sequence.position = t;
    for (
      let i = 0;
      i < 60 && Math.abs(droneSheet.sequence.position - t) > 1e-6;
      i++
    ) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    studio.transaction(({ set }) => {
      set(droneObj.props.turn, sample.turn);
      set(droneObj.props.radius, sample.radius);
      set(droneObj.props.y, sample.y);
      set(droneObj.props.lookY, sample.lookY);
      set(droneObj.props.fov, sample.fov);
    });
  }
  console.log(
    `[Reply] 周回カメラを${SAMPLE_TIMES.length}個のキーフレームにした(最終position=${droneSheet.sequence.position})。`,
  );
}
exposeDevSeed("seedReplyBuildOrbitKeyframes", seedReplyBuildOrbitKeyframes);

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
  /**
   * ホログラムに映している Reply の映像本体。Studio の Sequence Editor で
   * プレイヘッドを手で動かしたときに、この映像を一時停止してその位置へ
   * シークするために使う(下の useFrame 内の解説参照)。
   */
  videoRef?: RefObject<HTMLVideoElement | null>;
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
  videoRef,
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
  /** droneObj.value から毎フレーム写す先。使い回すことで new を避ける */
  const key = useRef({ turn: 0, radius: 0, y: 0, lookY: 0, fov: 68 });
  /**
   * 直前のフレームで自分が droneSheet.sequence.position に書き込んだ値。
   * Studio の Sequence Editor でプレイヘッドを手で動かすと、次のフレームで
   * 読み返した sequence.position がこの値とズレる(=自分が書いた覚えのない
   * 変化)。それを「手動でスクラブされた」の判定に使う(下の useFrame 参照)。
   */
  const lastWrittenPositionRef = useRef<number | null>(null);
  /*
    videoRef(prop)の.currentを直接書き換えると react-hooks/immutability に
    引っかかるため、一度ローカルrefへ移してから触る(下の perspectiveRef と
    同じ手当て)。
  */
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  /**
   * 編集モードのツールバー(EditorToolbar)で押された一時停止。
   * Theatre.js 標準の再生/一時停止(スペースキー、
   * sequence.pointer.playing)は**使わない**——それに反応しようとすると、
   * Theatre側の内部時計が独自に sequence.position を進め始めてしまい、
   * 毎フレーム動画をそれに追従させようとして「1秒ごとにガクガク動く」
   * 不具合になった。代わりに Theatre のシーケンス自体は下の useFrame で
   * 毎フレーム pause() して無効化し、一時停止状態はストア側で持つ。
   *
   * useFrame の中から毎フレーム読むので、購読(再レンダー)ではなく
   * getState() で都度読む。
   */
  const isPaused = () => useSceneStore.getState().editorPaused;
  /**
   * 再生中にバーをスクラブした直後、動画へ commanded した seek 先。
   * video.currentTime への代入はブラウザ側で反映に数フレームかかることが
   * あり、その間 songTime(=video.currentTime の読み戻し)はまだ古い値の
   * まま。この間に songTime を信用して sequence.position を書き戻すと、
   * シークした瞬間に元の位置へ「戻る」ように見える不具合になる
   * (実際に発生した)。songTime がこの seek 先に追いつくまでは、
   * sequence.position をこの値に固定しておく。追いついたら null に戻す。
   */
  const pendingSeekTargetRef = useRef<number | null>(null);
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

  // videoRef(prop)の.currentをローカルrefへ移す(videoElRefのコメント参照)
  useEffect(() => {
    videoElRef.current = videoRef?.current ?? null;
  }, [videoRef]);


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

      1. 静止(BUILD_HOLD_SECONDS): 正面の START で待つ。回転もしない。
      2. ドリーイン(BUILD_DOLLY_SECONDS): そこからまっすぐ START→MID へ
         前進しながら、高さも Y_FROM→Y_MID へ一緒に持ち上げる
         (まだ回転はしない)。
      3. 周回: そこから回り込みながら MID→TO へ寄り、
         高さも Y_MID→Y_TO へ上がっていく(見る先は build 直結で
         このフェーズより前から継続して上がっている。下の orbitLook 参照)。

      radius・高さは**エルミート補間**で繋ぐ(上の RADIUS_JUNCTION_VELOCITY /
      Y_JUNCTION_VELOCITY のコメント参照)。ドリーイン区間は
      (速度0 → 継ぎ目の速度)、周回区間は(継ぎ目の速度 → 速度0)という
      具合に、継ぎ目(MID)の速度を両区間でぴったり同じ値にしてあるので、
      ドリーインの勢いが数式的に途切れず周回(回転)へ引き継がれる。
      回転(orbitAngle)は継ぐべき前の動きが無い(ドリーイン中は回転0固定)
      ので、そのぶんは普通に smoothstep で0から立ち上げてよい。
    */
    const dollyPhase = Math.min(
      Math.max((build - BUILD_HOLD_FRACTION) / BUILD_DOLLY_FRACTION, 0),
      1,
    );
    const orbitPhase = Math.min(
      Math.max(
        (build - BUILD_ORBIT_START_FRACTION) / BUILD_ORBIT_DURATION_FRACTION,
        0,
      ),
      1,
    );
    const rotate = smoothstep(orbitPhase);
    const orbitAngle =
      BUILD_ORBIT_START_ANGLE + rotate * BUILD_ORBIT_TURNS * Math.PI * 2;
    const inDolly = build < BUILD_ORBIT_START_FRACTION;
    const orbitRadius = inDolly
      ? hermite(
          BUILD_ORBIT_RADIUS_START,
          0,
          BUILD_ORBIT_RADIUS_MID,
          RADIUS_JUNCTION_VELOCITY * BUILD_DOLLY_FRACTION,
          dollyPhase,
        )
      : hermite(
          BUILD_ORBIT_RADIUS_MID,
          RADIUS_JUNCTION_VELOCITY * BUILD_ORBIT_DURATION_FRACTION,
          BUILD_ORBIT_RADIUS_TO,
          0,
          orbitPhase,
        );
    const orbitY = inDolly
      ? hermite(
          BUILD_ORBIT_Y_FROM,
          0,
          BUILD_ORBIT_Y_MID,
          Y_JUNCTION_VELOCITY * BUILD_DOLLY_FRACTION,
          dollyPhase,
        )
      : hermite(
          BUILD_ORBIT_Y_MID,
          Y_JUNCTION_VELOCITY * BUILD_ORBIT_DURATION_FRACTION,
          BUILD_ORBIT_Y_TO,
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
      BASE.y + BUILD_LOOK_Y_FROM + build * (BUILD_LOOK_Y_TO - BUILD_LOOK_Y_FROM),
      BASE.z,
    );

    /*
      Theatre.js 自身の再生エンジンは毎フレーム止めておく。Studio 側の
      スペースキー/再生ボタンで sequence.playing が true になると、
      Theatre が内部時計で sequence.position を勝手に進め始めてしまい、
      それを動画に追従させようとして映像がガクつく不具合になった
      (frozenRef のコメント参照)。一時停止/再開はこちらの frozenRef と
      `P`キーだけで管理する。
    */
    droneSheet.sequence.pause();

    /*
      ドローンの航路。基本は曲の再生位置を Theatre.js のシーケンス位置へ
      直接代入してシークする(公式にサポートされた外部時刻との同期方法)。

      Studio の Sequence Editor でプレイヘッドを手でスクラブしたときは、
      毎フレーム自分で書き込んだ値(lastWrittenPositionRef)と今読み返した
      sequence.position がズレることで検知する。この「スクラブされた」
      イベントが起きたときの挙動を frozenRef で分ける:
        - 一時停止中(frozenRef=true): そこへシークして止まったまま
        - 再生中(frozenRef=false): そこへシークしてそのまま再生を続ける
      スクラブが無い間は、一時停止中なら位置を一切いじらず(止まったまま)、
      そうでなければ今まで通り songTime で毎フレーム上書きする。
    */
    const currentSeqPosition = droneSheet.sequence.position;
    const wasScrubbedManually =
      lastWrittenPositionRef.current !== null &&
      Math.abs(currentSeqPosition - lastWrittenPositionRef.current) > 0.03;

    const paused = isPaused();

    if (wasScrubbedManually) {
      const video = videoElRef.current;
      if (video) {
        // 一時停止中でもシーク自体は必ず行う(その位置の画を見たいため)
        video.currentTime = Math.max(currentSeqPosition, 0);
        if (paused) {
          video.pause();
        } else if (video.paused) {
          void video.play().catch(() => {});
        }
      }
      lastWrittenPositionRef.current = currentSeqPosition;
      // 再生中のスクラブだけ、動画がシーク先に追いつくまでの保持が要る
      pendingSeekTargetRef.current = paused ? null : currentSeqPosition;
    } else if (paused) {
      // 一時停止中は何もしない(sequence.position を songTime で上書きしない)
    } else if (
      pendingSeekTargetRef.current !== null &&
      Math.abs(songTime - pendingSeekTargetRef.current) > 0.2
    ) {
      /*
        直前のスクラブで命じた seek 先に、動画(songTime)がまだ追いついて
        いない。ここで songTime を信用すると、シークした瞬間に元の位置へ
        「戻る」ように見える不具合になる(実際に発生した)。動画側の再生は
        続いているので数フレームで自然に追いつく。それまでは seek 先を
        維持する。
      */
      droneSheet.sequence.position = pendingSeekTargetRef.current;
      lastWrittenPositionRef.current = pendingSeekTargetRef.current;
    } else {
      pendingSeekTargetRef.current = null;
      droneSheet.sequence.position = songTime;
      lastWrittenPositionRef.current = songTime;
    }
    key.current.turn = droneObj.value.turn;
    key.current.radius = droneObj.value.radius;
    key.current.y = droneObj.value.y;
    key.current.lookY = droneObj.value.lookY;
    key.current.fov = droneObj.value.fov;
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
