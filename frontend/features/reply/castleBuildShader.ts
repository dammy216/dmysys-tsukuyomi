import { Color } from "three";
import type { MeshStandardMaterial } from "three";
import {
  BUILD_CELL_SIZE,
  BUILD_EDGE_GLOW,
  BUILD_EDGE_JITTER,
  CASTLE_TOP_Y,
  PROJECTION_COLOR_CYAN,
  PROJECTION_COLOR_HIT,
  PROJECTION_COLOR_MOON,
  PROJECTION_COLOR_VIOLET,
  PROJECTION_PANEL_SIZE,
  REPLY_GLOW_COLOR,
} from "./constants";

/*
  Reply モードの「黒い建物が下からボクセル状に湧いて現れ、ステージ照明の
  投影光で浮かび上がる」表現。江戸城の天守(EdoCastle)と四隅の隅櫓
  (CornerTowers)で同じ見え方にするため、シェーダーの仕込みをここへ集約する。

  - 組み上げ: セル(BUILD_CELL_SIZE の立方格子)ごとにハッシュで出現高さを
    ずらし、組み上げ面(uBuildY)より上のセルを discard。面のすぐ下は白熱の帯。
  - 投影光(プロジェクションマッピング): ワールド法線で面を「屋根 / 4方位の壁」に
    分け、その面へ *正面から* 映像を平面投影する。UV の基底が面ごとに直交する
    (壁X面は zy、壁Z面は xy、屋根は xz)ので、建物の角で映像がスパッと切り替わる。
    平面投影した UV を PROJECTION_PANEL_SIZE の格子でパネルに割り、点灯フロントが
    高さ方向を往復してパネルを順に灯す + 面ごとの斜めチェイス。パネルの塗りは
    セル中心で評価してセル内は一定(= 面に貼りついたフラットなパネル)。
    実際にスポットライトを何灯も置くのは重いための見立てで、黒い建物は
    この光だけで形が見える。
*/

const PROJECTION_A = new Color(PROJECTION_COLOR_CYAN);
const PROJECTION_B = new Color(PROJECTION_COLOR_VIOLET);
const PROJECTION_C = new Color(PROJECTION_COLOR_MOON);
const PROJECTION_HIT = new Color(PROJECTION_COLOR_HIT);
const BUILD_GLOW_COLOR = new Color(REPLY_GLOW_COLOR);

/**
 * 面の向きによる明暗。水平な面(屋根)を明るく、垂直な面(壁・石垣)を暗くする。
 * テクスチャを外したぶん、これが無いと層になった屋根が潰れてただの塊に見える。
 * 0で無効、1で最大。プロジェクションマッピングを面ごとの平面投影へ作り替えた
 * (壁も面として描き分けられるようになった)ので、壁を落とす量は半分だけ効かせる。
 */
const GLOW_FACE_SHADE = 0.55;

/**
 * パネルの枠(投影グリッド)の常時薄明かり。0で「点いてるパネルだけ枠が見える」、
 * 上げると消灯パネルの枠までうっすら光り「建物ぜんたいに映像を投影している面」
 * が常に読める。プロジェクションマッピングらしさはこの下地グリッドが要。
 */
const PANEL_GRID_FLOOR = 0.14;
/** 組み上がり面で光る帯の強さ。ここだけ白熱させて「今できた」感を出す */
const BUILD_BAND_STRENGTH = 3;

/**
 * 投影光の最大強度。activation(0〜1)にこれを掛ける。
 * 帯A・帯Bが重なるところは2色ぶん足されるので、ここを上げすぎると
 * 建物が黄色く飽和して形が消える。
 */
export const PROJECTION_INTENSITY_MAX = 0.85;

/**
 * 組み上げ面がここまで上がりきったら演出終了。頂点(CASTLE_TOP_Y)に
 * ばらつき(BUILD_EDGE_JITTER)と帯(BUILD_EDGE_GLOW)を足した高さまで
 * 上げないと、最後のセルが出ないまま止まる。天守も隅櫓もこの1本の
 * 組み上げ面を共有する(隅櫓は背が低いので早く出来上がる)。
 */
export const BUILD_TOP_Y = CASTLE_TOP_Y + BUILD_EDGE_JITTER + BUILD_EDGE_GLOW;

/**
 * 組み上げ用の uniform。**同じ建物の全マテリアルでこのオブジェクトを共有する**。
 *
 * onBeforeCompile の中で shader.uniforms へ同じ参照を差し込んでおけば、
 * ここを1回書き換えるだけで全マテリアルに効く(three が同じ
 * customProgramCacheKey のマテリアルでシェーダープログラムを共有し、
 * 2個目以降で onBeforeCompile を呼ばないケースの対策でもある)。
 */
export type BuildUniforms = {
  uBuildY: { value: number };
  uBuildOn: { value: number };
  uBuildCell: { value: number };
  uBuildJitter: { value: number };
  uBuildEdge: { value: number };
  uBuildGlow: { value: Color };
  /* 建物に這わせる投影光(プロジェクションマッピング。寒色・電子寄り) */
  uProjA: { value: Color }; // シアン
  uProjB: { value: Color }; // バイオレット
  uProjC: { value: Color }; // 月明かりの白(少数パネルのみ)
  uProjHitCol: { value: Color }; // サビの一撃で差す金
  /** サビ・後半の頭の一撃のエンベロープ 0〜1(castleHitAt)。点灯パネルの一部が金へ */
  uProjHit: { value: number };
  uProjStrength: { value: number };
  uProjTime: { value: number };
  uProjBaseY: { value: number };
  uProjTopY: { value: number };
  /** 投影パネル1枚の大きさ(ワールド単位)。PROJECTION_PANEL_SIZE */
  uProjCell: { value: number };
};

/** 組み上げ uniform を初期値で作る。建物1棟につき1個。 */
export function createCastleBuildUniforms(): BuildUniforms {
  return {
    uBuildY: { value: 0 },
    uBuildOn: { value: 0 },
    uBuildCell: { value: BUILD_CELL_SIZE },
    uBuildJitter: { value: BUILD_EDGE_JITTER },
    uBuildEdge: { value: BUILD_EDGE_GLOW },
    uBuildGlow: { value: BUILD_GLOW_COLOR },
    /*
      uProjA/B/C は castleProjectionPalette.sampleCastleProjection が毎フレーム
      in-place で書き換える(セクション別の配色)。建物1棟につき別インスタンスを
      持たせるため clone する ―― 共有すると天守と隅櫓が同じ Color を奪い合う。
    */
    uProjA: { value: PROJECTION_A.clone() },
    uProjB: { value: PROJECTION_B.clone() },
    uProjC: { value: PROJECTION_C.clone() },
    uProjHitCol: { value: PROJECTION_HIT.clone() },
    uProjHit: { value: 0 },
    uProjStrength: { value: 0 },
    uProjTime: { value: 0 },
    uProjBaseY: { value: 0 },
    uProjTopY: { value: CASTLE_TOP_Y },
    uProjCell: { value: PROJECTION_PANEL_SIZE },
  };
}

/**
 * MeshStandardMaterial に組み上げ + 投影光シェーダーを仕込む。
 * `uniforms` は同じ建物で共有しているものを渡す。`cacheKey` はマテリアルごとに
 * 一意にする(将来マテリアルが増えても three が必ず onBeforeCompile を呼ぶ)。
 */
export function applyCastleBuildShader(
  material: MeshStandardMaterial,
  uniforms: BuildUniforms,
  cacheKey: string,
) {
  material.onBeforeCompile = (shader) => {
    // 同じ参照を差し込む = 1箇所書き換えれば全マテリアルに効く
    Object.assign(shader.uniforms, uniforms);

    /*
      組み上げ判定はワールド座標の高さで行う。頂点側でワールド位置を
      varying へ出しておく(transformed は begin_vertex で定義される)。
    */
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vBuildWorld;\nvarying vec3 vBuildNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvBuildWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      )
      // 屋根と壁で発光の明るさを変えるためのワールド法線
      .replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\nvBuildNormal = normalize(mat3(modelMatrix) * objectNormal);",
      );

    /*
      フラグメント側。セル(BUILD_CELL_SIZE の立方格子)ごとにハッシュで
      出現高さをずらし、組み上げ面(uBuildY)より上のセルを discard する。
      これで水平の切断面ではなく、ブロックが虫食い状に生えてくる
      見た目になる。面のすぐ下は帯状に白熱させる。
    */
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uBuildY;
uniform float uBuildOn;
uniform float uBuildCell;
uniform float uBuildJitter;
uniform float uBuildEdge;
uniform vec3 uBuildGlow;
uniform vec3 uProjA;
uniform vec3 uProjB;
uniform vec3 uProjC;
uniform vec3 uProjHitCol;
uniform float uProjHit;
uniform float uProjStrength;
uniform float uProjTime;
uniform float uProjBaseY;
uniform float uProjTopY;
uniform float uProjCell;
varying vec3 vBuildWorld;
varying vec3 vBuildNormal;

float buildHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}`,
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
  float buildBand = 0.0;
  if (uBuildOn > 0.5) {
    vec3 buildCell = floor(vBuildWorld / uBuildCell);
    float buildH = vBuildWorld.y - buildHash(buildCell) * uBuildJitter;
    if (buildH > uBuildY) discard;
    buildBand = smoothstep(uBuildY - uBuildEdge, uBuildY, buildH);
  }`,
      )
      /*
        プロジェクションマッピング(面ごとの平面投影 + パネル)。建物は黒いので、
        ここで足す光だけが形を浮かび上がらせる。

        1. ワールド法線で面を「屋根 / 4方位の壁」に分類する。
        2. その面へ正面から映像を平面投影した UV を作る(壁X面は zy、壁Z面は
           xy、屋根は xz)。基底が面ごとに直交するので、建物の角(かど)で
           映像がスパッと切り替わる ―― 正弦波をぐるっと巻いて建物を無視して
           流れていた旧版(atan ベース。隅櫓では据え付け方位で帯が決まる
           バグでもあった)を置き換える。
        3. UV を uProjCell の格子でパネルに割る。塗りは *セル中心* で評価して
           セル内は一定 = 面に貼りついたフラットなパネル。
        4. 点灯フロント(pmFront)が高さ方向を往復してパネルを順に灯し、
           それとは別に面ごとの斜めチェイス(pmChase)を重ねる。パネルの枠
           (pmEdge)は PANEL_GRID_FLOOR ぶん常時光らせて投影グリッドを保つ。
        5. 色はパネルごとに uProjA / uProjB。そこへ組み上がり面の帯を足す。
      */
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  vec3 pmN = normalize(vBuildNormal);
  vec3 pmAbsN = abs(pmN);
  // 法線の最大成分が Y なら屋根、そうでなければ壁。X/Z のどちらが支配的かで壁面を分ける
  float pmIsRoof = step(max(pmAbsN.x, pmAbsN.z), pmAbsN.y);
  float pmXDom = step(pmAbsN.z, pmAbsN.x);
  // 面へ正面から投影した UV(壁は「水平軸 × ワールドY」、屋根は水平面 xz)
  vec2 pmWallUV = mix(vBuildWorld.xy, vBuildWorld.zy, pmXDom);
  vec2 pmUV = mix(pmWallUV, vBuildWorld.xz, pmIsRoof);
  /*
    面ごとに種を変えて、隣り合う面(+X 壁と -X 壁、壁と屋根)のパネル模様が
    揃わないようにする。実機の投影も面ごとに別の映像を出している。
  */
  float pmFaceSeed = pmIsRoof * 7.0
    + (1.0 - pmIsRoof) * (mix(2.0, 1.0, pmXDom)
      + step(0.0, pmN.x) * 0.25 + step(0.0, pmN.z) * 0.25);

  vec2 pmCellId = floor(pmUV / uProjCell);
  vec2 pmCellUV = fract(pmUV / uProjCell);
  float pmKey = buildHash(vec3(pmCellId, pmFaceSeed));

  /*
    パネル中心の高さを 0〜1 へ正規化(壁は UV.y がワールドY、屋根はその点の
    高さ)。フラグメントの生の高さではなくセル中心で取るので、点灯がパネル
    単位でパッと切り替わる。
  */
  float pmPanelY = mix((pmCellId.y + 0.5) * uProjCell, vBuildWorld.y, pmIsRoof);
  float pmPanelT = clamp((pmPanelY - uProjBaseY) / max(uProjTopY - uProjBaseY, 0.001), 0.0, 1.0);

  // 点灯フロントが下→上を往復。フロント近傍のパネルが灯る(ラップして常に1本)
  float pmFront = fract(uProjTime * 0.11);
  float pmD = pmPanelT - pmFront;
  pmD -= floor(pmD + 0.5);
  float pmBand = smoothstep(0.34, 0.0, abs(pmD));
  /*
    面ごとの斜めチェイス。セルの格子番号で評価するので、パネルが1枚ずつ
    順に走って光る(clamp 済みの非負を pow へ渡すので NaN の心配はない。
    旧版の pow(1.0-facing) の NaN 事故のコメントは Searchlight.tsx 参照)。
  */
  float pmChase = pow(clamp(
    0.5 + 0.5 * sin(pmCellId.x * 0.8 - pmCellId.y * 0.5 - uProjTime * 1.4 + pmFaceSeed),
    0.0, 1.0), 4.0);
  // 灯っているパネルは 0.5 秒ごとの抽選で明滅(セル内は一定)
  float pmFlick = 0.7 + 0.3 * step(0.5, fract(pmKey * 7.0 + floor(uProjTime * 2.0) * 0.37));
  float pmLevel = max(pmBand, pmChase * 0.9) * pmFlick;

  // 面に貼りつくパネルの枠。常時 PANEL_GRID_FLOOR + 点灯時くっきり
  vec2 pmEdge2 = smoothstep(0.0, 0.05, pmCellUV) * smoothstep(0.0, 0.05, 1.0 - pmCellUV);
  float pmEdge = (1.0 - min(pmEdge2.x, pmEdge2.y))
    * max(${PANEL_GRID_FLOOR.toFixed(2)}, pmLevel * 1.6);

  /*
    パネルの色。セクション別の3色(uProjA ~45% / uProjB ~40% / uProjC ~15%)を
    パネルごとのハッシュで配る。uProjC は少数派で、多数派2色のあいだに抜けを作る枠。
    3色の中身は castleProjectionPalette.ts がセクションごとに差し替える
    (Aメロ=寒色電子 / イントロ2=エンバー / サビ=暖色パーティー …)。
  */
  float pmPick = fract(pmKey * 3.0);
  vec3 pmPanelCol = mix(uProjA, uProjB, step(0.45, pmPick));
  pmPanelCol = mix(pmPanelCol, uProjC, step(0.85, pmPick));
  /*
    サビ・後半の頭の一撃(uProjHit)でだけ、点灯中パネルの一部を金へフラッシュ。
    どのパネルが金になるかは 0.25 秒ごとに抽選し直す(pmHitSel)ので、一撃の
    あいだ金がパラパラと散る。uProjHit は指数減衰なので ~1 秒で寒色へ戻る。
  */
  float pmHitSel = step(0.55, fract(pmKey * 11.0 + floor(uProjTime * 4.0) * 0.19));
  pmPanelCol = mix(pmPanelCol, uProjHitCol, clamp(uProjHit, 0.0, 1.0) * pmHitSel);
  vec3 pmEdgeCol = mix(pmPanelCol, vec3(1.0), 0.5);
  // 屋根の面はわずかに明るく(層を描き分ける)。壁を落とす量は半分だけ
  float pmFace = mix(${(1 - GLOW_FACE_SHADE * 0.5).toFixed(2)}, 1.0, pmAbsN.y);

  vec3 projection = (pmPanelCol * pmLevel + pmEdgeCol * pmEdge) * pmFace;
  totalEmissiveRadiance = projection * uProjStrength
    + uBuildGlow * buildBand * ${BUILD_BAND_STRENGTH.toFixed(1)};`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
}
