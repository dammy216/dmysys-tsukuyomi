import { Color } from "three";
import type { MeshStandardMaterial } from "three";
import {
  BUILD_CELL_SIZE,
  BUILD_EDGE_GLOW,
  BUILD_EDGE_JITTER,
  CASTLE_TOP_Y,
  PROJECTION_COLOR_A,
  PROJECTION_COLOR_B,
  REPLY_GLOW_COLOR,
} from "./constants";

/*
  Reply モードの「黒い建物が下からボクセル状に湧いて現れ、ステージ照明の
  投影光で浮かび上がる」表現。江戸城の天守(EdoCastle)と四隅の隅櫓
  (CornerTowers)で同じ見え方にするため、シェーダーの仕込みをここへ集約する。

  - 組み上げ: セル(BUILD_CELL_SIZE の立方格子)ごとにハッシュで出現高さを
    ずらし、組み上げ面(uBuildY)より上のセルを discard。面のすぐ下は白熱の帯。
  - 投影光: ワールド座標と時間から色帯を2系統作って自己発光へ足す
    (実際にスポットライトを何灯も置くのは重いため)。黒い建物はこの光だけで
    形が見える。
*/

const PROJECTION_A = new Color(PROJECTION_COLOR_A);
const PROJECTION_B = new Color(PROJECTION_COLOR_B);
const BUILD_GLOW_COLOR = new Color(REPLY_GLOW_COLOR);

/**
 * 面の向きによる明暗。水平な面(屋根)を明るく、垂直な面(壁・石垣)を暗くする。
 * テクスチャを外したぶん、これが無いと層になった屋根が潰れてただの塊に見える。
 * 0で無効、1で最大。
 */
const GLOW_FACE_SHADE = 0.55;
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
  /* 建物に這わせる投影光(プロジェクションマッピング) */
  uProjA: { value: Color };
  uProjB: { value: Color };
  uProjStrength: { value: number };
  uProjTime: { value: number };
  uProjBaseY: { value: number };
  uProjTopY: { value: number };
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
    uProjA: { value: PROJECTION_A },
    uProjB: { value: PROJECTION_B },
    uProjStrength: { value: 0 },
    uProjTime: { value: 0 },
    uProjBaseY: { value: 0 },
    uProjTopY: { value: CASTLE_TOP_Y },
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
uniform float uProjStrength;
uniform float uProjTime;
uniform float uProjBaseY;
uniform float uProjTopY;
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
        プロジェクションマッピング。建物は黒いので、ここで足す光だけが
        建物を浮かび上がらせる。
          - 帯A: 高さ方向に流れる帯。下から上へ光が這い上がる
          - 帯B: 周方向に回る帯。まわりを光が一周する
        pow で締めて、ぼんやりした照り返しではなく「照明が当たっている
        帯」として見えるようにする。そこへ組み上がり面の帯を足す。
      */
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  float projT = clamp((vBuildWorld.y - uProjBaseY) / max(uProjTopY - uProjBaseY, 0.001), 0.0, 1.0);
  float projAng = atan(vBuildWorld.z, vBuildWorld.x);
  // pow へ渡すので必ず 0 以上に丸める(負の底は GLSL では未定義 = NaN。
  // 0.5+0.5*sin() は浮動小数点誤差でわずかに負になりうる)
  float bandA = clamp(0.5 + 0.5 * sin(projT * 9.0 - uProjTime * 1.7 + projAng * 1.5), 0.0, 1.0);
  float bandB = clamp(0.5 + 0.5 * sin(projAng * 3.0 + uProjTime * 0.9 - projT * 4.0), 0.0, 1.0);
  // 水平な面(屋根)ほど強く当たる。テクスチャが無いぶん、これで層を描き分ける
  float projFace = mix(${(1 - GLOW_FACE_SHADE).toFixed(2)}, 1.0, abs(vBuildNormal.y));
  vec3 projection = uProjA * pow(bandA, 3.0) + uProjB * pow(bandB, 4.0);
  totalEmissiveRadiance = projection * uProjStrength * projFace
    + uBuildGlow * buildBand * ${BUILD_BAND_STRENGTH.toFixed(1)};`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
}
