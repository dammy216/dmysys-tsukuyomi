"use client";

import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Color, DoubleSide } from "three";
import type { SkyVariant } from "./SkyBackground";

/*
  シーンの外周を囲む遠くの山。**「空間の外(水面の縁・のっぺりした水平線)が
  見えている」のを隠すための目隠し。**

  **不透明・はっきりしたシルエット。** 稜線を空色に溶かして霞ませる案は
  ボツ(ユーザー指摘)。空より明確に暗い色で、稜線が空に対してくっきり
  出るようにする。頂点カラーはふもと(少し濃い)→稜線(少し明るい)の弱い
  グラデ + 尾根ごとの明暗(shade)だけ。フォグは掛けない(遠すぎて 100%
  フォグ色になり階調が出ないため)。

  2層構成: 手前(NEAR)は radius 小・低い・濃い、奥(FAR)は radius 大・高い・
  やや淡い(大気遠近ぶんだけ)。位相(seed)をずらして稜線が重ならないように
  してある。どちらもカメラの操作範囲(OrbitControls の maxDistance=400)より外。

  色は空の状態(SkyVariant)で切り替える(MOUNTAIN_COLORS)。全モードで出す。
*/

/**
/*
  稜線ノイズ。乱数は使わず、整数周波数(→2π で完全に閉じる)の正弦波を
  フィボナッチ数列で1オクターブずつ上げながら重ねる fBm。低周波だけだと
  「土手」、正弦波の素のままだと「うねうね」にしか見えないので:
   - オクターブを 8 段まで重ねて、稜線に細かい起伏(尾根・谷・切れ込み)を出す
   - 高次オクターブは 1-2|sin| で折り返して「尾根」化(尖った稜線)
   - 最後に pow で谷を深く・峰を細く(山脈のシルエット)
*/
const RIDGE_FREQ = [2, 3, 5, 8, 13, 21, 34, 55];
const RIDGE_PHASE = [1.7, 3.1, 0.9, 2.3, 4.6, 5.9, 1.1, 3.7];

/**
 * @param octaves  重ねる段数(多いほど稜線が細かい)。遠い層は少なめに
 *   (どうせ霞むし、細かすぎると角度的にチラつく)
 * @param sharpness pow の指数(大きいほど谷が深く峰が細い＝険しい山脈)
 */
function ridgeNoise(
  theta: number,
  seed: number,
  octaves: number,
  sharpness: number,
): number {
  let v = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    let s = Math.sin(theta * RIDGE_FREQ[o] + seed * RIDGE_PHASE[o] + o);
    // 3段目から上は折り返して尾根状に(素の正弦波の丸いうねりを崩す)
    if (o >= 3) s = 1 - 2 * Math.abs(s);
    v += amp * s;
    norm += amp;
    amp *= 0.62;
  }
  let k = 0.5 + 0.5 * (v / norm);
  k = k < 0 ? 0 : k > 1 ? 1 : k;
  return Math.pow(k, sharpness);
}

/** 稜線の形(色は含まない)。色は MOUNTAIN_COLORS から SkyVariant ごとに差す */
type LayerShape = {
  radius: number;
  /** 円周方向の分割数。稜線の細かさの上限。大きいほど滑らか(ファセットが出ない) */
  segments: number;
  /** 稜線の最低の高さ(ワールドY) */
  baseHeight: number;
  /** 稜線のうねりの振幅。最高点 ≈ baseHeight + amp */
  amp: number;
  /** 稜線パターンの位相ずらし。層ごとに変えて稜線を重ねない */
  seed: number;
  /** ridgeNoise のオクターブ数(稜線の細かさ) */
  octaves: number;
  /** ridgeNoise の pow 指数(険しさ) */
  sharpness: number;
};

/** 幕の下端(ワールドY)。高い視点でも幕の下から外が見えないよう深く取る */
const FLOOR_Y = -220;
/** 色グラデの折れ点(稜線に対する高さ比)。ふもと(low)→稜線(high)の中間色の位置 */
const KNEE_FRAC = 0.5;

/**
 * 外周を1周する「幕」ジオメトリ。角度ごとに 下端 / 水平(y=0) / 中間 / 稜線 の
 * 4頂点。頂点カラー(不透明)がふもと(low)→中間→稜線(high=空の色)へ移り、
 * 稜線が空と同色になって縁が溶ける。内側から見るので DoubleSide。
 */
function buildRing(
  shape: LayerShape,
  lowHex: string,
  highHex: string,
): BufferGeometry {
  const { radius, segments, baseHeight, amp, seed, octaves, sharpness } = shape;
  const low = new Color(lowHex);
  const high = new Color(highHex);
  const knee = low.clone().lerp(high, 0.55);
  const rows = 4;
  const positions = new Float32Array(segments * rows * 3);
  const colors = new Float32Array(segments * rows * 3);
  const indices: number[] = [];

  const rowColor = [low, low, knee, high];
  /*
    尾根ごとにわずかに明暗をつける(全部フラット1色だと「板」に見える)。
    低〜中周波の別ノイズ。稜線まで効かせてよい(もう空色には寄せていない)。
  */
  const rowShade = [1, 1, 0.85, 0.7];

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const h = baseHeight + amp * ridgeNoise(theta, seed, octaves, sharpness);
    const ys = [FLOOR_Y, 0, h * KNEE_FRAC, h];
    const shade =
      1 +
      0.14 *
        (0.6 * Math.sin(theta * 6 + seed * 2.1) +
          0.4 * Math.sin(theta * 15 + seed * 4.3 + 1.1));
    for (let r = 0; r < rows; r++) {
      const p = (i * rows + r) * 3;
      positions[p] = x;
      positions[p + 1] = ys[r];
      positions[p + 2] = z;
      const c = rowColor[r];
      const m = 1 + (shade - 1) * rowShade[r];
      colors[p] = c.r * m;
      colors[p + 1] = c.g * m;
      colors[p + 2] = c.b * m;
    }
  }
  for (let i = 0; i < segments; i++) {
    const n = (i + 1) % segments;
    for (let r = 0; r < rows - 1; r++) {
      const a = i * rows + r;
      const b = i * rows + r + 1;
      const c = n * rows + r;
      const d = n * rows + r + 1;
      indices.push(a, b, d, a, d, c);
    }
  }

  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(positions, 3));
  g.setAttribute("color", new BufferAttribute(colors, 3));
  g.setIndex(indices);
  return g;
}

/**
 * 2層の山の形。高さは baseHeight/amp、稜線の細かさ・険しさは segments と
 * octaves/sharpness(ridgeNoise の係数も)。遠くにするなら radius を上げる
 * (RootCanvas のカメラ far も一緒に。far > radius + 400 が要る)。
 */
const FAR: LayerShape = {
  radius: 1200,
  segments: 560,
  baseHeight: 10,
  amp: 46,
  seed: 11.3,
  octaves: 6,
  sharpness: 1.35,
};
const NEAR: LayerShape = {
  radius: 850,
  segments: 720,
  baseHeight: 5,
  amp: 30,
  seed: 4.7,
  octaves: 8,
  sharpness: 1.7,
};

type MountainPalette = {
  /** NEAR 層 ふもと / 稜線 */
  nearLow: string;
  nearHigh: string;
  /** FAR 層 ふもと / 稜線(大気遠近で NEAR よりわずかに淡い) */
  farLow: string;
  farHigh: string;
};

/**
 * 空の状態ごとの山の色。**空より明確に暗い**色にして、稜線が空に対して
 * くっきり出るようにする(霞ませない)。ふもと(low)→稜線(high)は弱いグラデ。
 * FAR は大気遠近ぶんだけ NEAR より淡い。
 */
const MOUNTAIN_COLORS: Record<SkyVariant, MountainPalette> = {
  // 黄昏(sky-vertical: 明るい藤+橙の空)。暗い青紫のシルエット
  dusk: {
    nearLow: "#0f0b1e",
    nearHigh: "#221b38",
    farLow: "#1a1530",
    farHigh: "#2e2748",
  },
  // 星降る海(aurora-vertical: ほぼ黒の夜空)。ほぼ黒〜暗い青灰
  night: {
    nearLow: "#05070e",
    nearHigh: "#101a2b",
    farLow: "#0b111e",
    farHigh: "#182338",
  },
  // Reply(手続きの月夜: 水平線 #1d3a5e)。その青より明確に暗い紺
  reply: {
    nearLow: "#070c17",
    nearHigh: "#132539",
    farLow: "#0f1c2e",
    farHigh: "#1c3049",
  },
};

/**
 * シーンの外周を囲む遠くの山(2層)。水面の縁・のっぺりした水平線を隠す
 * 目隠し。不透明だが色を空に寄せて霞ませる。ファイル冒頭のコメント参照。
 */
export function MountainRing({ variant }: { variant: SkyVariant }) {
  const pal = MOUNTAIN_COLORS[variant];
  const farGeo = useMemo(() => buildRing(FAR, pal.farLow, pal.farHigh), [pal]);
  const nearGeo = useMemo(
    () => buildRing(NEAR, pal.nearLow, pal.nearHigh),
    [pal],
  );

  useEffect(
    () => () => {
      farGeo.dispose();
      nearGeo.dispose();
    },
    [farGeo, nearGeo],
  );

  return (
    <group>
      {/* 遠くまで大きいので建物の bbox ではカリングされない */}
      <mesh geometry={farGeo} frustumCulled={false} renderOrder={-3}>
        <meshBasicMaterial
          vertexColors
          toneMapped={false}
          fog={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh geometry={nearGeo} frustumCulled={false} renderOrder={-2}>
        <meshBasicMaterial
          vertexColors
          toneMapped={false}
          fog={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
