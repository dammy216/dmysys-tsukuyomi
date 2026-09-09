"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";
import {
  CASTLE_BEAM_PALETTE,
  CASTLE_BEAM_WARM,
  castleBeamPhase,
  castleRigHeightNorm,
  createCastleRigSample,
  heightGate,
  sampleCastleRig,
} from "./castleBeamRig";
import {
  CASTLE_ROOF_TIERS,
  CASTLE_TOP_Y,
  REPLY_BEAT_OFFSET,
  REPLY_BEAT_SECONDS,
  REPLY_INTRO2_BEAM_GREEN,
  REPLY_INTRO2_BEAM_MAGENTA,
  REPLY_INTRO2_BEAM_ORANGE,
} from "./constants";
import { REPLY_SECTIONS } from "./songStructure";
import { CORNER_TOWER_XZ, TOWER_HEIGHT, TOWER_ROOF_TIERS } from "./towerLayout";

/*
  ------------------------------------------------------------------
  用語(reply の照明は光源の場所で呼び分ける。ユーザー指定の呼び名):

    BeamLight     = このファイル。**屋根の端(軒)から出るビーム**。
                    天守・隅櫓の屋根の層ごとに四隅へ立てる 80 本(細い光条)。
    WashLight     = 天守四面の**破風**から出る**ウォッシュライト** 16 本
                    (細い筋ではなく広がりで面を染める光)。BeamLight と
                    同じリグ(castleBeamRig)を共有する別コンポーネント。
    Searchlight   = **足元**(水面すぐ上)から空へ撃つサーチライト 12 本。
                    別リグ(Searchlight.tsx 内の CUES)で動く。

  「建物から出る光」= BeamLight(軒 80)+ WashLight(破風 16)= 96 本で、
  この 96 本だけ castleBeamRig.ts が照明卓としてまとめて動かす。
  Searchlight はそこに含まれない。
  ------------------------------------------------------------------

  参照画像はコンサート会場のトラス照明。天守・隅櫓それぞれの屋根の
  **層ごとに**四隅へ立てる。天守・隅櫓とも1段の箱ではなく、上へ行くほど
  幅が狭くなる屋根が何段も重なった層塔型の建物(天守はCASTLE_ROOF_TIERSで
  5段、隅櫓はTOWER_ROOF_TIERSで3段。どちらも scene.gltf の頂点を実測して
  求めた値 ―― 定義は constants.ts / towerLayout.ts のコメント参照)。

  向きは「全ビームが同じ+Zへ平行」ではなく、**各隅ごとにL字**
  (上から見て、その隅に集まる屋根の2辺をそのまま外へ延長する2方向)。
  Searchlight.tsx のような放射状の扇でもない。

  天守は四隅とも正味のL字(4隅×2本=8本/層)。隅櫓は天守の四隅に重なって
  立つ配置なので、天守側(内側)を向く成分は城の中を貫通してしまうため
  間引く(4隅×2本→4本/層。詳細は EAVE_BEAM_SPOTS のコメント参照)。

  **動き・色・本数は castleBeamRig.ts が受け持つ。** このファイルは
  「どこに何本あるか」と描画だけで、演出の判断は一切持たない
  (破風のウォッシュ WashLight.tsx も同じリグを共有するので、2つが揃って動く)。
  例外として、**横振り(yaw)だけ**は cue.yaw が全リグ共通で小さすぎて光が
  横に動かないため、各ファイルで増幅する(ここは軒。天守・隅櫓で別ゲイン。
  *_YAW_GAIN / *_YAW_MIN 参照。破風は WashLight.tsx の WASH_YAW_*)。
*/

type RoofRow = { y: number; halfWidth: number; halfDepth: number; };

type EaveTierAtBuilding = {
  cx: number;
  cz: number;
  y: number;
  halfWidth: number;
  halfDepth: number;
  /**
   * その段の屋根を登った先の軒(最上段はひとつ上が無いので屋根の頂部
   * = 中心・halfWidth=halfDepth=0)。ROOF_CLIMB ぶんだけ軒からここへ寄せた
   * 位置にビームの根元を置く(= 屋根斜面の上)。
   */
  upperY: number;
  upperHalfWidth: number;
  upperHalfDepth: number;
};

/**
 * 屋根の段を「軒 → ひとつ上の段の軒(最上段は屋根の頂部)」の対にする。
 * ビームの根元は EAVE_BEAM_SPOTS でこの2点を ROOF_CLIMB で補間した所へ置く。
 */
function withRoofClimb(
  rows: readonly RoofRow[],
  apexY: number,
  cx: number,
  cz: number,
): EaveTierAtBuilding[] {
  return rows.map((t, i) => {
    const upper: RoofRow = rows[i + 1] ?? { y: apexY, halfWidth: 0, halfDepth: 0 };
    return {
      cx,
      cz,
      y: t.y,
      halfWidth: t.halfWidth,
      halfDepth: t.halfDepth,
      upperY: upper.y,
      upperHalfWidth: upper.halfWidth,
      upperHalfDepth: upper.halfDepth,
    };
  });
}

/**
 * ビームを生やす「建物×層」の一覧。天守1棟(CASTLE_ROOF_TIERS ぶん)+
 * 四隅の隅櫓4棟(それぞれ TOWER_ROOF_TIERS ぶん)。隅櫓は4棟とも同じ形の
 * モデルなので同じ層データを使い回すが、中心(cx, cz)だけは
 * CORNER_TOWER_XZ の各棟のものを使う(天守全体の四隅ではなく、
 * 各棟ローカルな四隅にするのがポイント)。
 *
 * 天守は指示により一番下の屋根(CASTLE_ROOF_TIERS[0]、最下・最大の層)だけ
 * ビームを消す。石垣に近く、他の層より目立ちすぎていたための間引き
 * (CASTLE_ROOF_TIERS 自体は実測値なので手を付けず、ここで slice する)。
 * slice 後の各要素の「ひとつ上の段」は slice 後の次の要素なので、
 * withRoofClimb にそのまま渡してよい(最上段だけ apex に落ちる)。
 */
const EAVE_TIERS: EaveTierAtBuilding[] = [
  ...withRoofClimb(CASTLE_ROOF_TIERS.slice(1), CASTLE_TOP_Y, 0, 0),
  ...CORNER_TOWER_XZ.flatMap(([cx, cz]) =>
    withRoofClimb(TOWER_ROOF_TIERS, TOWER_HEIGHT, cx, cz),
  ),
];

/** 隅の符号の組み合わせ(signX, signZ)。四隅ぶん */
const CORNER_SIGNS: readonly [1 | -1, 1 | -1][] = [
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1],
];

type EaveBeamSpot = {
  /**
   * ビームの根元(光源側)のワールド座標。**軒の実測座標そのものではない。**
   * 軒の隅から屋根の斜面を ROOF_CLIMB ぶん登り、対角方向へ CORNER_INSET ぶん
   * 中心へ寄せ、さらに壁の内側へ BEAM_EMBED_DEPTH(天守/隅櫓別)ぶん
   * 埋め込んだ後の座標が入っている(EAVE_BEAM_SPOTS 参照)。
   */
  position: [number, number, number];
  /** ジオメトリは既定でローカル+Zへ伸びる。Y回転でX/Z軸4方向のどれかへ向ける */
  rotationY: number;
  /**
   * 取り付け高さ 0(リグ下端=隅櫓の最下層)〜1(上端=天守の最上層)。
   * **点灯フロント(何本灯すか)と縦に走る波の唯一の入力。**
   */
  heightNorm: number;
  /** 城の中心から見た方位 0〜1(1周)。チェイスが城を回る順番になる */
  azimuth: number;
  /**
   * 隅櫓のビームか(true)、天守のビームか(false)。
   * 横(yaw)の首振りゲインを天守/隅櫓で切り替えるのに使う(*_YAW_* 参照)。
   */
  isTower: boolean;
  /**
   * この灯が属する棟の中心(ワールド x, z)。天守は (0, 0)、隅櫓は
   * CORNER_TOWER_XZ の各棟。イントロ2のレーザーで「面の右端/左端」を
   * **棟ローカル**に判定する(棟がまるごと城の隅にある隅櫓でも、その棟の
   * 2本が正しく交差するように)ためだけに使う。
   */
  cx: number;
  cz: number;
};

/**
 * ビームライトの太さ(先端の半径、ワールド単位)。
 *
 * **BeamLight は「細い光条」が持ち味。** 破風の WashLight が広がりで面を
 * 染めるウォッシュなのに対し、こちらは参考画像のトラス照明のような
 * くっきりした筋 ―― 断面も BEAM_FRAGMENT で芯(core = pow(facing, 7))を
 * 立てて細いシャフトにしている。だから「細く」の指示はまずこの値を絞る。
 *
 * 変遷: 2.6 → 1.2 → 0.8 → 0.5 → **0.3**(そのつど「まだ太い」の指摘で
 * 段階的に。根元は BEAM_ROOT_RADIUS = この4割)。
 *
 * **この定数群(BEAM_RADIUS 〜 CASTLE_BEAM_EMBED_DEPTH)は
 * EAVE_BEAM_SPOTS より前に置くこと。** EAVE_BEAM_SPOTS はモジュール
 * 読み込み時に即座に評価され、埋め込み深さの定数を参照するので、後ろに
 * 置くと「初期化前に参照した」実行時エラー(ReferenceError)になる
 * (TypeScript の型チェックでは検出できない。let/const の巡回参照は
 * 実行時の初期化順序の問題なので、他のファイルへ真似するときも注意)。
 */
const BEAM_RADIUS = 0.1;
/**
 * 根元(光源側)の半径。**0にしないこと。**
 *
 * 元は ConeGeometry で根元を完全な点(半径0)にしていたが、フレア
 * (根元に置く別ジオメトリの円盤)を非表示にした状態だと、光源そのものが
 * 面積を持たず画面上でほぼ消えてしまい、「先細りして光源が見えない」状態
 * になっていた(ユーザー指摘)。CylinderGeometry に変えて根元にも
 * BEAM_RADIUS の4割ほどの太さを持たせ、光源に見える最低限の面積を確保する。
 */
const BEAM_ROOT_RADIUS = BEAM_RADIUS * 0.4;
/**
 * 根元を壁の内側へ埋め込む深さ(ワールド単位)。**隅櫓用。**
 *
 * spot.position(=軒の実測座標、壁面ちょうどの点)を中心に半径
 * BEAM_ROOT_RADIUS の円柱を置くと断面の半分が建物の外へはみ出すので、
 * 断面の中心を壁の内側へ押し込む必要がある。**BEAM_ROOT_RADIUS ぶん
 * (=断面の半径ぶん)だけ押し込むと理屈上は壁面でちょうど全開の太さに
 * なるはずだったが、実際に見ると壁面ぎりぎりで「建物の中から光ってる」
 * 感が出ないとの指摘があったため、もう一段深く埋め込む
 * (BEAM_ROOT_RADIUS の2.5倍)。**
 *
 * ジオメトリのtranslateではなく EAVE_BEAM_SPOTS 側で spot.position に
 * 適用する(天守・隅櫓で埋め込み量を変えたいが、InstancedMesh は全80本で
 * 1つのジオメトリを共有するため、ジオメトリ側に焼き込むと全本一律にしか
 * できない。位置オフセットならインスタンスごとに変えられる)。
 */
const TOWER_BEAM_EMBED_DEPTH = BEAM_ROOT_RADIUS * 0;
/**
 * 天守用の埋め込み深さ。**天守は隅櫓よりモデル全体が大きい縮尺で
 * 建っているため、隅櫓と同じ絶対値の埋め込みでは軒の張り出しに対して
 * 相対的に浅く、壁からまだ浮いて見えてしまっていた**
 * (ユーザー指摘:「天守のほうが若干建物から出ていない」)。
 * 隅櫓用よりさらに深く埋め込む。
 */
const CASTLE_BEAM_EMBED_DEPTH = TOWER_BEAM_EMBED_DEPTH * 0;

/**
 * ビームの根元を、軒からその段の屋根をどれだけ登った所に置くか
 * (0=軒ちょうど、1=ひとつ上の段の軒／最上段は屋根の頂部)。
 *
 * **軒(=屋根のいちばん下の縁)のままだと、上から見たとき光が屋根ではなく
 * その下の壁・軒下の隙間から出ているように見える**との指摘(参照画像)。
 * 0.38 だと軒と棟の間の下〜中ほど、水平方向にも内側へ入った位置になり、
 * 根元が屋根の斜面の上(軒隅から頂部へ登るハズ)に乗る。x/z を同じ比率で
 * 内へ詰めるので、L字の向き(rotationY)は変えなくても2本のビームは
 * 引き続きその段の屋根の2辺を外へ延長する向きに走る。
 */
const ROOF_CLIMB = 0;

/**
 * L字の交点(2本のビームの根元)を、そこからさらに**対角方向＝建物の中心へ**
 * どれだけ寄せるか(その段の半幅/半奥行きに対する割合)。
 *
 * ROOF_CLIMB が屋根の斜面を「登る」ぶんなら、こちらは水平に「内へ」寄せるぶん。
 * ビームの向き(rotationY)は変えないので、L字の形はそのまま、交点だけが
 * 隅から中心へスライドする。0で寄せない。大きくすると屋根の内側寄りから
 * 2本が出る(参照スケッチの赤い矢印の向き)。
 */
const CORNER_INSET = 0.08;

/**
 * 軒ビームの横(yaw)の首振りをどれだけ強めるか。**天守と隅櫓で別々に持つ。**
 *
 * castleBeamRig の cue.yaw は全リグ共通で ±1〜9°ほどしかなく、軒の光は
 * ほぼ横に動かない(ユーザー指摘)。軒ビームに限ってこの倍率を掛け、上下の
 * 振り(liftSwing)はそのままに左右へ扇状に大きく振らせる。上下と 90° 位相が
 * ずれているので、ヘッドは横長の楕円を描く。破風は WashLight.tsx 側で同じ増幅。
 *
 * *_YAW_MIN … 静かな区間でも最低これだけは横に振る下限(ラジアン。0.35≒20°)。
 * *_YAW_GAIN を上げすぎると扇の端で隣の隅櫓・天守面へビームがかぶる。
 * 今は天守・隅櫓とも同値。片方だけ広げたいときはここで差をつける。
 */
const TOWER_YAW_GAIN = 5;
const TOWER_YAW_MIN = 0.35;
const CASTLE_YAW_GAIN = 5;
const CASTLE_YAW_MIN = 0.35;

/* ------------------------------------------------------------------ *
 * イントロ2(intro-B / 11.05〜23秒)だけの「レーザー」モード。ユーザー指定。
 * 2フェーズある:
 *  1) intro-B 開始 〜 INTRO2_BLINK_START_SECONDS(カメラの引きが終わるまで):
 *     交差も点滅もさせず、各面から外向きへ平行にレーザーをそのまま出す。
 *  2) それ以降: 各建物ごと、灯を**その建物の中心の右側/左側**で分けて、
 *     中心をまたぐ向きへ振り空中で X に交差させる(INTRO2_LASER_CROSS。
 *     天守は4面それぞれ、隅櫓は各棟で X)。振る向きは進行方向(rotationY)で
 *     +yaw の世界向きが反転するので **crossSign** で補正する ―― 無いと
 *     「南は交差するのに北は開く」になる(ユーザー指摘)。**点滅のたびに
 *     全灯まとめて逆向きへ ±SWAY 回して X の交点を左右へ振る**
 *     (INTRO2_LASER_SWAY。= 1回目と2回目で逆方向。スナップ)。点滅の合間は
 *     完全消灯(INTRO2_BLINK_FLOOR = 0)なので移動の途中は見えず、点いた一瞬
 *     だけ X が現れて消える = 「パッパと切り替わる」。
 * 色は城のパレットではなく **サーチライトのイントロ2と同じ3色**
 * (INTRO2_LASER_COLORS。取り付け高さで3バンド。ユーザー指定)。
 * castleBeamRig からは本数フロント(density/gate)と明るさのベースだけ
 * 引き継ぐ ―― 首振り・チェイス・色は無視。
 * ------------------------------------------------------------------ */
/** レーザーの仰角(ラジアン)。水平から。0.6 ≒ 34°(浅め・外向き) */
const INTRO2_LASER_LIFT = 0.8;
/**
 * **ビームを交差させる yaw(ラジアン)。** 面の右端の灯を左へ、左端の灯を右へ
 * 振って、空中で X に交わらせる(ユーザー指定「右端の光と左端の光を交差」)。
 * 0.7 ≒ 40°。
 */
const INTRO2_LASER_CROSS = 0.7;
/**
 * 点滅のたびに X を左右へ傾ける量(ラジアン)。0.4 ≒ 23°。
 * 偶数拍は X が左寄り(右端の灯が深く・左端が浅く)、奇数拍はその鏡像。
 * **なまさずスナップ**するので「左右左右とスウィング」ではなく拍ごとに
 * パッと切り替わる。CROSS + SWAY ≒ 63° が可動域の端(*_YAW_GAIN のコメント参照)。
 */
const INTRO2_LASER_SWAY = 0.4;
/** レーザー時の明るさ倍率。細い光条をくっきり見せるため少し持ち上げる */
const INTRO2_LASER_LEVEL = 1.35;
/**
 * フェーズ2(交差 + 点滅)を始める再生位置(秒)。これより前は交差も点滅も
 * させず平行照射(上のコメント参照)。ユーザー指定:「イントロ2に入るときの
 * カメラの引きが終わるまでは表示、そこから点滅」。
 * dronePathData の引きの着地点(t:11.5 で radius 11.5→53、そこから詰め始める)
 * あたり。長く感じるなら後ろへずらす。
 */
const INTRO2_BLINK_START_SECONDS =11.8;
/** 1拍のうちレーザーが点いている割合(0〜1)。残りは完全消灯 */
const INTRO2_BLINK_ON = 0.38;
/**
 * 消灯側の残光。**0 = 完全に消す。** 合間に beam が見えると、拍ごとに位置が
 * 変わるぶんが「左右にスウィングしている」ように見えてしまう(ユーザー指摘)。
 * 真っ暗にして、点いた一瞬だけ X が見えるようにする。
 */
const INTRO2_BLINK_FLOOR = 0;

/**
 * レーザー時の色。**城のパレット(CASTLE_BEAM_PALETTE)や暖色は使わず、
 * サーチライトのイントロ2と同じ3色**(ユーザー指定)。灯の取り付け高さで
 * 3バンドに配るので、同じ層の X は単色・層ごとに色が変わる。
 */
const INTRO2_LASER_COLORS: readonly Color[] = [
  new Color(REPLY_INTRO2_BEAM_GREEN),
  new Color(REPLY_INTRO2_BEAM_MAGENTA),
  new Color(REPLY_INTRO2_BEAM_ORANGE),
];

/**
 * 層ごとの屋根の四隅(±半幅, ±半奥行き)それぞれに、そこへ集まる2辺を
 * 外へ延長する2方向(L字)でビームの根元を置く。位置・向きは定数だけから
 * 決まるので、モジュール読み込み時に一度だけ計算する
 * (毎フレーム・毎レンダーで作り直さない)。
 *
 * **天守(cx=cz=0)は指示により手を付けず、全4隅×2方向のまま。**
 * 隅櫓は天守の四隅に重なる位置に立つので、天守側(内側)を向く方向まで
 * 律儀に出すと城の内部を貫通するビームになってしまう。そこで隅櫓の
 * 中心が居る象限の符号(qx/qz)と逆向きの成分は間引く: 外側の1隅は
 * そのままL字(2本)、天守の各辺に接する2隅はそれぞれ外向きの1本だけ、
 * 天守にめり込む内側の1隅は0本になる(1隅あたり8本→4本)。
 */
const EAVE_BEAM_SPOTS: readonly EaveBeamSpot[] = EAVE_TIERS.flatMap((t) => {
  // 天守は cx=cz=0 なので qx=qz=0 になり、下の間引き条件が常に真になる(=間引かれない)
  const qx = Math.sign(t.cx);
  const qz = Math.sign(t.cz);
  /*
    天守は隅櫓よりモデル全体が大きい縮尺で建っているので、同じ絶対値の
    埋め込みだと軒の張り出しに対して相対的に浅く、壁からまだ浮いて見える
    (ユーザー指摘:「天守のほうが若干建物から出ていない」)。cx=cz=0 が
    天守なので、それで深さを切り替える(BEAM_EMBED_DEPTH のコメント参照)。
  */
  const isCastle = t.cx === 0 && t.cz === 0;
  const embedDepth = isCastle ? CASTLE_BEAM_EMBED_DEPTH : TOWER_BEAM_EMBED_DEPTH;
  return CORNER_SIGNS.flatMap(([signX, signZ]): EaveBeamSpot[] => {
    /*
      根元の位置。軒の隅(base*)から、ひとつ上の段の軒の隅(upper*。最上段は
      屋根の頂部)へ ROOF_CLIMB ぶん寄せて、屋根の斜面の上に置く
      (軒ちょうどだと上から見て「屋根の下」から出ているように見えるとの
      指摘。ROOF_CLIMB のコメント参照)。x/z を同じ比率で内へ詰めるので、
      L字の2辺を外へ延長する向き(下の rotationY)は変えなくてよい。
    */
    const baseX = t.cx + signX * t.halfWidth;
    const baseZ = t.cz + signZ * t.halfDepth;
    const upperX = t.cx + signX * t.upperHalfWidth;
    const upperZ = t.cz + signZ * t.upperHalfDepth;
    /*
      さらに対角方向＝建物の中心へ CORNER_INSET ぶん(その段の半幅/半奥行きに
      対する割合)押し込む。ビームの向き(下の rotationY)は変えないので、
      L字の形はそのまま交点だけが隅から中心へスライドする。
    */
    const rootX =
      baseX + (upperX - baseX) * ROOF_CLIMB - signX * t.halfWidth * CORNER_INSET;
    const rootZ =
      baseZ + (upperZ - baseZ) * ROOF_CLIMB - signZ * t.halfDepth * CORNER_INSET;
    const rootY = t.y + (t.upperY - t.y) * ROOF_CLIMB;
    /*
      方位・高さは埋め込み前の根元座標で計算する(埋め込みオフセットを
      含めると外向き方向で座標がわずかに動き、チェイスの順番の基準が
      ぶれるため)。高さは軒ではなく実際の取り付け高さ(rootY)から取る
      ―― 屋根を登ったぶん灯は実際に高くなっているので、点灯フロントも
      それに合わせる。
    */
    const heightNorm = castleRigHeightNorm(rootY);
    const azimuth = (Math.atan2(rootX, rootZ) / (Math.PI * 2) + 1) % 1;
    const spots: EaveBeamSpot[] = [];
    if (qx === 0 || signX === qx) {
      // X方向の辺を外へ延長(+Xならrotation.yが+90°で+Zジオメトリが+X向きになる)。
      // 埋め込みは外向き(signX)の逆方向、つまり建物の中心へ向けて引く。
      spots.push({
        position: [rootX - signX * embedDepth, rootY, rootZ],
        rotationY: signX > 0 ? Math.PI / 2 : -Math.PI / 2,
        heightNorm,
        azimuth,
        isTower: !isCastle,
        cx: t.cx,
        cz: t.cz,
      });
    }
    if (qz === 0 || signZ === qz) {
      // Z方向の辺を外へ延長(+Zはジオメトリそのまま、-Zは180°反転)
      spots.push({
        position: [rootX, rootY, rootZ - signZ * embedDepth],
        rotationY: signZ > 0 ? 0 : Math.PI,
        heightNorm,
        azimuth,
        isTower: !isCastle,
        cx: t.cx,
        cz: t.cz,
      });
    }
    return spots;
  });
});

/** 灯の数。天守4層×8本 + 隅櫓4棟×3層×4本 = 80本 */
const BEAM_COUNT = EAVE_BEAM_SPOTS.length;

/** ビームの長さ。水面(半径400。scenery/SeaGlow.tsx参照)の内側に十分収まる長さ */
const BEAM_LENGTH = 150;
/** 円周方向の分割数。太いSearchlightの18分割ほどの解像度は要らないので絞る */
const BEAM_SEGMENTS = 12;

/** ビーム本体の最大の濃さ。Searchlight の BEAM_OPACITY_MAX と同程度 */
const EAVE_BEAM_OPACITY_MAX = 0.55;

/**
 * 根元に置くフレアの半径(ワールド単位)。細いビームなので
 * Searchlight(旧FLARE_SIZE=11相当)より小さくしてある。これが無いと、ただの
 * 三角形が壁から生えているだけに見え、光源だと分かりにくい。
 *
 * **大きすぎると逆効果。** 元は1.6だったが、引きの画で天守のまわりに
 * 白っぽい丸い玉がいくつも浮いて見え、「スポットライトの出口」ではなく
 * 「浮いてる発光体」に見えてしまっていた(ユーザー指摘で0.8へ縮小)。
 *
 * **ビルボード(sprite)にしないこと。** sprite は常にカメラの方を向くので、
 * どの角度から見ても真円の光る球体に見えてしまい、「スポットライトの
 * 出口」ではなく「浮いてる発光体」に見える。ビームと同じ向き(法線=
 * ビームの進行方向)を向いた円盤にして、正面(ビームが出ている方向)から
 * 見たときだけ光り、横や後ろからは見えないようにする(FLARE_FRAGMENT参照)。
 */
const FLARE_RADIUS = 0.8;
/** フレアの最大の濃さ。ビーム本体(EAVE_BEAM_OPACITY_MAX)より少し明るく */
const FLARE_OPACITY_MAX = 0.9;
/**
 * 正面から外れたときの減衰の鋭さ。大きいほど真正面付近だけに絞られ、
 * 少し角度がつくだけで急に消える。円盤の縁でのブツ切れ感を抑えつつ
 * 「正面からしか見えない」を成立させる値を目視で選んである。
 */
const FLARE_FRESNEL_POWER = 1.8;

/**
 * 灯ごとの明るさ・色を持たせるため、80本を **1つの InstancedMesh** で描く。
 *
 * 以前は本数ぶんの `<mesh>` が1つのマテリアルを共有していた(全灯が同じ色・
 * 同じ明るさだったので足りていた)。演出で灯ごとに色と明るさを変えるように
 * なったのでマテリアルの共有が崩れるが、本数ぶんマテリアルを作ると
 * 80回のユニフォーム更新 + 80ドローコールになる。インスタンス属性
 * (aColor / aLevel)に逃がせば、ドローコールはビーム1・フレア1の**計2回**で
 * 済む(破風の WashLight.tsx も同じ作りにしてある)。
 */
const BEAM_VERTEX = /* glsl */ `
  /*
    instanceMatrix は three.js が USE_INSTANCING のときに自動で宣言する
    (ShaderMaterial の場合。RawShaderMaterial には付かないので注意)。
  */
  attribute vec3 aColor;
  attribute float aLevel;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLevel;
  /* ビームの進行方向(ローカル+Z=根元→先端)をビュー空間で。真正面判定に使う */
  varying vec3 vAxisView;
  void main() {
    vUv = uv;
    vColor = aColor;
    vLevel = aLevel;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    /*
      instanceMatrix は回転+平行移動だけ(スケールを入れていない)ので、
      法線は mat3 をそのまま掛けてよい(逆転置を取る必要がない)。
    */
    vNormalView = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vViewDir = normalize(-mv.xyz);
    vAxisView = normalize((modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

/*
  Searchlight.tsx の BEAM_FRAGMENT と同じ考え方(円筒の断面は
  「芯が明るい」・先端は smoothstep で完全に減衰)をそのまま流用する。
  詳しい理屈のコメントは Searchlight.tsx 側を参照(あちらは根元が点の
  ConeGeometry のままだが、facing による断面の明るさの計算自体は
  ConeGeometry / CylinderGeometry のどちらでも同じ)。

  違いは色と明るさをインスタンス属性から取るところだけ。uOpacity は
  「リグ全体の最大の濃さ × 点灯具合」で、灯ごとの差は vLevel が持つ。
*/
const BEAM_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLevel;
  varying vec3 vAxisView;

  void main() {
    float y = clamp(vUv.y, 0.0, 1.0);
    /*
      根元(y=1)がもっとも明るく、先端(y=0)へ向かって暗くなる。
      **以前あった根元だけを45%減衰させる処理は撤廃した。** ConeGeometryで
      根元が完全な点だった頃は「一点だけ極端に光るのを避ける」ための処置
      だったが、根元は光源そのものなので本来ここが一番明るくあるべきで、
      むしろ光源が暗く・先細りして見えなくなる原因になっていた
      (ユーザー指摘。BEAM_ROOT_RADIUS で根元に太さを持たせたのと対にして直す)。
    */
    float along = mix(0.25, 1.0, pow(y, 1.5));
    along *= smoothstep(0.0, 0.30, y);

    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vViewDir);
    float facing = clamp(abs(dot(n, v)), 0.0, 1.0);

    float body = facing;
    float core = pow(facing, 7.0);
    // pow の底は必ず 0 以上に丸める(負の底はGLSLで未定義=NaNになる。詳細はSearchlight.tsx参照)
    float haze = pow(max(1.0 - facing, 0.0), 3.0);

    float shell = along * (body * 0.45 + core * 0.9 + haze * 0.1);

    /*
      **真正面のまぶしさ。** 円筒シェルは軸方向から見ると壁の法線がすべて
      視線と直交して facing≈0 になり、body も core も haze も消えて、光の
      真正面にいるのに何も描かれない = 光が消える、という状態になっていた
      (ユーザー指摘。本来は光源がこちらを照らして一番まぶしいはず)。
      ビームの進行方向(vAxisView)が視線(vViewDir=フラグメント→カメラ)と
      揃うほど 1 になる項を足して、真正面付近で筒ぜんたいを光らせる。
      along(先端で0に落とす窓)は通さない ―― 真正面だと手前に来るのは
      先端側なので、along を掛けると結局消えてしまうため。
    */
    float headOn = clamp(dot(normalize(vAxisView), normalize(vViewDir)), 0.0, 1.0);
    float glare = pow(headOn, 2.0);

    float a = clamp((shell + glare * 1.1) * uOpacity * vLevel, 0.0, 1.0);
    // まぶしいほど芯を白へ寄せる(加算合成なので実際に白飛びして見える)
    vec3 rgb = mix(vColor, vec3(1.0), glare * 0.5);
    gl_FragColor = vec4(rgb * a, a);
  }
`;

/*
  根元のフレア用フラグメントシェーダー。頂点シェーダーは BEAM_VERTEX を
  そのまま使い回す(uv・法線・視線方向の計算は円盤でもコーンでも同じ)。

  円盤の法線はビームの進行方向(local +Z)を向くように置く(CircleGeometry
  の既定の法線がそのまま +Z なので、コーンと同じ回転を掛けるだけでよい)。
  正面(法線とほぼ同じ方向)から見たときだけ facing が1に近づき明るくなり、
  横や後ろから見ると0に落ちて消える ―― 「スポットライトの出口」の見え方。

  **参照映像(BUTTERFLY 3:06〜)の光源は、芯が完全に飽和して白く抜け、
  そのまわりに色の付いたにじみが出る。** 単に色を薄く塗ったのではなく
  「明るすぎて白飛びしている」見え方なので、中心へ行くほど白へ寄せる
  (uCore)。これが無いと光源が「色の付いた丸いシール」に見える。
*/
const FLARE_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vColor;
  varying float vLevel;

  void main() {
    // 中心からの距離で丸く落とす(円盤の縁をなだらかに消して境界を隠す)
    float d = length(vUv - vec2(0.5));
    float radial = smoothstep(0.5, 0.15, d);

    // 正面から見ているときだけ明るい。裏側はマテリアル側のFrontSideで描画自体しない
    vec3 n = normalize(vNormalView);
    vec3 v = normalize(vViewDir);
    float facing = max(dot(n, v), 0.0);

    float a = radial * pow(facing, ${FLARE_FRESNEL_POWER.toFixed(1)}) * uOpacity * vLevel;

    /*
      芯の白飛び。中心(d≈0)ほど、かつ灯が明るいときほど白へ寄せる。
      加算合成なので、白へ寄せたぶんだけ実際に「飛んで」見える。
    */
    float core = smoothstep(0.34, 0.0, d) * clamp(vLevel, 0.0, 1.0);
    vec3 tinted = mix(vColor, vec3(1.0), core * 0.85);

    gl_FragColor = vec4(tinted * a, a);
  }
`;

type BeamLightProps = {
  /** 天守の底面のワールド座標。EdoCastle / CornerTowers と同じ値を渡す */
  position?: [number, number, number];
  /**
   * Reply の進行度(0〜1)を持つ ref。毎フレーム変わるので数値 prop ではなく
   * ref で受け取る。
   */
  activationRef?: RefObject<number>;
  /**
   * ステージ照明の点灯具合(0〜1)を持つ ref。曲が11秒に達してから立ち上がる。
   * EdoCastle / CornerTowers の投影光(uProjStrength = activation*lights*…)と
   * 同じ掛け算パターンで、ステージ照明が点くのと同時にフェードインさせる。
   */
  lightsRef?: RefObject<number>;
  /**
   * 曲(=ホログラム映像)の再生位置(秒)を持つ ref。本数・首振り・チェイス・
   * 色替えのグリッドをここから取る。**clock.elapsedTime ではなく曲の時計を
   * 使うこと。** 小節グリッド(REPLY_BAR_ORIGIN)は曲の頭を基準にした実測値
   * なので、シーンの経過時間で回すと小節線がまるごとずれる。
   * 渡さなければ演出は動かず、従来どおり全灯が点きっぱなしになる。
   */
  songTimeRef?: RefObject<number>;
};

/**
 * 天守・隅櫓の屋根の四隅、屋根の斜面の上(軒の隅から棟へ少し登った所。
 * ROOF_CLIMB)から伸びる **細いビームライト** 80 本(コンサート会場の
 * トラス照明の見立て)。上から見て、その隅に集まる屋根の2辺をそのまま外へ
 * 延長する L字の2方向へ1本ずつ伸ばす。
 *
 * 見た目は**くっきりした細い光条** ―― 破風の WashLight(広がりで面を染める
 * ウォッシュ)とは対になる役。太さは BEAM_RADIUS、筋っぽさは BEAM_FRAGMENT
 * の芯(core)で作る。
 *
 * **演出は castleBeamRig.ts のキュー表が決める。** 本数(点灯フロント)・
 * 首振り・チェイス・色は全部あちら側で、ここはその結果をインスタンス属性へ
 * 書き込むだけ。破風の WashLight.tsx と同じリグを共有しているので、軒の
 * ビームと破風のウォッシュは必ず揃って動く。
 *
 * **例外: イントロ2(intro-B / 11.05〜23秒)だけ「レーザー」モード**
 * (ユーザー指定。INTRO2_LASER_* / useFrame の isIntro2 分岐参照):最初は平行に
 * 外向き照射、カメラの引きが終わってから建物ごとに右側/左側の灯を交差させた
 * X + 点滅(合間は完全消灯)+ 点滅ごとに全灯まとめて逆向きへ ±SWAY 回す。
 * 色はサーチライトのイントロ2と同じ3色(高さ3バンド)。この区間だけ
 * castleBeamRig の首振り・チェイス・色を無視する(本数フロントはそのまま)。
 */
export function BeamLight({
  position = [0, 0, 0],
  activationRef,
  lightsRef,
  songTimeRef,
}: BeamLightProps) {
  const beamMeshRef = useRef<InstancedMesh>(null);
  const flareMeshRef = useRef<InstancedMesh>(null);
  /*
    useFrame 内で useMemo の戻り値を直接書き換えると react-hooks/immutability に
    引っかかるため、ref へコピーしてそちら経由で触る(EdoCastle と同じ手当て)。
  */
  const materialRef = useRef<ShaderMaterial | null>(null);
  const flareMaterialRef = useRef<ShaderMaterial | null>(null);
  const attributesRef = useRef<{
    colors: InstancedBufferAttribute;
    levels: InstancedBufferAttribute;
  } | null>(null);
  const scratchRef = useRef<typeof scratchValue | null>(null);

  /*
    円柱(CylinderGeometry)は既定で top が+h/2・bottom が-h/2(+Y方向)。
    radiusTop=BEAM_ROOT_RADIUS(根元)・radiusBottom=BEAM_RADIUS(先端)なので、
    top 側が光源、bottom 側が空へ広がる先端になる。rotateX(-90°)で
    top をワールド+Zへ倒し、translateで top を原点に据える
    (Searchlight は+Yへ伸ばすため rotateX(180°)を使っているが、
    今回は+Zへ伸ばしたいので回転角が異なる)。
    **壁への埋め込みはここでは行わない。** 天守・隅櫓で埋め込み量を
    変えたいが、この InstancedMesh は全80本で1つのジオメトリを共有する
    ので、ジオメトリ側に焼き込むと一律にしかできない。埋め込みは
    EAVE_BEAM_SPOTS 側で spot.position に反映済み(TOWER/CASTLE_BEAM_EMBED_DEPTH
    のコメント参照)。
  */
  const geometry = useMemo(() => {
    const g = new CylinderGeometry(
      BEAM_ROOT_RADIUS,
      BEAM_RADIUS,
      BEAM_LENGTH,
      BEAM_SEGMENTS,
      1,
      true,
    );
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, BEAM_LENGTH / 2);
    return g;
  }, []);

  /*
    根元に置くフレアの円盤。コーンと同じくローカル+Zが法線(=ビームの
    進行方向)になるよう、CircleGeometryの既定の向き(+Z法線、XY平面)を
    そのまま使う。
  */
  const flareGeometry = useMemo(() => new CircleGeometry(FLARE_RADIUS, 24), []);

  /*
    灯ごとの色と明るさ。**ビームとフレアで同じバッファを共有する**
    (同じ灯なので必ず同じ値。2本持つと片方の更新漏れがバグになる)。
    three.js は attribute オブジェクト単位でGPUバッファを持つので、
    共有すると更新も1回で済む。
  */
  const attributes = useMemo(() => {
    const colors = new InstancedBufferAttribute(
      new Float32Array(BEAM_COUNT * 3),
      3,
    );
    const levels = new InstancedBufferAttribute(
      new Float32Array(BEAM_COUNT),
      1,
    );
    // 毎フレーム書き換えるので、three 側にも動的バッファだと伝えておく
    colors.setUsage(DynamicDrawUsage);
    levels.setUsage(DynamicDrawUsage);
    return { colors, levels };
  }, []);

  useEffect(() => {
    attributesRef.current = attributes;
    geometry.setAttribute("aColor", attributes.colors);
    geometry.setAttribute("aLevel", attributes.levels);
    flareGeometry.setAttribute("aColor", attributes.colors);
    flareGeometry.setAttribute("aLevel", attributes.levels);
  }, [geometry, flareGeometry, attributes]);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        toneMapped: false,
      }),
    [],
  );

  /*
    side は既定の FrontSide のまま(裏側は描画自体しない = 横や後ろからは
    完全に見えない。正面内での角度落ちは FLARE_FRAGMENT の facing 項)。
  */
  const flareMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uOpacity: { value: 0 } },
        vertexShader: BEAM_VERTEX,
        fragmentShader: FLARE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );

  useEffect(() => {
    materialRef.current = material;
    flareMaterialRef.current = flareMaterial;
    // GPU資源なので外れるときに解放する
    return () => {
      material.dispose();
      geometry.dispose();
      flareMaterial.dispose();
      flareGeometry.dispose();
    };
  }, [material, geometry, flareMaterial, flareGeometry]);

  /*
    useFrame の中で new しないための使い回し(R3F のパフォーマンス規約。
    @react-three/eslint-plugin が弾く)。
  */
  const scratchValue = useMemo(
    () => ({
      sample: createCastleRigSample(),
      euler: new Euler(0, 0, 0, "YXZ"),
      quat: new Quaternion(),
      matrix: new Matrix4(),
      pos: new Vector3(),
      one: new Vector3(1, 1, 1),
      color: new Color(),
      warm: new Color(CASTLE_BEAM_WARM),
      palette: CASTLE_BEAM_PALETTE.map((hex) => new Color(hex)),
      /** 灯ごとの現在の首の向き。目標へなまして追従させる(下のコメント参照) */
      lift: new Float32Array(BEAM_COUNT),
      yaw: new Float32Array(BEAM_COUNT),
    }),
    [],
  );

  useEffect(() => {
    scratchRef.current = scratchValue;
  }, [scratchValue]);

  useFrame(({ clock }, delta) => {
    const beamMesh = beamMeshRef.current;
    // JSX 側でフレアの instancedMesh を外してある間は常に null
    const flareMesh = flareMeshRef.current;
    const mat = materialRef.current;
    const flareMat = flareMaterialRef.current;
    const attrs = attributesRef.current;
    const scratch = scratchRef.current;
    /*
      **フレアはユーザー指示でいったん描画を止めてある(JSX側で
      instancedMesh をコメントアウト)。** flareMesh は null のまま
      になるので早期return の条件には含めない ―― 含めると
      ビーム本体(beamMesh)の更新まで一緒に止まってしまう。
    */
    if (!beamMesh || !mat || !flareMat || !attrs || !scratch) {
      return;
    }

    // 出具合はref経由(数値propだと親ごと毎フレーム再レンダー)
    const activation = activationRef?.current ?? 0;
    // 渡されなければ従来どおり常時点灯とみなす(EdoCastleのlightsRefと同じ既定)
    const lights = lightsRef?.current ?? 1;
    const lit = activation * lights;

    mat.uniforms.uOpacity.value = lit * EAVE_BEAM_OPACITY_MAX;
    flareMat.uniforms.uOpacity.value = lit * FLARE_OPACITY_MAX;

    /*
      グリッドは**曲の再生位置**で取る。シーンの経過時間で回すと、
      REPLY_BAR_ORIGIN(曲の頭からの実測値)を基準にした小節線がずれる。
    */
    const raw = songTimeRef?.current ?? clock.elapsedTime;
    const s = sampleCastleRig(raw, scratch.sample);

    /*
      イントロ2(intro-B)だけ「レーザー」モード(INTRO2_LASER_* のコメント参照):
      右端/左端の灯を交差させた X + 点滅ごとに X の傾きを切り替える。ここで
      その区間かどうかと、拍のブリンク係数・X の傾き向き(全灯共通)を1回求める。

      **カメラの引きが終わる(INTRO2_BLINK_START_SECONDS)まで**は点滅させず、
      **交差もさせず**にレーザーをそのまま出す(各面から外向きへ平行に照射)。
      引き切ってから、交差の X + 拍の点滅 + 傾きの切り替えを始める。
    */
    const isIntro2 = REPLY_SECTIONS[s.sectionIndex]?.name === "intro-B";
    let intro2Blink = 1;
    /** 偶数拍 +1 / 奇数拍 -1。点滅のたびに X の傾きをこの符号で反転する */
    let intro2BeatDir = 0;
    /** 交差(X)させるか。引きが終わるまでは false = 平行に外向き照射 */
    let intro2Crossing = false;
    if (isIntro2 && raw >= INTRO2_BLINK_START_SECONDS) {
      intro2Crossing = true;
      const beatPos = (raw - REPLY_BEAT_OFFSET) / REPLY_BEAT_SECONDS;
      const beat = Math.floor(beatPos);
      const beatPhase = beatPos - beat;
      intro2Blink = beatPhase < INTRO2_BLINK_ON ? 1 : INTRO2_BLINK_FLOOR;
      intro2BeatDir = (((beat % 2) + 2) % 2) === 0 ? 1 : -1;
    }

    const follow = 1 - Math.exp(-s.slew * delta);
    const colors = attrs.colors.array as Float32Array;
    const levels = attrs.levels.array as Float32Array;

    for (let i = 0; i < BEAM_COUNT; i++) {
      const spot = EAVE_BEAM_SPOTS[i];

      /*
        灯ごとの位相。取り付け高さと方位から決まるので、光の走る順番が
        空間として読み取れる(乱数は使わない。castleBeamRig.ts のコメント参照)。
      */
      const phase = castleBeamPhase(
        s.pattern,
        s.waveSpread,
        spot.heightNorm,
        spot.azimuth,
      );

      /* --- 1. 本数。点灯フロントより高い灯だけが灯る --- */
      const gate = heightGate(spot.heightNorm, s.density);

      /* --- 3. チェイス。位相を引くと決まった順に光が渡っていく --- */
      const wave = 0.5 + 0.5 * Math.cos(Math.PI * 2 * (s.chasePos - phase));
      const chase = 1 - s.chaseDepth + s.chaseDepth * Math.pow(wave, 3);
      /*
        レーザー時はチェイスを殺して**全灯いっせいに拍でチカチカ**
        (intro2Blink)。密度フロント(gate)は残すので、まだ点いてない
        高さの灯は光らない。
      */
      const level = isIntro2
        ? Math.max(s.base * gate * intro2Blink * INTRO2_LASER_LEVEL, 0)
        : Math.max(s.base * gate * chase, 0);
      levels[i] = level;

      /* --- 2. 首振り。上下(lift)と左右(yaw)で同じ位相の円を描く --- */
      let targetLift: number;
      let targetYaw: number;
      if (isIntro2) {
        /*
          レーザーモード: 仰角は INTRO2_LASER_LIFT 固定。
          intro2Crossing=false(カメラの引きが終わるまで): yaw=0 =
            各面から法線方向へ平行に外向き照射。交差させない。
          intro2Crossing=true: 「交差」―― その灯が面の中心のどちら側か
            (進行方向と直交する軸の座標。**棟の中心 (cx,cz) からの相対**。
            隅櫓は棟がまるごと城の隅にあるのでワールド座標の符号では全灯同じ側
            になり交差しない)。lateralSign は +1 / -1。

            **crossSign(= sin(rotationY) - cos(rotationY) ∈ {±1})が必須。**
            +yaw が世界のどちら向きに首を振るかは進行方向(rotationY)で反転する
            (+Z 面なら +yaw→+X、-Z 面なら +yaw→-X …)。これを掛けないと
            「南側は交差するのに北側は開く(交差しない)」になる(ユーザー指摘)。

            SWAY: 拍ごとに全灯まとめて世界Y軸まわりに ±SWAY 回す(X の交点が
            左右へ振れる = 「1回目と2回目で逆方向」)。crossSign を掛けないので
            全面いっせいに同じ向きへ回る。
        */
        targetLift = INTRO2_LASER_LIFT;
        if (intro2Crossing) {
          const pointsAlongX =
            spot.rotationY === Math.PI / 2 || spot.rotationY === -Math.PI / 2;
          const lateral = pointsAlongX
            ? spot.position[2] - spot.cz
            : spot.position[0] - spot.cx;
          const lateralSign = lateral >= 0 ? 1 : -1;
          const crossSign =
            Math.sin(spot.rotationY) - Math.cos(spot.rotationY) >= 0 ? 1 : -1;
          targetYaw =
            crossSign * lateralSign * INTRO2_LASER_CROSS +
            intro2BeatDir * INTRO2_LASER_SWAY;
        } else {
          targetYaw = 0;
        }
      } else {
        const swing = Math.PI * 2 * (s.swingPos + phase);
        /*
          **基準の仰角(s.lift)を中心に振る。** 水平を中心にすると、引きの画で
          ビームが画面を横切るただの細い線になってしまう(参照映像のビームは
          常に斜め上を向いて夜空に扇を作っている。castleBeamRig.ts の lift の
          コメント参照)。
        */
        targetLift = s.lift + s.liftSwing * Math.cos(swing);
        /*
          軒ビームの横の首振りを大きくして扇状に振らせる(天守・隅櫓で別ゲイン、
          破風は cue.yaw のまま)。上下(liftSwing)には手を付けないので、
          横長の楕円軌道になる。*_YAW_* のコメント参照。
        */
        const yawAmp = spot.isTower
          ? Math.max(s.yaw * TOWER_YAW_GAIN, TOWER_YAW_MIN)
          : Math.max(s.yaw * CASTLE_YAW_GAIN, CASTLE_YAW_MIN);
        targetYaw = yawAmp * Math.sin(swing);
      }

      /*
        通常時: 実機のムービングヘッドは首の回る速さに限りがあるので、目標へ
        瞬間移動させると作り物に見える。ここで一段なまらせることで、キューが
        切り替わって位相が飛んでも「ヘッドが向きを変えた」動きとして繋がる
        (Searchlight の tiltRef と同じ手当て)。
        レーザーモード: なまさずスナップ。点滅と同時に可動域の反対端へパッと
        飛ばしたい(ユーザー指定)。scratch も更新しておくので、intro-B を
        抜けた最初のフレームから通常のなましがそこから再開する。
      */
      const nextLift = isIntro2
        ? targetLift
        : scratch.lift[i] + (targetLift - scratch.lift[i]) * follow;
      const nextYaw = isIntro2
        ? targetYaw
        : scratch.yaw[i] + (targetYaw - scratch.yaw[i]) * follow;
      scratch.lift[i] = nextLift;
      scratch.yaw[i] = nextYaw;

      /*
        Euler の順序は "YXZ"(パン→チルトの順)。既定の "XYZ" だと、左右へ
        振ったあとの上下がねじれた軸まわりに掛かってしまう。
        ジオメトリは+Zへ伸びるので、X をマイナスに振ると上を向く。
      */
      scratch.euler.set(-nextLift, spot.rotationY + nextYaw, 0);
      scratch.quat.setFromEuler(scratch.euler);
      scratch.pos.set(spot.position[0], spot.position[1], spot.position[2]);
      scratch.matrix.compose(scratch.pos, scratch.quat, scratch.one);
      beamMesh.setMatrixAt(i, scratch.matrix);
      flareMesh?.setMatrixAt(i, scratch.matrix);

      /* --- 4. 色 --- */
      if (isIntro2) {
        /*
          レーザーは城のパレットではなく **サーチライトのイントロ2と同じ3色**
          (ユーザー指定)。取り付け高さで3バンドに配る(暖色・tint は掛けない)。
        */
        const cn = INTRO2_LASER_COLORS.length;
        const c =
          INTRO2_LASER_COLORS[Math.min(Math.floor(spot.heightNorm * cn), cn - 1)];
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      } else {
        // パレットをリグの高さ方向へ配り、暖色から寄せる
        const slot =
          s.colorSlot + spot.heightNorm * s.colorSpread * scratch.palette.length;
        /*
          剰余は必ず正に丸める。曲頭(barPos<0)では colorSlot が負になり、
          JS の % は負を返すので、そのまま添字にすると undefined になる。
        */
        const n = scratch.palette.length;
        const idx = ((Math.floor(slot) % n) + n) % n;
        scratch.color.copy(scratch.warm).lerp(scratch.palette[idx], s.tint);
        colors[i * 3] = scratch.color.r;
        colors[i * 3 + 1] = scratch.color.g;
        colors[i * 3 + 2] = scratch.color.b;
      }
    }

    beamMesh.instanceMatrix.needsUpdate = true;
    if (flareMesh) flareMesh.instanceMatrix.needsUpdate = true;
    attrs.colors.needsUpdate = true;
    attrs.levels.needsUpdate = true;
  });

  return (
    <group position={position}>
      {/*
        遠くまで長く伸びるので、建物のbboxではカリングされてしまう
        (frustumCulled={false})。行列は毎フレーム useFrame が書く。
      */}
      <instancedMesh
        ref={beamMeshRef}
        args={[geometry, material, BEAM_COUNT]}
        frustumCulled={false}
      />
      {/*
        光源そのもののフレア。**ユーザー指示でいったん非表示にしてある。**
        戻すときはこのコメントを外すだけでよい(useFrame 側は flareMesh が
        null でも動く作りにしてあるので、他の変更は不要)。
      */}
      {/* <instancedMesh
        ref={flareMeshRef}
        args={[flareGeometry, flareMaterial, BEAM_COUNT]}
        frustumCulled={false}
      /> */}
    </group>
  );
}
