import type { MeshStandardMaterial } from "three";

/*
  CastleAssembly.tsx の飛来ブロックを「電子的なワイヤーフレーム発光キューブ」に
  見せるためのシェーダー仕込み。castleBuildShader.ts の applyCastleBuildShader と
  同じやり口(onBeforeCompile で MeshStandardMaterial に手を入れる)だが、こちらは
  組み上げ高さ判定やプロジェクションマッピングは不要で、やることは単純:

  1. boxGeometry の uv(各面 0〜1)から、面内でエッジに近いフラグメントを判定する
     マスク(blockEdgeMask)を作る。fwidth でスクリーン空間のアンチエイリアスされた
     一定太さの枠になる。
  2. エッジ以外は discard せず、MeshStandardMaterial の地の色(BLOCK_BASE_COLOR
     ≒ 黒)のまま残す ―― 「枠だけ光る、中身は黒い箱」という見た目にするため
     (最初は discard でエッジだけ残す空洞のワイヤーフレームにしていたが、
     「枠の中空洞じゃなくて黒にして」というユーザー指摘で discard をやめた)。
  3. エッジ部分だけ totalEmissiveRadiance にインスタンスカラー(赤/橙。
     CastleAssembly.tsx 側で mesh.setColorAt() を一度だけ設定している)を
     強めに足して発光させる。

  uv 自体は attribute vec2 uv; が three のシェーダーで常に(条件なしで)宣言されて
  いるので使えるが、vUv varying は USE_UV / USE_ANISOTROPY が立っていないと
  頂点→フラグメント間で運ばれない(このマテリアルはテクスチャを一切使わないので
  USE_UV が立たない)。そのため独自の varying vBlockUv で確実に運ぶ。

  インスタンスカラーも material.vertexColors は使わない ―― それを true にすると
  USE_COLOR が立ち、シェーダーが「ジオメトリ側の」頂点カラー attribute(color)を
  要求する。boxGeometry にはその属性が無いので、bind されない attribute が
  WebGL の既定値(0,0,0,1)を返し、掛け算で発光色が黒に潰れる事故になりかねない。
  instanceColor(USE_INSTANCING_COLOR で有効になる別の attribute。setColorAt を
  呼べば InstancedMesh 側が自動で用意する)を直接読む独自 varying vBlockColor に
  乗せ替えることでこれを避ける。
*/

export type BlockWireframeOptions = {
  /** エッジ判定の太さ(box の各面の UV 空間、0〜0.5) */
  edgeWidth: number;
  /** fwidth(スクリーン空間の変化率)に掛けるアンチエイリアス幅の倍率 */
  edgeSoftness: number;
  /** エッジ発光の強さ。totalEmissiveRadiance へ instanceColor * この値を足す */
  emissiveIntensity: number;
};

/**
 * MeshStandardMaterial にワイヤーフレーム発光シェーダーを仕込む。
 * `cacheKey` はマテリアルごとに一意にする(three が必ず onBeforeCompile を呼ぶため。
 * castleBuildShader.ts と同じ理由)。
 */
export function applyBlockWireframeShader(
  material: MeshStandardMaterial,
  options: BlockWireframeOptions,
  cacheKey: string,
) {
  material.onBeforeCompile = (shader) => {
    // uv attribute は常に宣言されているので、独自 varying へそのまま渡す
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vBlockUv;\nvarying vec3 vBlockColor;",
      )
      .replace(
        "#include <uv_vertex>",
        "#include <uv_vertex>\nvBlockUv = uv;",
      )
      /*
        instanceColor は USE_INSTANCING_COLOR のときだけ宣言される attribute
        (WebGLProgram.js)。CastleAssembly.tsx は必ず setColorAt() 済みの
        InstancedMesh を渡すので基本的には常に true になるが、保険で分岐する。
      */
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
#ifdef USE_INSTANCING_COLOR
  vBlockColor = instanceColor;
#else
  vBlockColor = vec3( 1.0 );
#endif`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vBlockUv;\nvarying vec3 vBlockColor;",
      )
      /*
        discard は clipping_planes_fragment の直後(= totalEmissiveRadiance が
        宣言される手前)に置く。天守本体(castleBuildShader.ts の組み上げ判定)と
        同じ差し込み位置。
      */
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
  // 面の中心からの距離(UV空間)。0=辺上、0.5=面の中心
  float blockEdgeDist = min(min(vBlockUv.x, 1.0 - vBlockUv.x), min(vBlockUv.y, 1.0 - vBlockUv.y));
  float blockEdgeAA = fwidth(blockEdgeDist) * ${options.edgeSoftness.toFixed(2)} + 1e-4;
  float blockEdgeMask = 1.0 - smoothstep(${options.edgeWidth.toFixed(4)}, ${options.edgeWidth.toFixed(4)} + blockEdgeAA, blockEdgeDist);`,
      )
      // エッジだけ instanceColor(vBlockColor)で発光させる。ベースの diffuse は暗いまま
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += vBlockColor * blockEdgeMask * ${options.emissiveIntensity.toFixed(2)};`,
      );
  };
  material.customProgramCacheKey = () => cacheKey;
}
